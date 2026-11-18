import { sendTelegramMessage } from '../utils/telegramMessages.js';
import { randomBytes } from 'node:crypto';
import type TelegramBot from 'node-telegram-bot-api';
import TaskDraft, { type ITaskDraft } from '../models/TaskDraft.js';
import User from '../models/User.js';
import TaskChain from '../models/TaskChain.js';
import AuxChain from '../models/AuxChain.js';
import MainChain from '../models/MainChain.js';
import type TaskCommandHandlers from './taskCommands.js';
import {
  DEFAULT_TASK_DURATION_MINUTES,
  getMinTaskDurationMinutes,
  MAX_TASK_DURATION_MINUTES
} from '../types/taskDefaults.js';
import config from '../../config/index.js';
import { formatDurationFromSeconds } from '../utils/helpers.js';
import { isValidTaskDescription } from '../utils/taskText.js';
import { TASK_DESCRIPTION_ERROR } from '../utils/constants.js';

class TaskDraftHandlers {
  private static readonly SUBMISSION_LEASE_MS = 2 * 60 * 1000;
  private static readonly activeSubmissions = new Set<string>();

  constructor(
    private bot: TelegramBot,
    private commands: TaskCommandHandlers
  ) {}

  async begin(userId: number, mode: ITaskDraft['mode'], description = '', plannedDuration?: number): Promise<void> {
    const submitting = await TaskDraft.findOne({ userId, stage: 'submitting' });
    if (submitting) {
      if (!(await this.recoverSubmittingDraft(submitting))) {
        await sendTelegramMessage(this.bot, userId, '之前的准备正在提交，请稍候再查看 /status 或 /reserve_status。');
      }
      return;
    }
    description = description.trim();
    if (!isValidTaskDescription(description, true)) {
      await sendTelegramMessage(this.bot, userId, TASK_DESCRIPTION_ERROR);
      return;
    }
    if (!description) {
      let existing = await TaskDraft.findOne({ userId, expiresAt: { $gt: new Date() } });
      if (existing) {
        if (existing.mode !== mode && existing.stage !== 'submitting') {
          existing = await TaskDraft.findOneAndUpdate({
            userId, token: existing.token, mode: existing.mode, stage: existing.stage, expiresAt: { $gt: new Date() }
          }, { $set: { mode, token: randomBytes(10).toString('hex') } }, { new: true });
          if (!existing) {
            await sendTelegramMessage(this.bot, userId, '当前准备状态已变化，请用 /status 查看原准备。');
            return;
          }
        }
        await this.showDraft(existing);
        return;
      }
    }
    const user = await User.findOne({ userId });
    let draft;
    try {
      draft = await TaskDraft.findOneAndUpdate(
        { userId, stage: { $ne: 'submitting' } },
        {
          $set: {
            token: randomBytes(10).toString('hex'),
            mode,
            stage: description ? 'ready' : 'description',
            description,
            duration: plannedDuration ?? user?.settings.defaultDuration ?? DEFAULT_TASK_DURATION_MINUTES,
            expiresAt: new Date(Date.now() + 30 * 60 * 1000)
          }
        },
        { upsert: true, new: true, runValidators: true }
      );
    } catch (error) {
      if (!(error && typeof error === 'object' && 'code' in error && error.code === 11000)) throw error;
      await sendTelegramMessage(this.bot, userId, '之前的准备正在提交，请稍候再查看 /status 或 /reserve_status。');
      return;
    }
    await this.showDraft(draft);
  }

  private async showDraft(draft: ITaskDraft): Promise<void> {
    if (draft.stage === 'submitting') {
      if (!(await this.recoverSubmittingDraft(draft))) {
        await sendTelegramMessage(this.bot, draft.userId, '之前的准备正在提交，请稍候再查看 /status 或 /reserve_status。');
      }
      return;
    }
    if (draft.stage === 'ready') {
      await this.showConfirmation(draft);
      return;
    }
    await sendTelegramMessage(this.bot,
      draft.userId,
      '先写下这次要做的一件事，直接回复即可。\n\n现在只是准备，确认后才开始任务或建立预约承诺。',
      {
        reply_markup: { inline_keyboard: [[{ text: '退出准备', callback_data: `draft:${draft.token}:cancel` }]] }
      }
    );
  }

  async handleText(userId: number, text: string): Promise<boolean> {
    const description = text.trim();
    const draft = await TaskDraft.findOne({ userId, stage: 'description', expiresAt: { $gt: new Date() } });
    if (!draft) return false;
    if (!isValidTaskDescription(description)) {
      await sendTelegramMessage(this.bot, userId, TASK_DESCRIPTION_ERROR);
      return true;
    }
    const updated = await TaskDraft.findOneAndUpdate(
      { userId, token: draft.token, stage: 'description' },
      { $set: { description, stage: 'ready' } },
      { new: true }
    );
    if (updated) await this.showConfirmation(updated);
    return true;
  }

  private async showConfirmation(draft: ITaskDraft): Promise<void> {
    const delay = formatDurationFromSeconds(config.linearDelay.defaultReservationDelay);
    const action = draft.mode === 'reserve' ? `预约：承诺在 ${delay}内启动` : '立即开始专注';
    const prefix = `draft:${draft.token}:`;
    await sendTelegramMessage(this.bot,
      draft.userId,
      `这次要做：${draft.description}\n专注时长：${draft.duration} 分钟\n\n${action}\n确认前可调整时长或退出准备。`,
      {
        reply_markup: {
          inline_keyboard: [
            [30, 60, 90].map((minutes) => ({ text: `${minutes} 分钟`, callback_data: `${prefix}duration${minutes}` })),
            [{ text: draft.mode === 'reserve' ? '确认预约' : '确认开始', callback_data: `${prefix}confirm` }],
            [
              {
                text: draft.mode === 'reserve' ? '改为立即开始' : `改为${delay}内启动`,
                callback_data: `${prefix}switch`
              },
              { text: '退出准备', callback_data: `${prefix}cancel` }
            ]
          ]
        }
      }
    );
  }

  async handleCallback(userId: number, data: string): Promise<void> {
    const [prefix, token, action, extra] = data.split(':');
    if (prefix !== 'draft' || !token || !action || extra !== undefined) {
      await sendTelegramMessage(this.bot, userId, '准备按钮无效，请用 /status 查看当前准备。');
      return;
    }
    const filter = { userId, token, expiresAt: { $gt: new Date() } };
    const draft = await TaskDraft.findOne(filter);
    if (!draft) {
      await sendTelegramMessage(this.bot, userId, '这份准备已结束或不存在，请从 /reserve 或 /task 重新开始。');
      return;
    }
    if (draft.stage === 'submitting') {
      if (await this.recoverSubmittingDraft(draft)) return;
      await sendTelegramMessage(this.bot, userId, '这份准备正在提交，请稍候片刻再点一次。');
      return;
    }
    if (action === 'resume') {
      await this.showDraft(draft);
      return;
    }
    if (action === 'cancel') {
      const result = await TaskDraft.deleteOne({ ...filter, stage: { $ne: 'submitting' } });
      await sendTelegramMessage(this.bot, userId, result.deletedCount
        ? '已退出准备，尚未建立任务或预约承诺。'
        : '当前准备状态已变化，请用 /status 或 /reserve_status 查看，不要假定已取消。');
      return;
    }
    if (draft.stage !== 'ready') return;
    if (action === 'switch' || action?.startsWith('duration')) {
      const duration = action === 'switch' ? draft.duration : Number(action.slice('duration'.length));
      if (
        !Number.isInteger(duration) ||
        duration < getMinTaskDurationMinutes() ||
        duration > MAX_TASK_DURATION_MINUTES
      ) {
        await sendTelegramMessage(this.bot, userId, '任务时长超出允许范围，请重新选择。');
        return;
      }
      const updated = await TaskDraft.findOneAndUpdate(
        { ...filter, stage: 'ready' },
        {
          $set: {
            duration,
            mode: action === 'switch' ? (draft.mode === 'reserve' ? 'start' : 'reserve') : draft.mode
          }
        },
        { new: true }
      );
      if (updated) await this.showConfirmation(updated);
      return;
    }
    if (action !== 'confirm') return;
    const claimed = await TaskDraft.findOneAndUpdate(
      { ...filter, stage: 'ready' },
      { $set: { stage: 'submitting' } },
      { new: true }
    );
    if (!claimed) return;
    const activeKey = `${userId}:${token}`;
    TaskDraftHandlers.activeSubmissions.add(activeKey);
    try {
      const input = `${claimed.description} ${claimed.duration}`;
      const succeeded =
        claimed.mode === 'reserve'
          ? await this.commands.handleReserveCommand(userId, input, token)
          : await this.commands.handleTaskCommand(userId, input, token);
      if (succeeded) {
        await TaskDraft.deleteOne({ userId, token });
      } else {
        await TaskDraft.updateOne({ userId, token }, { $set: { stage: 'ready' } });
      }
    } catch (error) {
      await TaskDraft.updateOne({ userId, token }, { $set: { stage: 'ready' } });
      throw error;
    } finally {
      TaskDraftHandlers.activeSubmissions.delete(activeKey);
    }
  }

  private async recoverSubmittingDraft(draft: ITaskDraft): Promise<boolean> {
    // Lease expiry alone cannot replace a still-live submission in the single polling worker.
    if (TaskDraftHandlers.activeSubmissions.has(`${draft.userId}:${draft.token}`)) return false;
    const updatedAt = draft.updatedAt?.getTime() ?? 0;
    if (!updatedAt || Date.now() - updatedAt < TaskDraftHandlers.SUBMISSION_LEASE_MS) return false;
    if (draft.mode === 'start' && await TaskChain.exists({ userId: draft.userId, tasks: { $elemMatch: {
      submissionToken: draft.token, creationState: { $in: ['initializing', 'rolling_back'] }
    } } })) {
      await sendTelegramMessage(this.bot, draft.userId, '任务启动未完成，正在恢复或清理。请稍后查看 /status，再次确认准备。');
      return true;
    }
    if (draft.mode === 'start') {
      const chain = await TaskChain.findOne({ userId: draft.userId, 'tasks.submissionToken': draft.token });
      const task = chain?.tasks.find(entry => entry.submissionToken === draft.token);
      if (task?.mainChainId && !await MainChain.exists({ userId: draft.userId, chainId: task.mainChainId,
        'nodes.taskId': task.taskId })) {
        await sendTelegramMessage(this.bot, draft.userId, '启动记录正在恢复，请稍后使用 /status 查看，再次确认准备。');
        return true;
      }
    }
    const committed =
      draft.mode === 'reserve'
        ? await AuxChain.exists({
            userId: draft.userId,
            $or: [
              { 'pendingReservation.reservationId': `res_${draft.token}` },
              { 'reservationHistory.reservationId': `res_${draft.token}` }
            ]
          })
        : await TaskChain.exists({
            userId: draft.userId,
            tasks: {
              $elemMatch: {
                submissionToken: draft.token
              }
            }
          });

    if (committed) {
      await TaskDraft.deleteOne({ userId: draft.userId, token: draft.token, stage: 'submitting' });
      await sendTelegramMessage(this.bot,
        draft.userId,
        draft.mode === 'reserve'
          ? '预约已经建立，之前的确认通知可能发送失败；请使用 /reserve_status 查看。'
          : '任务已经开始，之前的确认通知可能发送失败；请使用 /status 查看。'
      );
      return true;
    }

    if (Date.now() - updatedAt >= TaskDraftHandlers.SUBMISSION_LEASE_MS) {
      const reset = await TaskDraft.findOneAndUpdate(
        { userId: draft.userId, token: draft.token, stage: 'submitting', updatedAt: draft.updatedAt },
        { $set: { stage: 'ready', updatedAt: new Date() } },
        { new: true }
      );
      if (reset) {
        await this.showConfirmation(reset);
        return true;
      }
    }

    return false;
  }
}

export default TaskDraftHandlers;
