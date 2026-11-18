import { expect, test, vi } from 'vitest';
import AuxChain from '../../src/models/AuxChain.js';
import AuxiliaryRulesService from '../../src/services/AuxiliaryRulesService.js';
import PrecedentService from '../../src/services/PrecedentService.js';
import CTDPService from '../../src/services/CTDPService.js';
import TaskService from '../../src/services/TaskService.js';
import TaskCommandHandlers from '../../src/handlers/taskCommands.js';

async function seed(userId: number, delayMinutes?: number) {
  return AuxChain.create({ userId, chainId: `resolution-${userId}`, pendingReservation: {
    reservationId: `res_${userId}`, signal: '阅读', duration: 30,
    createdAt: new Date(), deadlineAt: new Date(Date.now() + 600000), status: 'pending'
  }, pendingDecision: { behaviorKey: delayMinutes ? 'delay_reservation_5' : 'cancel_reservation', delayMinutes } });
}

test('a committed decision survives Redis cancellation failure', async () => {
  await seed(821001);
  const cancelReservation = vi.fn().mockRejectedValue(new Error('Redis outage'));
  const service = new AuxiliaryRulesService({ cancelReservation, rescheduleReservation: vi.fn() });
  const result = await service.resolve(821001, 'res_821001', 'break_chain');
  expect(result.status).toBe('inactive');
  expect(result.pendingReservation).toBeUndefined();
  expect(result.pendingDecision).toBeUndefined();
  expect(result.reservationHistory).toHaveLength(1);
});

test('selected delay recovery keeps its original resolution deadline when requeueing fails', async () => {
  const chain = await seed(821002, 5);
  const resolutionAt = new Date(Date.now() - 120000);
  await AuxChain.updateOne({ _id: chain._id }, { $set: {
    'pendingDecision.chosenDecision': 'allow_forever',
    'pendingDecision.resolutionAt': resolutionAt,
    'pendingDecision.processingUntil': new Date(Date.now() - 1000)
  } });
  const queue = {
    cancelReservation: vi.fn(), rescheduleReservation: vi.fn().mockRejectedValue(new Error('missing job'))
  };
  const service = new AuxiliaryRulesService(queue);
  expect(await service.recoverSelectedDecision('res_821002')).toBe(true);
  const result = (await AuxChain.findById(chain._id))!;
  expect(result.pendingDecision).toBeUndefined();
  expect(result.pendingReservation?.deadlineAt).toEqual(new Date(resolutionAt.getTime() + 300000));
  expect(result.reservationHistory).toHaveLength(1);
  expect(await service.recoverSelectedDecision('res_821002')).toBe(false);
});

test('pre-commit failure preserves the chosen option for recovery and rejects a different decision', async () => {
  await seed(821003);
  const service = new AuxiliaryRulesService({ cancelReservation: vi.fn(), rescheduleReservation: vi.fn() });
  const precedent = vi.spyOn(PrecedentService.prototype, 'allowForever').mockRejectedValueOnce(new Error('DB outage'));
  try {
    await expect(service.resolve(821003, 'res_821003', 'allow_forever')).rejects.toThrow('DB outage');
    expect((await AuxChain.findOne({ userId: 821003 }))?.pendingDecision?.chosenDecision).toBe('allow_forever');
    await expect(service.resolve(821003, 'res_821003', 'break_chain')).rejects.toThrow('另一决定');
    expect(await service.recoverSelectedDecision('res_821003')).toBe(true);
    expect((await AuxChain.findOne({ userId: 821003 }))?.reservationHistory).toHaveLength(1);
  } finally {
    precedent.mockRestore();
  }
});

test('a committed resolution with a lost DB response appends one history entry', async () => {
  await seed(821004);
  const service = new AuxiliaryRulesService({ cancelReservation: vi.fn(), rescheduleReservation: vi.fn() });
  const original = AuxChain.findOneAndUpdate.bind(AuxChain);
  let lost = false;
  const write = vi.spyOn(AuxChain, 'findOneAndUpdate').mockImplementation((async (
    filter: any, update: any, options: any
  ) => {
    const result = await original(filter, update, options);
    if (!lost && update?.$push?.reservationHistory?.resolutionId) {
      lost = true;
      throw new Error('DB response lost');
    }
    return result;
  }) as any);
  try {
    const result = await service.resolve(821004, 'res_821004', 'break_chain');
    expect(result.status).toBe('inactive');
    expect(result.reservationHistory).toHaveLength(1);
    expect(await service.recoverSelectedDecision('res_821004')).toBe(false);
  } finally {
    write.mockRestore();
  }
});

test('public delay and cancel service methods cannot bypass the precedent decision', async () => {
  const queue = { cancelReservation: vi.fn(), rescheduleReservation: vi.fn() };
  const service = new CTDPService(new TaskService(queue as never), queue);
  await service.createReservation(821005, '阅读', 30, 'public_delay');
  const originalDeadline = (await AuxChain.findOne({ userId: 821005 }))!.pendingReservation!.deadlineAt;
  const result = await service.delayReservation(821005, 'public_delay', 5);
  expect(result.auxChain.pendingDecision?.behaviorKey).toBe('delay_reservation_5');
  expect(result.decisionPending).toBe(true);
  expect(result.auxChain.pendingReservation?.deadlineAt).toEqual(originalDeadline);
  expect(queue.rescheduleReservation).not.toHaveBeenCalled();
  await expect(service.cancelReservation(821005, 'public_delay')).rejects.toThrow('请先处理');
  expect((await AuxChain.findOne({ userId: 821005 }))?.pendingReservation).toBeDefined();
});

test('cancel requests are explicitly pending and the Telegram handler presents the required decision',
  async () => {
    const queue = { cancelReservation: vi.fn(), rescheduleReservation: vi.fn() };
    const tasks = new TaskService(queue as never);
    const service = new CTDPService(tasks, queue);
    await service.createReservation(821006, '阅读', 30, 'cancel_pending');
    const requested = await service.cancelReservation(821006, 'cancel_pending');
    expect(requested.decisionPending).toBe(true);
    expect(requested.cancelled).toBe(false);
    const sendMessage = vi.fn();
    const onError = vi.fn();
    const handlers = new TaskCommandHandlers({
      bot: { sendMessage } as never, taskService: tasks, ctdpService: service,
      queueService: queue as never, onError
    });
    await handlers.handleCancelReservationCallback(821006, 'cancel_reservation_cancel_pending');
    expect(onError).not.toHaveBeenCalled();
    expect(sendMessage.mock.calls[0]?.[1]).toContain('辅助链需要判定');
    expect((await AuxChain.findOne({ userId: 821006 }))?.pendingReservation).toBeDefined();
  });
