import { describe, expect, test, vi } from 'vitest';
import CTDPService from '../../src/services/CTDPService.js';
import TaskService from '../../src/services/TaskService.js';
import { AuxChain, MainChain, TaskChain, PrecedentRule } from '../../src/models/index.js';

function fixture() {
  const queue = {
    addReminder: vi.fn(),
    cancelTaskReminders: vi.fn(),
    cancelReservation: vi.fn(),
    rescheduleReservation: vi.fn()
  };
  const tasks = new TaskService(queue as never, { awardCultivation: vi.fn() } as never);
  return new CTDPService(tasks, queue as never);
}

async function makeOverdue(reservationId: string) {
  await AuxChain.updateOne(
    { 'pendingReservation.reservationId': reservationId },
    {
      $set: { 'pendingReservation.deadlineAt': new Date(Date.now() - 1000) }
    }
  );
}

describe('原文：发出预约信号后15分钟内启动', () => {
  test('simultaneous conflicting decisions have one winner and append one history entry', async () => {
    const service = fixture();
    await service.createReservation(809008, '学习', 60, 'decision-race');
    await service.requestAuxiliaryViolation(809008, 'decision-race', 'cancel_reservation');
    const results = await Promise.allSettled([
      service.resolveAuxiliaryViolation(809008, 'decision-race', 'allow_forever'),
      service.resolveAuxiliaryViolation(809008, 'decision-race', 'break_chain')
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const chain = (await AuxChain.findOne({ userId: 809008 }))!;
    expect(chain.reservationHistory).toHaveLength(1);
    expect(chain.pendingDecision).toBeUndefined();
  });
  test('a direct main-task start also fulfills an outstanding reservation', async () => {
    const service = fixture();
    await service.createReservation(809007, '准备学习', 60, 'direct-start');
    const result = await service.startMainTask(809007, {
      markerLabel: '确认开始', description: '学习第一节', duration: 60
    });
    const aux = await AuxChain.findOne({ userId: 809007 });
    expect(aux?.pendingReservation).toBeUndefined();
    expect(aux?.completedReservations).toBe(1);
    expect(result.task.reservationId).toBe('direct-start');
  });
  test('starting before the deadline fulfills the reservation and accumulates an auxiliary record', async () => {
    const service = fixture();
    await service.createReservation(809001, '打开书本读第一节', 60, 'early');
    const result = await service.startReservedTask(809001, 'early');
    expect(result.auxChain.reservationHistory).toHaveLength(1);
    expect(result.auxChain.reservationHistory[0]!.status).toBe('fulfilled');
    expect(result.mainChain.nodes[0]!.status).toBe('running');
  });

  test('a missed deadline cannot start silently, nor can a new reservation overwrite the decision', async () => {
    const service = fixture();
    await service.createReservation(809002, '准备学习', 60, 'late');
    await makeOverdue('late');
    await expect(service.startReservedTask(809002, 'late')).rejects.toThrow('判例');
    const chain = (await AuxChain.findOne({ userId: 809002, status: 'active' }))!;
    expect(chain.pendingReservation?.status).toBe('expired');
    expect(chain.pendingDecision?.behaviorKey).toBe('missed_start');
    expect(await TaskChain.countDocuments({ userId: 809002 })).toBe(0);
    await expect(service.createReservation(809002, '换一个', 60, 'replacement')).rejects.toThrow('已有');
  });

  test('the persistent deadline processor requests a decision; break resets the auxiliary chain only', async () => {
    const service = fixture();
    await service.createReservation(809003, '准备学习', 60, 'expired');
    await makeOverdue('expired');
    await service.expireReservation('expired');
    await service.resolveAuxiliaryViolation(809003, 'expired', 'break_chain');
    const chain = (await AuxChain.findOne({ userId: 809003 }))!;
    expect(chain.status).toBe('inactive');
    expect(chain.pendingReservation).toBeUndefined();
    expect(chain.completedReservations).toBe(0);
    expect(await MainChain.countDocuments({ userId: 809003 })).toBe(0);
  });

  test('permanent permission applies only to the current auxiliary chain lifecycle', async () => {
    const service = fixture();
    const first = await service.createReservation(809004, '准备学习', 60, 'permission');
    await makeOverdue('permission');
    await service.expireReservation('permission');
    await service.resolveAuxiliaryViolation(809004, 'permission', 'allow_forever');
    const rule = (await PrecedentRule.findOne({ userId: 809004 }))!;
    expect(rule.scope.chainId).toBe(first.chainId);

    await service.createReservation(809004, '下一个', 60, 'allowed');
    await makeOverdue('allowed');
    const allowed = await service.expireReservation('allowed');
    expect(allowed.auxChain?.pendingDecision).toBeUndefined();
    expect(allowed.auxChain?.pendingReservation).toBeUndefined();

    await service.createReservation(809004, '再试', 60, 'break');
    await service.requestAuxiliaryViolation(809004, 'break', 'cancel_reservation');
    await service.resolveAuxiliaryViolation(809004, 'break', 'break_chain');
    const next = await service.createReservation(809004, '重建', 60, 'new-life');
    expect(next.chainId).not.toBe(first.chainId);
    await makeOverdue('new-life');
    const overdue = await service.expireReservation('new-life');
    expect(overdue.auxChain?.pendingDecision?.behaviorKey).toBe('missed_start');
  });

  test('delay and cancellation require a decision and cannot be decided by another user', async () => {
    const service = fixture();
    await service.createReservation(809005, '学习', 60, 'cancel');
    await service.requestAuxiliaryViolation(809005, 'cancel', 'cancel_reservation');
    await expect(service.resolveAuxiliaryViolation(809006, 'cancel', 'allow_forever')).rejects.toThrow('不存在');
    expect((await AuxChain.findOne({ userId: 809005 }))?.pendingReservation).toBeDefined();
    await service.resolveAuxiliaryViolation(809005, 'cancel', 'allow_forever');
    expect((await AuxChain.findOne({ userId: 809005 }))?.pendingReservation).toBeUndefined();
  });
});
