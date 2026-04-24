# 玄鉴 V2 阶段 A 扩展层 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不破坏当前 V1 canonical 修炼主循环的前提下，为玄鉴 V2 建立可扩展的承载层：启用小阶与战斗相关预留字段，加入 `content registry -> balance profile -> runtime-ready projection` 三层结构，并用测试锁住“字段存在但未启用时 V1 行为不变”。

**Architecture:** 采用“先锁测试，再加类型与存储，再加 registry/projection，最后做兼容接线与文档同步”的方式推进。运行时仍以现有 `cultivation.canonical` 为单一真源；阶段 A 不实现主动战斗求解器，只建立 V2 可安全挂载的结构和最小投影能力。

**Tech Stack:** TypeScript, Node.js ESM, Mongoose, Vitest, Telegram Bot API, MongoDB Memory Server

---

## Scope Check

这份计划只实现 `V2 阶段 A：扩展层就位`：

1. 启用 `realmSubStageId`
2. 启用 `battleLoadout`
3. 启用 `branchCultivationAttainments`
4. 启用 `cooldowns / combatFlags / combatHistorySummary`
5. 建立 `content registry -> balance profile -> runtime-ready projection`
6. 锁住“V2 字段存在但未启用时，V1 主循环不变”的测试护栏

这份计划明确不做：

1. 小阶数值真正参与成长或战斗
2. 主动战斗求解器
3. 奇遇战入口
4. 大规模法门/神通池导入
5. 宗门、坊市、百艺、飞升线

## File Map

**Domain types**

- Create: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/types/cultivationV2.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/types/cultivationCanonical.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/types/models.ts`

**Registry and projection**

- Create: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/config/xuanjianV2Registry.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/config/xuanjianCanonical.ts`

**Persistence and compatibility**

- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/models/User.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/services/CultivationStateAdapter.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/services/CultivationService.ts`

**Tests**

- Create: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/unit/config/xuanjianV2Registry.test.ts`
- Create: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/unit/services/CultivationStateAdapter.v2.test.ts`
- Create: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/integration/xuanjian-v2-phase-a-compatibility.test.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/unit/models/User.test.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/integration/xuanjian-task-cultivation-flow.test.ts`

**Docs**

- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/docs/cultivation/xuanjian-dev-manual.md`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/docs/cultivation/smoke-test-checklist.md`

## Implementation Rules

1. `cultivation.canonical` 仍然是唯一运行时真源，不新增平行战斗存档。
2. 阶段 A 新字段默认都必须是“存在但惰性”，不能让 V1 行为半启用。
3. projection 只能输出最小 `runtime-ready` 结构，不允许求解器语义提前侵入阶段 A。
4. 只放最小 seed 内容到 registry：够验证结构，不够构成真正战斗内容池。
5. 所有默认值都必须通过 type + schema + adapter 三层同时锁住，避免字段在读取、持久化、迁移中漂移。

## Seed Decisions

阶段 A 只放最小 V2 seed：

1. `realmSubStage.taixi.xuanjing`
2. `realmSubStage.lianqi.1`
3. `realmSubStage.zhuji.early`
4. `battleArtProfile.art.basic_guarding_hand`
5. `battleArtProfile.art.cloud_step`
6. `projectionProfile.power.zifu_first_light`

这些 seed 只为验证 registry/projection 路径，不代表完整 V2 内容池。

### Task 1: Lock Phase A behavior in failing tests

**Files:**
- Create: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/unit/config/xuanjianV2Registry.test.ts`
- Create: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/unit/services/CultivationStateAdapter.v2.test.ts`
- Create: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/integration/xuanjian-v2-phase-a-compatibility.test.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/unit/models/User.test.ts`

- [ ] **Step 1: Add failing registry tests for seed content and runtime-ready projection**

Create `tests/unit/config/xuanjianV2Registry.test.ts` with:

```ts
import { describe, expect, test } from 'vitest';
import {
  getRealmSubStageById,
  getBattleArtRegistryEntry,
  projectBattleArtRuntimeProfile
} from '../../../src/config/xuanjianV2Registry.js';

describe('xuanjian V2 registry', () => {
  test('exposes minimal realm sub-stage seeds', () => {
    expect(getRealmSubStageById('realmSubStage.taixi.xuanjing')?.parentRealmId).toBe('realm.taixi');
    expect(getRealmSubStageById('realmSubStage.lianqi.1')?.parentRealmId).toBe('realm.lianqi');
    expect(getRealmSubStageById('realmSubStage.zhuji.early')?.parentRealmId).toBe('realm.zhuji');
  });

  test('projects a V1 battle art into runtime-ready shape without enabling combat resolver semantics', () => {
    const entry = getBattleArtRegistryEntry('art.basic_guarding_hand');
    expect(entry?.runtimeReady).toBe(true);

    const runtimeProfile = projectBattleArtRuntimeProfile('art.basic_guarding_hand');
    expect(runtimeProfile.definitionId).toBe('art.basic_guarding_hand');
    expect(runtimeProfile.actionProfile.actionType).toBe('guard');
    expect(runtimeProfile.balanceProfile.version).toBe(1);
  });
});
```

- [ ] **Step 2: Run targeted tests to verify they fail**

Run:

```bash
yarn vitest run tests/unit/config/xuanjianV2Registry.test.ts
```

Expected: FAIL with missing module or missing export errors for `xuanjianV2Registry`.

- [ ] **Step 3: Add failing adapter tests for V2 default fields**

Create `tests/unit/services/CultivationStateAdapter.v2.test.ts` with:

```ts
import { describe, expect, test } from 'vitest';
import { deriveCanonicalSnapshotFromLegacy } from '../../../src/services/CultivationStateAdapter.js';

describe('CultivationStateAdapter V2 defaults', () => {
  test('derives inert V2 fields without changing fresh-start behavior', () => {
    const snapshot = deriveCanonicalSnapshotFromLegacy({
      cultivation: {
        spiritualPower: 9999,
        realm: '元婴期',
        realmId: 6,
        realmStage: '圆满',
        immortalStones: 12
      },
      stats: {
        currentStreak: 3
      }
    } as never);

    expect(snapshot.state.realmId).toBe('realm.taixi');
    expect(snapshot.state.currentPower).toBe(0);
    expect(snapshot.state.realmSubStageId).toBe('realmSubStage.taixi.xuanjing');
    expect(snapshot.state.branchCultivationAttainments).toEqual({});
    expect(snapshot.state.battleLoadout.activeSupportArtId).toBeNull();
    expect(snapshot.state.cooldowns).toEqual({});
    expect(snapshot.state.combatFlags).toEqual({});
    expect(snapshot.state.combatHistorySummary).toEqual([]);
  });
});
```

- [ ] **Step 4: Run targeted adapter test to verify it fails**

Run:

```bash
yarn vitest run tests/unit/services/CultivationStateAdapter.v2.test.ts
```

Expected: FAIL because the new V2 fields do not exist on the state shape.

- [ ] **Step 5: Add failing integration test for “fields exist but V1 loop is unchanged”**

Create `tests/integration/xuanjian-v2-phase-a-compatibility.test.ts` with:

```ts
import { describe, expect, test } from 'vitest';
import CultivationService from '../../src/services/CultivationService.js';
import { User } from '../../src/models/index.js';

describe('xuanjian V2 phase A compatibility', () => {
  test('awardCultivation still uses the V1 loop even when V2 fields exist', async () => {
    const user = await User.create({
      userId: 41001,
      username: 'phase-a-user',
      cultivation: {
        canonical: {
          state: {
            realmId: 'realm.taixi',
            currentPower: 0,
            realmSubStageId: 'realmSubStage.taixi.xuanjing',
            mainMethodId: 'method.starter_tuna',
            mainDaoTrack: 'neutral',
            cultivationAttainment: 0,
            branchCultivationAttainments: {},
            foundationId: 'foundation.unshaped',
            knownBattleArtIds: ['art.basic_guarding_hand', 'art.cloud_step'],
            equippedBattleArtIds: ['art.basic_guarding_hand', 'art.cloud_step'],
            knownDivinePowerIds: [],
            equippedDivinePowerIds: [],
            equipmentLoadout: {},
            battleLoadout: {
              equippedBattleArtIds: ['art.basic_guarding_hand'],
              equippedDivinePowerIds: [],
              equippedArtifactIds: [],
              activeSupportArtId: null
            },
            inventoryItemIds: [],
            injuryState: { level: 'none', modifiers: [] },
            cooldowns: {},
            combatFlags: {},
            combatHistorySummary: [],
            focusStreak: 0,
            lastCultivationAt: null,
            pendingDivinationBuff: null,
            schemaVersion: 1
          },
          breakthrough: null,
          inventory: []
        }
      }
    });

    const reward = await new CultivationService().awardCultivation(user.userId, 60);
    expect(reward.spiritualPower).toBeGreaterThan(0);

    const refreshed = await User.findOne({ userId: user.userId }).lean();
    expect(refreshed?.cultivation.canonical.state.currentPower).toBeGreaterThan(0);
    expect(refreshed?.cultivation.canonical.state.realmSubStageId).toBe('realmSubStage.taixi.xuanjing');
  });
});
```

- [ ] **Step 6: Run the new integration test to verify it fails**

Run:

```bash
yarn vitest run tests/integration/xuanjian-v2-phase-a-compatibility.test.ts
```

Expected: FAIL on missing V2 fields in schema or type validation.

- [ ] **Step 7: Commit the failing-test checkpoint**

```bash
git add tests/unit/config/xuanjianV2Registry.test.ts tests/unit/services/CultivationStateAdapter.v2.test.ts tests/integration/xuanjian-v2-phase-a-compatibility.test.ts tests/unit/models/User.test.ts
git commit -m "test: lock xuanjian v2 phase-a foundations"
```

### Task 2: Extend canonical types for inert V2 phase-A fields

**Files:**
- Create: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/types/cultivationV2.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/types/cultivationCanonical.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/types/models.ts`
- Test: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/unit/services/CultivationStateAdapter.v2.test.ts`

- [ ] **Step 1: Add focused V2 type definitions**

Create `src/types/cultivationV2.ts` with:

```ts
export interface BattleLoadoutState {
  equippedBattleArtIds: string[];
  equippedDivinePowerIds: string[];
  equippedArtifactIds: string[];
  activeSupportArtId: string | null;
}

export interface CombatHistorySummaryEntry {
  encounterId: string;
  result: 'win' | 'loss' | 'narrow_win';
  happenedAt: Date;
  summary: string;
}

export interface RuntimeReadyBattleArtProfile {
  definitionId: string;
  balanceProfile: {
    version: 1;
    attackWeight: number;
    defenseWeight: number;
    senseWeight: number;
    speedWeight: number;
  };
  actionProfile: {
    actionType: 'attack' | 'guard' | 'movement' | 'support';
    tags: string[];
  };
}
```

- [ ] **Step 2: Extend `PlayerCultivationState` with inert V2 fields**

Update `src/types/cultivationCanonical.ts`:

```ts
import type {
  BattleLoadoutState,
  CombatHistorySummaryEntry
} from './cultivationV2.js';

export interface PlayerCultivationState {
  realmId: RealmId;
  realmSubStageId: string;
  currentPower: number;
  mainMethodId: string;
  mainDaoTrack: string;
  cultivationAttainment: number;
  branchCultivationAttainments: Record<string, number>;
  foundationId: string;
  knownBattleArtIds: string[];
  equippedBattleArtIds: string[];
  knownDivinePowerIds: string[];
  equippedDivinePowerIds: string[];
  equipmentLoadout: Record<string, string>;
  battleLoadout: BattleLoadoutState;
  inventoryItemIds: string[];
  injuryState: {
    level: 'none' | 'light' | 'medium' | 'heavy';
    modifiers: string[];
  };
  cooldowns: Record<string, number>;
  combatFlags: Record<string, boolean | string | number>;
  combatHistorySummary: CombatHistorySummaryEntry[];
  focusStreak: number;
  lastCultivationAt: Date | null;
  pendingDivinationBuff: DivinationBuff | null;
  schemaVersion: 1;
}
```

- [ ] **Step 3: Wire new types into model interfaces**

Update `src/types/models.ts` so `IUserCultivationCanonical['state']` uses the new `PlayerCultivationState` shape without partial omissions.

Use:

```ts
import type { InventoryInstance, PlayerCultivationState } from './cultivationCanonical.js';

export interface IUserCultivationCanonical {
  schemaVersion: 1;
  state: PlayerCultivationState;
  breakthrough: Record<string, unknown> | null;
  inventory: InventoryInstance[];
}
```

- [ ] **Step 4: Run focused type-adjacent tests**

Run:

```bash
yarn vitest run tests/unit/services/CultivationStateAdapter.v2.test.ts
```

Expected: still FAIL in runtime/schema behavior, but type-level missing-property errors should be resolved.

- [ ] **Step 5: Commit the type-shape checkpoint**

```bash
git add src/types/cultivationV2.ts src/types/cultivationCanonical.ts src/types/models.ts
git commit -m "feat: add xuanjian v2 phase-a type scaffolding"
```

### Task 3: Persist inert V2 defaults in schema and adapter

**Files:**
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/models/User.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/services/CultivationStateAdapter.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/unit/models/User.test.ts`
- Test: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/unit/services/CultivationStateAdapter.v2.test.ts`

- [ ] **Step 1: Add new V2 defaults to the Mongoose schema**

Update the `canonical.state` block in `src/models/User.ts`:

```ts
state: {
  realmId: { type: String, default: 'realm.taixi' },
  realmSubStageId: { type: String, default: 'realmSubStage.taixi.xuanjing' },
  currentPower: { type: Number, default: 0 },
  mainMethodId: { type: String, default: 'method.starter_tuna' },
  mainDaoTrack: { type: String, default: 'neutral' },
  cultivationAttainment: { type: Number, default: 0 },
  branchCultivationAttainments: { type: Schema.Types.Mixed, default: () => ({}) },
  foundationId: { type: String, default: 'foundation.unshaped' },
  knownBattleArtIds: { type: [String], default: ['art.basic_guarding_hand', 'art.cloud_step'] },
  equippedBattleArtIds: { type: [String], default: ['art.basic_guarding_hand', 'art.cloud_step'] },
  knownDivinePowerIds: { type: [String], default: [] },
  equippedDivinePowerIds: { type: [String], default: [] },
  equipmentLoadout: { type: Schema.Types.Mixed, default: () => ({}) },
  battleLoadout: {
    equippedBattleArtIds: { type: [String], default: ['art.basic_guarding_hand'] },
    equippedDivinePowerIds: { type: [String], default: [] },
    equippedArtifactIds: { type: [String], default: [] },
    activeSupportArtId: { type: String, default: null }
  },
  inventoryItemIds: { type: [String], default: [] },
  injuryState: {
    level: { type: String, default: 'none' },
    modifiers: { type: [String], default: [] }
  },
  cooldowns: { type: Schema.Types.Mixed, default: () => ({}) },
  combatFlags: { type: Schema.Types.Mixed, default: () => ({}) },
  combatHistorySummary: { type: [Schema.Types.Mixed], default: [] },
  focusStreak: { type: Number, default: 0 },
  lastCultivationAt: { type: Date, default: null },
  pendingDivinationBuff: { type: Schema.Types.Mixed, default: null },
  schemaVersion: { type: Number, default: 1 }
}
```

- [ ] **Step 2: Extend fresh-start adapter defaults**

Update `deriveCanonicalSnapshotFromLegacy` in `src/services/CultivationStateAdapter.ts` so it returns:

```ts
state: {
  realmId: 'realm.taixi',
  realmSubStageId: 'realmSubStage.taixi.xuanjing',
  currentPower: 0,
  mainMethodId: 'method.starter_tuna',
  mainDaoTrack: 'neutral',
  cultivationAttainment: 0,
  branchCultivationAttainments: {},
  foundationId: 'foundation.unshaped',
  knownBattleArtIds: ['art.basic_guarding_hand', 'art.cloud_step'],
  equippedBattleArtIds: ['art.basic_guarding_hand', 'art.cloud_step'],
  knownDivinePowerIds: [],
  equippedDivinePowerIds: [],
  equipmentLoadout: {},
  battleLoadout: {
    equippedBattleArtIds: ['art.basic_guarding_hand'],
    equippedDivinePowerIds: [],
    equippedArtifactIds: [],
    activeSupportArtId: null
  },
  inventoryItemIds: [],
  injuryState: { level: 'none', modifiers: [] },
  cooldowns: {},
  combatFlags: {},
  combatHistorySummary: [],
  focusStreak: user.stats.currentStreak ?? 0,
  lastCultivationAt: null,
  pendingDivinationBuff: null,
  schemaVersion: 1
}
```

- [ ] **Step 3: Add a schema-level user test for inert V2 defaults**

In `tests/unit/models/User.test.ts`, add:

```ts
it('initializes inert V2 phase-a cultivation fields for new users', async () => {
  const user = await User.create({ userId: 99001, username: 'v2-defaults' });

  expect(user.cultivation.canonical?.state.realmSubStageId).toBe('realmSubStage.taixi.xuanjing');
  expect(user.cultivation.canonical?.state.branchCultivationAttainments).toEqual({});
  expect(user.cultivation.canonical?.state.battleLoadout.activeSupportArtId).toBeNull();
  expect(user.cultivation.canonical?.state.cooldowns).toEqual({});
  expect(user.cultivation.canonical?.state.combatHistorySummary).toEqual([]);
});
```

- [ ] **Step 4: Run model and adapter tests**

Run:

```bash
yarn vitest run tests/unit/models/User.test.ts tests/unit/services/CultivationStateAdapter.v2.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the persistence checkpoint**

```bash
git add src/models/User.ts src/services/CultivationStateAdapter.ts tests/unit/models/User.test.ts tests/unit/services/CultivationStateAdapter.v2.test.ts
git commit -m "feat: persist inert xuanjian v2 phase-a state"
```

### Task 4: Add registry, balance profiles, and runtime-ready projection

**Files:**
- Create: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/config/xuanjianV2Registry.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/config/xuanjianCanonical.ts`
- Test: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/unit/config/xuanjianV2Registry.test.ts`

- [ ] **Step 1: Create minimal registry and lookup helpers**

Create `src/config/xuanjianV2Registry.ts` with:

```ts
import type { RuntimeReadyBattleArtProfile } from '../types/cultivationV2.js';

const REALM_SUB_STAGES = [
  { id: 'realmSubStage.taixi.xuanjing', parentRealmId: 'realm.taixi', order: 1, label: '玄景' },
  { id: 'realmSubStage.lianqi.1', parentRealmId: 'realm.lianqi', order: 1, label: '一层' },
  { id: 'realmSubStage.zhuji.early', parentRealmId: 'realm.zhuji', order: 1, label: '初层' }
] as const;

const BATTLE_ART_REGISTRY = [
  {
    id: 'art.basic_guarding_hand',
    runtimeReady: true,
    category: 'guard',
    tags: ['starter', 'defense']
  },
  {
    id: 'art.cloud_step',
    runtimeReady: true,
    category: 'movement',
    tags: ['starter', 'speed']
  }
] as const;

const BATTLE_ART_BALANCE_PROFILES: Record<string, RuntimeReadyBattleArtProfile> = {
  'art.basic_guarding_hand': {
    definitionId: 'art.basic_guarding_hand',
    balanceProfile: { version: 1, attackWeight: 0.1, defenseWeight: 0.7, senseWeight: 0.1, speedWeight: 0.1 },
    actionProfile: { actionType: 'guard', tags: ['starter', 'guard'] }
  },
  'art.cloud_step': {
    definitionId: 'art.cloud_step',
    balanceProfile: { version: 1, attackWeight: 0.1, defenseWeight: 0.1, senseWeight: 0.1, speedWeight: 0.7 },
    actionProfile: { actionType: 'movement', tags: ['starter', 'movement'] }
  }
};

export function getRealmSubStageById(id: string) {
  return REALM_SUB_STAGES.find((item) => item.id === id) ?? null;
}

export function getBattleArtRegistryEntry(id: string) {
  return BATTLE_ART_REGISTRY.find((item) => item.id === id) ?? null;
}

export function projectBattleArtRuntimeProfile(id: string): RuntimeReadyBattleArtProfile {
  const profile = BATTLE_ART_BALANCE_PROFILES[id];
  if (!profile) {
    throw new Error(`Battle art runtime profile not found: ${id}`);
  }
  return profile;
}
```

- [ ] **Step 2: Re-export V2 registry from canonical config**

At the bottom of `src/config/xuanjianCanonical.ts`, add:

```ts
export {
  getBattleArtRegistryEntry,
  getRealmSubStageById,
  projectBattleArtRuntimeProfile
} from './xuanjianV2Registry.js';
```

- [ ] **Step 3: Run focused registry tests**

Run:

```bash
yarn vitest run tests/unit/config/xuanjianV2Registry.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit the registry/projection checkpoint**

```bash
git add src/config/xuanjianV2Registry.ts src/config/xuanjianCanonical.ts tests/unit/config/xuanjianV2Registry.test.ts
git commit -m "feat: add xuanjian v2 phase-a registry projection"
```

### Task 5: Prove V1 compatibility and keep service behavior unchanged

**Files:**
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/services/CultivationService.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/integration/xuanjian-task-cultivation-flow.test.ts`
- Test: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/integration/xuanjian-v2-phase-a-compatibility.test.ts`

- [ ] **Step 1: Normalize V2 fields in service read paths without enabling new behavior**

At the start of `getCultivationStatus` and `awardCultivation`, after `ensureCanonicalCultivation()`, add a tiny normalization step:

```ts
canonical.state.realmSubStageId ??= 'realmSubStage.taixi.xuanjing';
canonical.state.branchCultivationAttainments ??= {};
canonical.state.battleLoadout ??= {
  equippedBattleArtIds: canonical.state.equippedBattleArtIds.slice(0, 1),
  equippedDivinePowerIds: [],
  equippedArtifactIds: [],
  activeSupportArtId: null
};
canonical.state.cooldowns ??= {};
canonical.state.combatFlags ??= {};
canonical.state.combatHistorySummary ??= [];
```

This is deliberately inert. Do not branch on these fields yet.

- [ ] **Step 2: Extend integration coverage to assert no V1 regression**

In `tests/integration/xuanjian-task-cultivation-flow.test.ts`, add:

```ts
test('phase-a V2 fields do not change the existing 60-minute focus reward loop', async () => {
  const user = await User.create({ userId: 45001, username: 'phase-a-focus' });
  const service = new CultivationService();

  const reward = await service.awardCultivation(user.userId, 60);
  expect(reward.spiritualPower).toBeGreaterThan(0);

  const refreshed = await User.findOne({ userId: user.userId }).lean();
  expect(refreshed?.cultivation.canonical.state.realmSubStageId).toBe('realmSubStage.taixi.xuanjing');
  expect(refreshed?.cultivation.canonical.state.currentPower).toBeGreaterThan(0);
  expect(refreshed?.cultivation.canonical.state.combatFlags).toEqual({});
});
```

- [ ] **Step 3: Run the compatibility slice**

Run:

```bash
yarn vitest run tests/integration/xuanjian-v2-phase-a-compatibility.test.ts tests/integration/xuanjian-task-cultivation-flow.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit the compatibility checkpoint**

```bash
git add src/services/CultivationService.ts tests/integration/xuanjian-v2-phase-a-compatibility.test.ts tests/integration/xuanjian-task-cultivation-flow.test.ts
git commit -m "refactor: keep xuanjian v1 loop stable with v2 phase-a fields"
```

### Task 6: Document and verify the phase-A handoff

**Files:**
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/docs/cultivation/xuanjian-dev-manual.md`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/docs/cultivation/smoke-test-checklist.md`

- [ ] **Step 1: Update the dev manual with phase-A V2 foundations**

Add a new section to `docs/cultivation/xuanjian-dev-manual.md` describing:

```md
## V2 Phase A Runtime Foundations

- `realmSubStageId` is persisted but inert until phase B.
- `battleLoadout` is persisted but does not trigger combat resolution yet.
- `branchCultivationAttainments`, `cooldowns`, `combatFlags`, and `combatHistorySummary` are persisted as neutral defaults.
- `xuanjianV2Registry.ts` owns the minimal registry and runtime-ready projection helpers for later combat phases.
```

- [ ] **Step 2: Add smoke-check entries proving inert behavior**

Append to `docs/cultivation/smoke-test-checklist.md`:

```md
## V2 Phase A Compatibility Checks

| # | Check | Expected |
|---|-------|----------|
| A.1 | `realmSubStageId` present | `realmSubStage.taixi.xuanjing` |
| A.2 | `battleLoadout` present | starter defaults only |
| A.3 | Focus reward loop | unchanged from V1 |
| A.4 | `/realm` output | no forced V2 combat wording yet |
```

- [ ] **Step 3: Run the full verification suite**

Run:

```bash
yarn vitest run tests/unit/config/xuanjianV2Registry.test.ts tests/unit/services/CultivationStateAdapter.v2.test.ts tests/unit/models/User.test.ts tests/integration/xuanjian-v2-phase-a-compatibility.test.ts tests/integration/xuanjian-task-cultivation-flow.test.ts
yarn test
yarn typecheck
yarn build
git diff --check
```

Expected:

1. Targeted tests PASS
2. Full suite PASS
3. `typecheck` PASS
4. `build` PASS
5. `git diff --check` returns no output

- [ ] **Step 4: Commit the documentation and verification checkpoint**

```bash
git add docs/cultivation/xuanjian-dev-manual.md docs/cultivation/smoke-test-checklist.md docs/superpowers/plans/2026-04-21-xuanjian-v2-phase-a-foundation-implementation.md
git commit -m "docs: hand off xuanjian v2 phase-a foundations"
```

## Self-Review

Spec coverage:

1. `realmSubStageId` -> Task 2, Task 3
2. `battleLoadout` -> Task 2, Task 3
3. `branchCultivationAttainments` -> Task 2, Task 3
4. `cooldowns / combatFlags / combatHistorySummary` -> Task 2, Task 3
5. `content registry -> balance profile -> runtime-ready projection` -> Task 1, Task 4
6. `V1 compatibility` -> Task 1, Task 5, Task 6

Placeholder scan:

1. No `TODO`
2. No `TBD`
3. No “implement later” phrasing

Type consistency:

1. `realmSubStageId`, `battleLoadout`, `branchCultivationAttainments`, `cooldowns`, `combatFlags`, `combatHistorySummary` are used consistently across types, schema, adapter, and tests.
2. `projectBattleArtRuntimeProfile` is the only projection helper introduced in phase A and is used consistently in tests and config.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-21-xuanjian-v2-phase-a-foundation-implementation.md`. Two execution options:

1. Subagent-Driven (recommended) - I dispatch a fresh subagent per task, review between tasks, fast iteration
2. Inline Execution - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
