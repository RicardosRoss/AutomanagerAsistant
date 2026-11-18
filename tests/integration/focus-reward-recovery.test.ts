import { afterEach, expect, test, vi } from 'vitest';
import TaskService from '../../src/services/TaskService.js';
import CTDPService from '../../src/services/CTDPService.js';
import CultivationService from '../../src/services/CultivationService.js';
import { User, TaskChain } from '../../src/models/index.js';
import MainViolationService from '../../src/services/MainViolationService.js';
import logger from '../../src/utils/logger.js';

afterEach(() => vi.restoreAllMocks());
const load = () => import(new URL('../../src/services/FocusRewardService.ts', import.meta.url).href);

function fixture() {
  const queue = { addReminder: vi.fn(), cancelTaskReminders: vi.fn().mockResolvedValue(0) };
  const cultivation = new CultivationService();
  const tasks = new TaskService(queue as never, cultivation);
  return { cultivation, tasks, ctdp: new CTDPService(tasks, queue as never) };
}

async function complete(userId: number, ctdp: CTDPService, minutes = 60) {
  const started = await ctdp.startMainTask(userId, { description: '延迟奖励', duration: minutes, markerLabel: '确认' });
  await TaskChain.updateOne(
    { userId, 'tasks.taskId': started.task.taskId },
    {
      $set: { 'tasks.$.startTime': new Date(Date.now() - minutes * 60000) }
    }
  );
  await ctdp.completeTrackedTask(userId, started.task.taskId);
  return started.task.taskId;
}

test('two queued rewards keep their original seed streak and apply one receipt each in order', async () => {
  const { default: FocusRewardService } = await load();
  const { ctdp, cultivation } = fixture();
  vi.spyOn(Math, 'random').mockReturnValue(0.1);
  const first = await complete(835010, ctdp);
  const second = await complete(835010, ctdp);
  const pending = (await User.findOne({ userId: 835010 }))!;
  expect(pending.stats.currentStreak).toBe(2);
  expect(pending.pendingFocusRewards?.map(entry => entry.legacyCurrentStreakBefore)).toEqual([0, 1]);
  expect(pending.ensureCanonicalCultivation().state.focusStreak).toBe(0);
  const paid: string[] = [];
  await new FocusRewardService(cultivation).recover(835010, async (_id: number, taskId: string) => {
    paid.push(taskId);
  });
  await new FocusRewardService(cultivation).recover(835010);
  const user = (await User.findOne({ userId: 835010 }))!;
  expect(paid).toEqual([first, second]);
  expect(user.cultivation.spiritualPower).toBe(2);
  expect(user.cultivation.canonical?.state.focusStreak).toBe(2);
  expect(user.focusRewardReceipts).toHaveLength(2);
  expect(user.pendingFocusRewards).toHaveLength(0);
  expect(user.stats.completedTasks).toBe(2);
  expect((await TaskChain.findOne({ userId: 835010 }))?.tasks.map(task => task.rewardStatus)).toEqual([
    'settled',
    'settled'
  ]);
});

test('reward failure keeps the intent but does not prevent more core tasks from completing', async () => {
  const { default: FocusRewardService } = await load();
  const { ctdp, cultivation } = fixture();
  vi.spyOn(Math, 'random').mockReturnValue(0.1);
  await complete(835011, ctdp);
  const fail = vi.spyOn(cultivation, 'awardCultivation').mockRejectedValueOnce(new Error('game provider offline'));
  await expect(new FocusRewardService(cultivation).recover(835011)).rejects.toThrow('奖励');
  const second = await complete(835011, ctdp, 30);
  expect(second).toBeTruthy();
  expect((await User.findOne({ userId: 835011 }))?.stats.completedTasks).toBe(2);
  expect((await User.findOne({ userId: 835011 }))?.pendingFocusRewards).toHaveLength(2);
  fail.mockRestore();
  await new FocusRewardService(cultivation).recover(835011);
  expect((await User.findOne({ userId: 835011 }))?.cultivation.spiritualPower).toBe(1);
  expect((await User.findOne({ userId: 835011 }))?.cultivation.canonical?.state.focusStreak).toBe(2);
});

test('pending rewards protect game mutations while status preserves the buff and stays readable', async () => {
  const { default: FocusRewardService } = await load();
  const { ctdp, cultivation } = fixture();
  await User.create({ userId: 835012, cultivation: { immortalStones: 100 } });
  vi.spyOn(Math, 'random').mockReturnValue(0.99);
  await cultivation.castDivination(835012, 10);
  await complete(835012, ctdp);
  const status = await cultivation.getCultivationStatus(835012);
  expect(status.pendingFocusRewardCount).toBe(1);
  expect(status.activeBuff).toContain('大吉');
  expect(status.canonicalState?.focusStreak).toBe(0);
  await expect(cultivation.castDivination(835012, 10)).rejects.toThrow('附加奖励');
  expect((await User.findOne({ userId: 835012 }))?.cultivation.divinationCount).toBe(1);
  vi.spyOn(Math, 'random').mockReturnValue(0.1);
  await new FocusRewardService(cultivation).recover(835012);
  expect((await User.findOne({ userId: 835012 }))?.cultivation.canonical?.state.pendingDivinationBuff).toBeNull();
  await cultivation.castDivination(835012, 10);
  expect((await User.findOne({ userId: 835012 }))?.cultivation.divinationCount).toBe(2);
});

test('legacy completed history without a reward protocol does not authorize new assets', async () => {
  const { default: FocusRewardService } = await load();
  const { cultivation } = fixture();
  await User.create({ userId: 835013 });
  await TaskChain.collection.insertOne({
    userId: 835013,
    chainId: 'unknown-reward-history',
    status: 'broken',
    tasks: [
      {
        taskId: 'old',
        description: '旧完成',
        status: 'completed',
        duration: 60,
        startTime: new Date(0),
        settlementStatus: 'settled',
        rewardApplied: false
      }
    ]
  });
  const award = vi.spyOn(cultivation, 'awardCultivation');
  await new FocusRewardService(cultivation).recover(835013);
  expect(award).not.toHaveBeenCalled();
  expect((await User.findOne({ userId: 835013 }))?.cultivation.spiritualPower).toBe(0);
});

test('a pending offer pauses later payouts but not the next core task and can still be resolved', async () => {
  const { default: FocusRewardService } = await load();
  const { ctdp, cultivation } = fixture();
  await User.create({ userId: 835014 });
  vi.spyOn(Math, 'random').mockReturnValue(0.1);
  await cultivation.setDevEncounterScript(835014, 'offer', 2);
  await complete(835014, ctdp);
  await complete(835014, ctdp);
  await new FocusRewardService(cultivation).recover(835014);
  const first = (await User.findOne({ userId: 835014 }))!;
  const offer = first.cultivation.canonical?.state.combatFlags.pendingEncounterOffer as { offerId: string };
  expect(offer.offerId).toBeTruthy();
  expect(first.focusRewardReceipts).toHaveLength(1);
  expect(first.pendingFocusRewards).toHaveLength(1);
  const next = await ctdp.startMainTask(835014, { description: '奇遇期间继续专注', duration: 30, markerLabel: '确认' });
  expect(next.task.status).toBe('running');
  await cultivation.abandonEncounterOffer(835014, offer.offerId);
  await new FocusRewardService(cultivation).recover(835014);
  const after = (await User.findOne({ userId: 835014 }))!;
  expect(after.focusRewardReceipts).toHaveLength(2);
  expect(after.cultivation.spiritualPower).toBe(2);
  expect(after.pendingFocusRewards).toHaveLength(0);
});

test('inventory drops survive the same asset and receipt commit during deferred reward recovery', async () => {
  const { default: FocusRewardService } = await load();
  const { ctdp, cultivation } = fixture();
  await User.create({ userId: 835015 });
  vi.spyOn(Math, 'random').mockReturnValue(0.1);
  await cultivation.setDevEncounterScript(835015, 'item', 1);
  await complete(835015, ctdp);
  await new FocusRewardService(cultivation).recover(835015);
  const user = (await User.findOne({ userId: 835015 }))!;
  expect(user.focusRewardReceipts?.[0]?.status).toBe('settled');
  expect(user.focusRewardReceipts?.[0]?.reward?.encounter).toMatchObject({
    obtainedDefinitionIds: ['material.yellow_breakthrough_token']
  });
  expect(user.cultivation.canonical?.inventory.map(entry => entry.definitionId)).toContain(
    'material.yellow_breakthrough_token'
  );
  await new FocusRewardService(cultivation).recover(835015);
  expect((await User.findOne({ userId: 835015 }))?.cultivation.canonical?.inventory).toHaveLength(1);
});

test('paid account commits with a lost reward projection recover from receipts without replaying assets', async () => {
  const { default: FocusRewardService } = await load();
  const { ctdp, cultivation } = fixture();
  vi.spyOn(Math, 'random').mockReturnValue(0.1);
  await complete(835016, ctdp);
  const update = TaskChain.findOneAndUpdate.bind(TaskChain);
  const write = vi.spyOn(TaskChain, 'findOneAndUpdate').mockImplementationOnce((async (...args: any[]) => {
    const result = await update(...(args as [any, any, any]));
    return result;
  }) as any);
  let fail = true;
  write.mockImplementation((async (...args: any[]) => {
    if (fail && args[1]?.$set?.['tasks.$.rewardApplied']) {
      fail = false;
      throw new Error('projection offline');
    }
    return update(...(args as [any, any, any]));
  }) as any);
  await expect(new FocusRewardService(cultivation).recover(835016)).rejects.toThrow();
  expect((await User.findOne({ userId: 835016 }))?.cultivation.spiritualPower).toBe(1);
  expect((await User.findOne({ userId: 835016 }))?.pendingFocusRewards).toHaveLength(0);
  write.mockRestore();
  await new FocusRewardService(cultivation).recover(835016);
  expect((await User.findOne({ userId: 835016 }))?.cultivation.spiritualPower).toBe(1);
  expect((await User.findOne({ userId: 835016 }))?.focusRewardReceipts).toHaveLength(1);
  expect((await TaskChain.findOne({ userId: 835016 }))?.tasks[0]?.rewardStatus).toBe('settled');
});

test('core completion appending a second intent cannot be overwritten by a stale reward save', async () => {
  const { default: FocusRewardService } = await load();
  const { ctdp, cultivation } = fixture();
  const userId = 835040;
  vi.spyOn(Math, 'random').mockReturnValue(0.1);
  await complete(userId, ctdp);
  let reached!: () => void;
  let release!: () => void;
  const entered = new Promise<void>(resolve => { reached = resolve; });
  const gate = new Promise<void>(resolve => { release = resolve; });
  const original = User.prototype.save;
  const pause = vi.spyOn(User.prototype, 'save').mockImplementationOnce(async function (this: any) {
    reached();
    await gate;
    return original.call(this);
  });
  const paying = new FocusRewardService(cultivation).recover(userId).then(() => ({ ok: true }), () => ({ ok: false }));
  try {
    await entered;
    await complete(userId, ctdp);
    release();
    expect((await paying).ok).toBe(false);
    expect((await User.findOne({ userId }))?.pendingFocusRewards).toHaveLength(2);
    expect((await User.findOne({ userId }))?.cultivation.spiritualPower).toBe(0);
    pause.mockRestore();
    await new FocusRewardService(cultivation).recover(userId);
    const after = (await User.findOne({ userId }))!;
    expect(after.stats.completedTasks).toBe(2);
    expect(after.cultivation.spiritualPower).toBe(2);
    expect(after.focusRewardReceipts).toHaveLength(2);
    expect(after.pendingFocusRewards).toHaveLength(0);
  } finally {
    release();
    await paying;
    pause.mockRestore();
  }
});

test('reward projection does not invalidate an in-flight core chain save', async () => {
  const { default: FocusRewardService } = await load();
  const { ctdp, cultivation } = fixture();
  const userId = 835041;
  vi.spyOn(Math, 'random').mockReturnValue(0.1);
  const first = await complete(userId, ctdp);
  const next = await ctdp.startMainTask(userId, { description: '并发核心', duration: 30, markerLabel: '确认' });
  await TaskChain.updateOne({ userId, 'tasks.taskId': next.task.taskId }, {
    $set: { 'tasks.$.startTime': new Date(Date.now() - 1800000) }
  });
  let reached!: () => void;
  let release!: () => void;
  const entered = new Promise<void>(resolve => { reached = resolve; });
  const gate = new Promise<void>(resolve => { release = resolve; });
  const original = TaskChain.prototype.save;
  const pause = vi.spyOn(TaskChain.prototype, 'save').mockImplementationOnce(async function (this: any) {
    reached();
    await gate;
    return original.call(this);
  });
  const completing = ctdp.completeTrackedTask(userId, next.task.taskId);
  try {
    await entered;
    const before = (await TaskChain.findOne({ userId }))!.__v;
    await new FocusRewardService(cultivation).recover(userId);
    const projected = (await TaskChain.findOne({ userId }))!;
    expect(projected.__v).toBe(before);
    expect(projected.tasks.find(task => task.taskId === first)?.rewardStatus).toBe('settled');
    release();
    expect((await completing).task.settlementStatus).toBe('settled');
    expect((await TaskChain.findOne({ userId }))?.tasks[0]?.rewardStatus).toBe('settled');
    expect((await User.findOne({ userId }))?.stats.completedTasks).toBe(2);
  } finally {
    release();
    await completing.catch(() => undefined);
    pause.mockRestore();
  }
});

test('reward recovery after a main-chain break never revives its core streak', async () => {
  const { default: FocusRewardService } = await load();
  const { ctdp, tasks, cultivation } = fixture();
  const userId = 835042;
  vi.spyOn(Math, 'random').mockReturnValue(0.1);
  await complete(userId, ctdp);
  const rules = new MainViolationService({} as never, tasks);
  const reported = await rules.report(userId, '离开位置');
  await rules.resolve(userId, 'break_chain', reported.pending!.decisionToken);
  await new FocusRewardService(cultivation).recover(userId);
  const after = (await User.findOne({ userId }))!;
  expect(after.stats.currentStreak).toBe(0);
  expect(after.stats.completedTasks).toBe(1);
  expect(after.cultivation.spiritualPower).toBe(1);
  expect((await TaskChain.findOne({ userId }))?.status).toBe('broken');
  const next = await ctdp.startMainTask(userId, { description: '从一开始', duration: 30, markerLabel: '确认' });
  expect(next.mainChain.nodes[0]?.nodeNo).toBe(1);
});

test('a deferred short-task reward keeps the divination buff for the following long task', async () => {
  const { default: FocusRewardService } = await load();
  const { ctdp, cultivation } = fixture();
  const userId = 835043;
  await User.create({ userId, cultivation: { immortalStones: 100 } });
  vi.spyOn(Math, 'random').mockReturnValue(0.99);
  await cultivation.castDivination(userId, 10);
  vi.spyOn(Math, 'random').mockReturnValue(0.1);
  await complete(userId, ctdp, 30);
  await new FocusRewardService(cultivation).recover(userId);
  const short = (await User.findOne({ userId }))!;
  expect(short.cultivation.spiritualPower).toBe(0);
  expect(short.cultivation.canonical?.state.pendingDivinationBuff).not.toBeNull();
  await complete(userId, ctdp, 60);
  await new FocusRewardService(cultivation).recover(userId);
  const long = (await User.findOne({ userId }))!;
  expect(long.cultivation.spiritualPower).toBe(1);
  expect(long.cultivation.canonical?.state.pendingDivinationBuff).toBeNull();
  expect(long.focusRewardReceipts).toHaveLength(2);
});

test('a core intent arriving between the game guard and account load cannot be bypassed', async () => {
  const { ctdp, cultivation } = fixture();
  const userId = 835044;
  await User.create({ userId, cultivation: { immortalStones: 100 } });
  const started = await ctdp.startMainTask(userId, { description: '检查读取交错', duration: 60, markerLabel: '确认' });
  await TaskChain.updateOne({ userId }, { $set: { 'tasks.0.startTime': new Date(Date.now() - 3600000) } });
  const exists = User.exists.bind(User);
  const check = vi.spyOn(User, 'exists').mockImplementationOnce((async (...args: any[]) => {
    const result = await exists(args[0]);
    await ctdp.completeTrackedTask(userId, started.task.taskId);
    return result;
  }) as any);
  try {
    await expect(cultivation.castDivination(userId, 10)).rejects.toThrow('附加奖励');
    const after = (await User.findOne({ userId }))!;
    expect(after.cultivation.divinationCount).toBe(0);
    expect(after.cultivation.immortalStones).toBe(100);
    expect(after.pendingFocusRewards).toHaveLength(1);
  } finally {
    check.mockRestore();
  }
});

test('a paid intent left behind another head is audited and converges without replaying assets', async () => {
  const { default: FocusRewardService } = await load();
  const { ctdp, cultivation } = fixture();
  const userId = 835045;
  vi.spyOn(Math, 'random').mockReturnValue(0.1);
  const first = await complete(userId, ctdp);
  await complete(userId, ctdp);
  const oldIntent = (await User.findOne({ userId }))!.pendingFocusRewards![0];
  await cultivation.awardCultivation(userId, 60, first);
  await User.updateOne({ userId }, { $push: { pendingFocusRewards: oldIntent } });
  const warning = vi.spyOn(logger, 'warn');
  await new FocusRewardService(cultivation).recover(userId);
  expect(warning).toHaveBeenCalledWith(expect.stringContaining('奖励意图清理未匹配'),
    expect.objectContaining({ userId, taskId: first }));
  const after = (await User.findOne({ userId }))!;
  expect(after.cultivation.spiritualPower).toBe(2);
  expect(after.focusRewardReceipts).toHaveLength(2);
  expect(after.pendingFocusRewards).toHaveLength(0);
});

test('a new protocol task missing both intent and receipt is audited without blocking another account', async () => {
  const { default: FocusRewardService } = await load();
  const { ctdp, cultivation } = fixture();
  vi.spyOn(Math, 'random').mockReturnValue(0.1);
  const taskId = await complete(835046, ctdp);
  await User.updateOne({ userId: 835046 }, { $pull: { pendingFocusRewards: { taskId } } });
  await complete(835047, ctdp);
  await expect(new FocusRewardService(cultivation).recover()).rejects.toThrow('附加奖励');
  expect((await User.findOne({ userId: 835046 }))?.cultivation.spiritualPower).toBe(0);
  expect((await TaskChain.findOne({ userId: 835046 }))?.tasks[0]?.settlementStatus).toBe('settled');
  expect((await User.findOne({ userId: 835047 }))?.cultivation.spiritualPower).toBe(1);
  expect((await User.findOne({ userId: 835047 }))?.pendingFocusRewards).toHaveLength(0);
});
