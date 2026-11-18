import { describe, expect, test, vi } from 'vitest';
import MainViolationService from '../../src/services/MainViolationService.js';
import { MainChain, TaskChain, User, PrecedentRule } from '../../src/models/index.js';
import SelfControlBot from '../../src/bot.js';

function fixture() {
  const queue = { cancelTaskReminders: vi.fn().mockResolvedValue(0) };
  return new MainViolationService(queue as never);
}

async function createRunningMain(userId: number) {
  await User.create({ userId });
  await MainChain.create({
    userId,
    chainId: `main-${userId}`,
    sacredMarker: { type: 'seat', label: '神圣座位' },
    nodes: [{ nodeNo: 1, level: 'unit', taskId: `task-${userId}`, status: 'running' }]
  });
  await TaskChain.create({
    userId,
    chainId: `task-chain-${userId}`,
    tasks: [
      {
        taskId: `task-${userId}`,
        description: '学习',
        duration: 60,
        startTime: new Date(Date.now() - 3600000),
        status: 'running',
        isReserved: false,
        metadata: { progressReminders: [], interruptions: [], notes: '' }
      }
    ]
  });
}

describe('主链下必为例入口', () => {
  test('Telegram /violation and decision callback reach the scoped service', async () => {
    const bot = Object.create(SelfControlBot.prototype) as SelfControlBot & {
      bot: { sendMessage: ReturnType<typeof vi.fn> };
      mainViolationService: { report: ReturnType<typeof vi.fn>; resolve: ReturnType<typeof vi.fn> };
    };
    bot.bot = { sendMessage: vi.fn().mockResolvedValue({ message_id: 1 }) };
    bot.mainViolationService = {
      report: vi.fn().mockResolvedValue({
        requiresDecision: true, pending: { behaviorKey: '刷手机两分钟', decisionToken: 'a'.repeat(20) }
      }),
      resolve: vi.fn().mockResolvedValue({ decision: 'break_chain' })
    };
    await bot.handleCommand({ from: { id: 815000 }, chat: { id: 815000 }, text: '/violation 刷手机两分钟' } as never);
    expect(bot.mainViolationService.report).toHaveBeenCalledWith(815000, '刷手机两分钟');
    await bot.handleQuickCallback(815000, `main_violation:break_chain:${'a'.repeat(20)}`);
    expect(bot.mainViolationService.resolve).toHaveBeenCalledWith(815000, 'break_chain', 'a'.repeat(20));
  });

  test('first violation asks for a decision and preserves the running task', async () => {
    await createRunningMain(815001);
    const service = fixture();
    const result = await service.report(815001, '刷手机两分钟');
    expect(result.requiresDecision).toBe(true);
    expect((await MainChain.findOne({ userId: 815001 }))?.pendingViolation?.behaviorKey).toBe('刷手机两分钟');
    expect((await TaskChain.findOne({ userId: 815001 }))?.tasks[0]?.status).toBe('running');
  });

  test('break decision breaks only the main chain lifecycle, terminates the running task and reminders', async () => {
    await createRunningMain(815002);
    const queue = { cancelTaskReminders: vi.fn().mockResolvedValue(0) };
    const service = new MainViolationService(queue as never);
    await service.report(815002, '回复消息');
    await service.resolve(815002, 'break_chain');
    expect((await MainChain.findOne({ userId: 815002 }))?.status).toBe('broken');
    expect((await MainChain.findOne({ userId: 815002 }))?.pendingViolation).toBeUndefined();
    expect((await TaskChain.findOne({ userId: 815002 }))?.tasks[0]?.status).toBe('failed');
    expect(queue.cancelTaskReminders).toHaveBeenCalledWith('task-815002');
    expect(await PrecedentRule.countDocuments({ userId: 815002 })).toBe(0);
  });

  test('allow decision is scoped to the current main chain and does not leak to a new chain', async () => {
    await createRunningMain(815003);
    const service = fixture();
    await service.report(815003, '上厕所');
    await service.resolve(815003, 'allow_forever');
    const rule = await PrecedentRule.findOne({ userId: 815003 });
    expect(rule?.scope.chainId).toBe('main-815003');
    expect((await MainChain.findOne({ userId: 815003 }))?.status).toBe('active');
    expect((await MainChain.findOne({ userId: 815003 }))?.pendingViolation).toBeUndefined();
    await MainChain.updateOne({ userId: 815003 }, { $set: { status: 'broken' } });
    await expect(service.report(815003, '上厕所')).rejects.toThrow('主链');
  });

  test('another user and concurrent decisions cannot resolve the violation', async () => {
    await createRunningMain(815004);
    const service = fixture();
    await service.report(815004, '刷短视频');
    await expect(service.resolve(815005, 'break_chain')).rejects.toThrow('主链');
    const results = await Promise.allSettled([
      service.resolve(815004, 'break_chain'),
      service.resolve(815004, 'allow_forever')
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
  });
});
