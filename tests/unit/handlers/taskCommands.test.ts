import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import config from '../../../config/index.js';
import TaskCommandHandlers from '../../../src/handlers/taskCommands.js';
import {
  DEFAULT_TASK_DURATION_MINUTES,
  getMinTaskDurationMinutes
} from '../../../src/types/taskDefaults.js';

describe('TaskCommandHandlers', () => {
  const bot = {
    sendMessage: vi.fn().mockResolvedValue({ message_id: 1 })
  };
  const taskService = {
    createTask: vi.fn()
  };
  const onError = vi.fn();
  const originalReservationDelay = config.linearDelay.defaultReservationDelay;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    config.linearDelay.defaultReservationDelay = originalReservationDelay;
    vi.unstubAllEnvs();
  });

  test('/reserve 在 reservation 状态创建失败时，不应先留下队列任务', async () => {
    const queueService = {
      scheduleReservation: vi.fn().mockResolvedValue('job-id'),
      cancelReservation: vi.fn().mockResolvedValue(true)
    };
    const ctdpService = {
      createReservation: vi.fn().mockRejectedValue(new Error('已有活跃预约')),
      cancelReservation: vi.fn().mockResolvedValue({ cancelled: true })
    };

    const handlers = new TaskCommandHandlers({
      bot: bot as never,
      taskService: taskService as never,
      queueService: queueService as never,
      ctdpService: ctdpService as never,
      onError
    });

    await handlers.handleReserveCommand(123456789, '学习编程 30');

    expect(ctdpService.createReservation).toHaveBeenCalledTimes(1);
    expect(queueService.scheduleReservation).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(123456789, '已有活跃预约');
  });

  test('/reserve 在队列调度失败时，应回滚已创建的 reservation 状态', async () => {
    const queueService = {
      scheduleReservation: vi.fn().mockRejectedValue(new Error('队列不可用')),
      cancelReservation: vi.fn().mockResolvedValue(true)
    };
    const ctdpService = {
      createReservation: vi.fn().mockResolvedValue({}),
      cancelReservation: vi.fn().mockResolvedValue({ cancelled: true })
    };

    const handlers = new TaskCommandHandlers({
      bot: bot as never,
      taskService: taskService as never,
      queueService: queueService as never,
      ctdpService: ctdpService as never,
      onError
    });

    await handlers.handleReserveCommand(123456789, '读书 45');

    expect(ctdpService.createReservation).toHaveBeenCalledTimes(1);
    expect(queueService.scheduleReservation).toHaveBeenCalledTimes(1);
    expect(ctdpService.cancelReservation).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(123456789, '队列不可用');
  });

  test('/reserve 成功消息应显示配置化的预约延迟', async () => {
    config.linearDelay.defaultReservationDelay = 90 * 60;

    const queueService = {
      scheduleReservation: vi.fn().mockResolvedValue('job-id'),
      cancelReservation: vi.fn().mockResolvedValue(true)
    };
    const ctdpService = {
      createReservation: vi.fn().mockResolvedValue({}),
      cancelReservation: vi.fn().mockResolvedValue({ cancelled: true })
    };

    const handlers = new TaskCommandHandlers({
      bot: bot as never,
      taskService: taskService as never,
      queueService: queueService as never,
      ctdpService: ctdpService as never,
      onError
    });

    await handlers.handleReserveCommand(123456789, '深度工作 45');

    expect(bot.sendMessage).toHaveBeenCalledWith(
      123456789,
      expect.stringContaining('🕐 预约时间：1小时30分钟后'),
      expect.any(Object)
    );
    expect(bot.sendMessage).toHaveBeenCalledWith(
      123456789,
      expect.stringContaining('1小时30分钟的延迟将降低60%的启动阻力'),
      expect.any(Object)
    );
  });

  test('parseTaskInput 在无显式时长时应使用统一默认时长', () => {
    const handlers = new TaskCommandHandlers({
      bot: bot as never,
      taskService: taskService as never,
      queueService: { scheduleReservation: vi.fn(), cancelReservation: vi.fn() } as never,
      onError
    });

    expect(handlers.parseTaskInput('写作业')).toEqual({
      description: '写作业',
      duration: DEFAULT_TASK_DURATION_MINUTES
    });
  });

  test('parseTaskInput 在开发环境应允许 1 分钟任务', () => {
    vi.stubEnv('NODE_ENV', 'development');

    const handlers = new TaskCommandHandlers({
      bot: bot as never,
      taskService: taskService as never,
      queueService: { scheduleReservation: vi.fn(), cancelReservation: vi.fn() } as never,
      onError
    });

    expect(getMinTaskDurationMinutes()).toBe(1);
    expect(handlers.parseTaskInput('测试奇遇 1')).toEqual({
      description: '测试奇遇',
      duration: 1
    });
  });

  test('parseTaskInput 在生产环境不应允许 1 分钟任务', () => {
    vi.stubEnv('NODE_ENV', 'production');

    const handlers = new TaskCommandHandlers({
      bot: bot as never,
      taskService: taskService as never,
      queueService: { scheduleReservation: vi.fn(), cancelReservation: vi.fn() } as never,
      onError
    });

    expect(getMinTaskDurationMinutes()).toBe(5);
    expect(handlers.parseTaskInput('测试奇遇 1')).toEqual({
      description: '测试奇遇 1',
      duration: DEFAULT_TASK_DURATION_MINUTES
    });
  });

  test('sendTaskPrompt 应显示统一默认时长', async () => {
    const handlers = new TaskCommandHandlers({
      bot: bot as never,
      taskService: taskService as never,
      queueService: { scheduleReservation: vi.fn(), cancelReservation: vi.fn() } as never,
      onError
    });

    await handlers.sendTaskPrompt(123456789);

    expect(bot.sendMessage).toHaveBeenCalledWith(
      123456789,
      expect.stringContaining(`• \`/task 写作业\` (默认${DEFAULT_TASK_DURATION_MINUTES}分钟)`),
      expect.objectContaining({ parse_mode: 'Markdown' })
    );
  });

  test('完成任务消息应显示道行与灵石变化，不再显示额外灵力文案', async () => {
    const queueService = {
      scheduleReservation: vi.fn(),
      cancelReservation: vi.fn()
    };
    const ctdpService = {
      completeTrackedTask: vi.fn().mockResolvedValue({
        task: {
          taskId: 'task-1',
          actualDuration: 37
        },
        cultivationReward: {
          spiritualPower: 88,
          immortalStones: -5,
          cultivationAttainmentDelta: 4,
          mainMethodName: '太虚引气诀',
          encounter: {
            message: '🍃 行功顺畅，心神清明'
          },
          breakthroughReady: true
        },
        user: {
          stats: {
            currentStreak: 1
          }
        }
      }),
      failTrackedTask: vi.fn()
    };

    const handlers = new TaskCommandHandlers({
      bot: bot as never,
      taskService: taskService as never,
      queueService: queueService as never,
      ctdpService: ctdpService as never,
      onError
    });

    await handlers.handleCompleteTaskCallback(123456789, 'complete_task_task-1');

    const sentMessage = bot.sendMessage.mock.calls[0]?.[1] as string;
    expect(sentMessage).toContain('⚡ 获得修为：88 点');
    expect(sentMessage).toContain('🧭 道行变化：+4');
    expect(sentMessage).toContain('💎 灵石变化：-5');
    expect(sentMessage).toContain('📘 主修功法：太虚引气诀');
    expect(sentMessage).not.toContain('额外灵力');
    expect(sentMessage).not.toContain('x1.5');
  });

  test('完成任务消息应追加奇遇战短战报', async () => {
    const handlers = new TaskCommandHandlers({
      bot: bot as never,
      taskService: taskService as never,
      queueService: { scheduleReservation: vi.fn(), cancelReservation: vi.fn() } as never,
      ctdpService: {
        completeTrackedTask: vi.fn().mockResolvedValue({
          task: {
            taskId: 'task-1',
            actualDuration: 60
          },
          cultivationReward: {
            spiritualPower: 1,
            immortalStones: 3,
            cultivationAttainmentDelta: 1,
            mainMethodName: '玄门吐纳法',
            encounter: {
              type: 'combat',
              message: '林间妖气骤起，一头拦路青狼扑杀而来。',
              spiritStoneDelta: 3,
              obtainedDefinitionIds: [],
              combatSummary: {
                encounterId: 'combatEncounter.taixi.roadside_wolf',
                enemyName: '拦路青狼',
                result: 'win',
                summary: '你先以身法游走拉开空档，随后趁势压制对手。',
                injuryLevel: 'none'
              }
            }
          },
          user: {
            stats: {
              currentStreak: 1
            }
          }
        }),
        failTrackedTask: vi.fn()
      } as never,
      onError
    });

    await handlers.handleCompleteTaskCallback(123456789, 'complete_task_task-1');

    const sentMessage = bot.sendMessage.mock.calls[0]?.[1] as string;
    expect(sentMessage).toContain('⚔️ 斗法结果：大胜');
    expect(sentMessage).toContain('🐺 对手：拦路青狼');
    expect(sentMessage).toContain('📝 你先以身法游走拉开空档，随后趁势压制对手。');
  });

  test('完成任务消息在疗伤生效时应追加伤势恢复摘要，但不显示修为扣减', async () => {
    const handlers = new TaskCommandHandlers({
      bot: bot as never,
      taskService: taskService as never,
      queueService: { scheduleReservation: vi.fn(), cancelReservation: vi.fn() } as never,
      ctdpService: {
        completeTrackedTask: vi.fn().mockResolvedValue({
          task: {
            taskId: 'task-2',
            actualDuration: 90
          },
          cultivationReward: {
            spiritualPower: 1,
            immortalStones: 0,
            cultivationAttainmentDelta: 0,
            mainMethodName: '玄门吐纳法',
            injuryRecovery: {
              applied: true,
              previousLevel: 'medium',
              nextLevel: 'none',
              summary: '🩹 伤势恢复：中伤 -> 无伤'
            },
            encounter: {
              type: 'none',
              message: null,
              spiritStoneDelta: 0,
              obtainedDefinitionIds: []
            },
            breakthroughReady: false
          },
          user: {
            stats: {
              currentStreak: 1
            }
          }
        }),
        failTrackedTask: vi.fn()
      } as never,
      onError
    });

    await handlers.handleCompleteTaskCallback(123456789, 'complete_task_task-2');

    const sentMessage = bot.sendMessage.mock.calls[0]?.[1] as string;
    expect(sentMessage).toContain('🩹 伤势恢复：中伤 -> 无伤');
    expect(sentMessage).not.toContain('疗伤耗去修为');
  });

  test('完成任务消息在开发详细战报开启时应追加回合日志', async () => {
    const handlers = new TaskCommandHandlers({
      bot: bot as never,
      taskService: taskService as never,
      queueService: { scheduleReservation: vi.fn(), cancelReservation: vi.fn() } as never,
      ctdpService: {
        completeTrackedTask: vi.fn().mockResolvedValue({
          task: {
            taskId: 'task-1',
            actualDuration: 60
          },
          cultivationReward: {
            spiritualPower: 1,
            immortalStones: 3,
            cultivationAttainmentDelta: 1,
            mainMethodName: '玄门吐纳法',
            encounter: {
              type: 'combat',
              message: '林间妖气骤起，一头拦路青狼扑杀而来。',
              spiritStoneDelta: 3,
              obtainedDefinitionIds: [],
              combatSummary: {
                encounterId: 'combatEncounter.taixi.roadside_wolf',
                enemyName: '拦路青狼',
                result: 'win',
                summary: '你先以身法游走拉开空档，随后趁势压制对手。',
                injuryLevel: 'none',
                rounds: [
                  { round: 1, actor: 'player', action: 'attack', damage: 4 },
                  { round: 1, actor: 'enemy', action: 'movement', damage: 1 }
                ]
              }
            }
          },
          user: {
            stats: {
              currentStreak: 1
            }
          }
        }),
        failTrackedTask: vi.fn()
      } as never,
      onError
    });

    await handlers.handleCompleteTaskCallback(123456789, 'complete_task_task-1');

    const sentMessage = bot.sendMessage.mock.calls[0]?.[1] as string;
    expect(sentMessage).toContain('🧪 详细战报：');
    expect(sentMessage).toContain('第1回合·你：攻伐，伤害 4');
    expect(sentMessage).toContain('第1回合·敌方：身法，伤害 1');
  });

  test('短时任务未达到主修为门槛时，应明确提示修为为 0 的原因', async () => {
    const handlers = new TaskCommandHandlers({
      bot: bot as never,
      taskService: taskService as never,
      queueService: { scheduleReservation: vi.fn(), cancelReservation: vi.fn() } as never,
      ctdpService: {
        completeTrackedTask: vi.fn().mockResolvedValue({
          task: {
            taskId: 'task-short-1',
            actualDuration: 1
          },
          cultivationReward: {
            spiritualPower: 0,
            immortalStones: 3,
            cultivationAttainmentDelta: 1,
            mainMethodName: '玄门吐纳法',
            encounter: {
              type: 'combat',
              message: '林间妖气骤起，一头拦路青狼扑杀而来。',
              spiritStoneDelta: 3,
              obtainedDefinitionIds: [],
              combatSummary: {
                encounterId: 'combatEncounter.taixi.roadside_wolf',
                enemyName: '拦路青狼',
                result: 'win',
                summary: '你先以身法游走拉开空档，随后趁势压制对手。',
                injuryLevel: 'none'
              }
            }
          },
          user: {
            stats: {
              currentStreak: 1
            }
          }
        }),
        failTrackedTask: vi.fn()
      } as never,
      onError
    });

    await handlers.handleCompleteTaskCallback(123456789, 'complete_task_task-short-1');

    const sentMessage = bot.sendMessage.mock.calls[0]?.[1] as string;
    expect(sentMessage).toContain('⚡ 获得修为：0 点');
    expect(sentMessage).toContain('未达到60分钟主修为门槛');
    expect(sentMessage).toContain('奇遇与道行奖励已照常结算');
  });

  test('短时任务无奇遇收益时，应提示未触发主修为与奇遇收益', async () => {
    const handlers = new TaskCommandHandlers({
      bot: bot as never,
      taskService: taskService as never,
      queueService: { scheduleReservation: vi.fn(), cancelReservation: vi.fn() } as never,
      ctdpService: {
        completeTrackedTask: vi.fn().mockResolvedValue({
          task: {
            taskId: 'task-short-2',
            actualDuration: 1
          },
          cultivationReward: {
            spiritualPower: 0,
            immortalStones: 0,
            cultivationAttainmentDelta: 0,
            mainMethodName: '玄门吐纳法',
            encounter: {
              type: 'none',
              message: null,
              spiritStoneDelta: 0,
              obtainedDefinitionIds: []
            }
          },
          user: {
            stats: {
              currentStreak: 1
            }
          }
        }),
        failTrackedTask: vi.fn()
      } as never,
      onError
    });

    await handlers.handleCompleteTaskCallback(123456789, 'complete_task_task-short-2');

    const sentMessage = bot.sendMessage.mock.calls[0]?.[1] as string;
    expect(sentMessage).toContain('⚡ 获得修为：0 点');
    expect(sentMessage).toContain('未达到60分钟主修为门槛');
    expect(sentMessage).toContain('未触发主修为与奇遇收益');
  });

  test('完成任务消息在守宝奇遇时应追加风险文案和离开/争抢按钮', async () => {
    const cultivationService = {
      abandonEncounterOffer: vi.fn(),
      contestEncounterOffer: vi.fn()
    };
    const handlers = new TaskCommandHandlers({
      bot: bot as never,
      taskService: taskService as never,
      cultivationService: cultivationService as never,
      queueService: { scheduleReservation: vi.fn(), cancelReservation: vi.fn() } as never,
      ctdpService: {
        completeTrackedTask: vi.fn().mockResolvedValue({
          task: { taskId: 'task-guardian', actualDuration: 60 },
          cultivationReward: {
            spiritualPower: 1,
            immortalStones: 0,
            cultivationAttainmentDelta: 1,
            mainMethodName: '玄门吐纳法',
            encounter: {
              type: 'offer',
              message: '✨ 你发现了归元盾传承玉简，却有守宝之物拦路。',
              spiritStoneDelta: 0,
              obtainedDefinitionIds: [],
              offerSummary: {
                offerId: 'offer_1',
                lootDefinitionId: 'manual.art.returning_origin_shield',
                lootDisplayName: '归元盾传承玉简',
                lootTier: '玄',
                guardianStyle: 'hybrid',
                riskTier: 'dangerous',
                guardianEncounterId: 'generated.encounter.guardian.hybrid.1',
                guardianName: '镇宝异种'
              }
            }
          },
          user: {
            stats: {
              currentStreak: 1
            }
          }
        }),
        failTrackedTask: vi.fn()
      } as never,
      onError
    });

    await handlers.handleCompleteTaskCallback(123456789, 'complete_task_task-guardian');

    expect(bot.sendMessage).toHaveBeenCalledWith(
      123456789,
      expect.stringContaining('⚠️ 风险：凶险'),
      expect.objectContaining({
        reply_markup: {
          inline_keyboard: [[
            { text: '🚶 离开', callback_data: 'encounter_abandon_offer_1' },
            { text: '⚔️ 争抢', callback_data: 'encounter_contest_offer_1' }
          ]]
        }
      })
    );
  });
});
