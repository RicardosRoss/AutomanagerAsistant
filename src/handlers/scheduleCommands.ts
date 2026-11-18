import moment from 'moment-timezone';
import type TelegramBot from 'node-telegram-bot-api';
import type ScheduleService from '../services/ScheduleService.js';
import type TaskDraftHandlers from './taskDraftCommands.js';
import { sendTelegramMessage } from '../utils/telegramMessages.js';
import { getMinTaskDurationMinutes, MAX_TASK_DURATION_MINUTES } from '../types/taskDefaults.js';

class ScheduleCommandHandlers {
  constructor(private bot: TelegramBot, private service: ScheduleService, private drafts: TaskDraftHandlers) {}

  async handleCallback(userId: number, data: string): Promise<void> {
    const match = /^schedule:([a-f0-9]{24}):(start|reserve|dismiss)$/.exec(data);
    const token = match?.[1];
    const item = token ? await this.service.actionItem(userId, token) : null;
    if (!match || !item || !token) {
      await sendTelegramMessage(this.bot, userId, '这条日程当前不可操作，请用 /schedule 查看最新安排；专注结果尚未保存时可用 /status 重试。');
      return;
    }
    if (match[2] === 'dismiss') {
      const dismissed = await this.service.dismiss(userId, token);
      await sendTelegramMessage(this.bot, userId, dismissed
        ? '已略过这条日程提醒。没有建立任务或预约承诺。'
        : '这条日程状态已变化，请用 /schedule 查看。');
      return;
    }
    const duration = Math.max(getMinTaskDurationMinutes(),
      Math.min(MAX_TASK_DURATION_MINUTES, item.endMinute - item.startMinute));
    await this.drafts.begin(userId, match[2] === 'reserve' ? 'reserve' : 'start', item.title, duration);
  }

  async handleCommand(userId: number, args: string): Promise<void> {
    const argument = args.trim();
    const timezone = 'Asia/Shanghai';
    const date = argument === 'tomorrow' || argument === '明天'
      ? moment.tz(timezone).add(1, 'day').format('YYYY-MM-DD')
      : !argument || argument === 'today' || argument === '今天'
        ? moment.tz(timezone).format('YYYY-MM-DD') : argument;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !moment(date, 'YYYY-MM-DD', true).isValid()) {
      await sendTelegramMessage(this.bot, userId, '用 /schedule、/schedule tomorrow 或 /schedule YYYY-MM-DD 查看日程。');
      return;
    }
    const plan = await this.service.list(userId, date);
    if (!plan) {
      await sendTelegramMessage(this.bot, userId, `${date} 还没有同步的 Nautilus 日程。`);
      return;
    }
    const statuses = { pending: '等待提醒 · 待处理', sending: '正在投递 · 待处理', sent: '已提醒 · 待处理', dismissed: '已略过',
      expired: '错过提醒 · 待处理', failed: '投递失败 · 待处理', unknown: '投递结果未知 · 待处理' };
    const focusStatuses = { running: '专注中', settling: '结算中（用 /status 重试保存）', completed: '已完成',
      failed: '未完成 · 可重新准备', unverified: '结果待核对' };
    const lines = plan.items.map(item => `${moment(item.startAt).tz(plan.timezone).format('MM-DD HH:mm')} ` +
      `${item.title} · ${item.focusStatus ? focusStatuses[item.focusStatus] : statuses[item.status]}`);
    const now = new Date();
    const active = plan.items.filter(item => item.startAt <= now && item.status !== 'dismissed' &&
      (!item.focusStatus || item.focusStatus === 'failed'));
    await sendTelegramMessage(this.bot, userId,
      `${date} Nautilus 日程（${plan.timezone}）\n${lines.join('\n') || '当天计划已清空。'}\n\n` +
      '这是上次同步的排程快照。超过计划时间仍可准备、预约或略过；确认前不建立承诺。' +
      '\n专注进度按同一天唯一同名任务核对；有同名歧义时保留提醒状态。' +
      '\n修改 Obsidian 日程后重新同步即可更新提醒。',
      { reply_markup: { inline_keyboard: active.slice(0, 20).map(item => [
        { text: `准备：${item.title.slice(0, 25)}`, callback_data: `schedule:${item.token}:start` },
        { text: '15 分钟内启动', callback_data: `schedule:${item.token}:reserve` },
        { text: '略过', callback_data: `schedule:${item.token}:dismiss` }
      ]) } });
  }
}

export default ScheduleCommandHandlers;
