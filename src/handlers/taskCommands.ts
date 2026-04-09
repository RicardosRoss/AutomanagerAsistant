import type TelegramBot from 'node-telegram-bot-api';
import logger from '../utils/logger.js';
import {
  CALLBACK_PREFIXES,
  NOTIFICATION_TEMPLATES
} from '../utils/constants.js';
import type QueueService from '../services/QueueService.js';
import type TaskService from '../services/TaskService.js';
import type CTDPService from '../services/CTDPService.js';

type ErrorReporter = (userId: number, message: string) => Promise<void>;

interface TaskCommandDependencies {
  bot: TelegramBot;
  taskService: TaskService;
  queueService: QueueService;
  ctdpService?: CTDPService;
  onError: ErrorReporter;
}

class TaskCommandHandlers {
  bot: TelegramBot;

  taskService: TaskService;

  queueService: QueueService;

  ctdpService: CTDPService | null;

  onError: ErrorReporter;

  constructor({ bot, taskService, queueService, ctdpService, onError }: TaskCommandDependencies) {
    this.bot = bot;
    this.taskService = taskService;
    this.queueService = queueService;
    this.ctdpService = ctdpService ?? null;
    this.onError = onError;
  }

  parseTaskInput(input: string): { description: string; duration: number } {
    const parts = input.trim().split(' ');
    const lastPart = parts[parts.length - 1] ?? '';
    const duration = Number.parseInt(lastPart, 10);

    if (!Number.isNaN(duration) && duration >= 5 && duration <= 480) {
      return {
        description: parts.slice(0, -1).join(' ') || '专注任务',
        duration
      };
    }

    return {
      description: input || '专注任务',
      duration: 25
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
      const { description, duration } = this.parseTaskInput(taskInput || '专注任务 25');
      const reservationId = `res_${Date.now()}_${userId}`;

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
          + '🕐 预约时间：15分钟后\n\n'
          + '根据线性时延原理，15分钟的延迟将降低60%的启动阻力，'
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

        message += `\n⚡ 获得灵力：${reward.spiritualPower} 点`;
        if (reward.bonus > 1) {
          message += ` (x${reward.bonus.toFixed(1)} 加成)`;
        }

        message += `\n💎 获得仙石：${reward.immortalStones} 颗`;

        if (reward.fortuneEvent.message) {
          message += `\n\n${reward.fortuneEvent.message}`;
          if (reward.fortuneEvent.power > 0) {
            message += `\n⚡ 额外灵力：+${reward.fortuneEvent.power}`;
          }
          if (reward.fortuneEvent.stones > 0) {
            message += `\n💎 额外仙石：+${reward.fortuneEvent.stones}`;
          }
        }

        message += `\n\n📊 当前境界：${reward.newRealm}（${reward.newStage}）`;
        message += `\n⚡ 当前灵力：${reward.newSpiritualPower}`;

        if (reward.realmChanged) {
          message += `\n\n🎊🎊🎊\n✨ 恭喜！境界提升！\n${reward.oldRealm} → ${reward.newRealm}`;
        }

        message += '\n\n💡 使用 /divination 占卜天机试试手气！';
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
        + '• `/task 写作业` (默认25分钟)',
      { parse_mode: 'Markdown' }
    );
  }

  async sendReservePrompt(userId: number): Promise<void> {
    await this.bot.sendMessage(
      userId,
      '⏰ **预约任务**\n\n'
        + '使用格式：`/reserve 任务描述 时长`\n\n'
        + '15分钟的延迟将帮助您：\n'
        + '• 降低60%启动阻力\n'
        + '• 做好心理准备\n'
        + '• 提高成功率',
      { parse_mode: 'Markdown' }
    );
  }
}

export default TaskCommandHandlers;
