import { afterEach, expect, test, vi } from 'vitest';
import CultivationService from '../../src/services/CultivationService.js';
import CultivationCommandHandlers from '../../src/handlers/cultivationCommands.js';
import { User, DivinationHistory } from '../../src/models/index.js';

afterEach(() => vi.restoreAllMocks());

test('an account version conflict cannot publish a divination that never settled', async () => {
  await User.create({ userId: 833001, cultivation: { immortalStones: 100 } });
  vi.spyOn(Math, 'random').mockReturnValue(0.1);
  const save = User.prototype.save;
  vi.spyOn(User.prototype, 'save').mockImplementationOnce(async function (this: any) {
    await User.updateOne({ userId: 833001 }, { $inc: { __v: 1 } });
    return save.call(this);
  });
  await expect(new CultivationService().castDivination(833001, 10)).rejects.toMatchObject({ name: 'VersionError' });
  expect(await DivinationHistory.countDocuments({ userId: 833001 })).toBe(0);
  const user = (await User.findOne({ userId: 833001 }))!;
  expect(user.cultivation.immortalStones).toBe(100);
  expect(user.cultivation.divinationCount).toBe(0);
});

test('the committed history records the existing zero balance floor after a large loss', async () => {
  await User.create({ userId: 833014, cultivation: { immortalStones: 10 } });
  vi.spyOn(Math, 'random').mockReturnValue(0.1);
  const result = await new CultivationService().castDivination(833014, 10);
  expect(result.result).toBe(-40);
  expect(result.stonesAfter).toBe(0);
  expect((await User.findOne({ userId: 833014 }))?.cultivation.immortalStones).toBe(0);
  expect((await DivinationHistory.findOne({ userId: 833014 }))?.stonesAfter).toBe(0);
});

test('a win keeps the original gain and identical history balance', async () => {
  await User.create({ userId: 833015, cultivation: { immortalStones: 10 } });
  vi.spyOn(Math, 'random').mockReturnValue(0.99);
  const result = await new CultivationService().castDivination(833015, 10);
  expect(result.result).toBe(40);
  expect(result.stonesAfter).toBe(50);
  expect((await User.findOne({ userId: 833015 }))?.cultivation.immortalStones).toBe(50);
  expect((await DivinationHistory.findOne({ userId: 833015 }))?.stonesAfter).toBe(50);
});

test('a zero-floor snapshot survives deferred history recovery unchanged', async () => {
  await User.create({ userId: 833016, cultivation: { immortalStones: 10 } });
  vi.spyOn(Math, 'random').mockReturnValue(0.1);
  const write = vi.spyOn(DivinationHistory, 'findOneAndUpdate').mockRejectedValueOnce(new Error('history offline'));
  const result = await new CultivationService().castDivination(833016, 10);
  expect(result.stonesAfter).toBe(0);
  expect((await User.findOne({ userId: 833016 }))?.pendingDivinationHistories?.[0]?.stonesAfter).toBe(0);
  write.mockRestore();
  await new CultivationService().recoverDivinationHistories(833016);
  expect((await User.findOne({ userId: 833016 }))?.cultivation.immortalStones).toBe(0);
  expect((await DivinationHistory.findOne({ userId: 833016 }))?.stonesAfter).toBe(0);
  expect((await DivinationHistory.findOne({ userId: 833016 }))?.result).toBe(-40);
});

test('history write failure leaves one committed divination with a durable replayable snapshot', async () => {
  await User.create({ userId: 833002, cultivation: { immortalStones: 100 } });
  vi.spyOn(Math, 'random').mockReturnValue(0.1);
  const create = vi.spyOn(DivinationHistory, 'findOneAndUpdate').mockRejectedValueOnce(new Error('history offline'));
  const result = await new CultivationService().castDivination(833002, 10);
  expect(result.historyPending).toBe(true);
  const user = (await User.findOne({ userId: 833002 }))!;
  expect(user.cultivation.immortalStones).toBe(100 + result.result);
  expect(user.cultivation.divinationCount).toBe(1);
  expect(user.pendingDivinationHistories).toHaveLength(1);
  expect(await DivinationHistory.countDocuments({ userId: 833002 })).toBe(0);
  create.mockRestore();
  await (new CultivationService() as any).recoverDivinationHistories();
  await (new CultivationService() as any).recoverDivinationHistories();
  const after = (await User.findOne({ userId: 833002 }))!;
  expect(after.cultivation.immortalStones).toBe(user.cultivation.immortalStones);
  expect(after.cultivation.divinationCount).toBe(1);
  expect(after.pendingDivinationHistories).toHaveLength(0);
  expect(await DivinationHistory.countDocuments({ userId: 833002 })).toBe(1);
  expect((await DivinationHistory.findOne({ userId: 833002 }))?.diceRoll).toBe(result.roll);
});

test('an account commit response loss reads its stored snapshot and never asks for a second cast', async () => {
  await User.create({ userId: 833003, cultivation: { immortalStones: 100 } });
  vi.spyOn(Math, 'random').mockReturnValue(0.1);
  const save = User.prototype.save;
  vi.spyOn(User.prototype, 'save').mockImplementationOnce(async function (this: any) {
    await save.call(this);
    throw new Error('commit response lost');
  });
  const result = await new CultivationService().castDivination(833003, 10);
  expect(result.roll).toBe(1);
  expect((await User.findOne({ userId: 833003 }))?.cultivation.divinationCount).toBe(1);
  expect(await DivinationHistory.countDocuments({ userId: 833003 })).toBe(1);
});

test('deleting a waiting message cannot turn a successful divination into a failure notice', async () => {
  await User.create({ userId: 833004, cultivation: { immortalStones: 100 } });
  vi.spyOn(Math, 'random').mockReturnValue(0.1);
  const messages: string[] = [];
  const handler = new CultivationCommandHandlers({
    sendMessage: async (_id: number, text: string) => {
      messages.push(text);
      return { message_id: messages.length };
    },
    deleteMessage: async () => {
      throw new Error('message cannot be deleted');
    }
  } as never);
  await handler.handleDivinationCommand({ from: { id: 833004 }, chat: { id: 833004 } } as never, ['', '10'] as never);
  expect(messages.at(-1)).toContain('当前灵石');
  expect(messages.at(-1)).not.toContain('message cannot be deleted');
  expect((await User.findOne({ userId: 833004 }))?.cultivation.divinationCount).toBe(1);
  expect(await DivinationHistory.countDocuments({ userId: 833004 })).toBe(1);
});

test('a failed result notification reports already settled instead of encouraging a second bet', async () => {
  await User.create({ userId: 833008, cultivation: { immortalStones: 100 } });
  vi.spyOn(Math, 'random').mockReturnValue(0.1);
  const sendMessage = vi
    .fn()
    .mockResolvedValueOnce({ message_id: 1 })
    .mockRejectedValueOnce(new Error('ETIMEDOUT after account commit'))
    .mockResolvedValue({ message_id: 3 });
  const handler = new CultivationCommandHandlers({
    sendMessage,
    deleteMessage: vi.fn().mockResolvedValue(true)
  } as never);
  await handler.handleDivinationCommand({ from: { id: 833008 }, chat: { id: 833008 } } as never, ['', '10'] as never);
  expect(sendMessage.mock.calls.at(-1)?.[1]).toContain('已结算');
  expect(sendMessage.mock.calls.at(-1)?.[1]).toContain('不要重复下注');
  expect(sendMessage.mock.calls.at(-1)?.[1]).not.toContain('ETIMEDOUT');
  expect((await User.findOne({ userId: 833008 }))?.cultivation.divinationCount).toBe(1);
  expect(await DivinationHistory.countDocuments({ userId: 833008 })).toBe(1);
});

test('history acknowledged before receipt cleanup fails is recovered once by competing services', async () => {
  await User.create({ userId: 833005, cultivation: { immortalStones: 100 } });
  vi.spyOn(Math, 'random').mockReturnValue(0.1);
  const cleanup = vi.spyOn(User, 'updateOne').mockRejectedValueOnce(new Error('receipt cleanup offline'));
  const result = await new CultivationService().castDivination(833005, 10);
  expect(result.historyPending).toBe(true);
  expect(await DivinationHistory.countDocuments({ userId: 833005 })).toBe(1);
  expect((await User.findOne({ userId: 833005 }))?.pendingDivinationHistories).toHaveLength(1);
  cleanup.mockRestore();
  await Promise.all([
    new CultivationService().recoverDivinationHistories(),
    new CultivationService().recoverDivinationHistories()
  ]);
  expect(await DivinationHistory.countDocuments({ userId: 833005 })).toBe(1);
  expect((await User.findOne({ userId: 833005 }))?.pendingDivinationHistories).toHaveLength(0);
  expect((await User.findOne({ userId: 833005 }))?.cultivation.immortalStones).toBe(100 + result.result);
});

test('conflicting stored history is preserved for audit and does not block another account recovery', async () => {
  vi.spyOn(Math, 'random').mockReturnValue(0.1);
  await User.create({ userId: 833006, cultivation: { immortalStones: 100 } });
  await User.create({ userId: 833007, cultivation: { immortalStones: 100 } });
  const history = vi.spyOn(DivinationHistory, 'findOneAndUpdate').mockRejectedValue(new Error('offline'));
  await new CultivationService().castDivination(833006, 10);
  await new CultivationService().castDivination(833007, 10);
  history.mockRestore();
  const first = (await User.findOne({ userId: 833006 }))!;
  const snapshot = first.toObject().pendingDivinationHistories![0]!;
  await DivinationHistory.collection.insertOne({ ...snapshot, result: 999 } as never);
  await expect(new CultivationService().recoverDivinationHistories()).rejects.toThrow('同步失败');
  expect((await User.findOne({ userId: 833006 }))?.pendingDivinationHistories).toHaveLength(1);
  expect((await DivinationHistory.findOne({ userId: 833006 }))?.result).toBe(999);
  expect((await User.findOne({ userId: 833006 }))?.cultivation.immortalStones).toBe(first.cultivation.immortalStones);
  expect((await User.findOne({ userId: 833007 }))?.pendingDivinationHistories).toHaveLength(0);
  expect(await DivinationHistory.countDocuments({ userId: 833007 })).toBe(1);
});

test('the pending journal does not add collection indexes to User', async () => {
  const indexes = await User.collection.listIndexes().toArray();
  expect(indexes.some(index => Object.keys(index.key).some(key => key.startsWith('pendingDivinationHistories.')))).toBe(
    false
  );
});

test('history sync failure leaves existing history readable with an explicit pending count', async () => {
  await User.create({ userId: 833011, cultivation: { immortalStones: 100 } });
  await DivinationHistory.create({ userId: 833011, gameId: 'prior-game', betAmount: 10, diceRoll: 5, result: 5 });
  vi.spyOn(Math, 'random').mockReturnValue(0.1);
  vi.spyOn(DivinationHistory, 'findOneAndUpdate').mockRejectedValue(new Error('history writer offline'));
  await new CultivationService().castDivination(833011, 10);
  const records = await new CultivationService().getDivinationHistory(833011);
  expect(records).toHaveLength(1);
  expect(records[0]?.gameId).toBe('prior-game');
  expect(records.pendingSyncCount).toBe(1);
  const stats = await new CultivationService().getDivinationStats(833011);
  expect(stats.totalGames).toBe(1);
  expect(stats.pendingSyncCount).toBe(1);
  expect((await User.findOne({ userId: 833011 }))?.pendingDivinationHistories).toHaveLength(1);
});

test('a failed cast removes the waiting message while preserving the actual failure notice', async () => {
  await User.create({ userId: 833012 });
  const messages: string[] = [];
  const deleteMessage = vi.fn().mockResolvedValue(true);
  const handler = new CultivationCommandHandlers({
    sendMessage: async (_id: number, text: string) => {
      messages.push(text);
      return { message_id: messages.length };
    },
    deleteMessage
  } as never);
  await handler.handleDivinationCommand({ from: { id: 833012 }, chat: { id: 833012 } } as never, ['', '10'] as never);
  expect(deleteMessage.mock.calls).toEqual([[833012, 1]]);
  expect(messages.at(-1)).toContain('灵石不足');
  expect(await DivinationHistory.countDocuments({ userId: 833012 })).toBe(0);
});

test('two competing casts commit one account change and one matching history', async () => {
  await User.create({ userId: 833013, cultivation: { immortalStones: 100 } });
  vi.spyOn(Math, 'random').mockReturnValue(0.1);
  let reached!: () => void;
  let release!: () => void;
  const gate = new Promise<void>(resolve => {
    release = resolve;
  });
  const entered = new Promise<void>(resolve => {
    reached = resolve;
  });
  const save = User.prototype.save;
  vi.spyOn(User.prototype, 'save').mockImplementationOnce(async function (this: any) {
    reached();
    await gate;
    return save.call(this);
  });
  const first = new CultivationService().castDivination(833013, 10).then(
    result => ({ result }),
    error => ({ error })
  );
  try {
    await entered;
    const winner = await new CultivationService().castDivination(833013, 10);
    release();
    const loser = await first;
    expect(loser).toHaveProperty('error');
    expect(winner.result).toBe(-40);
    expect((await User.findOne({ userId: 833013 }))?.cultivation.immortalStones).toBe(60);
    expect((await User.findOne({ userId: 833013 }))?.cultivation.divinationCount).toBe(1);
    expect(await DivinationHistory.countDocuments({ userId: 833013 })).toBe(1);
  } finally {
    release();
    await first;
  }
});
