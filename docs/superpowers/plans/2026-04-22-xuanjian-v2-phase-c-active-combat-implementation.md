# 玄鉴 V2 阶段 C 主动战斗运行时 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为玄鉴 `V2` 接入最小可运行的奇遇战主动战斗闭环，使专注完成后的 `combat` 奇遇可以稳定生成战斗快照、完成确定性求解、把结果回写到 canonical 状态，并把短战报展示给用户。

**Architecture:** 保持 `V1` 的“专注 -> 修为 -> 奇遇 -> 破境”主循环不变，仅在 `CultivationRewardEngine` 返回 `encounter.type = 'combat'` 时进入新的战斗分支。战斗分支由 `CombatStateAdapter -> CombatResolver -> CombatRewardBridge -> CombatService` 串联，`CultivationService.awardCultivation()` 负责编排与持久化，`taskCommands` 与 `/realm` 只负责展示战报和伤势摘要。

**Tech Stack:** TypeScript, Node.js ESM, Mongoose, Vitest, Telegram Bot API, MongoDB Memory Server

---

## Scope Check

这份计划只实现 `V2 阶段 C：主动战斗系统上线` 的最小闭环：

1. 为奇遇战新增独立的战斗类型、战斗配置、战斗快照、求解器和结果桥接。
2. 在 `awardCultivation()` 的专注奇遇链路里接入 `combat` 分支。
3. 至少提供一个 starter 级奇遇战模板，并保证同一随机种子下结果可复现。
4. 把战斗结果写回 `cultivation.canonical.state` 的伤势、冷却、`combatHistorySummary` 与资源变化。
5. 把战报摘要展示到任务完成消息，并在 `/realm` 展示当前伤势和最近一次斗法摘要。

这份计划明确不做：

1. 玩家手动 `/fight`、`/flee` 指令或长回合交互。
2. `battleLoadout` 槽位限制与小阶门槛拦截。
3. 守关战、试炼战、破境战、PVP。
4. 大规模法门/神通池扩容；本轮只接现有 starter seeds。

## File Map

**New runtime types and config**

- Create: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/types/cultivationCombat.ts`
- Create: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/config/xuanjianCombat.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/types/cultivationV2.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/types/services.ts`

**Combat runtime services**

- Create: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/services/CombatStateAdapter.ts`
- Create: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/services/CombatResolver.ts`
- Create: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/services/CombatRewardBridge.ts`
- Create: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/services/CombatService.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/services/CultivationRewardEngine.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/services/CultivationService.ts`

**User-facing handlers**

- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/handlers/taskCommands.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/handlers/cultivationCommands.ts`

**Tests**

- Create: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/unit/config/xuanjianCombat.test.ts`
- Create: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/unit/services/CombatStateAdapter.test.ts`
- Create: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/unit/services/CombatResolver.test.ts`
- Create: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/unit/services/CombatRewardBridge.test.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/unit/services/CultivationRewardEngine.test.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/unit/handlers/taskCommands.test.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/cultivation.test.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/integration/xuanjian-task-cultivation-flow.test.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/integration/xuanjian-cultivation-command-flow.test.ts`

**Docs**

- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/docs/cultivation/xuanjian-dev-manual.md`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/docs/cultivation/smoke-test-checklist.md`

## Implementation Rules

1. `combat` 奇遇必须由专注完成链路触发，不能绕开 `awardCultivation()` 直接写用户文档。
2. `CombatResolver` 只返回 `CombatResolution` 与 `CombatOutcomePatch`，不得直接触碰 Mongoose 文档。
3. 战斗结果进入 canonical 的唯一路径是 `CombatRewardBridge` 和 `CombatService`。
4. 同一输入与同一种子必须得出同一结果；不得使用不可控全局随机数。
5. 本轮只启用 starter 级条目：`art.basic_guarding_hand`、`art.cloud_step` 与一个奇遇敌方模板。
6. 伤势、历史摘要与资源变化必须写回 canonical，同时继续同步 legacy shell。

## Seed Decisions

阶段 C 采用以下 starter combat seeds：

1. `combatEncounter.taixi.roadside_wolf`
   - 场景：山路遭遇战
   - 敌方模板：`enemy.taixi.roadside_wolf`
   - 适用大境：`realm.taixi`
   - 胜利：`+3` 灵石，`+1` 道行，无额外掉落
   - 失败：`轻伤`，`-2` 灵石，无修为变化
2. `enemy.taixi.roadside_wolf`
   - 父大境：`realm.taixi`
   - 参考小阶：`realmSubStage.taixi.qingyuan`
   - 行为标签：`rush`, `speed`
3. `rollFocusEncounter()` 新增 `combat` 分支
   - 推荐触发阈值：`0.97 < roll <= 0.995`
   - 返回 `combatEncounterId = 'combatEncounter.taixi.roadside_wolf'`

## Task 1: Lock the phase-C combat contract in failing tests

**Files:**
- Create: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/unit/config/xuanjianCombat.test.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/unit/services/CultivationRewardEngine.test.ts`

- [ ] **Step 1: Add a failing config test for starter combat seeds**

Create `tests/unit/config/xuanjianCombat.test.ts`:

```ts
import { describe, expect, test } from 'vitest';
import {
  COMBAT_BALANCE,
  getCombatEncounterById,
  getEnemyTemplateById,
  formatCombatOutcomeLabel,
  formatInjuryLevelLabel
} from '../../../src/config/xuanjianCombat.js';

describe('xuanjian combat config', () => {
  test('exposes the starter taixi encounter and enemy template', () => {
    expect(COMBAT_BALANCE.maxRounds).toBe(5);

    expect(getEnemyTemplateById('enemy.taixi.roadside_wolf')).toMatchObject({
      id: 'enemy.taixi.roadside_wolf',
      realmId: 'realm.taixi',
      realmSubStageId: 'realmSubStage.taixi.qingyuan'
    });

    expect(getCombatEncounterById('combatEncounter.taixi.roadside_wolf')).toMatchObject({
      id: 'combatEncounter.taixi.roadside_wolf',
      enemyTemplateId: 'enemy.taixi.roadside_wolf',
      rewards: { spiritStoneDeltaOnWin: 3, attainmentDeltaOnWin: 1 },
      penalties: { injuryLevelOnLoss: 'light', spiritStoneDeltaOnLoss: -2 }
    });

    expect(formatCombatOutcomeLabel('narrow_win')).toBe('险胜');
    expect(formatInjuryLevelLabel('light')).toBe('轻伤');
  });
});
```

- [ ] **Step 2: Extend reward-engine tests to require a combat encounter branch**

Append to `tests/unit/services/CultivationRewardEngine.test.ts`:

```ts
test('focus encounter can now roll into a combat branch with a seeded encounter id', () => {
  const encounter = rollFocusEncounter(() => 0.98, 'realm.taixi', null);

  expect(encounter).toMatchObject({
    type: 'combat',
    combatEncounterId: 'combatEncounter.taixi.roadside_wolf'
  });
  expect(encounter.spiritStoneDelta).toBe(0);
  expect(encounter.obtainedDefinitionIds).toEqual([]);
});
```

- [ ] **Step 3: Run targeted tests and verify they fail**

Run:

```bash
yarn vitest run tests/unit/config/xuanjianCombat.test.ts tests/unit/services/CultivationRewardEngine.test.ts
```

Expected: FAIL because `xuanjianCombat.ts` does not exist and `rollFocusEncounter()` does not yet return structured combat encounters.

- [ ] **Step 4: Commit the failing-test checkpoint**

```bash
git add tests/unit/config/xuanjianCombat.test.ts tests/unit/services/CultivationRewardEngine.test.ts
git commit -m "test: lock xuanjian phase-c combat contract"
```

## Task 2: Add phase-C combat types and static config

**Files:**
- Create: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/types/cultivationCombat.ts`
- Create: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/config/xuanjianCombat.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/services/CultivationRewardEngine.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/types/cultivationV2.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/types/services.ts`
- Create: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/unit/config/xuanjianCombat.test.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/unit/services/CultivationRewardEngine.test.ts`

- [ ] **Step 1: Define the runtime combat contracts**

Create `src/types/cultivationCombat.ts`:

```ts
import type { RealmId } from './cultivationCanonical.js';

export type CombatOutcome = 'win' | 'loss' | 'narrow_win';
export type CombatActionType = 'attack' | 'guard' | 'movement' | 'support';

export interface CombatDimensions {
  attack: number;
  defense: number;
  sense: number;
  speed: number;
}

export interface CombatantSnapshot {
  side: 'player' | 'enemy';
  realmId: RealmId;
  realmSubStageId: string;
  currentPower: number;
  dimensions: CombatDimensions;
  vitality: number;
  stability: number;
  battleArtIds: string[];
  divinePowerIds: string[];
  injuryLevel: 'none' | 'light' | 'medium' | 'heavy';
  tags: string[];
}

export interface CombatEncounterDefinition {
  id: string;
  enemyTemplateId: string;
  maxRounds: number;
  rewards: {
    spiritStoneDeltaOnWin: number;
    attainmentDeltaOnWin: number;
    obtainedDefinitionIdsOnWin: string[];
  };
  penalties: {
    injuryLevelOnLoss: 'light' | 'medium' | 'heavy';
    spiritStoneDeltaOnLoss: number;
  };
}

export interface CombatResolution {
  encounterId: string;
  outcome: CombatOutcome;
  enemyName: string;
  firstStrike: 'player' | 'enemy';
  rounds: Array<{ round: number; actor: 'player' | 'enemy'; action: CombatActionType; damage: number }>;
  summary: string;
}

export interface CombatOutcomePatch {
  spiritStoneDelta: number;
  cultivationAttainmentDelta: number;
  obtainedDefinitionIds: string[];
  injuryLevel: 'none' | 'light' | 'medium' | 'heavy';
  cooldownPatch: Record<string, number>;
}
```

- [ ] **Step 2: Add starter combat config and label formatters**

Create `src/config/xuanjianCombat.ts`:

```ts
import type { CombatEncounterDefinition } from '../types/cultivationCombat.js';

export const COMBAT_BALANCE = {
  maxRounds: 5,
  vitalityBase: 12,
  vitalityDefenseWeight: 2,
  initiativeSpeedWeight: 2,
  initiativeSenseWeight: 1,
  attackWeight: 2,
  mitigationWeight: 1
} as const;

const ENEMY_TEMPLATES = [
  {
    id: 'enemy.taixi.roadside_wolf',
    name: '拦路青狼',
    realmId: 'realm.taixi',
    realmSubStageId: 'realmSubStage.taixi.qingyuan',
    currentPower: 72,
    dimensions: { attack: 8, defense: 6, sense: 5, speed: 8 },
    tags: ['rush', 'speed']
  }
] as const;

const COMBAT_ENCOUNTERS: CombatEncounterDefinition[] = [
  {
    id: 'combatEncounter.taixi.roadside_wolf',
    enemyTemplateId: 'enemy.taixi.roadside_wolf',
    maxRounds: COMBAT_BALANCE.maxRounds,
    rewards: {
      spiritStoneDeltaOnWin: 3,
      attainmentDeltaOnWin: 1,
      obtainedDefinitionIdsOnWin: []
    },
    penalties: {
      injuryLevelOnLoss: 'light',
      spiritStoneDeltaOnLoss: -2
    }
  }
];

export function getEnemyTemplateById(id: string) {
  return ENEMY_TEMPLATES.find((entry) => entry.id === id) ?? null;
}

export function getCombatEncounterById(id: string) {
  return COMBAT_ENCOUNTERS.find((entry) => entry.id === id) ?? null;
}

export function formatCombatOutcomeLabel(outcome: 'win' | 'loss' | 'narrow_win') {
  if (outcome === 'win') return '大胜';
  if (outcome === 'narrow_win') return '险胜';
  return '惜败';
}

export function formatInjuryLevelLabel(level: 'none' | 'light' | 'medium' | 'heavy') {
  if (level === 'light') return '轻伤';
  if (level === 'medium') return '中伤';
  if (level === 'heavy') return '重伤';
  return '无伤';
}
```

- [ ] **Step 3: Extend service-facing encounter types**

Modify `src/types/services.ts` and `src/types/cultivationV2.ts`:

```ts
// src/types/services.ts
export interface CombatEncounterSummary {
  encounterId: string;
  enemyName: string;
  result: 'win' | 'loss' | 'narrow_win';
  summary: string;
  injuryLevel: 'none' | 'light' | 'medium' | 'heavy';
}

export interface CultivationEncounterResult {
  type: 'none' | 'stones' | 'item' | 'combat';
  message: string | null;
  spiritStoneDelta: number;
  obtainedDefinitionIds: string[];
  combatEncounterId?: string;
  combatSummary?: CombatEncounterSummary;
}
```

```ts
// src/types/cultivationV2.ts
export interface CombatHistorySummaryEntry {
  encounterId: string;
  result: 'win' | 'loss' | 'narrow_win';
  happenedAt: Date;
  summary: string;
  enemyName?: string;
}
```

- [ ] **Step 4: Add the combat branch to the focus encounter table**

Modify `src/services/CultivationRewardEngine.ts`:

```ts
const FOCUS_ENCOUNTER_TABLE = [
  {
    id: 'encounter.none',
    threshold: 0.78,
    result: { type: 'none', message: null, spiritStoneDelta: 0, obtainedDefinitionIds: [] }
  },
  {
    id: 'encounter.stones_gain',
    threshold: 0.88,
    result: { type: 'stones', message: '偶得灵石', spiritStoneDelta: 8, obtainedDefinitionIds: [] }
  },
  {
    id: 'encounter.stones_loss',
    threshold: 0.93,
    result: { type: 'stones', message: '护道花费', spiritStoneDelta: -5, obtainedDefinitionIds: [] }
  },
  {
    id: 'encounter.material_drop',
    threshold: 0.97,
    result: {
      type: 'item',
      message: '得到破境辅材',
      spiritStoneDelta: 0,
      obtainedDefinitionIds: ['material.yellow_breakthrough_token']
    }
  },
  {
    id: 'encounter.combat_trial',
    threshold: 0.995,
    result: {
      type: 'combat',
      message: '林间妖气骤起，一头拦路青狼扑杀而来。',
      spiritStoneDelta: 0,
      obtainedDefinitionIds: [],
      combatEncounterId: 'combatEncounter.taixi.roadside_wolf'
    }
  },
  {
    id: 'encounter.pill_drop',
    threshold: 1,
    result: {
      type: 'item',
      message: '得到低阶丹药',
      spiritStoneDelta: 0,
      obtainedDefinitionIds: ['consumable.low_cultivation_pill']
    }
  }
] as const;
```

- [ ] **Step 5: Re-run targeted tests and verify they pass**

Run:

```bash
yarn vitest run tests/unit/config/xuanjianCombat.test.ts tests/unit/services/CultivationRewardEngine.test.ts
```

Expected: PASS for the new config contract, while adapter/resolver-related phase-C tests do not exist yet.

- [ ] **Step 6: Commit the type/config checkpoint**

```bash
git add src/types/cultivationCombat.ts src/config/xuanjianCombat.ts src/services/CultivationRewardEngine.ts src/types/cultivationV2.ts src/types/services.ts tests/unit/config/xuanjianCombat.test.ts tests/unit/services/CultivationRewardEngine.test.ts
git commit -m "feat: add xuanjian combat runtime contracts"
```

## Task 3: Build CombatStateAdapter on top of canonical state

**Files:**
- Create: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/services/CombatStateAdapter.ts`
- Create: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/unit/services/CombatStateAdapter.test.ts`

- [ ] **Step 1: Add failing adapter tests that lock loadout, sub-stage, and injury projection**

Create `tests/unit/services/CombatStateAdapter.test.ts`:

```ts
import { describe, expect, test } from 'vitest';
import { buildPlayerCombatSnapshot } from '../../../src/services/CombatStateAdapter.js';

describe('CombatStateAdapter', () => {
  test('projects canonical state into a combat snapshot using battleLoadout first', () => {
    const snapshot = buildPlayerCombatSnapshot({
      realmId: 'realm.taixi',
      realmSubStageId: 'realmSubStage.taixi.qingyuan',
      currentPower: 60,
      cultivationAttainment: 8,
      branchCultivationAttainments: { neutral: 3 },
      mainMethodId: 'method.starter_tuna',
      mainDaoTrack: 'neutral',
      knownBattleArtIds: ['art.basic_guarding_hand', 'art.cloud_step'],
      equippedBattleArtIds: ['art.basic_guarding_hand', 'art.cloud_step'],
      knownDivinePowerIds: [],
      equippedDivinePowerIds: [],
      battleLoadout: {
        equippedBattleArtIds: ['art.cloud_step'],
        equippedDivinePowerIds: [],
        equippedArtifactIds: [],
        activeSupportArtId: null
      },
      injuryState: { level: 'light', modifiers: ['recent_loss'] }
    } as never);

    expect(snapshot.realmSubStageId).toBe('realmSubStage.taixi.qingyuan');
    expect(snapshot.battleArtIds).toEqual(['art.cloud_step']);
    expect(snapshot.injuryLevel).toBe('light');
    expect(snapshot.dimensions.speed).toBeGreaterThan(snapshot.dimensions.defense);
  });

  test('falls back to canonical equipped battle arts when battleLoadout is empty', () => {
    const snapshot = buildPlayerCombatSnapshot({
      realmId: 'realm.taixi',
      realmSubStageId: 'realmSubStage.taixi.chengming',
      currentPower: 22,
      cultivationAttainment: 0,
      branchCultivationAttainments: {},
      mainMethodId: 'method.starter_tuna',
      mainDaoTrack: 'neutral',
      knownBattleArtIds: ['art.basic_guarding_hand'],
      equippedBattleArtIds: ['art.basic_guarding_hand'],
      knownDivinePowerIds: [],
      equippedDivinePowerIds: [],
      battleLoadout: {
        equippedBattleArtIds: [],
        equippedDivinePowerIds: [],
        equippedArtifactIds: [],
        activeSupportArtId: null
      },
      injuryState: { level: 'none', modifiers: [] }
    } as never);

    expect(snapshot.battleArtIds).toEqual(['art.basic_guarding_hand']);
    expect(snapshot.vitality).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run the new adapter tests and verify they fail**

Run:

```bash
yarn vitest run tests/unit/services/CombatStateAdapter.test.ts
```

Expected: FAIL because `CombatStateAdapter.ts` does not exist yet.

- [ ] **Step 3: Implement the adapter with canonical-first defaults**

Create `src/services/CombatStateAdapter.ts`:

```ts
import { getBattleArtRegistryEntry, getRealmSubStageById } from '../config/xuanjianCanonical.js';
import { COMBAT_BALANCE } from '../config/xuanjianCombat.js';
import type { PlayerCultivationState } from '../types/cultivationCanonical.js';
import type { CombatantSnapshot } from '../types/cultivationCombat.js';

function getEffectiveBattleArts(state: PlayerCultivationState) {
  if (state.battleLoadout.equippedBattleArtIds.length > 0) {
    return state.battleLoadout.equippedBattleArtIds;
  }
  return state.equippedBattleArtIds;
}

export function buildPlayerCombatSnapshot(state: PlayerCultivationState): CombatantSnapshot {
  const subStage = getRealmSubStageById(state.realmSubStageId);
  const battleArtIds = getEffectiveBattleArts(state);
  const speedBonus = battleArtIds.includes('art.cloud_step') ? 3 : 0;
  const defenseBonus = battleArtIds.includes('art.basic_guarding_hand') ? 3 : 0;
  const subStageOrder = subStage?.order ?? 1;
  const injuryPenalty = state.injuryState.level === 'none' ? 0 : state.injuryState.level === 'light' ? 1 : state.injuryState.level === 'medium' ? 2 : 4;

  const dimensions = {
    attack: 6 + subStageOrder,
    defense: 6 + defenseBonus + subStageOrder - injuryPenalty,
    sense: 5 + Math.floor(state.cultivationAttainment / 5),
    speed: 5 + speedBonus + subStageOrder - injuryPenalty
  };

  return {
    side: 'player',
    realmId: state.realmId,
    realmSubStageId: state.realmSubStageId,
    currentPower: state.currentPower,
    dimensions,
    vitality: COMBAT_BALANCE.vitalityBase + dimensions.defense * COMBAT_BALANCE.vitalityDefenseWeight,
    stability: 10 + Math.floor(state.cultivationAttainment / 3),
    battleArtIds,
    divinePowerIds: state.battleLoadout.equippedDivinePowerIds.length > 0
      ? state.battleLoadout.equippedDivinePowerIds
      : state.equippedDivinePowerIds,
    injuryLevel: state.injuryState.level,
    tags: [state.mainDaoTrack]
  };
}
```

- [ ] **Step 4: Re-run adapter tests and verify they pass**

Run:

```bash
yarn vitest run tests/unit/services/CombatStateAdapter.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the adapter checkpoint**

```bash
git add src/services/CombatStateAdapter.ts tests/unit/services/CombatStateAdapter.test.ts
git commit -m "feat: add xuanjian combat state adapter"
```

## Task 4: Implement CombatResolver and CombatRewardBridge with deterministic output

**Files:**
- Create: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/services/CombatResolver.ts`
- Create: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/services/CombatRewardBridge.ts`
- Create: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/unit/services/CombatResolver.test.ts`
- Create: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/unit/services/CombatRewardBridge.test.ts`

- [ ] **Step 1: Add failing resolver and bridge tests**

Create `tests/unit/services/CombatResolver.test.ts`:

```ts
import { describe, expect, test } from 'vitest';
import { resolveCombat } from '../../../src/services/CombatResolver.js';

const player = {
  side: 'player',
  realmId: 'realm.taixi',
  realmSubStageId: 'realmSubStage.taixi.qingyuan',
  currentPower: 60,
  dimensions: { attack: 12, defense: 10, sense: 9, speed: 11 },
  vitality: 32,
  stability: 12,
  battleArtIds: ['art.cloud_step'],
  divinePowerIds: [],
  injuryLevel: 'none',
  tags: ['neutral']
} as const;

const enemy = {
  side: 'enemy',
  realmId: 'realm.taixi',
  realmSubStageId: 'realmSubStage.taixi.qingyuan',
  currentPower: 72,
  dimensions: { attack: 8, defense: 6, sense: 5, speed: 8 },
  vitality: 24,
  stability: 8,
  battleArtIds: ['art.cloud_step'],
  divinePowerIds: [],
  injuryLevel: 'none',
  tags: ['rush']
} as const;

describe('CombatResolver', () => {
  test('returns a reproducible result under the same seed', () => {
    const first = resolveCombat({ encounterId: 'combatEncounter.taixi.roadside_wolf', player, enemy, seed: 42 });
    const second = resolveCombat({ encounterId: 'combatEncounter.taixi.roadside_wolf', player, enemy, seed: 42 });

    expect(first).toEqual(second);
    expect(first.outcome).toBe('win');
    expect(first.firstStrike).toBe('player');
  });

  test('a weaker player can deterministically lose', () => {
    const weakened = {
      ...player,
      dimensions: { attack: 5, defense: 4, sense: 4, speed: 4 },
      vitality: 18
    };

    const result = resolveCombat({ encounterId: 'combatEncounter.taixi.roadside_wolf', player: weakened, enemy, seed: 7 });
    expect(result.outcome).toBe('loss');
  });
});
```

Create `tests/unit/services/CombatRewardBridge.test.ts`:

```ts
import { describe, expect, test } from 'vitest';
import { buildCombatOutcomePatch } from '../../../src/services/CombatRewardBridge.js';

describe('CombatRewardBridge', () => {
  test('maps a win into rewards and a clean history summary', () => {
    const patch = buildCombatOutcomePatch({
      outcome: 'win',
      encounterId: 'combatEncounter.taixi.roadside_wolf',
      enemyName: '拦路青狼',
      summary: '你以云步抢得先手，数合后斩退青狼。',
      rewards: { spiritStoneDeltaOnWin: 3, attainmentDeltaOnWin: 1, obtainedDefinitionIdsOnWin: [] },
      penalties: { injuryLevelOnLoss: 'light', spiritStoneDeltaOnLoss: -2 }
    });

    expect(patch.spiritStoneDelta).toBe(3);
    expect(patch.cultivationAttainmentDelta).toBe(1);
    expect(patch.injuryLevel).toBe('none');
  });

  test('maps a loss into injury and resource loss', () => {
    const patch = buildCombatOutcomePatch({
      outcome: 'loss',
      encounterId: 'combatEncounter.taixi.roadside_wolf',
      enemyName: '拦路青狼',
      summary: '你被青狼逼退，只得仓皇后撤。',
      rewards: { spiritStoneDeltaOnWin: 3, attainmentDeltaOnWin: 1, obtainedDefinitionIdsOnWin: [] },
      penalties: { injuryLevelOnLoss: 'light', spiritStoneDeltaOnLoss: -2 }
    });

    expect(patch.spiritStoneDelta).toBe(-2);
    expect(patch.cultivationAttainmentDelta).toBe(0);
    expect(patch.injuryLevel).toBe('light');
  });
});
```

- [ ] **Step 2: Run the resolver/bridge tests and verify they fail**

Run:

```bash
yarn vitest run tests/unit/services/CombatResolver.test.ts tests/unit/services/CombatRewardBridge.test.ts
```

Expected: FAIL because the resolver and bridge do not exist yet.

- [ ] **Step 3: Implement a deterministic 3-5 round resolver**

Create `src/services/CombatResolver.ts`:

```ts
import { COMBAT_BALANCE } from '../config/xuanjianCombat.js';
import type { CombatResolution } from '../types/cultivationCombat.js';

function mulberry32(seed: number) {
  let value = seed >>> 0;
  return () => {
    value += 0x6D2B79F5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function resolveCombat(input: {
  encounterId: string;
  player: any;
  enemy: any;
  seed: number;
}): CombatResolution {
  const rng = mulberry32(input.seed);
  const playerInitiative = input.player.dimensions.speed * COMBAT_BALANCE.initiativeSpeedWeight + input.player.dimensions.sense;
  const enemyInitiative = input.enemy.dimensions.speed * COMBAT_BALANCE.initiativeSpeedWeight + input.enemy.dimensions.sense;
  const firstStrike = playerInitiative >= enemyInitiative ? 'player' : 'enemy';
  const rounds: CombatResolution['rounds'] = [];
  let playerHp = input.player.vitality;
  let enemyHp = input.enemy.vitality;

  const order = firstStrike === 'player'
    ? [['player', input.player, input.enemy], ['enemy', input.enemy, input.player]]
    : [['enemy', input.enemy, input.player], ['player', input.player, input.enemy]];

  for (let round = 1; round <= COMBAT_BALANCE.maxRounds && playerHp > 0 && enemyHp > 0; round += 1) {
    for (const [actor, self, target] of order) {
      const attackScore = self.dimensions.attack * COMBAT_BALANCE.attackWeight + self.dimensions.speed;
      const mitigation = target.dimensions.defense * COMBAT_BALANCE.mitigationWeight + target.dimensions.sense;
      const damage = Math.max(1, Math.floor(attackScore - mitigation / 2 + rng() * 2));

      if (actor === 'player') {
        enemyHp -= damage;
      } else {
        playerHp -= damage;
      }

      rounds.push({
        round,
        actor: actor as 'player' | 'enemy',
        action: self.battleArtIds.includes('art.basic_guarding_hand') ? 'guard' : 'attack',
        damage
      });

      if (playerHp <= 0 || enemyHp <= 0) break;
    }
  }

  const outcome =
    enemyHp <= 0 && playerHp > Math.floor(input.player.vitality / 3)
      ? 'win'
      : enemyHp <= 0
        ? 'narrow_win'
        : 'loss';

  const summary =
    outcome === 'loss'
      ? `你与${input.enemy.tags.includes('rush') ? '疾扑而来的' : ''}敌手缠斗数合，终究不支后退。`
      : `你稳住气机，占得先手，数合后击退敌手。`;

  return {
    encounterId: input.encounterId,
    outcome,
    enemyName: '拦路青狼',
    firstStrike,
    rounds,
    summary
  };
}
```

- [ ] **Step 4: Implement the patch bridge**

Create `src/services/CombatRewardBridge.ts`:

```ts
export function buildCombatOutcomePatch(input: {
  outcome: 'win' | 'loss' | 'narrow_win';
  encounterId: string;
  enemyName: string;
  summary: string;
  rewards: { spiritStoneDeltaOnWin: number; attainmentDeltaOnWin: number; obtainedDefinitionIdsOnWin: string[] };
  penalties: { injuryLevelOnLoss: 'light' | 'medium' | 'heavy'; spiritStoneDeltaOnLoss: number };
}) {
  if (input.outcome === 'loss') {
    return {
      spiritStoneDelta: input.penalties.spiritStoneDeltaOnLoss,
      cultivationAttainmentDelta: 0,
      obtainedDefinitionIds: [],
      injuryLevel: input.penalties.injuryLevelOnLoss,
      cooldownPatch: {}
    };
  }

  return {
    spiritStoneDelta: input.rewards.spiritStoneDeltaOnWin,
    cultivationAttainmentDelta: input.rewards.attainmentDeltaOnWin,
    obtainedDefinitionIds: [...input.rewards.obtainedDefinitionIdsOnWin],
    injuryLevel: 'none',
    cooldownPatch: {}
  };
}
```

- [ ] **Step 5: Re-run resolver/bridge tests and verify they pass**

Run:

```bash
yarn vitest run tests/unit/services/CombatResolver.test.ts tests/unit/services/CombatRewardBridge.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit the combat core checkpoint**

```bash
git add src/services/CombatResolver.ts src/services/CombatRewardBridge.ts tests/unit/services/CombatResolver.test.ts tests/unit/services/CombatRewardBridge.test.ts
git commit -m "feat: add xuanjian combat resolver core"
```

## Task 5: Wire combat into focus encounters and canonical persistence

**Files:**
- Create: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/services/CombatService.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/services/CultivationService.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/cultivation.test.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/integration/xuanjian-task-cultivation-flow.test.ts`

- [ ] **Step 1: Add failing integration tests for the combat branch**

Append to `tests/integration/xuanjian-task-cultivation-flow.test.ts`:

```ts
test('combat encounter should resolve through awardCultivation and persist combat history', async () => {
  const userId = 602010;
  vi.spyOn(Math, 'random')
    .mockReturnValueOnce(0.98)
    .mockReturnValueOnce(0.18);

  const created = await taskService.createTask(userId, 'phase-c combat');
  await backdateTask(created.task.taskId, DEFAULT_TASK_DURATION_MINUTES);
  const completed = await taskService.completeTask(userId, created.task.taskId, true);
  const refreshed = await User.findOne({ userId }).lean();

  expect(completed.cultivationReward?.encounter?.type).toBe('combat');
  expect(completed.cultivationReward?.encounter?.combatSummary?.result).toBe('win');
  expect(refreshed?.cultivation.canonical.state.combatHistorySummary).toHaveLength(1);
  expect(refreshed?.cultivation.canonical.state.injuryState.level).toBe('none');
});
```

Append to `tests/cultivation.test.ts`:

```ts
test('getCultivationStatus should preserve combat history and current injury after a combat loss', async () => {
  const user = await User.create({ userId: 400120, username: 'combat-status' });
  const canonical = user.ensureCanonicalCultivation();
  canonical.state.injuryState = { level: 'light', modifiers: ['combat_loss'] };
  canonical.state.combatHistorySummary = [{
    encounterId: 'combatEncounter.taixi.roadside_wolf',
    result: 'loss',
    happenedAt: new Date('2026-04-22T10:00:00.000Z'),
    summary: '你被拦路青狼逼退。',
    enemyName: '拦路青狼'
  }];
  user.replaceCanonicalCultivation(canonical);
  user.syncLegacyCultivationShell();
  await user.save();

  const status = await new CultivationService().getCultivationStatus(400120);
  expect(status.canonicalState?.injuryState.level).toBe('light');
  expect(status.canonicalState?.combatHistorySummary).toHaveLength(1);
});
```

- [ ] **Step 2: Run the failing integration tests**

Run:

```bash
yarn vitest run tests/cultivation.test.ts tests/integration/xuanjian-task-cultivation-flow.test.ts
```

Expected: FAIL because no combat branch is wired into focus rewards yet.

- [ ] **Step 3: Add CombatService orchestration**

Create `src/services/CombatService.ts`:

```ts
import { getCombatEncounterById, getEnemyTemplateById } from '../config/xuanjianCombat.js';
import { buildPlayerCombatSnapshot } from './CombatStateAdapter.js';
import { resolveCombat } from './CombatResolver.js';
import { buildCombatOutcomePatch } from './CombatRewardBridge.js';

class CombatService {
  resolveEncounterCombat(input: { canonical: any; combatEncounterId: string; seed: number }) {
    const encounter = getCombatEncounterById(input.combatEncounterId);
    if (!encounter) {
      throw new Error(`未找到奇遇战模板: ${input.combatEncounterId}`);
    }

    const enemyTemplate = getEnemyTemplateById(encounter.enemyTemplateId);
    if (!enemyTemplate) {
      throw new Error(`未找到敌方模板: ${encounter.enemyTemplateId}`);
    }

    const player = buildPlayerCombatSnapshot(input.canonical.state);
    const enemy = {
      side: 'enemy',
      realmId: enemyTemplate.realmId,
      realmSubStageId: enemyTemplate.realmSubStageId,
      currentPower: enemyTemplate.currentPower,
      dimensions: enemyTemplate.dimensions,
      vitality: 24,
      stability: 8,
      battleArtIds: ['art.cloud_step'],
      divinePowerIds: [],
      injuryLevel: 'none',
      tags: [...enemyTemplate.tags]
    };

    const resolution = resolveCombat({
      encounterId: encounter.id,
      player,
      enemy,
      seed: input.seed
    });
    const patch = buildCombatOutcomePatch({
      outcome: resolution.outcome,
      encounterId: encounter.id,
      enemyName: resolution.enemyName,
      summary: resolution.summary,
      rewards: encounter.rewards,
      penalties: encounter.penalties
    });

    return { encounter, resolution, patch };
  }
}

export default CombatService;
```

- [ ] **Step 4: Add canonical write-back for resolved combat encounters**

Modify `src/services/CultivationService.ts`:

```ts
import CombatService from './CombatService.js';

class CultivationService {
  combatService = new CombatService();

  async awardCultivation(userId: number, duration: number): Promise<CultivationReward> {
    // existing focus reward setup...
    let encounter = resolution.encounter;

    if (encounter.type === 'combat' && encounter.combatEncounterId) {
      const combat = this.combatService.resolveEncounterCombat({
        canonical,
        combatEncounterId: encounter.combatEncounterId,
        seed: Math.floor(Math.random() * 1_000_000)
      });

      canonical.state.cultivationAttainment += combat.patch.cultivationAttainmentDelta;
      canonical.state.injuryState = {
        level: combat.patch.injuryLevel,
        modifiers: combat.patch.injuryLevel === 'none' ? [] : ['combat_loss']
      };
      canonical.state.combatHistorySummary = [
        ...canonical.state.combatHistorySummary.slice(-4),
        {
          encounterId: combat.resolution.encounterId,
          result: combat.resolution.outcome,
          happenedAt: new Date(),
          summary: combat.resolution.summary,
          enemyName: combat.resolution.enemyName
        }
      ];

      encounter = {
        ...encounter,
        spiritStoneDelta: combat.patch.spiritStoneDelta,
        obtainedDefinitionIds: combat.patch.obtainedDefinitionIds,
        combatSummary: {
          encounterId: combat.resolution.encounterId,
          enemyName: combat.resolution.enemyName,
          result: combat.resolution.outcome,
          summary: combat.resolution.summary,
          injuryLevel: combat.patch.injuryLevel
        }
      };
    }

    user.addImmortalStones(encounter.spiritStoneDelta);
    for (const definitionId of encounter.obtainedDefinitionIds) {
      user.grantInventoryDefinition(definitionId, 'encounter');
    }
    user.replaceCanonicalCultivation(canonical);
    user.syncLegacyCultivationShell();
    await user.save();
    // return reward with encounter
  }
}
```

- [ ] **Step 5: Re-run integration tests and verify they pass**

Run:

```bash
yarn vitest run tests/cultivation.test.ts tests/integration/xuanjian-task-cultivation-flow.test.ts
```

Expected: PASS, including persistence of `combatHistorySummary` and injury state.

- [ ] **Step 6: Commit the cultivation-integration checkpoint**

```bash
git add src/services/CombatService.ts src/services/CultivationService.ts tests/cultivation.test.ts tests/integration/xuanjian-task-cultivation-flow.test.ts
git commit -m "feat: wire xuanjian combat into focus encounters"
```

## Task 6: Surface battle summary to users and finish verification

**Files:**
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/handlers/taskCommands.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/handlers/cultivationCommands.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/unit/handlers/taskCommands.test.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/integration/xuanjian-cultivation-command-flow.test.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/docs/cultivation/xuanjian-dev-manual.md`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/docs/cultivation/smoke-test-checklist.md`

- [ ] **Step 1: Add failing handler tests for combat summary and realm injury display**

Append to `tests/unit/handlers/taskCommands.test.ts`:

```ts
test('完成任务消息应追加奇遇战短战报', async () => {
  const handlers = new TaskCommandHandlers({
    bot: bot as never,
    taskService: taskService as never,
    queueService: { scheduleReservation: vi.fn(), cancelReservation: vi.fn() } as never,
    ctdpService: {
      completeTrackedTask: vi.fn().mockResolvedValue({
        task: { taskId: 'task-1', actualDuration: 60 },
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
              summary: '你稳住气机，占得先手，数合后击退敌手。',
              injuryLevel: 'none'
            }
          }
        },
        user: { stats: { currentStreak: 1 } }
      }),
      failTrackedTask: vi.fn()
    } as never,
    onError
  });

  await handlers.handleCompleteTaskCallback(123456789, 'complete_task_task-1');
  const sentMessage = bot.sendMessage.mock.calls[0]?.[1] as string;
  expect(sentMessage).toContain('⚔️ 斗法结果：大胜');
  expect(sentMessage).toContain('拦路青狼');
  expect(sentMessage).toContain('你稳住气机，占得先手');
});
```

Append to `tests/integration/xuanjian-cultivation-command-flow.test.ts`:

```ts
test('/realm 应展示当前伤势与最近斗法摘要', async () => {
  const user = await User.create({ userId: 820012, username: 'realm-combat' });
  const canonical = user.ensureCanonicalCultivation();
  canonical.state.injuryState = { level: 'light', modifiers: ['combat_loss'] };
  canonical.state.combatHistorySummary = [{
    encounterId: 'combatEncounter.taixi.roadside_wolf',
    result: 'loss',
    happenedAt: new Date('2026-04-22T10:00:00.000Z'),
    summary: '你被拦路青狼逼退。',
    enemyName: '拦路青狼'
  }];
  user.replaceCanonicalCultivation(canonical);
  user.syncLegacyCultivationShell();
  await user.save();

  await handlers.handleRealmCommand({
    chat: { id: 820012 },
    from: { id: 820012 }
  } as never);

  const sentMessage = bot.sendMessage.mock.calls.at(-1)?.[1] as string;
  expect(sentMessage).toContain('🩹 当前伤势：轻伤');
  expect(sentMessage).toContain('⚔️ 最近斗法：你被拦路青狼逼退。');
});
```

- [ ] **Step 2: Run the user-facing tests and verify they fail**

Run:

```bash
yarn vitest run tests/unit/handlers/taskCommands.test.ts tests/integration/xuanjian-cultivation-command-flow.test.ts
```

Expected: FAIL because handlers do not yet render combat summaries or injury lines.

- [ ] **Step 3: Update task and realm handlers**

Modify `src/handlers/taskCommands.ts` and `src/handlers/cultivationCommands.ts`:

```ts
// taskCommands.ts
import { formatCombatOutcomeLabel, formatInjuryLevelLabel } from '../config/xuanjianCombat.js';

if (reward.encounter?.combatSummary) {
  message += `\n⚔️ 斗法结果：${formatCombatOutcomeLabel(reward.encounter.combatSummary.result)}`;
  message += `\n🐺 对手：${reward.encounter.combatSummary.enemyName}`;
  message += `\n📝 ${reward.encounter.combatSummary.summary}`;
  if (reward.encounter.combatSummary.injuryLevel !== 'none') {
    message += `\n🩹 伤势：${formatInjuryLevelLabel(reward.encounter.combatSummary.injuryLevel)}`;
  }
}
```

```ts
// cultivationCommands.ts
import { formatInjuryLevelLabel } from '../config/xuanjianCombat.js';

const injury = status.canonicalState?.injuryState;
if (injury && injury.level !== 'none') {
  message += `\n🩹 当前伤势：${formatInjuryLevelLabel(injury.level)}`;
}

const latestCombat = status.canonicalState?.combatHistorySummary.at(-1);
if (latestCombat) {
  message += `\n⚔️ 最近斗法：${latestCombat.summary}`;
}
```

- [ ] **Step 4: Update docs and smoke checklist**

Modify `docs/cultivation/xuanjian-dev-manual.md` and `docs/cultivation/smoke-test-checklist.md`:

```md
### C. V2 Phase C 主动战斗运行时验收

| 检查项 | 预期 |
|-------|------|
| C.1 | `rollFocusEncounter()` 可返回 `type = combat` |
| C.2 | 相同 seed 的 starter 奇遇战结果一致 |
| C.3 | 战斗胜负会写回 `combatHistorySummary` |
| C.4 | 战败后 `/realm` 可看到伤势与最近斗法 |
| C.5 | 完成任务消息会附带奇遇战短战报 |
```

- [ ] **Step 5: Run phase-C targeted verification**

Run:

```bash
yarn vitest run tests/unit/config/xuanjianCombat.test.ts tests/unit/services/CombatStateAdapter.test.ts tests/unit/services/CombatResolver.test.ts tests/unit/services/CombatRewardBridge.test.ts tests/unit/services/CultivationRewardEngine.test.ts tests/unit/handlers/taskCommands.test.ts tests/cultivation.test.ts tests/integration/xuanjian-task-cultivation-flow.test.ts tests/integration/xuanjian-cultivation-command-flow.test.ts
```

Expected: PASS.

- [ ] **Step 6: Run full verification before closing phase C**

Run:

```bash
yarn test
yarn typecheck
yarn build
git diff --check
```

Expected:

1. `yarn test` 全绿
2. `yarn typecheck` 无类型错误
3. `yarn build` 成功
4. `git diff --check` 无空白与冲突问题

- [ ] **Step 7: Commit the phase-C user-surface checkpoint**

```bash
git add src/handlers/taskCommands.ts src/handlers/cultivationCommands.ts tests/unit/handlers/taskCommands.test.ts tests/integration/xuanjian-cultivation-command-flow.test.ts docs/cultivation/xuanjian-dev-manual.md docs/cultivation/smoke-test-checklist.md
git commit -m "feat: surface xuanjian combat summaries"
```

## Self-Review Checklist

在开始执行前，先做这 4 个自检：

1. `spec coverage`
   - `CombatConfig / Adapter / Resolver / Bridge / Service` 是否都在任务里有落点
   - `同 seed 可复现` 是否被 unit test 锁住
   - `奇遇战回写 canonical` 是否被 integration test 锁住
   - `战报摘要与 /realm 展示` 是否被 handler/integration test 锁住
2. `no placeholders`
   - 不允许把空白字段或模糊步骤留在本计划里；starter seeds、结果字段、测试命令都必须是实值
3. `naming consistency`
   - `combatEncounterId`、`combatSummary`、`CombatOutcomePatch`、`buildPlayerCombatSnapshot` 这些名字在所有任务里必须一致
4. `scope control`
   - 本计划只覆盖一个 starter 奇遇战模板，不得顺手把 phase D 内容池扩容混进来
