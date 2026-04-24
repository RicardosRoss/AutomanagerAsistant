import type TelegramBot from 'node-telegram-bot-api';
import config from '../../config/index.js';
import { formatCombatOutcomeLabel, formatInjuryLevelLabel } from '../config/xuanjianCombat.js';
import {
  DEFAULT_TASK_DURATION_MINUTES,
  getMinTaskDurationMinutes,
  MAX_TASK_DURATION_MINUTES
} from '../types/taskDefaults.js';
import logger from '../utils/logger.js';
import {
  CALLBACK_PREFIXES,
  NOTIFICATION_TEMPLATES
} from '../utils/constants.js';
import { formatDurationFromSeconds } from '../utils/helpers.js';
import type QueueService from '../services/QueueService.js';
import type TaskService from '../services/TaskService.js';
import type CTDPService from '../services/CTDPService.js';
import type CultivationService from '../services/CultivationService.js';
import type { CombatActionType } from '../types/cultivationCombat.js';
import { formatEncounterRiskTierLabel, formatGuardianStyleLabel } from '../config/xuanjianCombat.js';

type ErrorReporter = (userId: number, message: string) => Promise<void>;

interface TaskCommandDependencies {
  bot: TelegramBot;
  taskService: TaskService;
  cultivationService?: CultivationService;
  queueService: QueueService;
  ctdpService?: CTDPService;
  onError: ErrorReporter;
}

function formatCombatActionLabel(action: CombatActionType) {
  switch (action) {
    case 'attack':
      return '攻伐';
    case 'guard':
      return '护体';
    case 'movement':
      return '身法';
    case 'support':
      return '辅法';
    case 'burst':
      return '神通爆发';
    case 'control':
      return '神通压制';
    case 'ward':
      return '神通护持';
    case 'domain':
      return '场域展开';
    default:
      return action;
  }
}

class TaskCommandHandlers {
  bot: TelegramBot;

  taskService: TaskService;

  cultivationService: CultivationService | null;

  queueService: QueueService;

  ctdpService: CTDPService | null;

  onError: ErrorReporter;

  constructor({ bot, taskService, cultivationService, queueService, ctdpService, onError }: TaskCommandDependencies) {
    this.bot = bot;
    this.taskService = taskService;
    this.cultivationService = cultivationService ?? null;
    this.queueService = queueService;
    this.ctdpService = ctdpService ?? null;
    this.onError = onError;
  }

  parseTaskInput(input: string): { description: string; duration: number } {
    const parts = input.trim().split(' ');
    const lastPart = parts[parts.length - 1] ?? '';
    const duration = Number.parseInt(lastPart, 10);
    const minDuration = getMinTaskDurationMinutes();

    if (!Number.isNaN(duration) && duration >= minDuration && duration <= MAX_TASK_DURATION_MINUTES) {
      return {
        description: parts.slice(0, -1).join(' ') || '专注任务',
        duration
      };
    }

    return {
      description: input || '专注任务',
      duration: DEFAULT_TASK_DURATION_MINUTES
    };
  }

  parseDelayReservationInput(data: string): { reservationId: string; delayMinutes: number } {
    const payload = data.replace(CALLBACK_PREFIXES.DELAY_RESERVATION, '');

    if (payload.includes(':')) {
      const [delayPart = '5', reservationId = ''] = payload.split(':', 2);
      return {
        reservationId,
        delayMinutes: Number.parseInt(delayPart, 10)
      };
    }

    const lastSeparatorIndex = payload.lastIndexOf('_');
    if (lastSeparatorIndex === -1) {
      return {
        reservationId: payload,
        delayMinutes: 5
      };
    }

    return {
      reservationId: payload.slice(0, lastSeparatorIndex),
      delayMinutes: Number.parseInt(payload.slice(lastSeparatorIndex + 1), 10)
    };
  }

  async handleTaskCommand(userId: number, taskInput: string): Promise<void> {
    try {
      if (!taskInput.trim()) {
        await this.bot.sendMessage(
          userId,
          '请提供任务描述。\n\n示例：\n`/task 学习编程 30`\n`/task 写作业`',
          { parse_mode: 'Markdown' }
        );
        return;
      }

      const { description, duration } = this.parseTaskInput(taskInput);
      const result = await this.taskService.createTask(userId, description, duration);

      const message = NOTIFICATION_TEMPLATES.TASK_STARTED
        .replace('{description}', description)
        .replace('{duration}', String(duration));

      await this.bot.sendMessage(userId, message, {
        reply_markup: {
          inline_keyboard: [[
            { text: '✅ 完成任务', callback_data: `${CALLBACK_PREFIXES.COMPLETE_TASK}${result.task.taskId}` },
            { text: '❌ 放弃任务', callback_data: `${CALLBACK_PREFIXES.FAIL_TASK}${result.task.taskId}` }
          ]]
        }
      });

      logger.logTaskAction(userId, result.task.taskId, 'created', { description, duration });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.logError(error, { userId, taskInput, command: 'task' });
      await this.onError(userId, message);
    }
  }

  async handleReserveCommand(userId: number, taskInput: string): Promise<void> {
    try {
      const { description, duration } = this.parseTaskInput(taskInput || `专注任务 ${DEFAULT_TASK_DURATION_MINUTES}`);
      const reservationId = `res_${Date.now()}_${userId}`;
      const reservationDelayText = formatDurationFromSeconds(config.linearDelay.defaultReservationDelay);

      if (this.ctdpService) {
        await this.ctdpService.createReservation(userId, description, duration, reservationId);
      }

      try {
        await this.queueService.scheduleReservation(userId, reservationId, description, duration);
      } catch (error) {
        if (this.ctdpService) {
          await this.ctdpService.cancelReservation(userId, reservationId);
        }

        throw error;
      }

      await this.bot.sendMessage(
        userId,
        '⏰ **预约已设置**\n\n'
          + `📋 任务：${description}\n`
          + `⏱ 时长：${duration}分钟\n`
          + `🕐 预约时间：${reservationDelayText}后\n\n`
          + `根据线性时延原理，${reservationDelayText}的延迟将降低60%的启动阻力，`
          + '让您在最佳状态下开始任务。',
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [[
              { text: '❌ 取消预约', callback_data: `${CALLBACK_PREFIXES.CANCEL_RESERVATION}${reservationId}` }
            ]]
          }
        }
      );

      logger.logTaskAction(userId, reservationId, 'reservation_created', { description, duration });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.logError(error, { userId, taskInput, command: 'reserve' });
      await this.onError(userId, message);
    }
  }

  async handleCompleteTaskCallback(userId: number, data: string): Promise<void> {
    const taskId = data.replace(CALLBACK_PREFIXES.COMPLETE_TASK, '');

    try {
      const result = this.ctdpService
        ? await this.ctdpService.completeTrackedTask(userId, taskId)
        : await this.taskService.completeTask(userId, taskId, true);

      let message = '✅ 闭关修炼结束！\n\n';
      message += `⏰ 实际时长：${result.task.actualDuration ?? 0} 分钟\n`;

      if (result.cultivationReward) {
        const reward = result.cultivationReward;
        message += `\n⚡ 获得修为：${reward.spiritualPower} 点`;
        message += `\n🧭 道行变化：+${reward.cultivationAttainmentDelta ?? 0}`;
        message += `\n💎 灵石变化：${reward.immortalStones >= 0 ? '+' : ''}${reward.immortalStones}`;
        message += `\n📘 主修功法：${reward.mainMethodName ?? '未入门'}`;
        if ((result.task.actualDuration ?? 0) < 60 && reward.spiritualPower === 0) {
          if (reward.encounter?.type === 'none' && reward.immortalStones === 0) {
            if ((reward.cultivationAttainmentDelta ?? 0) > 0) {
              message += '\nℹ️ 本次专注未达到60分钟主修为门槛，未触发奇遇收益，已结算连专道行。';
            } else {
              message += '\nℹ️ 本次专注未达到60分钟主修为门槛，未触发主修为与奇遇收益。';
            }
          } else {
            message += '\nℹ️ 本次专注未达到60分钟主修为门槛，奇遇与道行奖励已照常结算。';
          }
        }
        if (reward.injuryRecovery?.applied && reward.injuryRecovery.summary) {
          message += `\n${reward.injuryRecovery.summary}`;
        }
        if (reward.encounter?.message) {
          message += `\n\n${reward.encounter.message}`;
        }
        if (reward.encounter?.offerSummary) {
          message += `\n💎 宝物：${reward.encounter.offerSummary.lootDisplayName}`;
          message += `\n⚠️ 风险：${formatEncounterRiskTierLabel(reward.encounter.offerSummary.riskTier)}`;
          message += `\n🧿 守宝风格：${formatGuardianStyleLabel(reward.encounter.offerSummary.guardianStyle)}`;

          await this.bot.sendMessage(userId, message, {
            reply_markup: {
              inline_keyboard: [[
                {
                  text: '🚶 离开',
                  callback_data: `${CALLBACK_PREFIXES.ENCOUNTER_ABANDON}${reward.encounter.offerSummary.offerId}`
                },
                {
                  text: '⚔️ 争抢',
                  callback_data: `${CALLBACK_PREFIXES.ENCOUNTER_CONTEST}${reward.encounter.offerSummary.offerId}`
                }
              ]]
            }
          });

          logger.logTaskAction(userId, taskId, 'completed_success_offer');
          return;
        }
        if (reward.encounter?.combatSummary) {
          message += `\n⚔️ 斗法结果：${formatCombatOutcomeLabel(reward.encounter.combatSummary.result)}`;
          message += `\n🐺 对手：${reward.encounter.combatSummary.enemyName}`;
          message += `\n📝 ${reward.encounter.combatSummary.summary}`;
          if (reward.encounter.combatSummary.injuryLevel !== 'none') {
            message += `\n🩹 伤势：${formatInjuryLevelLabel(reward.encounter.combatSummary.injuryLevel)}`;
          }
          if (reward.encounter.combatSummary.rounds && reward.encounter.combatSummary.rounds.length > 0) {
            message += '\n\n🧪 详细战报：';
            reward.encounter.combatSummary.rounds.forEach((round) => {
              const actor = round.actor === 'player' ? '你' : '敌方';
              message += `\n第${round.round}回合·${actor}：${formatCombatActionLabel(round.action)}，伤害 ${round.damage}`;
            });
          }
        }
        if (reward.breakthroughReady) {
          message += '\n\n🌩️ 破境条件已满足，可使用 /breakthrough 尝试突破。';
        }
      }

      await this.bot.sendMessage(userId, message);

      if (result.user.stats.currentStreak > 0 && result.user.stats.currentStreak % 5 === 0) {
        await this.bot.sendMessage(
          userId,
          `🔥 连击达到 ${result.user.stats.currentStreak} 次！保持专注，继续加油！`
        );
      }

      logger.logTaskAction(userId, taskId, 'completed_success');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.onError(userId, message);
    }
  }

  async handleAbandonEncounterCallback(userId: number, data: string): Promise<void> {
    try {
      if (!this.cultivationService) {
        throw new Error('守宝奇遇服务未初始化');
      }

      const offerId = data.replace(CALLBACK_PREFIXES.ENCOUNTER_ABANDON, '');
      const offer = await this.cultivationService.abandonEncounterOffer(userId, offerId);
      await this.bot.sendMessage(userId, `🚶 你放弃了 ${offer.lootDisplayName}，此宝已随机缘散去。`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.onError(userId, message);
    }
  }

  async handleContestEncounterCallback(userId: number, data: string): Promise<void> {
    try {
      if (!this.cultivationService) {
        throw new Error('守宝奇遇服务未初始化');
      }

      const offerId = data.replace(CALLBACK_PREFIXES.ENCOUNTER_CONTEST, '');
      const encounter = await this.cultivationService.contestEncounterOffer(userId, offerId);

      let message = `⚔️ 你决定争抢 ${encounter.offerSummary?.lootDisplayName ?? '机缘宝物'}！\n`;
      message += `\n斗法结果：${formatCombatOutcomeLabel(encounter.combatSummary?.result ?? 'loss')}`;
      message += `\n对手：${encounter.combatSummary?.enemyName ?? '守宝敌手'}`;
      message += `\n战报：${encounter.combatSummary?.summary ?? '斗法落幕。'}`;

      if (encounter.combatSummary?.injuryLevel && encounter.combatSummary.injuryLevel !== 'none') {
        message += `\n伤势：${formatInjuryLevelLabel(encounter.combatSummary.injuryLevel)}`;
      }

      await this.bot.sendMessage(userId, message);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.onError(userId, message);
    }
  }

  async handleFailTaskCallback(userId: number, data: string): Promise<void> {
    const taskId = data.replace(CALLBACK_PREFIXES.FAIL_TASK, '');

    try {
      const result = this.ctdpService
        ? await this.ctdpService.failTrackedTask(userId, taskId, '用户主动放弃')
        : await this.taskService.completeTask(userId, taskId, false, '用户主动放弃');

      await this.bot.sendMessage(userId, NOTIFICATION_TEMPLATES.TASK_FAILED);

      if (result.wasChainBroken) {
        await this.bot.sendMessage(userId, NOTIFICATION_TEMPLATES.CHAIN_BROKEN);
      }

      logger.logTaskAction(userId, taskId, 'completed_failure', { reason: '用户主动放弃' });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.onError(userId, message);
    }
  }

  async handleStartReservedCallback(userId: number, data: string): Promise<void> {
    const reservationId = data.replace(CALLBACK_PREFIXES.START_RESERVED, '');

    try {
      if (this.ctdpService) {
        // CTDP flow: actually create a main chain task bound to the reservation
        const result = await this.ctdpService.startReservedTask(userId, reservationId);

        const message =
          '🚀 **预约任务启动**\n\n'
          + '根据线性时延原理，您的启动阻力已降低60%！\n'
          + '现在是开始专注的绝佳时机。\n\n'
          + `📋 任务：${result.task.description}\n`
          + `⏱ 时长：${result.task.duration}分钟`;

        await this.bot.sendMessage(userId, message, {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [[
              { text: '✅ 完成任务', callback_data: `${CALLBACK_PREFIXES.COMPLETE_TASK}${result.task.taskId}` },
              { text: '❌ 放弃任务', callback_data: `${CALLBACK_PREFIXES.FAIL_TASK}${result.task.taskId}` }]
            ]
          }
        });

        logger.logTaskAction(userId, result.task.taskId, 'reservation_started', {
          reservationId,
          chainId: result.mainChain.chainId
        });
      } else {
        // Fallback: no CTDPService — just send a prompt message
        await this.bot.sendMessage(
          userId,
          '🚀 **预约任务启动**\n\n'
            + '根据线性时延原理，您的启动阻力已降低60%！\n'
            + '现在是开始专注的绝佳时机。\n\n'
            + '使用 `/task` 命令创建具体任务。',
          { parse_mode: 'Markdown' }
        );

        logger.logTaskAction(userId, reservationId, 'reservation_started');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.onError(userId, message);
    }
  }

  async handleDelayReservationCallback(userId: number, data: string): Promise<void> {
    const { reservationId, delayMinutes } = this.parseDelayReservationInput(data);

    try {
      if (!reservationId || Number.isNaN(delayMinutes) || delayMinutes <= 0) {
        throw new Error('无效的预约延期参数');
      }

      if (this.ctdpService) {
        const result = await this.ctdpService.delayReservation(userId, reservationId, delayMinutes);

        await this.bot.sendMessage(
          userId,
          `⏰ 预约已延迟 ${delayMinutes} 分钟。\n\n`
            + '新的预约时间即将到来，请注意通知。'
        );

        logger.logTaskAction(userId, reservationId, 'reservation_delayed', {
          delayMinutes,
          newJobId: result.newJobId
        });
      } else {
        await this.bot.sendMessage(
          userId,
          `⏰ 预约已延迟 ${delayMinutes} 分钟。\n\n`
            + '新的预约时间即将到来，请注意通知。'
        );
        logger.logTaskAction(userId, reservationId, 'reservation_delayed', { delayMinutes });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.onError(userId, message);
    }
  }

  async handleCancelReservationCallback(userId: number, data: string): Promise<void> {
    const reservationId = data.replace(CALLBACK_PREFIXES.CANCEL_RESERVATION, '');

    try {
      const cancelled = this.ctdpService
        ? (await this.ctdpService.cancelReservation(userId, reservationId)).cancelled
        : await this.queueService.cancelReservation(reservationId);

      await this.bot.sendMessage(
        userId,
        cancelled ? '🗑️ 预约已取消。' : '⚠️ 预约不存在或已执行，无法取消。'
      );

      if (cancelled) {
        logger.logTaskAction(userId, reservationId, 'reservation_cancelled');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.onError(userId, message);
    }
  }

  async sendTaskPrompt(userId: number): Promise<void> {
    await this.bot.sendMessage(
      userId,
      '🚀 **创建新任务**\n\n'
        + '使用格式：`/task 任务描述 时长`\n\n'
        + '例如：\n'
        + '• `/task 学习编程 45`\n'
        + '• `/task 读书 30`\n'
        + `• \`/task 写作业\` (默认${DEFAULT_TASK_DURATION_MINUTES}分钟)`,
      { parse_mode: 'Markdown' }
    );
  }

  async sendReservePrompt(userId: number): Promise<void> {
    const reservationDelayText = formatDurationFromSeconds(config.linearDelay.defaultReservationDelay);

    await this.bot.sendMessage(
      userId,
      '⏰ **预约任务**\n\n'
        + '使用格式：`/reserve 任务描述 时长`\n\n'
        + `${reservationDelayText}的延迟将帮助您：\n`
        + '• 降低60%启动阻力\n'
        + '• 做好心理准备\n'
        + '• 提高成功率',
      { parse_mode: 'Markdown' }
    );
  }
}

export default TaskCommandHandlers;
