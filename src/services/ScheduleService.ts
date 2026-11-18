import { randomBytes } from 'node:crypto';
import Queue from 'bull';
import moment from 'moment-timezone';
import type TelegramBot from 'node-telegram-bot-api';
import config from '../../config/index.js';
import ScheduledPlan, { type IScheduledItem, type IScheduledPlan } from '../models/ScheduledPlan.js';
import User from '../models/User.js';
import TaskChain, { type ITask } from '../models/TaskChain.js';
import { ScheduleError, validateScheduleSnapshot, type ScheduleSnapshot } from '../utils/scheduleSnapshot.js';
import { sendTelegramMessage } from '../utils/telegramMessages.js';
import logger from '../utils/logger.js';

type ScheduleJob = { token?: string };
type ScheduleSender = (userId: number, text: string, options: TelegramBot.SendMessageOptions)
  => Promise<{ message_id: number }>;
const MAX_LATENESS_MS = 15 * 60 * 1000;
const CLAIM_LEASE_MS = 2 * 60 * 1000;

export type ScheduleItemView = IScheduledItem & {
  focusStatus?: 'running' | 'settling' | 'completed' | 'failed' | 'unverified';
};
type SchedulePlanView = Omit<IScheduledPlan, 'items'> & { items: ScheduleItemView[] };

export interface ScheduleSyncResult {
  date: string;
  timezone: string;
  revision: string;
  count: number;
  pending: number;
  sent: number;
  expired: number;
  unknown: number;
  queued: boolean;
  unchanged: boolean;
}

class ScheduleService {
  queue: Queue.Queue<ScheduleJob> | null = null;
  private reconciliation: Promise<void> | null = null;

  constructor(private sender?: ScheduleSender) {}

  async initialize(bot: Pick<TelegramBot, 'sendMessage'> | null = null,
    queueName = 'Nautilus日程提醒队列'): Promise<void> {
    if (this.queue) return;
    if (bot) this.sender = (userId, text, options) => sendTelegramMessage(bot, userId, text, options);
    const queue = new Queue<ScheduleJob>(queueName, {
      redis: { host: config.redis.host, port: config.redis.port, password: config.redis.password, db: config.redis.db },
      defaultJobOptions: { attempts: 3, backoff: 2000, removeOnComplete: 20, removeOnFail: 20 }
    });
    this.queue = queue;
    queue.on('error', error => logger.error('日程队列连接错误', { error: error.message }));
    queue.on('failed', (job, error) => logger.warn('日程队列任务失败', { jobId: job.id, error: error.message }));
    queue.process('remind', 2, async job => {
      if (job.data.token) await this.deliver(job.data.token);
    });
    queue.process('reconcile', 1, async () => this.reconcile());
    await this.restoreAfterRedisReconnect();
  }

  async restoreAfterRedisReconnect(): Promise<void> {
    if (!this.queue) return;
    await this.queue.add('reconcile', {}, { jobId: 'schedule-reconcile', repeat: { every: 60000 } });
    await this.reconcile();
  }

  async close(): Promise<void> {
    const queue = this.queue;
    this.queue = null;
    await queue?.close();
  }

  async sync(userId: number, raw: unknown): Promise<ScheduleSyncResult> {
    const snapshot = validateScheduleSnapshot(raw);
    if (!await User.exists({ userId })) throw new ScheduleError('请先在 bot 私聊发送 /start 初始化用户', 403);
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const previous = await ScheduledPlan.findOne({ userId, date: snapshot.date }).lean();
      if (previous && previous.generatedAt > snapshot.generatedAt && previous.revision !== snapshot.revision) {
        throw new ScheduleError('服务器已有更新的日程，请重新读取 Obsidian 后同步', 409);
      }
      const items = this.mergeItems(snapshot, previous);
      const data = { userId, date: snapshot.date, timezone: snapshot.timezone, revision: snapshot.revision,
        generatedAt: new Date(Math.max(snapshot.generatedAt.getTime(), previous?.generatedAt.getTime() ?? 0)), items };
      if (!previous) {
        try {
          await ScheduledPlan.create(data);
        } catch (error) {
          if (error && typeof error === 'object' && 'code' in error && error.code === 11000) continue;
          throw error;
        }
      } else {
        const updated = await ScheduledPlan.updateOne({ _id: previous._id, __v: previous.__v },
          { $set: data, $inc: { __v: 1 } }, { runValidators: true });
        if (!updated.modifiedCount) continue;
      }
      const queued = await (async () => {
        // An already-running scan may have passed this day before its new snapshot was saved.
        if (this.reconciliation) await this.reconciliation;
        await this.reconcile();
        return true;
      })().catch(() => false);
      return {
        date: snapshot.date, timezone: snapshot.timezone, revision: snapshot.revision,
        count: items.length, pending: items.filter(item => item.status === 'pending').length,
        sent: items.filter(item => item.status === 'sent').length,
        expired: items.filter(item => item.status === 'expired').length,
        unknown: items.filter(item => item.status === 'unknown').length,
        queued, unchanged: previous?.revision === snapshot.revision
      };
    }
    throw new ScheduleError('日程正在更新，请稍后重试同步', 409);
  }

  private mergeItems(snapshot: ScheduleSnapshot, previous: IScheduledPlan | null): IScheduledItem[] {
    const oldItems = new Map(previous?.items.map(item => [item.key, item]) ?? []);
    return snapshot.items.map(item => {
      const old = oldItems.get(item.key);
      const sameTime = old?.startAt.getTime() === item.startAt.getTime() &&
        old?.endAt.getTime() === item.endAt.getTime() && previous?.timezone === snapshot.timezone;
      if (old && sameTime) return { ...old, ...item };
      if (old && ['sent', 'dismissed', 'unknown', 'sending'].includes(old.status)) {
        return { ...old, ...item, token: randomBytes(12).toString('hex'),
          status: old.status === 'sending' ? 'unknown' : old.status };
      }
      return { ...item, token: randomBytes(12).toString('hex'), attempts: 0,
        status: item.startAt.getTime() <= Date.now() ? 'expired' : 'pending' };
    });
  }

  reconcile(): Promise<void> {
    if (!this.queue) return Promise.reject(new Error('日程队列尚未初始化'));
    if (this.reconciliation) return this.reconciliation;
    const promise = this.performReconciliation(this.queue).finally(() => {
      if (this.reconciliation === promise) this.reconciliation = null;
    });
    this.reconciliation = promise;
    return promise;
  }

  private async performReconciliation(queue: Queue.Queue<ScheduleJob>): Promise<void> {
    const plans = ScheduledPlan.find({ 'items.status': { $in: ['pending', 'sending'] } }).cursor();
    let failures = 0;
    for await (const plan of plans) {
      for (const item of plan.items) {
        try {
          if (item.status === 'sending') {
            if ((item.claimedAt?.getTime() ?? 0) <= Date.now() - CLAIM_LEASE_MS) {
              await this.setStatus(item.token, 'sending', { status: 'unknown' });
            }
            continue;
          }
          if (item.status !== 'pending') continue;
          if (item.endAt.getTime() <= Date.now() || item.startAt.getTime() < Date.now() - MAX_LATENESS_MS) {
            await this.setStatus(item.token, 'pending', { status: 'expired' });
            continue;
          }
          const dueAt = Math.max(item.startAt.getTime(), item.retryAt?.getTime() ?? 0);
          const jobId = `remind_${item.token}`;
          const existing = await queue.getJob(jobId);
          if (existing) {
            const state = await existing.getState();
            if (['active', 'waiting', 'paused'].includes(state)) continue;
            if (state === 'delayed' && Math.abs(existing.timestamp + Number(existing.opts.delay ?? 0) - dueAt) < 1000) {
              continue;
            }
            await existing.remove();
          }
          await queue.add('remind', { token: item.token }, { jobId, delay: Math.max(0, dueAt - Date.now()) });
        } catch (error) {
          failures += 1;
          logger.warn('单条日程提醒等待恢复', { token: item.token, error: String(error) });
        }
      }
    }
    if (failures) throw new Error(`${failures} 条日程等待队列恢复`);
  }

  private async setStatus(token: string, status: IScheduledItem['status'],
    data: Partial<IScheduledItem>, claim?: string): Promise<boolean> {
    const filter = { token, status, ...(claim ? { claim } : {}) };
    const values = Object.fromEntries(Object.entries(data).map(([key, value]) => [`items.$.${key}`, value]));
    const result = await ScheduledPlan.updateOne({ items: { $elemMatch: filter } },
      { $set: values, $inc: { __v: 1 } });
    return result.modifiedCount > 0;
  }

  async deliver(token: string): Promise<void> {
    if (!this.sender) throw new Error('日程 Telegram 发送器尚未初始化');
    const now = new Date();
    const claim = randomBytes(12).toString('hex');
    const plan = await ScheduledPlan.findOneAndUpdate({ items: { $elemMatch: {
      token, status: 'pending', startAt: { $lte: now },
      $or: [{ retryAt: { $exists: false } }, { retryAt: { $lte: now } }]
    } } }, { $set: { 'items.$.status': 'sending', 'items.$.claimedAt': now, 'items.$.claim': claim },
      $inc: { 'items.$.attempts': 1, __v: 1 } }, { new: true }).lean();
    const item = plan?.items.find(entry => entry.token === token && entry.claim === claim);
    if (!plan || !item) return;
    if (item.endAt.getTime() <= now.getTime() || item.startAt.getTime() < now.getTime() - MAX_LATENESS_MS) {
      await this.setStatus(token, 'sending', { status: 'expired' }, claim);
      return;
    }
    // Recheck the claimed token immediately before dispatch after any concurrent snapshot replacement.
    if (!await ScheduledPlan.exists({
      userId: plan.userId, items: { $elemMatch: { token, status: 'sending', claim } }
    })) {
      return;
    }
    const start = moment(item.startAt).tz(plan.timezone).format('MM-DD HH:mm');
    const end = moment(item.endAt).tz(plan.timezone).format('MM-DD HH:mm');
    const lateMinutes = Math.floor((now.getTime() - item.startAt.getTime()) / 60000);
    const text = `该开始了：${item.title}\n计划：${start} → ${end}（${plan.timezone}）` +
      (lateMinutes > 0 ? `\n恢复提醒：比计划开始晚了 ${lateMinutes} 分钟。` : '') +
      '\n\n选择准备开始，或预约 15 分钟内启动。确认前只是日程提醒。';
    let receipt: { message_id: number };
    try {
      receipt = await this.sender(plan.userId, text, { reply_markup: { inline_keyboard: [
        [{ text: '准备开始', callback_data: `schedule:${token}:start` },
          { text: '15 分钟内启动', callback_data: `schedule:${token}:reserve` }],
        [{ text: '今天略过', callback_data: `schedule:${token}:dismiss` }]
      ] } });
    } catch (error) {
      const body = (error as { response?: { body?: { ok?: boolean; error_code?: number;
        parameters?: { retry_after?: number } } } })?.response?.body;
      const explicit = body?.ok === false && Number.isInteger(body.error_code);
      if (explicit && body.error_code === 429 && item.attempts < 3) {
        const wait = Math.max(1, Math.min(900, Number(body.parameters?.retry_after) || 60));
        await this.setStatus(token, 'sending', {
          status: 'pending', retryAt: new Date(Date.now() + wait * 1000)
        }, claim);
      } else {
        const status = explicit && body.error_code! >= 400 && body.error_code! < 500 ? 'failed' : 'unknown';
        await this.setStatus(token, 'sending', { status }, claim);
      }
      return;
    }
    // A DB error leaves sending intact; recovery marks it unknown instead of sending a second message.
    await this.setStatus(token, 'sending', Number.isInteger(receipt?.message_id)
      ? { status: 'sent', sentAt: new Date(), messageId: receipt.message_id } : { status: 'unknown' }, claim);
  }

  async dismiss(userId: number, token: string): Promise<boolean> {
    if (!await this.actionItem(userId, token)) return false;
    const result = await ScheduledPlan.updateOne({ userId, items: { $elemMatch: {
      token, status: { $ne: 'dismissed' }, startAt: { $lte: new Date() }
    } } }, { $set: { 'items.$.status': 'dismissed' }, $inc: { __v: 1 } });
    return result.modifiedCount > 0;
  }

  async list(userId: number, date: string): Promise<SchedulePlanView | null> {
    const plan = await ScheduledPlan.findOne({ userId, date }).lean();
    return plan ? this.withFocusProgress(plan) : null;
  }

  private async withFocusProgress(plan: IScheduledPlan): Promise<SchedulePlanView> {
    if (!plan.items.length) return plan;
    const days = plan.items.map(item => moment(item.startAt).tz(plan.timezone).startOf('day'));
    const start = new Date(Math.min(...days.map(day => day.valueOf())));
    const end = new Date(Math.max(...days.map(day => day.clone().add(1, 'day').valueOf())));
    const titles = [...new Set(plan.items.map(item => item.title))];
    const [tasks, scheduled] = await Promise.all([
      TaskChain.aggregate<ITask>([
        { $match: { userId: plan.userId } },
        { $unwind: '$tasks' },
        { $match: { 'tasks.description': { $in: titles }, 'tasks.startTime': { $gte: start, $lt: end } } },
        { $replaceRoot: { newRoot: '$tasks' } }
      ]),
      ScheduledPlan.aggregate<{ title: string; startAt: Date }>([
        { $match: { userId: plan.userId } },
        { $unwind: '$items' },
        { $match: { 'items.title': { $in: titles }, 'items.startAt': { $gte: start, $lt: end } } },
        { $project: { _id: 0, title: '$items.title', startAt: '$items.startAt' } }
      ])
    ]);
    const key = (title: string, at: Date) => JSON.stringify([
      title, moment(at).tz(plan.timezone).format('YYYY-MM-DD')
    ]);
    const counts = new Map<string, number>();
    for (const item of scheduled) {
      const itemKey = key(item.title, item.startAt);
      counts.set(itemKey, (counts.get(itemKey) ?? 0) + 1);
    }
    // Old drafts have no schedule ID. Infer progress only for a unique exact-title pair on that local day.
    return { ...plan, items: plan.items.map(item => {
      const itemKey = key(item.title, item.startAt);
      if (item.status === 'dismissed' || counts.get(itemKey) !== 1) return item;
      const matches = tasks.filter(task => key(task.description, task.startTime) === itemKey);
      const task = matches.length === 1 ? matches[0] : undefined;
      if (!task || task.creationState !== undefined && task.creationState !== 'ready' ||
          !['running', 'completed', 'failed'].includes(task.status)) return item;
      // Legacy terminal records predate settlement receipts; their saved outcome is still authoritative.
      const legacyTerminal = task.coreProtocolVersion === undefined && task.settlementStatus === undefined;
      const focusStatus = task.status === 'running' ? 'running'
        : task.settlementStatus === 'settled' || legacyTerminal
          ? task.status === 'completed' ? 'completed' : 'failed'
          : task.settlementStatus === undefined ? 'unverified' : 'settling';
      return { ...item, focusStatus };
    }) };
  }

  async actionItem(userId: number, token: string): Promise<ScheduleItemView | null> {
    if (!/^[a-f0-9]{24}$/.test(token)) return null;
    const now = new Date();
    // Reminder expiry limits automatic delivery, not the owner's ability to act on a task.
    const plan = await ScheduledPlan.findOne({ userId, items: { $elemMatch: {
      token, startAt: { $lte: now }, status: { $ne: 'dismissed' }
    } } }).lean();
    if (!plan) return null;
    const item = (await this.withFocusProgress(plan)).items.find(entry => entry.token === token);
    return item && (!item.focusStatus || item.focusStatus === 'failed') ? item : null;
  }
}

export default ScheduleService;
