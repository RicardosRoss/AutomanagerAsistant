import { sendTelegramMessage } from '../utils/telegramMessages.js';
import type TelegramBot from 'node-telegram-bot-api';
import { randomBytes, randomUUID } from 'node:crypto';
import config from '../../config/index.js';
import { formatCombatOutcomeLabel, formatInjuryLevelLabel } from '../config/xuanjianCombat.js';
import {
  DEFAULT_TASK_DURATION_MINUTES,
  getMinTaskDurationMinutes,
  MAX_TASK_DURATION_MINUTES
} from '../types/taskDefaults.js';
import logger from '../utils/logger.js';
import {
  CALLBACK_PREFIXES, NOTIFICATION_TEMPLATES, TASK_DESCRIPTION_ERROR, RESERVATION_SERVICE_UNAVAILABLE
} from '../utils/constants.js';
import { isValidTaskDescription, previewTaskDescription } from '../utils/taskText.js';
import { formatDurationFromSeconds } from '../utils/helpers.js';
import type QueueService from '../services/QueueService.js';
import type TaskService from '../services/TaskService.js';
import type CTDPService from '../services/CTDPService.js';
import type CultivationService from '../services/CultivationService.js';
import type { ITask } from '../types/models.js';
import type { CultivationReward } from '../types/services.js';
import type { CombatActionType } from '../types/cultivationCombat.js';
import { formatEncounterRiskTierLabel, formatGuardianStyleLabel } from '../config/xuanjianCombat.js';
import AuxChain from '../models/AuxChain.js';
import User from '../models/User.js';

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

  private getReservationService(): CTDPService {
    if (!this.ctdpService) throw new Error(RESERVATION_SERVICE_UNAVAILABLE);
    return this.ctdpService;
  }

  parseTaskInput(
    input: string,
    defaultDuration = DEFAULT_TASK_DURATION_MINUTES
  ): { description: string; duration: number } {
    const parts = input.trim().split(/\s+/);
    const lastPart = parts[parts.length - 1] ?? '';
    const units = /^([+]?\d+(?:\.\d+)?)(h|小时|m|min|分钟)$/i.exec(lastPart);
    let duration = Number(lastPart);
    if (units) {
      const [whole = '0', fraction = ''] = units[1]!.split('.');
      const scale = 10n ** BigInt(fraction.length);
      const multiplier = /^(h|小时)$/i.test(units[2]!) ? 60n : 1n;
      const minutes = (BigInt(whole) * scale + BigInt(fraction || '0')) * multiplier;
      // Exact decimal conversion avoids rejecting whole-minute values such as 4.1h.
      duration = minutes % scale === 0n ? Number(minutes / scale) : NaN;
    }
    const minDuration = getMinTaskDurationMinutes();
    const description = (/^[+-]?\d/.test(lastPart) ? parts.slice(0, -1).join(' ') : input).trim() || '专注任务';
    if (!isValidTaskDescription(description)) throw new Error(TASK_DESCRIPTION_ERROR);

    if (/^[+-]?\d/.test(lastPart)) {
      if (!Number.isInteger(duration) || duration < minDuration || duration > MAX_TASK_DURATION_MINUTES) {
        throw new Error(`任务时长必须为${minDuration}到${MAX_TASK_DURATION_MINUTES}分钟的整数；可用60、1h或30分钟`);
      }
      return {
        description,
        duration
      };
    }

    return {
      description,
      duration: defaultDuration
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

  async handleTaskCommand(userId: number, taskInput: string, submissionToken?: string): Promise<boolean> {
    let taskCommitted = false;
    try {
      if (!taskInput.trim()) {
        await sendTelegramMessage(this.bot, userId, '请提供任务描述。\n\n示例：\n`/task 学习编程 30`\n`/task 写作业`', {
          parse_mode: 'Markdown'
        });
        return false;
      }

      const user = await User.findOne({ userId });
      const { description, duration } = this.parseTaskInput(taskInput, user?.settings.defaultDuration);
      const result = this.ctdpService
        ? await this.ctdpService.startMainTask(userId, {
            markerLabel: '确认开始专注', description, duration, submissionToken
          })
        : await this.taskService.createTask(userId, description, duration, false, null, submissionToken);
      taskCommitted = true;

      const message = NOTIFICATION_TEMPLATES.TASK_STARTED.replace(
        /\{(description|duration)\}/g, (_match, key: string) => key === 'description' ? description : String(duration)
      );

      await sendTelegramMessage(this.bot, userId, message, {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '✅ 完成任务', callback_data: `${CALLBACK_PREFIXES.COMPLETE_TASK}${result.task.taskId}` },
              { text: '❌ 放弃任务', callback_data: `${CALLBACK_PREFIXES.FAIL_TASK}${result.task.taskId}` }
            ]
          ]
        }
      });

      logger.logTaskAction(userId, result.task.taskId, 'created', { description, duration });
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (taskCommitted) {
        // The task is already durable. Do not return false: draft callers would
        // retry and create a second task when Telegram is temporarily down.
        logger.warn('任务已创建，但启动通知发送失败；保留已提交状态', { userId, taskInput, error: message });
        return true;
      }
      logger.logError(error, { userId, taskInput, command: 'task' });
      await this.onError(userId, message);
      return false;
    }
  }

  async handleReserveCommand(userId: number, taskInput: string, submissionToken?: string): Promise<boolean> {
    let reservationCommitted = false;
    try {
      const ctdp = this.getReservationService();
      const user = await User.findOne({ userId });
      const { description, duration } = this.parseTaskInput(taskInput || '专注任务', user?.settings.defaultDuration);
      const reservationId = submissionToken ? `res_${submissionToken}` : `res_${Date.now()}_${userId}`;
      const reservationDelayText = formatDurationFromSeconds(config.linearDelay.defaultReservationDelay);

      await ctdp.createReservation(userId, description, duration, reservationId);

      try {
        await this.queueService.scheduleReservation(userId, reservationId, description, duration);
      } catch (error) {
        await ctdp.rollbackReservationCreation(userId, reservationId);

        throw error;
      }
      reservationCommitted = true;

      await sendTelegramMessage(this.bot,
        userId,
        '⏰ 预约承诺已建立\n\n' +
          `📋 任务：${description}\n` +
          `⏱ 时长：${duration}分钟\n` +
          `🕐 启动期限：${reservationDelayText}内\n\n` +
          '不必现在马上开始，但要在期限内按「开始专注」兑现预约。\n' +
          '准备时只做下一步：打开材料、离开手机、坐到你选定的位置。\n' +
          '错过期限、延期或取消，需要断开辅助链或形成永久判例。',
        {
          reply_markup: {
            inline_keyboard: [
              [
                { text: '🚀 开始专注，兑现预约', callback_data: `${CALLBACK_PREFIXES.START_RESERVED}${reservationId}` },
                { text: '处理取消或延期', callback_data: `${CALLBACK_PREFIXES.CANCEL_RESERVATION}${reservationId}` }
              ]
            ]
          }
        }
      );

      logger.logTaskAction(userId, reservationId, 'reservation_created', { description, duration });
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (reservationCommitted) {
        // The AuxChain and Bull job are already durable. A notification retry
        // must never create another reservation or reset the draft for retry.
        logger.warn('预约已创建，但确认通知发送失败；保留已提交状态', {
          userId,
          taskInput,
          error: message
        });
        return true;
      }
      logger.logError(error, { userId, taskInput, command: 'reserve' });
      await this.onError(userId, message);
      return false;
    }
  }

  async handleCompleteTaskCallback(userId: number, data: string): Promise<void> {
    const taskId = data.replace(CALLBACK_PREFIXES.COMPLETE_TASK, '');

    try {
      const result = this.ctdpService
        ? await this.ctdpService.completeTrackedTask(userId, taskId)
        : await this.taskService.completeTask(userId, taskId, true);

      const message = `✅ 专注任务已完成！\n\n可信专注：${result.task.actualDuration ?? 0} 分钟\n` +
        `当前连击：${result.user.stats.currentStreak} 次\n\n` +
        '主链记录已保存，可以准备下一项。' +
        (result.rewardPending ? '\n附加奖励将单独同步，不影响继续专注。' : '');
      try {
        await sendTelegramMessage(this.bot, userId, message, { reply_markup: { inline_keyboard: [
          [{ text: '准备下一项预约', callback_data: 'quick_reserve' },
            { text: '查看专注状态', callback_data: 'quick_status' }]
        ] } });
      } catch (error) {
        logger.warn('专注已完成，确认消息未送达，可从状态查看', { userId, taskId,
          error: error instanceof Error ? error.message : String(error) });
      }
      void this.queueService.requestFocusRewardRecovery?.().catch(error => {
        logger.warn('专注已完成，附加奖励等待周期恢复', { userId, taskId, error: String(error) });
      });

      logger.logTaskAction(userId, taskId, 'completed_success');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.onError(userId, message);
    }
  }

  async sendRewardNotice(userId: number, taskId: string, reward: CultivationReward, task: ITask): Promise<void> {
    let message = `附加奖励已到账（${previewTaskDescription(task.description)}）\n`;
    message += `\n⚡ 获得修为：${reward.spiritualPower} 点`;
    message += `\n🧭 道行变化：+${reward.cultivationAttainmentDelta ?? 0}`;
    message += `\n💎 灵石变化：${reward.immortalStones >= 0 ? '+' : ''}${reward.immortalStones}`;
    message += `\n📘 主修功法：${reward.mainMethodName ?? '未入门'}`;
    if ((task.actualDuration ?? 0) < 60 && reward.spiritualPower === 0) {
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

      const account = await User.findOne({ userId });
      const offer = account?.cultivation.canonical?.state.combatFlags.pendingEncounterOffer as
        { offerId?: string } | null | undefined;
      if (offer?.offerId !== reward.encounter.offerSummary.offerId) {
        await sendTelegramMessage(this.bot, userId, message);
        return;
      }

      await sendTelegramMessage(this.bot, userId, message, {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: '🚶 离开',
                callback_data: `${CALLBACK_PREFIXES.ENCOUNTER_ABANDON}${reward.encounter.offerSummary.offerId}`
              },
              {
                text: '⚔️ 争抢',
                callback_data: `${CALLBACK_PREFIXES.ENCOUNTER_CONTEST}${reward.encounter.offerSummary.offerId}`
              }
            ]
          ]
        }
      });

      logger.logTaskAction(userId, taskId, 'reward_paid_offer');
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
    await sendTelegramMessage(this.bot, userId, message);
  }

  async handleAbandonEncounterCallback(userId: number, data: string): Promise<void> {
    try {
      if (!this.cultivationService) {
        throw new Error('守宝奇遇服务未初始化');
      }

      const offerId = data.replace(CALLBACK_PREFIXES.ENCOUNTER_ABANDON, '');
      const offer = await this.cultivationService.abandonEncounterOffer(userId, offerId);
      await sendTelegramMessage(this.bot, userId, `🚶 你放弃了 ${offer.lootDisplayName}，此宝已随机缘散去。`);
      void this.queueService.requestFocusRewardRecovery?.().catch(() => undefined);
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

      await sendTelegramMessage(this.bot, userId, message);
      void this.queueService.requestFocusRewardRecovery?.().catch(() => undefined);
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

      await sendTelegramMessage(this.bot, userId, NOTIFICATION_TEMPLATES.TASK_FAILED);

      if (result.wasChainBroken) {
        await sendTelegramMessage(this.bot, userId, NOTIFICATION_TEMPLATES.CHAIN_BROKEN);
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
      const result = await this.getReservationService().startReservedTask(userId, reservationId);

      const message =
        (result.alreadyStarted
          ? '🚀 预约此前已兑现，任务仍在进行，本次不会重新计时\n\n'
          : '🚀 预约已兑现，开始专注\n\n') +
        `📋 任务：${previewTaskDescription(result.task.description)}\n` +
        `⏱ 时长：${result.task.duration}分钟`;

      await sendTelegramMessage(this.bot, userId, message, {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '✅ 完成任务', callback_data: `${CALLBACK_PREFIXES.COMPLETE_TASK}${result.task.taskId}` },
              { text: '❌ 放弃任务', callback_data: `${CALLBACK_PREFIXES.FAIL_TASK}${result.task.taskId}` }
            ]
          ]
        }
      });

      logger.logTaskAction(userId, result.task.taskId, 'reservation_started', {
        reservationId,
        chainId: result.mainChain.chainId
      });
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

      await this.getReservationService().requestAuxiliaryViolation(
        userId, reservationId, `delay_reservation_${delayMinutes}`, delayMinutes
      );
      await this.sendAuxiliaryDecision(userId, reservationId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.onError(userId, message);
    }
  }

  async handleCancelReservationCallback(userId: number, data: string): Promise<void> {
    const reservationId = data.replace(CALLBACK_PREFIXES.CANCEL_RESERVATION, '');

    try {
      await this.getReservationService().requestAuxiliaryViolation(userId, reservationId, 'cancel_reservation');
      await this.sendAuxiliaryDecision(userId, reservationId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.onError(userId, message);
    }
  }

  async sendAuxiliaryDecision(userId: number, reservationId: string, automatic = false): Promise<void> {
    let chain = await AuxChain.findOne({
      userId,
      status: 'active',
      'pendingReservation.reservationId': reservationId
    });
    if (!chain?.pendingDecision) {
      await sendTelegramMessage(this.bot, userId, '已按当前辅助链的既有判例处理。使用 /reserve_status 查看状态。');
      return;
    }
    const notificationToken = randomUUID();
    const decisionToken = chain.pendingDecision.decisionToken ?? randomBytes(10).toString('hex');
    const now = new Date();
    chain = await AuxChain.findOneAndUpdate({
      _id: chain._id,
      'pendingReservation.reservationId': reservationId,
      'pendingDecision.behaviorKey': chain.pendingDecision.behaviorKey,
      'pendingDecision.decisionToken': chain.pendingDecision.decisionToken ?? { $exists: false },
      'pendingDecision.notifyingUntil': { $not: { $gt: now } },
      ...(automatic ? {
        'pendingDecision.notifiedAt': { $exists: false },
        'pendingDecision.nextNotificationAt': { $not: { $gt: now } }
      } : {})
    }, { $set: {
      'pendingDecision.notificationToken': notificationToken,
      'pendingDecision.decisionToken': decisionToken,
      'pendingDecision.notifyingUntil': new Date(now.getTime() + 5 * 60000),
      'pendingDecision.nextNotificationAt': new Date(now.getTime() + 15 * 60000)
    } }, { new: true });
    if (!chain?.pendingDecision) return;
    let sent = false;
    try {
      const reason =
        chain.pendingDecision.behaviorKey === 'missed_start'
          ? '没有在约定期限内开始'
          : chain.pendingDecision.delayMinutes
            ? `希望延迟${chain.pendingDecision.delayMinutes}分钟`
            : '希望取消预约';
      await sendTelegramMessage(this.bot,
        userId,
        `辅助链需要判定：${reason}\n\n` +
          `当前已兑现预约：${chain.completedReservations ?? 0} 次\n` +
          '依照下必为例，只能选择：\n' +
          '1. 承认辅助链断裂，当前预约记录归零，主任务链不受影响。\n' +
          '2. 允许这种情况，当前辅助链余下生命周期都必须允许。',
        {
          reply_markup: {
            inline_keyboard: [
              [
                { text: '断开辅助链，重新开始', callback_data: `aux_decide:break_chain:${decisionToken}` },
                { text: '当前辅助链永久允许', callback_data: `aux_decide:allow_forever:${decisionToken}` }
              ]
            ]
          }
        }
      );
      sent = true;
      await AuxChain.updateOne({
        _id: chain._id,
        'pendingReservation.reservationId': reservationId,
        'pendingDecision.notificationToken': notificationToken
      }, {
        $set: { 'pendingDecision.notifiedAt': new Date() },
        $unset: { 'pendingDecision.notifyingUntil': 1, 'pendingDecision.notificationToken': 1 }
      });
    } catch (error) {
      // If Telegram accepted the send but MongoDB failed, preserve the durable
      // cooldown instead of sending again on every reconciliation tick.
      if (!sent) {
        await AuxChain.updateOne({ _id: chain._id, 'pendingDecision.notificationToken': notificationToken }, {
          $set: { 'pendingDecision.nextNotificationAt': new Date(Date.now() + 60000) },
          $unset: { 'pendingDecision.notifyingUntil': 1, 'pendingDecision.notificationToken': 1 }
        });
      }
      throw error;
    }
  }

  async handleAuxiliaryDecisionCallback(userId: number, data: string): Promise<void> {
    const [prefix, decision, decisionToken, extra] = data.split(':');
    if (!this.ctdpService || !['break_chain', 'allow_forever'].includes(decision ?? '')) return;
    if (prefix !== 'aux_decide' || !/^[a-f0-9]{20}$/.test(decisionToken ?? '') || extra !== undefined) {
      await sendTelegramMessage(this.bot, userId, '判例按钮已过期，请用 /reserve_status 查看当前判例');
      return;
    }
    try {
      await this.ctdpService.resolveAuxiliaryDecisionToken(
        userId,
        decisionToken!,
        decision as 'break_chain' | 'allow_forever'
      );
      await sendTelegramMessage(this.bot,
        userId,
        decision === 'break_chain'
          ? '辅助链已断开，当前预约记录归零。可以重新准备预约；主任务链保持原状。'
          : '已形成当前辅助链的永久判例。后续相同情况也会允许。'
      );
    } catch (error) {
      await this.onError(userId, error instanceof Error ? error.message : String(error));
    }
  }

  async sendTaskPrompt(userId: number): Promise<void> {
    await sendTelegramMessage(this.bot,
      userId,
      '🚀 **创建新任务**\n\n' +
        '使用格式：`/task 任务描述 时长`\n\n' +
        '例如：\n' +
        '• `/task 学习编程 45`\n' +
        '• `/task 读书 30`\n' +
        `• \`/task 写作业\` (默认${DEFAULT_TASK_DURATION_MINUTES}分钟)`,
      { parse_mode: 'Markdown' }
    );
  }

  async sendReservePrompt(userId: number): Promise<void> {
    const reservationDelayText = formatDurationFromSeconds(config.linearDelay.defaultReservationDelay);

    await sendTelegramMessage(this.bot,
      userId,
      '⏰ **预约任务**\n\n' +
        '使用格式：`/reserve 任务描述 时长`\n\n' +
        `${reservationDelayText}的延迟将帮助您：\n` +
        '• 先处理切换成本\n' +
        '• 做好心理准备\n' +
        '• 在期限内兑现主任务',
      { parse_mode: 'Markdown' }
    );
  }
}

export default TaskCommandHandlers;
