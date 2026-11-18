import { afterEach, expect, test, vi } from 'vitest';
import SelfControlBot from '../../src/bot.js';
import { AuxChain, MainChain, TaskChain, User } from '../../src/models/index.js';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

function fixture() {
  vi.stubEnv('NODE_ENV', 'production');
  const bot = new SelfControlBot();
  const sendMessage = vi.fn().mockResolvedValue({ message_id: 1 });
  bot.bot = { sendMessage } as never;
  (bot as any).initializeHandlers(bot.bot);
  vi.spyOn(bot.queueService, 'addReminder').mockResolvedValue('reminder');
  vi.spyOn(bot.queueService, 'scheduleReservation').mockResolvedValue('reservation');
  return { bot, sendMessage };
}

test.each([
  ['1h', 60], ['1H', 60], ['1.5h', 90], ['4.1h', 246], ['8h', 480],
  ['0.1h', 6], ['+45m', 45], ['2小时', 120], ['45m', 45], ['45min', 45], ['45分钟', 45], ['+1h', 60]
])('explicit %s parses as %i minutes without changing the description', (token, minutes) => {
  const { bot } = fixture();
  expect(bot.taskHandlers!.parseTaskInput(`填表：[原文]_事项 ${token}`)).toEqual({
    description: '填表：[原文]_事项', duration: minutes
  });
});

test.each(['0h', '0.025h', '0.01h', '9h', '4m', '-1h', '1.01h', '1.5分钟', '1hour', '1h30m', '1e2h', '999分钟'])(
  'invalid duration %s never creates a commitment', async token => {
    const { bot, sendMessage } = fixture();
    await bot.handleCommand({ from: { id: 838001 }, chat: { id: 838001, type: 'private' },
      text: `/reserve 填表 ${token}`
    } as never);
    expect(sendMessage.mock.calls.at(-1)?.[1]).toContain('时长');
    expect(await AuxChain.countDocuments()).toBe(0);
    expect(await TaskChain.countDocuments()).toBe(0);
    expect(await User.countDocuments()).toBe(0);
  }
);

test('plain minutes, default duration and text ending in a word keep their original parsing', () => {
  const { bot } = fixture();
  expect(bot.taskHandlers!.parseTaskInput('填表 60')).toEqual({ description: '填表', duration: 60 });
  expect(bot.taskHandlers!.parseTaskInput('阅读 hour', 30)).toEqual({ description: '阅读 hour', duration: 30 });
  expect(bot.taskHandlers!.parseTaskInput('填表', 45)).toEqual({ description: '填表', duration: 45 });
});

test('the actual 1h reservation input keeps sixty minutes and the fifteen-minute deadline', async () => {
  const { bot, sendMessage } = fixture();
  await bot.handleCommand({ from: { id: 838002 }, chat: { id: 838002, type: 'private' },
    text: '/reserve 填表 1h'
  } as never);
  const aux = (await AuxChain.findOne({ userId: 838002 }))!;
  expect(aux.pendingReservation?.signal).toBe('填表');
  expect(aux.pendingReservation?.duration).toBe(60);
  expect(aux.pendingReservation!.deadlineAt!.getTime() - aux.pendingReservation!.createdAt!.getTime()).toBe(900000);
  expect(sendMessage.mock.calls.at(-1)?.[1]).toContain('预约承诺已建立');
  expect(sendMessage.mock.calls.at(-1)?.[1]).toContain('60分钟');
  expect(await TaskChain.countDocuments()).toBe(0);
});

test('a direct task with hour units creates the same ready main node and schedules trusted minutes', async () => {
  const { bot } = fixture();
  await bot.handleCommand({ from: { id: 838003 }, chat: { id: 838003, type: 'private' },
    text: '/task 阅读 1.5h'
  } as never);
  const task = (await TaskChain.findOne({ userId: 838003 }))!.tasks[0]!;
  expect(task).toMatchObject({ description: '阅读', duration: 90, creationState: 'ready', status: 'running' });
  expect((await MainChain.findOne({ userId: 838003 }))?.nodes[0]?.taskId).toBe(task.taskId);
  expect(bot.queueService.addReminder).toHaveBeenCalledWith('completion',
    expect.objectContaining({ taskId: task.taskId }),
    90 * 60000);
  expect((await User.findOne({ userId: 838003 }))?.stats.totalTasks).toBe(1);
});

test('a duration-only command keeps the existing generic description convention', () => {
  const { bot } = fixture();
  expect(bot.taskHandlers!.parseTaskInput('1h')).toEqual({ description: '专注任务', duration: 60 });
});

test('minute units respect the existing development minimum', () => {
  const { bot } = fixture();
  vi.stubEnv('NODE_ENV', 'development');
  expect(bot.taskHandlers!.parseTaskInput('测试 1m')).toEqual({ description: '测试', duration: 1 });
});
