import { describe, expect, test } from 'vitest';
import SettingsService from '../../src/services/SettingsService.js';
import StatsService from '../../src/services/StatsService.js';
import { TaskChain, User } from '../../src/models/index.js';

describe('日常设置和可信报告', () => {
  test('valid settings persist and invalid duration/timezone do not change the user', async () => {
    await User.create({ userId: 811001 });
    const settings = new SettingsService();
    await settings.update(811001, 'duration', '45');
    await settings.update(811001, 'timezone', 'Asia/Shanghai');
    await settings.update(811001, 'reminders', 'off');
    expect((await User.findOne({ userId: 811001 }))?.settings).toMatchObject({
      defaultDuration: 45,
      timezone: 'Asia/Shanghai',
      reminderEnabled: false
    });
    await expect(settings.update(811001, 'duration', '999')).rejects.toThrow('时长');
    await expect(settings.update(811001, 'timezone', 'not/a/timezone')).rejects.toThrow('时区');
    expect((await User.findOne({ userId: 811001 }))?.settings.defaultDuration).toBe(45);
    expect(await User.countDocuments({ userId: 811002 })).toBe(0);
  });

  test('a focus interval is split at the user-local midnight, not at the confirmation time', async () => {
    await User.create({ userId: 811003, settings: { timezone: 'Asia/Shanghai' } });
    await TaskChain.create({
      userId: 811003,
      chainId: 'cross-midnight',
      tasks: [
        {
          taskId: 'task-cross',
          description: '读书',
          duration: 60,
          startTime: new Date('2026-10-06T15:30:00Z'),
          endTime: new Date('2026-10-06T16:30:00Z'),
          confirmedAt: new Date('2026-10-07T02:00:00Z'),
          status: 'completed',
          actualDuration: 60
        }
      ]
    });
    const report = await new StatsService().build(811003, 7, new Date('2026-10-07T08:00:00Z'));
    expect(report.days.find((day) => day.date === '2026-10-06')?.minutes).toBe(30);
    expect(report.days.find((day) => day.date === '2026-10-07')?.minutes).toBe(30);
    expect(report.summary.minutes).toBe(60);
    expect(report.summary.completed).toBe(1);
    expect(report.timezone).toBe('Asia/Shanghai');
  });

  test('running tasks count as started, outcomes stay distinct, and legacy minutes are capped', async () => {
    await User.create({ userId: 811004, settings: { timezone: 'UTC' } });
    const base = { duration: 60, description: '专注', startTime: new Date('2026-10-07T06:00:00Z') };
    await TaskChain.create({
      userId: 811004,
      chainId: 'mixed',
      tasks: [
        {
          ...base,
          taskId: 'done',
          status: 'completed',
          actualDuration: 1080,
          endTime: new Date('2026-10-08T00:00:00Z')
        },
        { ...base, taskId: 'failed', status: 'failed', endTime: new Date('2026-10-07T06:10:00Z') },
        { ...base, taskId: 'cancelled', status: 'cancelled', endTime: new Date('2026-10-07T06:20:00Z') },
        { ...base, taskId: 'running', status: 'running' }
      ]
    });
    const report = await new StatsService().build(811004, 1, new Date('2026-10-07T08:00:00Z'));
    expect(report.summary).toMatchObject({ started: 4, completed: 1, failed: 1, cancelled: 1, minutes: 60 });
    expect(report.summary.successRate).toBeCloseTo(100 / 3);
    expect(report.days).toHaveLength(1);
  });

  test('reports do not create users or daily stats when there is no data', async () => {
    const report = await new StatsService().build(811005, 7);
    expect(report.summary.minutes).toBe(0);
    expect(report.summary.started).toBe(0);
    expect(await User.countDocuments({ userId: 811005 })).toBe(0);
  });
});
