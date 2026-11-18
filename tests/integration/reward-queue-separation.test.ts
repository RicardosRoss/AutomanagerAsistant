import { expect, test, vi } from 'vitest';
import QueueService from '../../src/services/QueueService.js';
import SelfControlBot from '../../src/bot.js';
import TaskService from '../../src/services/TaskService.js';
import CTDPService from '../../src/services/CTDPService.js';
import CultivationService from '../../src/services/CultivationService.js';
import TaskCommandHandlers from '../../src/handlers/taskCommands.js';
import { TaskChain, MainChain, User } from '../../src/models/index.js';

test('core reconciliation never waits for the independent reward handler', async () => {
  const queue = new QueueService();
  queue.isInitialized = true;
  queue.reservationQueue = {} as never;
  const blocked = vi.fn(() => new Promise<void>(() => {}));
  (queue as any).setFocusRewardRecoveryHandler(blocked);
  await queue.reconcileReservations();
  expect(blocked).not.toHaveBeenCalled();
});

test('core completion sends focus confirmation and queues optional recovery without executing it inline', async () => {
  const queue = {
    addReminder: vi.fn(),
    cancelTaskReminders: vi.fn().mockResolvedValue(0),
    requestFocusRewardRecovery: vi.fn().mockResolvedValue(undefined)
  };
  const tasks = new TaskService(queue as never);
  const ctdp = new CTDPService(tasks, queue as never);
  const started = await ctdp.startMainTask(835020, {
    description: '用户界面先完成',
    duration: 30,
    markerLabel: '确认'
  });
  await TaskChain.updateOne({ userId: 835020 }, { $set: { 'tasks.0.startTime': new Date(Date.now() - 1800000) } });
  const messages: string[] = [];
  const handler = new TaskCommandHandlers({
    bot: {
      sendMessage: async (_id: number, text: string) => {
        messages.push(text);
        return { message_id: messages.length };
      }
    } as never,
    taskService: tasks,
    queueService: queue as never,
    ctdpService: ctdp,
    onError: vi.fn()
  });
  await handler.handleCompleteTaskCallback(835020, `complete_task_${started.task.taskId}`);
  expect(messages[0]).toContain('专注任务已完成');
  expect(messages[0]).toContain('下一项');
  expect(messages[0]).not.toContain('闭关');
  expect((await MainChain.findOne({ userId: 835020 }))?.nodes[0]?.status).toBe('completed');
  expect((await User.findOne({ userId: 835020 }))?.cultivation.spiritualPower).toBe(0);
  expect(queue.requestFocusRewardRecovery).toHaveBeenCalledTimes(1);
});

test('the live bot wires reward work separately from the startup core recovery callback', async () => {
  const bot = new SelfControlBot();
  const reward = vi.spyOn(bot.taskService, 'recoverPendingRewards').mockRejectedValue(new Error('reward not ready'));
  await bot.queueService.taskCreationRecoveryHandler!();
  expect(reward).not.toHaveBeenCalled();
  await expect((bot.queueService as any).focusRewardRecoveryHandler()).rejects.toThrow('附加奖励');
  expect(reward).toHaveBeenCalledTimes(1);
});

test.each([false, true])('deferred offer notices only carry current controls, resolved=%s', async (resolved) => {
  const cultivation = new CultivationService();
  const userId = 835021;
  await User.create({ userId });
  const random = vi.spyOn(Math, 'random').mockReturnValue(0.1);
  try {
    await cultivation.setDevEncounterScript(userId, 'offer', 1);
    const reward = await cultivation.awardCultivation(userId, 60, 'notice-offer');
    const offerId = reward.encounter!.offerSummary!.offerId;
    if (resolved) await cultivation.abandonEncounterOffer(userId, offerId);
    const sent: any[] = [];
    const handler = new TaskCommandHandlers({
      bot: { sendMessage: async (...args: any[]) => {
        sent.push(args);
        return { message_id: 1 };
      } } as never,
      taskService: {} as never,
      queueService: {} as never,
      cultivationService: cultivation,
      onError: vi.fn()
    });
    await handler.sendRewardNotice(userId, 'notice-offer', reward,
      { description: '已完成的专注', actualDuration: 60 } as never);
    expect(sent[0][1]).toContain('附加奖励已到账');
    const controls = sent[0][2]?.reply_markup?.inline_keyboard;
    if (resolved) expect(controls).toBeUndefined();
    else expect(controls[0].map((button: any) => button.callback_data)).toEqual([
      `encounter_abandon_${offerId}`, `encounter_contest_${offerId}`
    ]);
  } finally {
    random.mockRestore();
  }
});
