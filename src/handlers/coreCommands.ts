import { sendTelegramMessage } from '../utils/telegramMessages.js';
import type TelegramBot from 'node-telegram-bot-api';
import config from '../../config/index.js';
import type BotConfig from '../config/bot.js';
import type TaskService from '../services/TaskService.js';
import { DEFAULT_TASK_DURATION_MINUTES } from '../types/taskDefaults.js';
import { formatDurationFromSeconds } from '../utils/helpers.js';
import User from '../models/User.js';
import SettingsService from '../services/SettingsService.js';
import StatsService from '../services/StatsService.js';
import { previewTaskDescription } from '../utils/taskText.js';
import { CALLBACK_PREFIXES } from '../utils/constants.js';
import TaskDraft, { type ITaskDraft } from '../models/TaskDraft.js';

type ErrorReporter = (userId: number, message: string) => Promise<void>;

interface CoreCommandDependencies {
  bot: TelegramBot;
  config: BotConfig;
  taskService: TaskService;
  onError: ErrorReporter;
}

class CoreCommandHandlers {
  bot: TelegramBot;

  config: BotConfig;

  taskService: TaskService;

  onError: ErrorReporter;

  constructor({ bot, config, taskService, onError }: CoreCommandDependencies) {
    this.bot = bot;
    this.config = config;
    this.taskService = taskService;
    this.onError = onError;
  }

  async handleStartCommand(userId: number, userInfo: TelegramBot.User): Promise<void> {
    await User.findOrCreate({
      userId,
      username: userInfo.username,
      firstName: userInfo.first_name,
      lastName: userInfo.last_name
    });

    const botInfo = this.config.getBotInfo();
    const welcomeMessage = `欢迎使用自控力助手。

${botInfo.description}

现在启动困难？先准备一件明确的任务，再预约在15分钟内开始；已经准备好了，也可以直接启动。

确认前只是准备，可以退出。确认后开始维护对应的任务链或预约链。

查看任务与记录：/status、/stats
修仙附加功能：/realm
规则与帮助：/help`;

    await sendTelegramMessage(this.bot, userId, welcomeMessage, {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '⏰ 先预约，15分钟内开始', callback_data: 'quick_reserve' },
            { text: '🚀 已准备好，立即开始', callback_data: 'quick_task' }
          ],
          [
            { text: '📊 专注状态', callback_data: 'quick_status' },
            { text: '❓ 帮助', callback_data: 'quick_help' }
          ]
        ]
      }
    });
  }

  async handleHelpCommand(userId: number): Promise<void> {
    const commands = this.config.getSupportedCommands();
    const reservationDelayText = formatDurationFromSeconds(config.linearDelay.defaultReservationDelay);
    const helpText = `📚 <b>命令帮助</b>

${commands.map((cmd) => `/${cmd.command} - ${cmd.description.replace(/</g, '&lt;').replace(/>/g, '&gt;')}`).join('\n')}

<b>使用示例：</b>
<code>/task 学习Python 45</code> - 创建45分钟学习任务
<code>/task 写作业</code> - 创建默认${DEFAULT_TASK_DURATION_MINUTES}分钟任务
<code>/reserve 准备考试 60</code> - 预约一个时长60分钟的任务
时长支持分钟数、小时或分钟单位，例如 <code>/reserve 填表 1h</code>、<code>/task 阅读 1.5h</code>、<code>/task 整理 30分钟</code>。

<b>重要提醒：</b>
🔴 <b>神圣座位原理</b> - 任务失败重置当前任务链记录
⏰ <b>${reservationDelayText}内启动</b> - 先预约，再兑现；错过期限按下必为例处理

如需更多帮助，请查看 /settings 进行个性化配置。`;

    await sendTelegramMessage(this.bot, userId, helpText, { parse_mode: 'HTML' });
  }

  async handleStatusCommand(userId: number): Promise<void> {
    try {
      const [status, draft] = await Promise.all([
        this.taskService.getUserStatus(userId, { includeTodayStats: false }),
        TaskDraft.findOne({ userId, expiresAt: { $gt: new Date() } })
      ]);

      if (!status.user) {
        if (draft) {
          await sendTelegramMessage(this.bot, userId, this.draftSummary(draft), {
            reply_markup: { inline_keyboard: [this.draftControls(draft)] }
          });
          return;
        }
        await sendTelegramMessage(this.bot, userId, '请先使用 /start 命令初始化您的账户。');
        return;
      }

      const { user, activeChain, currentTask } = status;
      const pendingSettlement = currentTask && (currentTask.status === 'completed' || currentTask.status === 'failed');
      const pendingCount = status.pendingSettlementCount ?? (pendingSettlement ? 1 : 0);
      let pendingMain = false;
      let pendingReservation = false;
      let protocolUnavailable = false;
      let statusMessage = '📊 您的专注状态\n\n';

      if (currentTask) {
        const elapsed = Math.floor((Date.now() - new Date(currentTask.startTime).getTime()) / 60000);
        statusMessage += '🎯 当前任务\n';
        statusMessage += `📋 ${previewTaskDescription(currentTask.description)}\n`;
        if (pendingSettlement) {
          statusMessage += `任务已确认${currentTask.status === 'completed' ? '完成' : '未完成'}，结果正在保存。\n`;
        }
        if (currentTask.creationState === 'initializing') statusMessage += '任务正在启动，稍后再查看状态即可。\n';
        if (currentTask.creationState === 'rolling_back') statusMessage += '启动未完成，正在清理准备记录；稍后可重新准备。\n';
        if (pendingSettlement) {
          statusMessage += `已确认的可信时长：${currentTask.actualDuration ?? 0} 分钟\n\n`;
        } else {
          statusMessage += `⏱ 已进行：${elapsed}分钟 / ${currentTask.duration}分钟\n`;
          statusMessage += `📈 进度：${Math.min(100, Math.round((elapsed / currentTask.duration) * 100))}%\n\n`;
        }
      } else {
        statusMessage += '💤 当前没有进行中的任务\n\n';
      }

      statusMessage += '🏆 总体统计\n';
      statusMessage += `✅ 完成任务：${user.stats.completedTasks}\n`;
      statusMessage += `🔥 当前连击：${user.stats.currentStreak}\n`;
      statusMessage += `🎖 最长连击：${user.stats.longestStreak}\n`;
      statusMessage += `⏰ 总专注时长：${Math.floor(user.stats.totalMinutes / 60)}小时${user.stats.totalMinutes % 60}分钟\n`;
      statusMessage += `📊 成功率：${user.successRate ?? 0}%\n\n`;

      if (activeChain) {
        statusMessage += '⛓ 任务链状态\n';
        statusMessage += `📈 链中任务：${activeChain.completedTasks}/${activeChain.totalTasks}\n`;
        statusMessage += `🎯 链条状态：${activeChain.status === 'active' ? '活跃' : '已中断'}\n`;
      }

      // CTDP/RSIP status
      try {
        const { MainChain, AuxChain } = await import('../models/index.js');

        const [activeMain, auxChain] = await Promise.all([
          MainChain.findOne({ userId, status: 'active' }), AuxChain.findOne({ userId, status: 'active' })
        ]);
        const mainChain = activeMain ?? await MainChain.findOne({ userId }).sort({ updatedAt: -1, createdAt: -1 });

        statusMessage += '\n🧠 CTDP 协议状态\n';
        if (mainChain) {
          statusMessage += `⛓ 主链节点：${mainChain.nodes.length}\n`;
          statusMessage += `🎯 主链状态：${mainChain.status === 'active' ? '活跃' : '已中断'}\n`;
          pendingMain = mainChain.status === 'active' && Boolean(mainChain.pendingViolation);
          if (pendingMain) statusMessage += '请先处理主链判例，再保存任务结果或启动下一项。\n';
        }
        if (auxChain?.pendingReservation) {
          pendingReservation = true;
          statusMessage += `⏰ 预约状态：${auxChain.pendingReservation.status}\n`;
        } else {
          statusMessage += '⏰ 预约状态：无预约\n';
        }
      } catch {
        protocolUnavailable = true;
        statusMessage += '\n暂时无法读取协议状态，请刷新后继续当前操作。\n';
      }

      try {
        const { PrecedentRule } = await import('../models/index.js');
        const { default: PatternTree } = await import('../models/PatternTree.js');
        const [precedentCount, patternTree] = await Promise.all([
          PrecedentRule.countDocuments({ userId }), PatternTree.findOne({ userId })
        ]);
        statusMessage += `⚖️ 判例数：${precedentCount}\n`;
        statusMessage += `🌲 定式树节点：${patternTree?.nodes.length ?? 0}\n`;
      } catch {
        statusMessage += '附加记录统计暂时无法读取，当前任务操作不受影响。\n';
      }

      if (draft && !currentTask && !pendingReservation && !pendingMain && !protocolUnavailable) {
        statusMessage += `\n${this.draftSummary(draft)}\n`;
      }

      if (pendingSettlement && !pendingMain) {
        statusMessage += `\n待保存结果：${pendingCount}项。保存这些原结果后即可启动下一项，不会反转原确认。\n`;
      }
      if (status.pendingRewardCount) {
        statusMessage += `\n有 ${status.pendingRewardCount} 项附加奖励等待同步，专注和下一项启动不受影响。\n`;
      }

      let actions: TelegramBot.InlineKeyboardButton[];
      if (protocolUnavailable) {
        actions = [{ text: '刷新当前状态', callback_data: 'quick_status' }];
      } else if (pendingMain) {
        actions = [{ text: '查看主链判例', callback_data: 'quick_violation' }];
      } else if (pendingSettlement) {
        actions = [{ text: '重试保存原结果', callback_data: `${currentTask.status === 'completed'
          ? CALLBACK_PREFIXES.COMPLETE_TASK : CALLBACK_PREFIXES.FAIL_TASK}${currentTask.taskId}` }];
      } else if (currentTask) {
        actions = ['initializing', 'rolling_back'].includes(currentTask.creationState ?? '')
          ? [{ text: '查看任务状态', callback_data: 'quick_status' }]
          : [{ text: '✅ 完成任务', callback_data: `${CALLBACK_PREFIXES.COMPLETE_TASK}${currentTask.taskId}` },
            { text: '❌ 未能完成', callback_data: `${CALLBACK_PREFIXES.FAIL_TASK}${currentTask.taskId}` }];
      } else if (pendingReservation) {
        actions = [{ text: '查看当前预约', callback_data: 'quick_reserve_status' }];
      } else if (draft) {
        actions = this.draftControls(draft);
      } else {
        actions = [{ text: '⏰ 准备预约', callback_data: 'quick_reserve' },
          { text: '🚀 已准备好，立即开始', callback_data: 'quick_task' }];
      }
      await sendTelegramMessage(this.bot, userId, statusMessage, { reply_markup: { inline_keyboard: [
        actions, [{ text: '📊 详细统计', callback_data: 'quick_stats' }]
      ] } });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.onError(userId, message);
    }
  }

  private draftSummary(draft: ITaskDraft): string {
    if (draft.stage === 'submitting') return '准备正在提交，请查看原提交结果，不必再次确认。';
    return `${draft.mode === 'reserve' ? '准备中的预约' : '准备中的任务'}（尚未建立承诺）\n` +
      (draft.description ? `📋 ${previewTaskDescription(draft.description)}\n` : '直接回复这次要做的一件事即可。\n') +
      `专注时长：${draft.duration} 分钟\n可以继续准备或退出，确认后才建立任务或预约。`;
  }

  private draftControls(draft: ITaskDraft): TelegramBot.InlineKeyboardButton[] {
    return [{ text: draft.stage === 'submitting' ? '查看提交进展' : '继续准备',
      callback_data: `draft:${draft.token}:resume` },
    ...(draft.stage === 'submitting' ? [] : [{ text: '退出准备', callback_data: `draft:${draft.token}:cancel` }])];
  }

  async handleStatsCommand(userId: number): Promise<void> {
    try {
      const status = await this.taskService.getUserStatus(userId);

      if (!status.user) {
        await sendTelegramMessage(this.bot, userId, '请先使用 /start 命令初始化您的账户。');
        return;
      }

      if (!status.todayStats) {
        throw new Error('获取今日统计失败');
      }

      const today = new Date().toLocaleDateString('zh-CN');
      let statsMessage = `📈 今日统计 (${today})\n\n`;
      const { todayStats } = status;

      if (todayStats.stats.tasksStarted > 0) {
        statsMessage += `🎯 启动任务：${todayStats.stats.tasksStarted}\n`;
        statsMessage += `✅ 完成任务：${todayStats.stats.tasksCompleted}\n`;
        statsMessage += `❌ 失败任务：${todayStats.stats.tasksFailed}\n`;
        statsMessage += `取消任务：${todayStats.stats.tasksCancelled ?? 0}\n`;
        statsMessage += `⏰ 专注时长：${todayStats.stats.totalMinutes}分钟\n`;
        statsMessage += `📊 成功率：${todayStats.stats.successRate.toFixed(1)}%\n\n`;

        if (todayStats.stats.averageTaskDuration > 0) {
          statsMessage += `📏 平均时长：${todayStats.stats.averageTaskDuration}分钟\n`;
        }
      } else {
        statsMessage += '💤 今日还未开始任何任务\n\n';
      }

      const { user } = status;
      statsMessage += '🏆 历史总览\n';
      statsMessage += `✅ 总完成：${user.stats.completedTasks} 任务\n`;
      statsMessage += `🔥 当前连击：${user.stats.currentStreak}\n`;
      statsMessage += `🎖 最佳记录：${user.stats.longestStreak} 连击\n`;

      const totalHours = Math.floor(user.stats.totalMinutes / 60);
      const remainingMinutes = user.stats.totalMinutes % 60;
      statsMessage += `⏰ 累计专注：${totalHours}小时${remainingMinutes}分钟\n`;

      await sendTelegramMessage(this.bot, userId, statsMessage, {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '📅 周报告', callback_data: 'quick_week' },
              { text: '🚀 开始任务', callback_data: 'quick_task' }
            ]
          ]
        }
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.onError(userId, message);
    }
  }

  async handleWeekCommand(userId: number): Promise<void> {
    try {
      const report = await new StatsService().build(userId);
      const summary = report.summary;
      await sendTelegramMessage(this.bot,
        userId,
        `最近7天专注报告（${report.timezone}）\n\n` +
          report.days.map((day) => `${day.date}：${day.minutes}分钟，完成${day.completed}次`).join('\n') +
          `\n\n启动：${summary.started} 次\n完成：${summary.completed} 次\n失败：${summary.failed} 次` +
          `\n取消：${summary.cancelled} 次\n可信专注：${summary.minutes} 分钟` +
          `\n已结束任务成功率：${summary.successRate.toFixed(1)}%` +
          '\n\n专注按约定时长计入实际发生的日期，迟确认不会增加分钟数。'
      );
    } catch (error) {
      await this.onError(userId, error instanceof Error ? error.message : String(error));
    }
  }

  async handleSettingsCommand(userId: number, input = ''): Promise<void> {
    try {
      const [field, value] = input.trim().split(/\s+/);
      const user = input.trim()
        ? await new SettingsService().update(userId, field ?? '', value ?? '')
        : await User.findOne({ userId });
      if (!user) throw new Error('请先使用 /start 初始化账户');
      await sendTelegramMessage(this.bot,
        userId,
        `个人设置\n\n默认任务时长：${user.settings.defaultDuration} 分钟` +
          `\n报告时区：${user.settings.timezone}\n过程提醒：${user.settings.reminderEnabled ? '开启' : '关闭'}` +
          '\n\n过程提醒可关闭，到点确认和预约承诺提醒仍保留。' +
          '\n自定义：/settings duration 45\n时区：/settings timezone Asia/Shanghai',
        {
          reply_markup: {
            inline_keyboard: [
              [30, 60, 90].map((duration) => ({
                text: `${duration}分钟`,
                callback_data: `settings:duration:${duration}`
              })),
              [
                { text: '关闭过程提醒', callback_data: 'settings:reminders:off' },
                { text: '开启过程提醒', callback_data: 'settings:reminders:on' }
              ],
              [
                { text: '北京时间', callback_data: 'settings:timezone:Asia/Shanghai' },
                { text: '洛杉矶时间', callback_data: 'settings:timezone:America/Los_Angeles' }
              ]
            ]
          }
        }
      );
    } catch (error) {
      await this.onError(userId, error instanceof Error ? error.message : String(error));
    }
  }

  async handleTextInput(msg: TelegramBot.Message): Promise<void> {
    const userId = msg.from?.id;
    const text = msg.text;

    if (!userId || !text) {
      return;
    }

    if (text.includes('任务') || text.includes('专注') || text.includes('学习') || text.includes('工作')) {
      const reservationDelayText = formatDurationFromSeconds(config.linearDelay.defaultReservationDelay);

      await sendTelegramMessage(this.bot,
        userId,
        `可以先准备任务，再确认是否在${reservationDelayText}内启动。点按钮后直接回复任务内容即可。`,
        {
          reply_markup: {
            inline_keyboard: [
              [
                { text: '⏰ 准备预约', callback_data: 'quick_reserve' },
                { text: '🚀 准备立即开始', callback_data: 'quick_task' }
              ]
            ]
          }
        }
      );
      return;
    }

    await sendTelegramMessage(this.bot,
      userId,
      '💭 我理解您的输入，但请使用具体的命令来操作。\n\n输入 /help 查看所有可用命令。',
      {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '❓ 查看帮助', callback_data: 'quick_help' },
              { text: '🚀 开始任务', callback_data: 'quick_task' }
            ]
          ]
        }
      }
    );
  }

  async sendQuickHelp(userId: number): Promise<void> {
    await this.handleHelpCommand(userId);
  }
}

export default CoreCommandHandlers;
