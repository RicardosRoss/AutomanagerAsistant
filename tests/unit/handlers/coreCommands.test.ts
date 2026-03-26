import { beforeEach, describe, expect, test, vi } from 'vitest';
import CoreCommandHandlers from '../../../src/handlers/coreCommands.js';
import User from '../../../src/models/User.js';

describe('CoreCommandHandlers', () => {
  const sendMessage = vi.fn();
  const config = {
    getBotInfo: vi.fn().mockReturnValue({
      description: '基于科学自控力理论的专注任务管理机器人'
    }),
    getSupportedCommands: vi.fn().mockReturnValue([])
  };

  const taskService = {
    getUserStatus: vi.fn(),
    getDailyStats: vi.fn()
  };

  const onError = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('/start initializes the user account before sending the welcome message', async () => {
    const findOrCreateSpy = vi.spyOn(User, 'findOrCreate').mockResolvedValue({} as never);

    const handler = new CoreCommandHandlers({
      bot: { sendMessage } as never,
      config: config as never,
      taskService: taskService as never,
      onError
    });

    await handler.handleStartCommand(5515965469, {
      id: 5515965469,
      username: 'richardos0112',
      first_name: 'jim',
      last_name: 'Jones'
    } as never);

    expect(findOrCreateSpy).toHaveBeenCalledWith({
      userId: 5515965469,
      username: 'richardos0112',
      firstName: 'jim',
      lastName: 'Jones'
    });
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });
});
