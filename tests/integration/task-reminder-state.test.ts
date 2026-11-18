import { expect, test, vi } from 'vitest';
import QueueService from '../../src/services/QueueService.js';
import { TaskChain } from '../../src/models/index.js';

test.each(['deleted', 'initializing', 'rolling_back', 'completed', 'broken'])(
  'an active completion job for %s task does not send stale buttons',
  async state => {
    const queue = new QueueService();
    const sendMessage = vi.fn();
    queue.setBotInstance({ sendMessage } as never);
    if (state !== 'deleted')
      await TaskChain.create({
        userId: 832010,
        chainId: 'reminder-state',
        status: state === 'broken' ? 'broken' : 'active',
        tasks: [
          {
            taskId: 'stale-reminder',
            description: '通知状态',
            status: state === 'completed' ? 'completed' : 'running',
            duration: 30,
            startTime: new Date(Date.now() - 1800000),
            creationState: ['initializing', 'rolling_back'].includes(state) ? state : 'ready'
          }
        ]
      });
    await queue.sendCompletionNotification(832010, '专注时间结束', 'stale-reminder');
    expect(sendMessage).not.toHaveBeenCalled();
  }
);

test('the ready running owner receives completion buttons; another user does not', async () => {
  const queue = new QueueService();
  const sendMessage = vi.fn();
  queue.setBotInstance({ sendMessage } as never);
  await TaskChain.create({
    userId: 832011,
    chainId: 'reminder-owner',
    tasks: [
      {
        taskId: 'valid-reminder',
        description: '通知状态',
        status: 'running',
        duration: 30,
        startTime: new Date(Date.now() - 1800000),
        creationState: 'ready'
      }
    ]
  });
  await queue.sendCompletionNotification(832012, '结束', 'valid-reminder');
  expect(sendMessage).not.toHaveBeenCalled();
  await queue.sendCompletionNotification(832011, '结束', 'valid-reminder');
  expect(sendMessage.mock.calls).toHaveLength(1);
  expect(sendMessage.mock.calls[0]?.[0]).toBe(832011);
  expect(sendMessage.mock.calls[0]?.[2].reply_markup.inline_keyboard[0][0].callback_data).toBe(
    'complete_task_valid-reminder'
  );
});
