import moment from 'moment-timezone';
import { TaskChain, User } from '../models/index.js';

export interface FocusDay {
  date: string;
  started: number;
  completed: number;
  failed: number;
  cancelled: number;
  minutes: number;
  completedMinutes: number;
}

class StatsService {
  async build(userId: number, numberOfDays = 7, now = new Date(), snapshotTimezone?: string) {
    if (![1, 7].includes(numberOfDays)) throw new Error('报告只能为今日或最近7天');
    const user = await User.findOne({ userId });
    const requestedZone = snapshotTimezone ?? user?.settings.timezone ?? 'UTC';
    const timezone = moment.tz.zone(requestedZone) ? requestedZone : 'UTC';
    const end = moment(now).tz(timezone).startOf('day').add(1, 'day');
    const start = end.clone().subtract(numberOfDays, 'days');
    const days: FocusDay[] = Array.from({ length: numberOfDays }, (_, index) => ({
      date: start.clone().add(index, 'days').format('YYYY-MM-DD'),
      started: 0,
      completed: 0,
      failed: 0,
      cancelled: 0,
      minutes: 0,
      completedMinutes: 0
    }));
    const bins = new Map(days.map((day) => [day.date, day]));
    const dayAt = (date: Date) => bins.get(moment(date).tz(timezone).format('YYYY-MM-DD'));
    const chains = await TaskChain.find({ userId }).lean();
    for (const chain of chains) {
      for (const task of chain.tasks) {
        if (task.creationState === 'rolling_back') continue;
        const taskStart = new Date(task.startTime);
        const startedDay = dayAt(taskStart);
        if (startedDay) startedDay.started += 1;
        if (task.status === 'completed') {
          const minutes = Math.max(0, Math.min(task.actualDuration ?? task.duration, task.duration));
          const focusEnd = new Date(taskStart.getTime() + minutes * 60000);
          const completedDay = dayAt(focusEnd);
          if (completedDay) {
            completedDay.completed += 1;
            completedDay.completedMinutes += minutes;
          }
          let cursor = Math.max(taskStart.getTime(), start.valueOf());
          const limit = Math.min(focusEnd.getTime(), end.valueOf());
          while (cursor < limit) {
            const nextMidnight = moment(cursor).tz(timezone).startOf('day').add(1, 'day').valueOf();
            const next = Math.min(nextMidnight, limit);
            const bin = dayAt(new Date(cursor));
            if (bin) bin.minutes += (next - cursor) / 60000;
            cursor = next;
          }
        } else if (task.status === 'failed' || task.status === 'cancelled') {
          const terminalDay = dayAt(new Date(task.endTime ?? task.startTime));
          if (terminalDay) terminalDay[task.status] += 1;
        }
      }
    }
    for (const day of days) day.minutes = Math.round(day.minutes * 10) / 10;
    const summary = days.reduce(
      (sum, day) => ({
        started: sum.started + day.started,
        completed: sum.completed + day.completed,
        failed: sum.failed + day.failed,
        cancelled: sum.cancelled + day.cancelled,
        minutes: sum.minutes + day.minutes
      }),
      { started: 0, completed: 0, failed: 0, cancelled: 0, minutes: 0 }
    );
    const ended = summary.completed + summary.failed + summary.cancelled;
    return {
      timezone,
      days,
      start: start.toDate(),
      end: end.toDate(),
      summary: { ...summary, successRate: ended ? (summary.completed / ended) * 100 : 0 }
    };
  }
}

export default StatsService;
