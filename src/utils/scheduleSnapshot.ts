import { createHash } from 'node:crypto';
import moment from 'moment-timezone';
import { isValidTaskDescription } from './taskText.js';

export class ScheduleError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

export type ScheduleKind = 'fixed' | 'pinned' | 'flex';
export interface ScheduleInputItem {
  title: string;
  kind: ScheduleKind;
  startMinute: number;
  endMinute: number;
}
export interface ScheduleItemSnapshot extends ScheduleInputItem {
  key: string;
  startAt: Date;
  endAt: Date;
}
export interface ScheduleSnapshot {
  date: string;
  timezone: string;
  generatedAt: Date;
  revision: string;
  items: ScheduleItemSnapshot[];
}

function calendarTime(date: string, minute: number, timezone: string): Date {
  const calendarDay = moment.utc(date, 'YYYY-MM-DD', true).add(Math.floor(minute / 1440), 'days');
  const clock = `${String(Math.floor(minute % 1440 / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
  const localTime = `${calendarDay.format('YYYY-MM-DD')} ${clock}`;
  const instant = moment.tz(localTime, 'YYYY-MM-DD HH:mm', true, timezone);
  if (!instant.isValid() || instant.format('YYYY-MM-DD HH:mm') !== localTime) {
    throw new ScheduleError('日程包含时区夏令时跳过的时刻，请指定有效时间');
  }
  return instant.toDate();
}

export function validateScheduleSnapshot(value: unknown, now = new Date()): ScheduleSnapshot {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ScheduleError('日程必须是 JSON 对象');
  const raw = value as Record<string, unknown>;
  if (Object.keys(raw).some(key => !['source', 'date', 'timezone', 'generatedAt', 'items'].includes(key))) {
    throw new ScheduleError('日程包含不支持的字段');
  }
  const { date, timezone, generatedAt } = raw;
  if (raw.source !== 'nautilus') throw new ScheduleError('只支持 Nautilus 日程');
  if (typeof timezone !== 'string' || !moment.tz.zone(timezone)) throw new ScheduleError('无效的日程时区');
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !moment.utc(date, 'YYYY-MM-DD', true).isValid()) throw new ScheduleError('无效的日程日期');
  const today = moment.utc(moment(now).tz(timezone).format('YYYY-MM-DD'));
  const distance = moment.utc(date).diff(today, 'days');
  if (distance < -1 || distance > 366) throw new ScheduleError('只能同步昨天至未来一年内的日程');
  if (typeof generatedAt !== 'string' || !moment(generatedAt, moment.ISO_8601, true).isValid() ||
      !Number.isFinite(Date.parse(generatedAt)) || Date.parse(generatedAt) > now.getTime() + 300000) {
    throw new ScheduleError('无效的快照生成时间，请检查电脑时钟');
  }
  if (!Array.isArray(raw.items) || raw.items.length > 200) throw new ScheduleError('每天最多同步 200 项日程');
  const identities = new Set<string>();
  const items = raw.items.map((entry): ScheduleItemSnapshot => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new ScheduleError('无效的日程项目');
    const { title, kind, startMinute, endMinute } = entry;
    if (typeof title !== 'string' || !isValidTaskDescription(title) ||
        Array.from(title).some(character => character.codePointAt(0)! < 32 || character.codePointAt(0) === 127)) {
      throw new ScheduleError('日程标题须为 1 至 1000 个字符，且不能含控制字符');
    }
    if (!['fixed', 'pinned', 'flex'].includes(kind)) throw new ScheduleError('无效的日程类型');
    if (!Number.isInteger(startMinute) || !Number.isInteger(endMinute) || startMinute < 0 ||
        endMinute > 2880 || endMinute <= startMinute || endMinute - startMinute > 1440) {
      throw new ScheduleError('日程分钟数必须在两天内，结束晚于开始，单项不超过 24 小时');
    }
    const cleanTitle = title.trim();
    // A unique flex title keeps its receipt across engine rescheduling and duration edits.
    const identity = JSON.stringify([kind, cleanTitle, kind === 'flex' ? null : endMinute - startMinute,
      kind === 'flex' ? null : startMinute]);
    if (identities.has(identity)) throw new ScheduleError('存在重复日程，请用不同标题区分任务后再同步');
    identities.add(identity);
    const key = createHash('sha256').update(identity).digest('hex');
    const startAt = calendarTime(date, startMinute, timezone);
    const endAt = calendarTime(date, endMinute, timezone);
    if (endAt <= startAt) throw new ScheduleError('日程结束时间必须晚于开始时间');
    return { title: cleanTitle, kind, startMinute, endMinute, key, startAt, endAt };
  });
  const revision = createHash('sha256').update(JSON.stringify({ date, timezone, items })).digest('hex');
  return { date, timezone, generatedAt: new Date(generatedAt), revision, items };
}
