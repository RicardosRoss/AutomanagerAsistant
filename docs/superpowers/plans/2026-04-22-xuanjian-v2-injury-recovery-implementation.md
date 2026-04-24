# Xuanjian V2 Injury Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不引入冷却玩法和新命令的前提下，把战斗后的 `injuryState` 接回专注主循环，使有效专注可以自动疗伤并按规则吞掉本次部分修为收益。

**Architecture:** 保持现有 `CultivationRewardEngine -> CultivationService -> taskCommands` 主链不变，只新增一个独立纯函数 `InjuryRecoveryEngine` 作为“专注收益修正层”。`CultivationRewardEngine` 继续产出原始修为与道行，`InjuryRecoveryEngine` 负责判断是否疗伤、计算 `50%` 修为扣减和伤势降档，`CultivationService` 统一落库并把恢复摘要传给 Telegram 文案层。

**Tech Stack:** TypeScript, Node.js ESM, Mongoose, Vitest, Telegram Bot API

---

## Scope Check

这份计划只覆盖 `伤势恢复闭环`：

1. 新增独立 `InjuryRecoveryEngine`
2. 将专注结算接入疗伤修正
3. 在任务完成消息里显示伤势恢复摘要
4. 补齐 unit / integration / handler / docs 验证

这份计划明确不做：

1. `cooldowns` 自动衰减
2. 丹药、灵物、法器疗伤
3. 伤势对战斗四维的额外惩罚
4. 新命令，例如 `/heal`

## File Map

**Recovery engine**

- Create: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/services/InjuryRecoveryEngine.ts`
- Test: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/unit/services/InjuryRecoveryEngine.test.ts`

**Reward and service integration**

- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/types/services.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/services/CultivationService.ts`
- Test: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/integration/xuanjian-task-cultivation-flow.test.ts`

**Telegram output**

- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/handlers/taskCommands.ts`
- Test: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/unit/handlers/taskCommands.test.ts`

**Docs**

- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/docs/cultivation/xuanjian-dev-manual.md`

## Implementation Rules

1. 疗伤只在 `有效专注` 时触发，门槛通过 `getDurationBaseValue(duration) > 0` 统一判断，不复制另一套 60 分钟常量。
2. 疗伤只扣本次 `rawPowerGain`，不扣 `cultivationAttainmentDelta`。
3. 单次有效专注最多恢复一档：`heavy -> medium -> light -> none`。
4. 扣减统一使用 `Math.floor(rawPowerGain * 0.5)`。
5. 若本次专注后续又触发奇遇战并新增伤势，新伤势从下一次专注开始恢复；同一次专注不立刻抵消新伤。
6. 不新增数据库字段；恢复摘要只通过 `CultivationReward` 返回给 handler。

## Task 1: Add the pure injury recovery engine

**Files:**
- Create: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/services/InjuryRecoveryEngine.ts`
- Test: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/unit/services/InjuryRecoveryEngine.test.ts`

- [ ] **Step 1: Write the failing unit tests**

Create `tests/unit/services/InjuryRecoveryEngine.test.ts`:

```ts
import { describe, expect, test } from 'vitest';
import { resolveInjuryRecovery } from '../../../src/services/InjuryRecoveryEngine.js';

describe('InjuryRecoveryEngine', () => {
  test('returns unchanged power when current state has no injury', () => {
    const result = resolveInjuryRecovery({
      duration: 90,
      rawPowerGain: 2,
      injuryLevel: 'none'
    });

    expect(result).toEqual({
      applied: false,
      previousInjuryLevel: 'none',
      nextInjuryLevel: 'none',
      powerCost: 0,
      finalPowerGain: 2,
      summary: null
    });
  });

  test('does not recover injury below effective focus threshold', () => {
    const result = resolveInjuryRecovery({
      duration: 30,
      rawPowerGain: 2,
      injuryLevel: 'light'
    });

    expect(result.applied).toBe(false);
    expect(result.nextInjuryLevel).toBe('light');
    expect(result.finalPowerGain).toBe(2);
    expect(result.summary).toBeNull();
  });

  test('downgrades medium injury by one tier and consumes half of raw power gain', () => {
    const result = resolveInjuryRecovery({
      duration: 90,
      rawPowerGain: 2,
      injuryLevel: 'medium'
    });

    expect(result).toEqual({
      applied: true,
      previousInjuryLevel: 'medium',
      nextInjuryLevel: 'light',
      powerCost: 1,
      finalPowerGain: 1,
      summary: '🩹 伤势恢复：中伤 -> 轻伤'
    });
  });

  test('only recovers one tier from heavy injury', () => {
    const result = resolveInjuryRecovery({
      duration: 180,
      rawPowerGain: 5,
      injuryLevel: 'heavy'
    });

    expect(result.applied).toBe(true);
    expect(result.previousInjuryLevel).toBe('heavy');
    expect(result.nextInjuryLevel).toBe('medium');
    expect(result.powerCost).toBe(2);
    expect(result.finalPowerGain).toBe(3);
  });

  test('never produces a negative final power gain', () => {
    const result = resolveInjuryRecovery({
      duration: 60,
      rawPowerGain: 1,
      injuryLevel: 'light'
    });

    expect(result.powerCost).toBe(0);
    expect(result.finalPowerGain).toBe(1);
    expect(result.nextInjuryLevel).toBe('none');
  });
});
```

- [ ] **Step 2: Run the new unit test file and verify it fails**

Run:

```bash
yarn vitest run tests/unit/services/InjuryRecoveryEngine.test.ts
```

Expected: FAIL with `Cannot find module '../../../src/services/InjuryRecoveryEngine.js'`.

- [ ] **Step 3: Implement the pure engine**

Create `src/services/InjuryRecoveryEngine.ts`:

```ts
import { getDurationBaseValue } from '../config/xuanjianCanonical.js';
import type { PlayerCultivationState } from '../types/cultivationCanonical.js';

type InjuryLevel = PlayerCultivationState['injuryState']['level'];

const NEXT_INJURY_LEVEL: Record<InjuryLevel, InjuryLevel> = {
  none: 'none',
  light: 'none',
  medium: 'light',
  heavy: 'medium'
};

function formatInjuryTransition(previous: InjuryLevel, next: InjuryLevel) {
  const labelMap: Record<InjuryLevel, string> = {
    none: '无伤',
    light: '轻伤',
    medium: '中伤',
    heavy: '重伤'
  };

  return `🩹 伤势恢复：${labelMap[previous]} -> ${labelMap[next]}`;
}

export interface InjuryRecoveryResult {
  applied: boolean;
  previousInjuryLevel: InjuryLevel;
  nextInjuryLevel: InjuryLevel;
  powerCost: number;
  finalPowerGain: number;
  summary: string | null;
}

export function resolveInjuryRecovery(input: {
  duration: number;
  rawPowerGain: number;
  injuryLevel: InjuryLevel;
}): InjuryRecoveryResult {
  const previousInjuryLevel = input.injuryLevel;
  const isEffectiveFocus = getDurationBaseValue(input.duration) > 0;

  if (!isEffectiveFocus || previousInjuryLevel === 'none') {
    return {
      applied: false,
      previousInjuryLevel,
      nextInjuryLevel: previousInjuryLevel,
      powerCost: 0,
      finalPowerGain: input.rawPowerGain,
      summary: null
    };
  }

  const nextInjuryLevel = NEXT_INJURY_LEVEL[previousInjuryLevel];
  const powerCost = Math.min(input.rawPowerGain, Math.floor(input.rawPowerGain * 0.5));
  const finalPowerGain = Math.max(0, input.rawPowerGain - powerCost);

  return {
    applied: true,
    previousInjuryLevel,
    nextInjuryLevel,
    powerCost,
    finalPowerGain,
    summary: formatInjuryTransition(previousInjuryLevel, nextInjuryLevel)
  };
}
```

- [ ] **Step 4: Run the unit test file and verify it passes**

Run:

```bash
yarn vitest run tests/unit/services/InjuryRecoveryEngine.test.ts
```

Expected: PASS with `5 passed`.

- [ ] **Step 5: Commit the engine slice**

```bash
git add src/services/InjuryRecoveryEngine.ts tests/unit/services/InjuryRecoveryEngine.test.ts
git commit -m "feat: add xuanjian injury recovery engine"
```

## Task 2: Wire injury recovery into cultivation settlement

**Files:**
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/types/services.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/services/CultivationService.ts`
- Test: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/integration/xuanjian-task-cultivation-flow.test.ts`

- [ ] **Step 1: Add failing integration tests for recovery writeback**

Append to `tests/integration/xuanjian-task-cultivation-flow.test.ts`:

```ts
test('90 分钟有效专注会恢复一档旧伤并只结算剩余修为', async () => {
  const userId = 602020;
  vi.spyOn(Math, 'random').mockReturnValue(0.8);

  const user = await User.create({ userId, username: 'injury-recovery-focus' });
  const canonical = user.ensureCanonicalCultivation();
  canonical.state.injuryState = { level: 'medium', modifiers: ['combat_loss'] };
  user.replaceCanonicalCultivation(canonical);
  user.syncLegacyCultivationShell();
  await user.save();

  const created = await taskService.createTask(userId, 'injury recovery', 90);
  await backdateTask(created.task.taskId, 90);
  const completed = await taskService.completeTask(userId, created.task.taskId, true);
  const refreshed = await User.findOne({ userId }).lean();

  expect(completed.cultivationReward?.spiritualPower).toBe(1);
  expect(completed.cultivationReward?.cultivationAttainmentDelta).toBe(0);
  expect(completed.cultivationReward?.injuryRecovery).toEqual({
    applied: true,
    previousLevel: 'medium',
    nextLevel: 'light',
    summary: '🩹 伤势恢复：中伤 -> 轻伤'
  });
  expect(refreshed?.cultivation.canonical.state.currentPower).toBe(1);
  expect(refreshed?.cultivation.canonical.state.injuryState.level).toBe('light');
});

test('短专注不会恢复旧伤', async () => {
  const userId = 602021;
  vi.spyOn(Math, 'random').mockReturnValue(0.8);

  const user = await User.create({ userId, username: 'short-no-heal' });
  const canonical = user.ensureCanonicalCultivation();
  canonical.state.injuryState = { level: 'light', modifiers: ['combat_loss'] };
  user.replaceCanonicalCultivation(canonical);
  user.syncLegacyCultivationShell();
  await user.save();

  const created = await taskService.createTask(userId, 'short-no-heal', 30);
  await backdateTask(created.task.taskId, 30);
  const completed = await taskService.completeTask(userId, created.task.taskId, true);
  const refreshed = await User.findOne({ userId }).lean();

  expect(completed.cultivationReward?.spiritualPower).toBe(0);
  expect(completed.cultivationReward?.injuryRecovery).toBeNull();
  expect(refreshed?.cultivation.canonical.state.injuryState.level).toBe('light');
});
```

- [ ] **Step 2: Run the integration test file and verify it fails**

Run:

```bash
yarn vitest run tests/integration/xuanjian-task-cultivation-flow.test.ts
```

Expected: FAIL because `CultivationReward` has no `injuryRecovery`, and `awardCultivation()` does not yet reduce power or downgrade injury.

- [ ] **Step 3: Add the reward summary type**

Update `src/types/services.ts`:

```ts
export interface InjuryRecoverySummary {
  applied: boolean;
  previousLevel: PlayerCultivationState['injuryState']['level'];
  nextLevel: PlayerCultivationState['injuryState']['level'];
  summary: string | null;
}

export interface CultivationReward {
  spiritualPower: number;
  immortalStones: number;
  bonus: number;
  cultivationAttainment?: number;
  cultivationAttainmentDelta?: number;
  mainMethodName?: string;
  encounter?: CultivationEncounterResult;
  injuryRecovery?: InjuryRecoverySummary | null;
  breakthroughReady?: boolean;
  fortuneEvent: FortuneEventResult;
  oldRealm?: string;
  oldRealmId?: RealmId;
  newRealm: string;
  newRealmId?: RealmId;
  newStage: string;
  stageId?: string;
  realmChanged: boolean;
  oldSpiritualPower?: number;
  newSpiritualPower: number;
}
```

- [ ] **Step 4: Integrate the engine in `CultivationService`**

Update `src/services/CultivationService.ts`:

```ts
import { resolveInjuryRecovery } from './InjuryRecoveryEngine.js';
```

Inside `awardCultivation()` right after `const resolution = resolveFocusReward(...)`:

```ts
      const injuryRecovery = resolveInjuryRecovery({
        duration,
        rawPowerGain: resolution.totalPowerGain,
        injuryLevel: canonical.state.injuryState.level
      });
      let encounter = resolution.encounter;
      let combatAttainmentDelta = 0;
      const awardedPowerGain = injuryRecovery.finalPowerGain;

      canonical.state.currentPower += awardedPowerGain;
      canonical.state.cultivationAttainment += resolution.attainmentDelta;
      canonical.state.focusStreak = resolution.nextFocusStreak;
      canonical.state.lastCultivationAt = new Date();
      canonical.state.realmId = getCanonicalRealmByPower(canonical.state.currentPower).id;

      if (injuryRecovery.applied) {
        canonical.state.injuryState = {
          level: injuryRecovery.nextInjuryLevel,
          modifiers: injuryRecovery.nextInjuryLevel === 'none' ? [] : canonical.state.injuryState.modifiers
        };
      }

      this.syncRealmSubStage(canonical);
```

Update the `user` aggregates and return payload:

```ts
      user.cultivation.totalSpiritualPowerEarned += awardedPowerGain;
      user.cultivation.peakSpiritualPower = Math.max(user.cultivation.peakSpiritualPower, canonical.state.currentPower);
```

```ts
      return {
        spiritualPower: awardedPowerGain,
        immortalStones: encounter.spiritStoneDelta,
        cultivationAttainment: canonical.state.cultivationAttainment,
        cultivationAttainmentDelta: resolution.attainmentDelta + combatAttainmentDelta,
        mainMethodName: getMainMethodById(canonical.state.mainMethodId).name,
        encounter,
        injuryRecovery: injuryRecovery.applied
          ? {
            applied: true,
            previousLevel: injuryRecovery.previousInjuryLevel,
            nextLevel: injuryRecovery.nextInjuryLevel,
            summary: injuryRecovery.summary
          }
          : null,
        bonus: 1,
        fortuneEvent: {
          power: 0,
          stones: encounter.spiritStoneDelta,
          message: encounter.message
        },
        oldRealm: oldRealmName,
        newRealm: getRealmById(canonical.state.realmId).name,
        newStage: formatCanonicalStage(canonical.state.currentPower),
        realmChanged,
        oldSpiritualPower,
        newSpiritualPower: user.cultivation.spiritualPower,
        breakthroughReady: readiness.ready
      };
```

- [ ] **Step 5: Run focused verification for service integration**

Run:

```bash
yarn vitest run tests/unit/services/InjuryRecoveryEngine.test.ts tests/integration/xuanjian-task-cultivation-flow.test.ts
```

Expected: PASS with the two new recovery integration cases green.

- [ ] **Step 6: Commit the service slice**

```bash
git add src/types/services.ts src/services/CultivationService.ts tests/integration/xuanjian-task-cultivation-flow.test.ts
git commit -m "feat: apply xuanjian injury recovery during focus rewards"
```

## Task 3: Surface recovery in Telegram output

**Files:**
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/handlers/taskCommands.ts`
- Test: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/unit/handlers/taskCommands.test.ts`

- [ ] **Step 1: Add the failing handler test**

Append to `tests/unit/handlers/taskCommands.test.ts`:

```ts
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
            nextLevel: 'light',
            summary: '🩹 伤势恢复：中伤 -> 轻伤'
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
  expect(sentMessage).toContain('🩹 伤势恢复：中伤 -> 轻伤');
  expect(sentMessage).not.toContain('疗伤耗去修为');
});
```

- [ ] **Step 2: Run the handler test and verify it fails**

Run:

```bash
yarn vitest run tests/unit/handlers/taskCommands.test.ts
```

Expected: FAIL because the completion message does not yet render `injuryRecovery.summary`.

- [ ] **Step 3: Render recovery summary in the completion message**

Update `src/handlers/taskCommands.ts` inside `handleCompleteTaskCallback()` after the short-focus info block and before encounter message rendering:

```ts
        if (reward.injuryRecovery?.applied && reward.injuryRecovery.summary) {
          message += `\n${reward.injuryRecovery.summary}`;
        }

        if (reward.encounter?.message) {
          message += `\n\n${reward.encounter.message}`;
        }
```

- [ ] **Step 4: Run handler verification**

Run:

```bash
yarn vitest run tests/unit/handlers/taskCommands.test.ts
```

Expected: PASS with the new recovery-summary assertion green.

- [ ] **Step 5: Commit the handler slice**

```bash
git add src/handlers/taskCommands.ts tests/unit/handlers/taskCommands.test.ts
git commit -m "feat: show xuanjian injury recovery summary"
```

## Task 4: Update docs and run final regression set

**Files:**
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/docs/cultivation/xuanjian-dev-manual.md`

- [ ] **Step 1: Update the developer manual**

Append to `docs/cultivation/xuanjian-dev-manual.md` near the Phase C runtime section:

```md
### 伤势恢复闭环

- `injuryState` 不再只是战斗结果字段；有效专注会自动尝试疗伤
- 疗伤只影响本次修为收益，不影响道行
- 当前规则：单次有效专注最多恢复一档伤势，并吞掉 `floor(rawPowerGain * 0.5)` 的本次修为
- `cooldowns` 仍只保留字段，不参与本轮恢复玩法
```

- [ ] **Step 2: Run the targeted regression suite**

Run:

```bash
yarn vitest run tests/unit/services/InjuryRecoveryEngine.test.ts tests/integration/xuanjian-task-cultivation-flow.test.ts tests/unit/handlers/taskCommands.test.ts tests/unit/services/CultivationRewardEngine.test.ts
```

Expected: PASS with all recovery and existing focus-reward tests green.

- [ ] **Step 3: Run typecheck**

Run:

```bash
yarn typecheck
```

Expected: PASS with no new type errors.

- [ ] **Step 4: Commit docs and final verification state**

```bash
git add docs/cultivation/xuanjian-dev-manual.md
git commit -m "docs: document xuanjian injury recovery loop"
```

## Self-Review

Spec coverage check:

1. `独立 InjuryRecoveryEngine` -> Task 1
2. `有效专注门槛 + 自动触发 + 单次降一档 + 50% floor 扣减` -> Task 1 implementation and tests
3. `只扣修为，不扣道行` -> Task 2 integration tests and service wiring
4. `完成任务消息只显示伤势恢复摘要，不显示修为扣减` -> Task 3
5. `dev manual 更新` -> Task 4

Placeholder scan:

1. 没有未定占位、延后实现占位或“参照上一任务”这类懒写法
2. 每个代码步骤都给了具体代码块
3. 每个测试步骤都给了具体命令和预期结果

Type consistency check:

1. `resolveInjuryRecovery()` 在 Task 1 定义，在 Task 2 复用
2. `injuryRecovery` 字段先在 `src/types/services.ts` 定义，再在 `CultivationService` 和 `taskCommands` 中使用
3. `previousLevel / nextLevel / summary` 在 plan 中保持同一命名
