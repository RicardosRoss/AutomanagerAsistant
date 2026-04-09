import { beforeEach, describe, expect, test, vi } from 'vitest';
import CoreCommandHandlers from '../../../src/handlers/coreCommands.js';
import MainChain from '../../../src/models/MainChain.js';
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

  test('/stats reuses todayStats from user status instead of issuing a second daily stats query', async () => {
    taskService.getUserStatus.mockResolvedValue({
      user: {
        stats: {
          completedTasks: 12,
          currentStreak: 3,
          longestStreak: 8,
          totalMinutes: 185
        }
      },
      activeChain: null,
      currentTask: undefined,
      todayStats: {
        stats: {
          tasksStarted: 2,
          tasksCompleted: 1,
          tasksFailed: 1,
          totalMinutes: 30,
          successRate: 50,
          averageTaskDuration: 30
        }
      },
      isActive: false,
      stats: {}
    });

    const handler = new CoreCommandHandlers({
      bot: { sendMessage } as never,
      config: config as never,
      taskService: taskService as never,
      onError
    });

    await handler.handleStatsCommand(5515965469);

    expect(taskService.getUserStatus).toHaveBeenCalledWith(5515965469);
    expect(taskService.getDailyStats).not.toHaveBeenCalled();
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledWith(
      5515965469,
      expect.stringContaining('🎯 启动任务：2'),
      expect.any(Object)
    );
  });

  test('/status should show the latest broken CTDP main chain instead of hiding it', async () => {
    taskService.getUserStatus.mockResolvedValue({
      user: {
        stats: {
          completedTasks: 3,
          currentStreak: 0,
          longestStreak: 4,
          totalMinutes: 90
        },
        successRate: 75
      },
      activeChain: null,
      currentTask: undefined,
      isActive: false,
      stats: {}
    });

    await MainChain.create({
      userId: 5515965469,
      chainId: 'mc_broken_status',
      sacredMarker: { type: 'seat', label: 'status-seat' },
      levelCounters: { unit: 0, group: 0, cluster: 0 },
      nodes: [],
      status: 'broken'
    });

    const handler = new CoreCommandHandlers({
      bot: { sendMessage } as never,
      config: config as never,
      taskService: taskService as never,
      onError
    });

    await handler.handleStatusCommand(5515965469);

    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledWith(
      5515965469,
      expect.stringContaining('🎯 主链状态：已中断'),
      expect.any(Object)
    );
  });
});
