import { describe, expect, test, vi } from 'vitest';
import type TelegramBot from 'node-telegram-bot-api';
import TaskDraftHandlers from '../../src/handlers/taskDraftCommands.js';
import TaskDraft from '../../src/models/TaskDraft.js';
import User from '../../src/models/User.js';
import TaskChain from '../../src/models/TaskChain.js';
import AuxChain from '../../src/models/AuxChain.js';
import TaskService from '../../src/services/TaskService.js';
import CTDPService from '../../src/services/CTDPService.js';
import TaskCommandHandlers from '../../src/handlers/taskCommands.js';

describe('low friction task input', () => {
  const userId = 808001;
  function fixture() {
    const sent: Array<{ text: string; options?: TelegramBot.SendMessageOptions }> = [];
    const bot = {
      sendMessage: vi.fn(async (_id: number, text: string, options?: TelegramBot.SendMessageOptions) => {
        sent.push({ text, options });
        return { message_id: sent.length };
      })
    };
    const actions: Array<{ mode: string; userId: number; input: string }> = [];
    const commands = {
      handleTaskCommand: async (id: number, input: string) => {
        actions.push({ mode: 'start', userId: id, input });
        return true;
      },
      handleReserveCommand: async (id: number, input: string) => {
        actions.push({ mode: 'reserve', userId: id, input });
        return true;
      }
    };
    const handler = new TaskDraftHandlers(bot as never, commands as never);
    return { handler, actions, sent };
  }

  test('button → description → confirmation preserves long Chinese text and uses short callbacks', async () => {
    await User.create({ userId, settings: { defaultDuration: 45 } });
    const { handler, actions, sent } = fixture();
    await handler.begin(userId, 'reserve');
    const description = '学习：整理章节_重点[例子]'.repeat(20);
    expect(await handler.handleText(userId, description)).toBe(true);
    const screen = sent.at(-1)!;
    expect(screen.text).toContain(description);
    expect(screen.options?.parse_mode).toBeUndefined();
    const buttons = screen.options!.reply_markup as TelegramBot.InlineKeyboardMarkup;
    for (const row of buttons.inline_keyboard) {
      for (const button of row) expect(Buffer.byteLength(button.callback_data!)).toBeLessThanOrEqual(64);
    }
    const confirm = buttons.inline_keyboard.flat().find((button) => button.callback_data?.endsWith(':confirm'))!;
    expect(actions).toEqual([]);
    await handler.handleCallback(userId, confirm.callback_data!);
    expect(actions).toEqual([{ mode: 'reserve', userId, input: `${description} 45` }]);
    expect(await TaskDraft.countDocuments({ userId })).toBe(0);
    await handler.handleCallback(userId, confirm.callback_data!);
    expect(actions).toHaveLength(1);
  });

  test('another user cannot confirm or cancel a draft; a stale button cannot submit a replacement draft', async () => {
    const { handler, actions } = fixture();
    await handler.begin(userId, 'start');
    await handler.handleText(userId, '读书');
    const first = (await TaskDraft.findOne({ userId }))!;
    await handler.handleCallback(userId + 1, `draft:${first.token}:confirm`);
    expect(actions).toEqual([]);
    expect(await TaskDraft.countDocuments({ userId })).toBe(1);
    await handler.begin(userId, 'reserve');
    await handler.handleCallback(userId, `draft:${first.token}:confirm`);
    expect(actions).toEqual([]);
  });

  test('exiting the preparation draft has no task or reservation side effects', async () => {
    const { handler, actions } = fixture();
    await handler.begin(userId, 'reserve');
    const draft = (await TaskDraft.findOne({ userId }))!;
    await handler.handleCallback(userId, `draft:${draft.token}:cancel`);
    expect(actions).toEqual([]);
    expect(await TaskDraft.countDocuments({ userId })).toBe(0);
    expect(await handler.handleText(userId, '后来再说')).toBe(false);
  });

  test('simultaneous confirmation claims one submission, while failures leave the draft retryable', async () => {
    const { handler, actions } = fixture();
    await handler.begin(userId, 'reserve');
    await handler.handleText(userId, '读论文');
    const draft = (await TaskDraft.findOne({ userId }))!;
    await Promise.all([
      handler.handleCallback(userId, `draft:${draft.token}:confirm`),
      handler.handleCallback(userId, `draft:${draft.token}:confirm`)
    ]);
    expect(actions).toHaveLength(1);

    const failing = new TaskDraftHandlers(
      { sendMessage: vi.fn() } as never,
      {
        handleReserveCommand: async () => false
      } as never
    );
    await failing.begin(userId, 'reserve');
    await failing.handleText(userId, '继续阅读');
    const retry = (await TaskDraft.findOne({ userId }))!;
    await failing.handleCallback(userId, `draft:${retry.token}:confirm`);
    expect((await TaskDraft.findOne({ userId }))?.stage).toBe('ready');
  });

  test('提交进程中断后，过期租约可以恢复为可确认草稿', async () => {
    const { handler, sent } = fixture();
    await handler.begin(userId, 'start');
    await handler.handleText(userId, '中断后继续');
    const draft = (await TaskDraft.findOne({ userId }))!;
    await TaskDraft.collection.updateOne(
      { userId, token: draft.token },
      { $set: { stage: 'submitting', updatedAt: new Date(Date.now() - 3 * 60 * 1000) } }
    );

    await handler.handleCallback(userId, `draft:${draft.token}:confirm`);

    expect((await TaskDraft.findOne({ userId }))?.stage).toBe('ready');
    expect(sent.at(-1)?.text).toContain('确认前可调整时长');
  });

  test('a same-description older task cannot be mistaken for this submission', async () => {
    const { handler } = fixture();
    await handler.begin(userId, 'start', '同样的阅读');
    const draft = (await TaskDraft.findOne({ userId }))!;
    await TaskChain.create({ userId, chainId: 'old-identical-task', tasks: [{
      taskId: 'old-task', description: draft.description, duration: draft.duration,
      startTime: new Date(), status: 'running'
    }] });
    await TaskDraft.collection.updateOne({ userId }, { $set: {
      stage: 'submitting', updatedAt: new Date(Date.now() - 180_000)
    } });
    await handler.handleCallback(userId, `draft:${draft.token}:confirm`);
    expect((await TaskDraft.findOne({ userId }))?.stage).toBe('ready');
    expect(await TaskChain.countDocuments({ userId })).toBe(1);
  });

  test('a durable reservation is recovered by its exact token after restart', async () => {
    const { handler, sent, actions } = fixture();
    await handler.begin(userId, 'reserve', '预约恢复');
    const draft = (await TaskDraft.findOne({ userId }))!;
    await AuxChain.create({ userId, chainId: 'recover-reservation', pendingReservation: {
      reservationId: `res_${draft.token}`, signal: draft.description,
      duration: draft.duration, createdAt: new Date(), status: 'pending'
    } });
    await TaskDraft.collection.updateOne({ userId }, { $set: {
      stage: 'submitting', updatedAt: new Date(Date.now() - 180_000)
    } });
    await handler.handleCallback(userId, `draft:${draft.token}:confirm`);
    expect(await TaskDraft.countDocuments({ userId })).toBe(0);
    expect(actions).toHaveLength(0);
    expect(sent.at(-1)?.text).toContain('/reserve_status');
  });

  test('another preparation cannot replace a submission that is still in flight', async () => {
    const { handler } = fixture();
    await handler.begin(userId, 'start', '正在提交');
    const draft = (await TaskDraft.findOne({ userId }))!;
    await TaskDraft.updateOne({ userId }, { $set: { stage: 'submitting' } });
    await handler.begin(userId, 'reserve', '另一个准备');
    const after = (await TaskDraft.findOne({ userId }))!;
    expect(after.token).toBe(draft.token);
    expect(after.stage).toBe('submitting');
  });

  test('confirmation with a failed Telegram notification creates exactly one durable reservation', async () => {
    const bot = { sendMessage: vi.fn().mockResolvedValue({ message_id: 1 }) };
    const queue = { scheduleReservation: vi.fn(), cancelReservation: vi.fn().mockResolvedValue(false) };
    const tasks = new TaskService(queue as never, { awardCultivation: vi.fn() } as never);
    const ctdp = new CTDPService(tasks, queue as never);
    const commands = new TaskCommandHandlers({
      bot: bot as never, taskService: tasks, queueService: queue as never,
      ctdpService: ctdp, onError: vi.fn()
    });
    const handler = new TaskDraftHandlers(bot as never, commands);
    await handler.begin(userId, 'reserve', '故障后预约');
    const draft = (await TaskDraft.findOne({ userId }))!;
    bot.sendMessage.mockRejectedValueOnce(new Error('Telegram timeout'));
    await handler.handleCallback(userId, `draft:${draft.token}:confirm`);
    await handler.handleCallback(userId, `draft:${draft.token}:confirm`);
    expect(await TaskDraft.countDocuments({ userId })).toBe(0);
    const chains = await AuxChain.find({ userId });
    expect(chains).toHaveLength(1);
    expect(chains[0]!.pendingReservation?.reservationId).toBe(`res_${draft.token}`);
    expect(queue.scheduleReservation).toHaveBeenCalledTimes(1);
  });

  test('a reservation left by Redis add and database rollback failure still has a precedent exit', async () => {
    const queue = {
      scheduleReservation: vi.fn().mockRejectedValue(new Error('Redis outage')),
      cancelReservation: vi.fn().mockRejectedValueOnce(new Error('Redis outage')).mockResolvedValue(false)
    };
    const tasks = new TaskService(queue as never, { awardCultivation: vi.fn() } as never);
    const ctdp = new CTDPService(tasks, queue as never);
    const commands = new TaskCommandHandlers({
      bot: { sendMessage: vi.fn() } as never, taskService: tasks,
      queueService: queue as never, ctdpService: ctdp, onError: vi.fn()
    });
    const original = AuxChain.findOneAndUpdate.bind(AuxChain);
    const rollback = vi.spyOn(AuxChain, 'findOneAndUpdate').mockImplementation((
      (filter: any, update: any, options: any) => {
        if (update?.$unset?.pendingReservation && !update?.$push) {
          return Promise.reject(new Error('MongoDB rollback unavailable'));
        }
        return original(filter, update, options);
      }
    ) as any);
    try {
      expect(await commands.handleReserveCommand(userId, '遗留预约 30', 'orphan-test')).toBe(false);
    } finally {
      rollback.mockRestore();
    }
    expect((await AuxChain.findOne({ userId }))?.pendingReservation?.reservationId).toBe('res_orphan-test');
    await ctdp.requestAuxiliaryViolation(userId, 'res_orphan-test', 'cancel_reservation');
    await ctdp.resolveAuxiliaryViolation(userId, 'res_orphan-test', 'break_chain');
    const chain = (await AuxChain.findOne({ userId }))!;
    expect(chain.status).toBe('inactive');
    expect(chain.pendingReservation).toBeUndefined();
  });
});
