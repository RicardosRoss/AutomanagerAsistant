# 玄鉴 Canonical Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将当前旧九境界 `spiritualPower + immortalStones + 随机 fortune` 修仙运行时，迁移为符合玄鉴文档的 `canonical schema + 专注主修为 + cultivationAttainment + 奇遇掉落 + 破境准备` V1 运行时，并明确采用“旧修仙进度清零重开”的上线策略。

**Architecture:** 采用“兼容壳字段保留、canonical 子状态新增、纯计算引擎拆出、服务层渐进接线”的方案。第一层先把玄鉴六境、主修功法、法门/神通槽位、破境法门、物品和数值锚点写成静态定义；第二层把用户存档扩成 `cultivation.canonical` 子文档，并提供旧字段到 canonical 新开局状态的适配器；第三层重写 `CultivationService` 的专注结算、奇遇掉落与突破判定，但继续同步旧 `spiritualPower / realm / realmId / immortalStones` 字段，保证现有命令与排行榜在迁移期间还能工作。

**Tech Stack:** TypeScript, Node.js ESM, Mongoose, Vitest, Telegram Bot API, MongoDB Memory Server

---

## Scope Check

这份计划只实现 `玄鉴 V1 修炼运行时`：

1. 实现 `canonical schema` 的静态配置与运行态存储。
2. 实现“完成专注 -> 修为 -> cultivationAttainment -> 奇遇/灵石/掉落 -> 破境准备”的主循环。
3. 实现主修功法、突破法门、基础物品与最小种子内容包。
4. 让状态页与完成任务消息读到 canonical 数据。

这份计划明确不做：

1. 独立主动战斗求解器。
2. 坊市、宗门、百艺、灵田等经济系统。
3. 全量法门/神通内容池落地。
4. 复杂临时状态系统，例如可叠加的长期卜卦增益。

当前仓库里没有独立的 `combat / encounter` 运行时模块，因此本计划的终点是“法门/神通/破境条目已建模并可持有、展示、用于突破判定”，不是“已经能主动斗法结算”。

## File Map

**New canonical domain types and config**

- Create: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/types/cultivationCanonical.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/types/cultivation.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/types/services.ts`
- Create: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/config/xuanjianCanonical.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/config/cultivation.ts`

**Persistence and migration**

- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/types/models.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/models/User.ts`
- Create: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/services/CultivationStateAdapter.ts`
- Create: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/scripts/migrate-xuanjian-cultivation.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/package.json`

**Pure runtime engines**

- Create: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/services/CultivationRewardEngine.ts`
- Create: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/services/BreakthroughEngine.ts`

**Service and handler integration**

- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/services/CultivationService.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/services/TaskService.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/models/DivinationHistory.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/handlers/taskCommands.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/handlers/cultivationCommands.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/handlers/coreCommands.ts`

**Tests**

- Create: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/unit/config/xuanjianCanonical.test.ts`
- Create: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/unit/services/CultivationStateAdapter.test.ts`
- Create: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/unit/services/CultivationRewardEngine.test.ts`
- Create: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/unit/services/BreakthroughEngine.test.ts`
- Create: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/unit/handlers/cultivationCommands.test.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/cultivation.test.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/unit/services/TaskService.test.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/unit/services/TaskService-ctdp-boundary.test.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/unit/handlers/taskCommands.test.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/unit/handlers/coreCommands.test.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/integration/ctdp-reservation-flow.test.ts`

## Implementation Rules

1. `spiritualPower`、`realm`、`realmId`、`realmStage`、`immortalStones` 继续保留为兼容壳字段，但所有新判断都以 `cultivation.canonical` 为准。
2. `cultivationAttainment` 作为单一长期道行字段落地，不再引入 `mainDaoLevel` / `schoolInsight` 双字段。
3. `主修为来源` 只能来自完成专注；奇遇和占卜不得再直接成为稳定主修为来源。
4. `战斗法门 / 神通` 先作为条目与状态字段落地，不在本计划里实现主动战斗伤害公式。
5. `突破` 在 V1 改成“条件门槛 + 资源消耗 + deterministic success”，去掉旧的统一概率模板。
6. `/divination` 在 V1 只保留灵石波动，不再直接改动修为。

## Seed Pack Decisions

为了让 V1 代码能运行并可测试，这一版只落一个最小种子内容包：

1. `realm.taixi`、`realm.lianqi`、`realm.zhuji`、`realm.zifu`、`realm.jindan`、`realm.yuanying`
2. `method.starter_tuna`
3. `foundation.unshaped`
4. `art.basic_guarding_hand`
5. `art.cloud_step`
6. `power.zifu_first_light`
7. `breakthrough.taixi_to_lianqi`
8. `breakthrough.lianqi_to_zhuji`
9. `breakthrough.zhuji_to_zifu`
10. `material.yellow_breakthrough_token`
11. `material.mysterious_breakthrough_token`
12. `consumable.low_cultivation_pill`

这些条目只解决“系统可运行、可掉落、可破境、可展示”。更完整的功法池、法门池、神通池在后续内容计划里继续补。

### Task 1: Lock the canonical runtime target in failing tests

**Files:**
- Create: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/unit/config/xuanjianCanonical.test.ts`
- Create: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/unit/services/CultivationStateAdapter.test.ts`
- Create: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/unit/services/CultivationRewardEngine.test.ts`
- Create: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/unit/services/BreakthroughEngine.test.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/cultivation.test.ts`

- [ ] **Step 1: Add failing config tests for the six realms and numeric anchors**

Use these assertions as the target:

```ts
import { describe, expect, test } from 'vitest';
import {
  getCanonicalRealmByPower,
  getDurationBaseValue,
  getGeneralAttainmentMultiplier,
  getRealmTemplateCoefficient
} from '../../../src/config/xuanjianCanonical.js';

describe('xuanjian canonical config', () => {
  test('maps power into the six xuanjian realms', () => {
    expect(getCanonicalRealmByPower(0).id).toBe('realm.taixi');
    expect(getCanonicalRealmByPower(120).id).toBe('realm.lianqi');
    expect(getCanonicalRealmByPower(1120).id).toBe('realm.zifu');
    expect(getCanonicalRealmByPower(5620).id).toBe('realm.yuanying');
  });

  test('uses the approved focus duration template', () => {
    expect(getDurationBaseValue(59)).toBe(0);
    expect(getDurationBaseValue(60)).toBe(1);
    expect(getDurationBaseValue(90)).toBe(2);
    expect(getDurationBaseValue(150)).toBe(4);
  });

  test('uses approved realm coefficients and attainment multipliers', () => {
    expect(getRealmTemplateCoefficient('realm.taixi')).toBe(1);
    expect(getRealmTemplateCoefficient('realm.jindan')).toBe(1.15);
    expect(getGeneralAttainmentMultiplier(10)).toBeCloseTo(1.2);
    expect(getGeneralAttainmentMultiplier(30)).toBeCloseTo(1.4);
  });
});
```

- [ ] **Step 2: Add failing adapter tests for legacy-to-canonical fresh-start initialization**

Add a test file that locks the fresh-start initialization behavior:

```ts
import { describe, expect, test } from 'vitest';
import { deriveCanonicalSnapshotFromLegacy } from '../../../src/services/CultivationStateAdapter.js';

describe('CultivationStateAdapter', () => {
  test('derives canonical state as a fresh restart regardless of legacy shell power', () => {
    const snapshot = deriveCanonicalSnapshotFromLegacy({
      cultivation: {
        spiritualPower: 2500,
        realm: '金丹期',
        realmId: 3,
        realmStage: '初期',
        immortalStones: 77
      },
      stats: {
        currentStreak: 7
      }
    } as never);

    expect(snapshot.state.realmId).toBe('realm.taixi');
    expect(snapshot.state.currentPower).toBe(0);
    expect(snapshot.state.focusStreak).toBe(7);
    expect(snapshot.state.mainMethodId).toBe('method.starter_tuna');
    expect(snapshot.inventory).toEqual([]);
  });
});
```

- [ ] **Step 3: Add failing reward and breakthrough engine tests**

Use pure-function tests instead of trying to assert through the full service first:

```ts
import { describe, expect, test } from 'vitest';
import { resolveFocusReward } from '../../../src/services/CultivationRewardEngine.js';
import { evaluateBreakthroughReadiness } from '../../../src/services/BreakthroughEngine.js';

describe('CultivationRewardEngine', () => {
  test('focus completion is the main source of power gain', () => {
    const result = resolveFocusReward({
      duration: 90,
      rng: () => 0.99,
      state: {
        realmId: 'realm.taixi',
        currentPower: 0,
        mainMethodId: 'method.starter_tuna',
        mainDaoTrack: 'neutral',
        cultivationAttainment: 0,
        foundationId: 'foundation.unshaped',
        knownBattleArtIds: ['art.basic_guarding_hand'],
        equippedBattleArtIds: ['art.basic_guarding_hand'],
        knownDivinePowerIds: [],
        equippedDivinePowerIds: [],
        equipmentLoadout: {},
        inventoryItemIds: [],
        injuryState: { level: 'none', modifiers: [] },
        focusStreak: 4,
        lastCultivationAt: null,
        schemaVersion: 1
      }
    });

    expect(result.basePowerGain).toBe(2);
    expect(result.totalPowerGain).toBe(2);
    expect(result.attainmentDelta).toBe(1);
    expect(result.nextFocusStreak).toBe(5);
  });
});

describe('BreakthroughEngine', () => {
  test('requires configured materials and attainment to mark breakthrough ready', () => {
    const result = evaluateBreakthroughReadiness({
      currentRealmId: 'realm.lianqi',
      currentPower: 420,
      cultivationAttainment: 9,
      mainMethodId: 'method.starter_tuna',
      inventory: []
    });

    expect(result.ready).toBe(false);
    expect(result.missing).toContain('material.yellow_breakthrough_token');
    expect(result.missing).toContain('cultivationAttainment');
  });
});
```

- [ ] **Step 4: Run the new focused tests to confirm RED**

Run:

```bash
npx vitest run tests/unit/config/xuanjianCanonical.test.ts tests/unit/services/CultivationStateAdapter.test.ts tests/unit/services/CultivationRewardEngine.test.ts tests/unit/services/BreakthroughEngine.test.ts tests/cultivation.test.ts
```

Expected:

1. Imports fail because the new config and engine files do not exist yet.
2. Existing `tests/cultivation.test.ts` still asserts the old `炼气期 -> 筑基期` progression.
3. No canonical runtime helpers are available yet.

- [ ] **Step 5: Commit the red baseline**

```bash
git add tests/unit/config/xuanjianCanonical.test.ts tests/unit/services/CultivationStateAdapter.test.ts tests/unit/services/CultivationRewardEngine.test.ts tests/unit/services/BreakthroughEngine.test.ts tests/cultivation.test.ts
git commit -m "test: lock xuanjian canonical runtime targets"
```

### Task 2: Introduce canonical domain types and static config

**Files:**
- Create: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/types/cultivationCanonical.ts`
- Create: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/config/xuanjianCanonical.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/types/cultivation.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/types/services.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/config/cultivation.ts`
- Test: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/unit/config/xuanjianCanonical.test.ts`

- [ ] **Step 1: Define the canonical entities and runtime state types**

Create focused canonical types instead of overloading the legacy `CultivationRealm` interface:

```ts
export type RealmId =
  | 'realm.taixi'
  | 'realm.lianqi'
  | 'realm.zhuji'
  | 'realm.zifu'
  | 'realm.jindan'
  | 'realm.yuanying';

export interface BaseDefinition {
  id: string;
  name: string;
  category: string;
  tier: '凡' | '黄' | '玄' | '地';
  realmFloor: RealmId;
  realmCeiling: RealmId;
  source: string;
  tags: string[];
  dropScope: 'common' | 'heritage' | 'majorFortune' | 'breakthroughOnly' | 'npcOnly';
  enabledInV1: boolean;
  reservedForV2: boolean;
}

export interface PlayerCultivationState {
  realmId: RealmId;
  currentPower: number;
  mainMethodId: string;
  mainDaoTrack: string;
  cultivationAttainment: number;
  foundationId: string;
  knownBattleArtIds: string[];
  equippedBattleArtIds: string[];
  knownDivinePowerIds: string[];
  equippedDivinePowerIds: string[];
  equipmentLoadout: Record<string, string>;
  inventoryItemIds: string[];
  injuryState: {
    level: 'none' | 'light' | 'medium' | 'heavy';
    modifiers: string[];
  };
  focusStreak: number;
  lastCultivationAt: Date | null;
  schemaVersion: 1;
}

export interface InventoryInstance {
  instanceId: string;
  definitionId: string;
  obtainedAt: Date;
  sourceType: 'focus' | 'encounter' | 'migration' | 'admin';
  bound: boolean;
  used: boolean;
  stackCount: number;
  instanceMeta: Record<string, string | number | boolean | null>;
}
```

- [ ] **Step 2: Create the canonical config module with approved numeric anchors and a minimal V1 seed pack**

Implement one static source-of-truth module:

```ts
export const XUANJIAN_REALMS = [
  { id: 'realm.taixi', name: '胎息', minPower: 0, maxPower: 119, coefficient: 1.0, nextPower: 120 },
  { id: 'realm.lianqi', name: '练气', minPower: 120, maxPower: 419, coefficient: 1.0, nextPower: 420 },
  { id: 'realm.zhuji', name: '筑基', minPower: 420, maxPower: 1119, coefficient: 1.05, nextPower: 1120 },
  { id: 'realm.zifu', name: '紫府', minPower: 1120, maxPower: 2619, coefficient: 1.1, nextPower: 2620 },
  { id: 'realm.jindan', name: '金丹', minPower: 2620, maxPower: 5619, coefficient: 1.15, nextPower: 5620 },
  { id: 'realm.yuanying', name: '元婴', minPower: 5620, maxPower: 10620, coefficient: 1.2, nextPower: null }
] as const;

export const XUANJIAN_MAIN_METHODS = [
  {
    id: 'method.starter_tuna',
    name: '玄门吐纳法',
    category: 'main_method',
    tier: '凡',
    realmFloor: 'realm.taixi',
    realmCeiling: 'realm.lianqi',
    source: 'runtime.seed',
    tags: ['starter', 'neutral'],
    dropScope: 'common',
    enabledInV1: true,
    reservedForV2: false,
    grade: 1,
    cultivationMultiplier: 1,
    combatBias: { attack: 0, defense: 0, sense: 0, speed: 0 },
    foundationAffinity: ['foundation.unshaped'],
    artSlotsBonus: 0,
    divinePowerSlotsBonus: 0,
    breakthroughAssist: ['breakthrough.taixi_to_lianqi'],
    requiredAura: []
  }
] as const;
```

Also add the exact helpers your tests need:

```ts
export function getCanonicalRealmByPower(power: number) {
  return XUANJIAN_REALMS.find((realm) => power >= realm.minPower && power <= realm.maxPower)
    ?? XUANJIAN_REALMS[XUANJIAN_REALMS.length - 1]!;
}

export function getRealmById(realmId: RealmId) {
  return XUANJIAN_REALMS.find((realm) => realm.id === realmId) ?? XUANJIAN_REALMS[0]!;
}

export function getRealmTemplateCoefficient(realmId: RealmId): number {
  return getRealmById(realmId).coefficient;
}

export function getMainMethodById(methodId: string) {
  return XUANJIAN_MAIN_METHODS.find((method) => method.id === methodId) ?? XUANJIAN_MAIN_METHODS[0]!;
}

export function getDurationBaseValue(duration: number): number {
  if (duration < 60) return 0;
  return 1 + Math.floor((duration - 60) / 30);
}

export function getGeneralAttainmentMultiplier(attainment: number): number {
  let multiplier = 1;
  const firstBand = Math.min(attainment, 10);
  const secondBand = Math.min(Math.max(attainment - 10, 0), 20);
  const thirdBand = Math.min(Math.max(attainment - 30, 0), 30);
  const fourthBand = Math.max(attainment - 60, 0);
  multiplier += firstBand * 0.02;
  multiplier += secondBand * 0.01;
  multiplier += thirdBand * 0.005;
  multiplier += fourthBand * 0.002;
  return Number(multiplier.toFixed(3));
}

export function getSameSchoolCultivationMultiplier(attainment: number, mainDaoTrack: string, methodTags: string[]): number {
  if (!methodTags.includes(mainDaoTrack)) return 1;
  if (attainment >= 30) return 1.08;
  if (attainment >= 10) return 1.05;
  return 1.02;
}

export function getCanonicalRealmStage(power: number) {
  if (power < 20) return { name: '玄景' };
  if (power < 40) return { name: '承明' };
  if (power < 60) return { name: '周行' };
  if (power < 80) return { name: '青元' };
  if (power < 100) return { name: '玉京' };
  return { name: '灵初' };
}

export function formatCanonicalStage(power: number): string {
  return getCanonicalRealmStage(power).name;
}

export function formatCanonicalRealmDisplay(state: { realmId: RealmId; currentPower: number }) {
  const realm = getRealmById(state.realmId);
  const stage = formatCanonicalStage(state.currentPower);
  return {
    realm: {
      id: realm.id,
      name: realm.name,
      minPower: realm.minPower,
      maxPower: realm.maxPower
    },
    stage: {
      name: stage
    },
    fullName: `${realm.name}${stage}`,
    title: realm.name
  };
}

export const XUANJIAN_BREAKTHROUGH_REQUIREMENTS = {
  'realm.taixi': {
    targetRealmId: 'realm.lianqi',
    requiredPower: 120,
    requiredAttainment: 0,
    requiredItems: []
  },
  'realm.lianqi': {
    targetRealmId: 'realm.zhuji',
    requiredPower: 420,
    requiredAttainment: 10,
    requiredItems: [{ definitionId: 'material.yellow_breakthrough_token', count: 1 }]
  },
  'realm.zhuji': {
    targetRealmId: 'realm.zifu',
    requiredPower: 1120,
    requiredAttainment: 10,
    requiredItems: [{ definitionId: 'material.mysterious_breakthrough_token', count: 1 }]
  }
} as const;

export function getBreakthroughRequirement(realmId: keyof typeof XUANJIAN_BREAKTHROUGH_REQUIREMENTS) {
  return XUANJIAN_BREAKTHROUGH_REQUIREMENTS[realmId];
}
```

- [ ] **Step 3: Expand service result types to carry the canonical data without breaking callers**

Add the new fields to `CultivationReward` and `CultivationStatusResult`, but keep old aliases during rollout:

```ts
export interface CultivationEncounterResult {
  type: 'none' | 'stones' | 'item' | 'combat';
  message: string | null;
  spiritStoneDelta: number;
  obtainedDefinitionIds: string[];
}

export interface CultivationReward {
  spiritualPower: number;
  immortalStones: number;
  cultivationAttainment: number;
  cultivationAttainmentDelta: number;
  mainMethodName: string;
  encounter: CultivationEncounterResult;
  fortuneEvent: {
    power: number;
    stones: number;
    message: string | null;
  };
  oldRealm?: string;
  newRealm: string;
  newStage: string;
  realmChanged: boolean;
  oldSpiritualPower?: number;
  newSpiritualPower: number;
  breakthroughReady: boolean;
}
```

This keeps `fortuneEvent` as a temporary alias so existing handler tests and CTDP mocks do not all break in the same commit.

- [ ] **Step 4: Turn `src/config/cultivation.ts` into a compatibility façade**

Do not force every importer to switch files in one commit. Re-export the new helpers behind the old API:

```ts
export {
  getCanonicalRealmByPower as getCurrentRealm,
  getCanonicalRealmStage as getRealmStage,
  formatCanonicalRealmDisplay as formatRealmDisplay
} from './xuanjianCanonical.js';
```

Keep legacy names only where handler/service code still expects them.

- [ ] **Step 5: Run the config and type-focused tests to confirm GREEN**

Run:

```bash
npx vitest run tests/unit/config/xuanjianCanonical.test.ts
npm run typecheck
```

Expected:

1. The new config tests pass.
2. TypeScript accepts the new `CultivationReward` and `CultivationStatusResult` contracts.

- [ ] **Step 6: Commit the canonical type/config layer**

```bash
git add src/types/cultivationCanonical.ts src/types/cultivation.ts src/types/services.ts src/config/xuanjianCanonical.ts src/config/cultivation.ts tests/unit/config/xuanjianCanonical.test.ts
git commit -m "feat: add xuanjian canonical cultivation config"
```

### Task 3: Persist canonical state alongside the legacy shell fields

**Files:**
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/types/models.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/models/User.ts`
- Create: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/services/CultivationStateAdapter.ts`
- Create: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/scripts/migrate-xuanjian-cultivation.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/package.json`
- Test: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/unit/services/CultivationStateAdapter.test.ts`

- [ ] **Step 1: Extend the model typing with a nested canonical snapshot**

Add a typed canonical subdocument instead of trying to flatten everything into the old shape:

```ts
export interface IUserCultivationCanonical {
  schemaVersion: 1;
  state: import('./cultivationCanonical.js').PlayerCultivationState;
  breakthrough: {
    targetRealm: import('./cultivationCanonical.js').RealmId;
    selectedBreakthroughMethodId: string | null;
    requirementProgress: Record<string, number>;
    hardConditionFlags: Record<string, boolean>;
    stabilityScore: number;
    attemptHistory: Array<{
      attemptedAt: Date;
      success: boolean;
      consumedDefinitionIds: string[];
    }>;
  } | null;
  inventory: import('./cultivationCanonical.js').InventoryInstance[];
}

export interface IUserCultivation {
  spiritualPower: number;
  realm: string;
  realmId: number;
  realmStage: string;
  immortalStones: number;
  canonical?: IUserCultivationCanonical;
}

export interface IUserMethods {
  ensureCanonicalCultivation(): IUserCultivationCanonical;
  syncLegacyCultivationShell(): UserDocument;
  grantInventoryDefinition(
    definitionId: string,
    sourceType: 'focus' | 'encounter' | 'migration' | 'admin'
  ): UserDocument;
  consumeInventoryDefinition(definitionId: string, count: number): boolean;
}
```

- [ ] **Step 2: Add schema defaults and user helpers for canonical state**

In `User.ts`, add schema defaults plus small helper methods:

```ts
userSchema.methods.ensureCanonicalCultivation = function ensureCanonicalCultivation(this: UserDocument) {
  if (!this.cultivation.canonical) {
    this.cultivation.canonical = deriveCanonicalSnapshotFromLegacy(this);
  }
  return this.cultivation.canonical;
};

userSchema.methods.syncLegacyCultivationShell = function syncLegacyCultivationShell(this: UserDocument) {
  const canonical = this.ensureCanonicalCultivation();
  const shell = toLegacyCultivationShell(canonical.state, this.cultivation.immortalStones);
  this.cultivation.spiritualPower = shell.spiritualPower;
  this.cultivation.realm = shell.realm;
  this.cultivation.realmId = shell.realmId;
  this.cultivation.realmStage = shell.realmStage;
  return this;
};

userSchema.methods.grantInventoryDefinition = function grantInventoryDefinition(
  this: UserDocument,
  definitionId: string,
  sourceType: 'focus' | 'encounter' | 'migration' | 'admin'
) {
  const canonical = this.ensureCanonicalCultivation();
  canonical.inventory.push({
    instanceId: `${definitionId}:${Date.now()}`,
    definitionId,
    obtainedAt: new Date(),
    sourceType,
    bound: false,
    used: false,
    stackCount: 1,
    instanceMeta: {}
  });
  return this;
};

userSchema.methods.consumeInventoryDefinition = function consumeInventoryDefinition(
  this: UserDocument,
  definitionId: string,
  count: number
) {
  const canonical = this.ensureCanonicalCultivation();
  let remaining = count;
  for (const item of canonical.inventory) {
    if (item.definitionId !== definitionId || item.used || remaining === 0) continue;
    const consumed = Math.min(item.stackCount, remaining);
    item.stackCount -= consumed;
    remaining -= consumed;
    if (item.stackCount === 0) item.used = true;
  }
  return remaining === 0;
};
```

Also add `grantInventoryDefinition` and `consumeInventoryDefinition` helpers so the service layer does not hand-roll array mutation every time.

- [ ] **Step 3: Implement the adapter that initializes canonical state for old users**

Create a focused adapter module instead of scattering fresh-start reset logic across the service:

```ts
export function getCanonicalRealmByLegacyPower(legacyPower: number) {
  void legacyPower;
  return getRealmById('realm.taixi');
}

export function getCanonicalPowerFromLegacy(legacyPower: number): number {
  void legacyPower;
  return 0;
}

export function toLegacyCultivationShell(state: PlayerCultivationState, immortalStones: number) {
  const realm = getRealmById(state.realmId);
  return {
    spiritualPower: state.currentPower,
    realm: realm.name,
    realmId: XUANJIAN_REALMS.findIndex((entry) => entry.id === state.realmId) + 1,
    realmStage: formatCanonicalStage(state.currentPower),
    immortalStones
  };
}

export function deriveCanonicalSnapshotFromLegacy(user: Pick<UserDocument, 'cultivation' | 'stats'>) {
  return {
    schemaVersion: 1,
    state: {
      realmId: getCanonicalRealmByLegacyPower(0).id,
      currentPower: getCanonicalPowerFromLegacy(0),
      mainMethodId: 'method.starter_tuna',
      mainDaoTrack: 'neutral',
      cultivationAttainment: 0,
      foundationId: 'foundation.unshaped',
      knownBattleArtIds: ['art.basic_guarding_hand', 'art.cloud_step'],
      equippedBattleArtIds: ['art.basic_guarding_hand', 'art.cloud_step'],
      knownDivinePowerIds: [],
      equippedDivinePowerIds: [],
      equipmentLoadout: {},
      inventoryItemIds: [],
      injuryState: { level: 'none', modifiers: [] },
      focusStreak: user.stats.currentStreak,
      lastCultivationAt: null,
      schemaVersion: 1
    },
    breakthrough: null,
    inventory: []
  };
}
```

The adapter should be the only place that knows the “玄鉴上线后统一新开局” rule.

- [ ] **Step 4: Add a migration script and npm entrypoint**

Add one script entry:

```json
{
  "scripts": {
    "migrate:xuanjian-cultivation": "tsx scripts/migrate-xuanjian-cultivation.ts"
  }
}
```

And implement a dry-run-friendly script:

```ts
for await (const user of User.find().cursor()) {
  user.ensureCanonicalCultivation();
  user.syncLegacyCultivationShell();
  if (!process.argv.includes('--dry-run')) {
    await user.save();
  }
}
```

Print migrated count, skipped count, and dry-run mode status.

- [ ] **Step 5: Run the adapter tests and a dry-run migration**

Run:

```bash
npx vitest run tests/unit/services/CultivationStateAdapter.test.ts
npm run migrate:xuanjian-cultivation -- --dry-run
```

Expected:

1. Adapter tests pass.
2. The migration script prints counts and exits without writing when `--dry-run` is present.

- [ ] **Step 6: Commit the persistence layer**

```bash
git add src/types/models.ts src/models/User.ts src/services/CultivationStateAdapter.ts scripts/migrate-xuanjian-cultivation.ts package.json tests/unit/services/CultivationStateAdapter.test.ts
git commit -m "feat: persist xuanjian canonical cultivation state"
```

### Task 4: Build pure reward, encounter, and breakthrough engines

**Files:**
- Create: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/services/CultivationRewardEngine.ts`
- Create: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/services/BreakthroughEngine.ts`
- Test: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/unit/services/CultivationRewardEngine.test.ts`
- Test: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/unit/services/BreakthroughEngine.test.ts`

- [ ] **Step 1: Implement a pure focus reward engine with the approved calculation order**

Create one pure function that does not talk to Mongo:

```ts
export function resolveFocusReward(input: {
  duration: number;
  rng: () => number;
  state: PlayerCultivationState;
}) {
  const baseValue = getDurationBaseValue(input.duration);
  const method = getMainMethodById(input.state.mainMethodId);
  const realm = getRealmById(input.state.realmId);
  const realmCoefficient = getRealmTemplateCoefficient(input.state.realmId);
  const attainmentMultiplier = getGeneralAttainmentMultiplier(input.state.cultivationAttainment);
  const sameSchoolMultiplier = getSameSchoolCultivationMultiplier(
    input.state.cultivationAttainment,
    input.state.mainDaoTrack,
    method.tags
  );
  const totalPowerGain = Math.floor(
    baseValue * realmCoefficient * method.cultivationMultiplier * attainmentMultiplier * sameSchoolMultiplier
  );

  return {
    realmName: realm.name,
    basePowerGain: baseValue,
    totalPowerGain,
    attainmentDelta: getFocusAttainmentDelta(input.state.focusStreak + 1),
    nextFocusStreak: input.state.focusStreak + 1,
    encounter: rollFocusEncounter(input.rng, input.state.realmId)
  };
}
```

`getFocusAttainmentDelta` must exactly implement:

1. `nextFocusStreak === 5` -> `+1`
2. `nextFocusStreak === 50` -> `+1`
3. `nextFocusStreak >= 100` -> `+1`

Use this helper instead of inlining the logic:

```ts
export function getFocusAttainmentDelta(nextFocusStreak: number): number {
  if (nextFocusStreak === 5) return 1;
  if (nextFocusStreak === 50) return 1;
  if (nextFocusStreak >= 100) return 1;
  return 0;
}
```

And keep encounter resolution as a helper with one exit path:

```ts
export function rollFocusEncounter(rng: () => number, realmId: RealmId) {
  const roll = rng();
  const table = realmId === 'realm.taixi' ? FOCUS_ENCOUNTER_TABLE : FOCUS_ENCOUNTER_TABLE;
  return table.find((entry) => roll <= entry.threshold)?.result ?? table[0]!.result;
}
```

- [ ] **Step 2: Implement a small V1 encounter table that changes stones and grants items, not main power**

Use a deterministic table with a single random roll:

```ts
const FOCUS_ENCOUNTER_TABLE = [
  { id: 'encounter.none', threshold: 0.78, result: { type: 'none', message: null, spiritStoneDelta: 0, obtainedDefinitionIds: [] } },
  { id: 'encounter.stones_gain', threshold: 0.88, result: { type: 'stones', message: '偶得灵石', spiritStoneDelta: 8, obtainedDefinitionIds: [] } },
  { id: 'encounter.stones_loss', threshold: 0.93, result: { type: 'stones', message: '护道花费', spiritStoneDelta: -5, obtainedDefinitionIds: [] } },
  { id: 'encounter.material_drop', threshold: 0.98, result: { type: 'item', message: '得到破境辅材', spiritStoneDelta: 0, obtainedDefinitionIds: ['material.yellow_breakthrough_token'] } },
  { id: 'encounter.pill_drop', threshold: 1, result: { type: 'item', message: '得到低阶丹药', spiritStoneDelta: 0, obtainedDefinitionIds: ['consumable.low_cultivation_pill'] } }
] as const;
```

The important rule is: this table can affect `spiritStoneDelta` and `inventory`, but not the primary multiplicative power gain.

- [ ] **Step 3: Implement deterministic breakthrough readiness and attempt resolution**

Use a rule engine, not a flat success-rate table:

```ts
export function evaluateBreakthroughReadiness(input: {
  currentRealmId: RealmId;
  currentPower: number;
  cultivationAttainment: number;
  mainMethodId: string;
  inventory: InventoryInstance[];
}) {
  const requirement = getBreakthroughRequirement(input.currentRealmId);
  const missing: string[] = [];
  if (input.currentPower < requirement.requiredPower) missing.push('requiredPower');
  if (!input.mainMethodId) missing.push('mainMethodId');
  if (input.cultivationAttainment < requirement.requiredAttainment) missing.push('cultivationAttainment');
  for (const requiredItem of requirement.requiredItems) {
    const owned = input.inventory
      .filter((item) => item.definitionId === requiredItem.definitionId && !item.used)
      .reduce((sum, item) => sum + item.stackCount, 0);
    if (owned < requiredItem.count) missing.push(requiredItem.definitionId);
  }
  return {
    ready: missing.length === 0,
    missing,
    targetRealmId: requirement.targetRealmId
  };
}
```

The V1 attempt function should:

1. refuse if `ready === false`
2. consume required items
3. move the player to the next realm
4. reset `breakthrough` state
5. grant `power.zifu_first_light` on `realm.zifu` entry if the player has none

- [ ] **Step 4: Run the engine tests to confirm GREEN**

Run:

```bash
npx vitest run tests/unit/services/CultivationRewardEngine.test.ts tests/unit/services/BreakthroughEngine.test.ts
```

Expected:

1. Focus reward tests pass with exact duration and attainment anchors.
2. Breakthrough tests pass without any RNG-based success table.

- [ ] **Step 5: Commit the pure engines**

```bash
git add src/services/CultivationRewardEngine.ts src/services/BreakthroughEngine.ts tests/unit/services/CultivationRewardEngine.test.ts tests/unit/services/BreakthroughEngine.test.ts
git commit -m "feat: add xuanjian cultivation reward and breakthrough engines"
```

### Task 5: Refactor CultivationService and TaskService around canonical state

**Files:**
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/services/CultivationService.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/services/TaskService.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/cultivation.test.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/unit/services/TaskService.test.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/unit/services/TaskService-ctdp-boundary.test.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/integration/ctdp-reservation-flow.test.ts`

- [ ] **Step 1: Ensure every cultivation service entrypoint hydrates or creates canonical state**

At the start of each mutating method:

```ts
const user = await User.findOne({ userId });
if (!user) throw new Error('用户不存在');
const canonical = user.ensureCanonicalCultivation();
```

Do not read `user.cultivation.spiritualPower` as the source of truth anymore once canonical exists.

- [ ] **Step 2: Rewrite `awardCultivation` to use the new reward engine**

The target flow inside `CultivationService.awardCultivation` should be:

```ts
const canonical = user.ensureCanonicalCultivation();
const resolution = resolveFocusReward({
  duration,
  rng: Math.random,
  state: canonical.state
});

canonical.state.currentPower += resolution.totalPowerGain;
canonical.state.cultivationAttainment += resolution.attainmentDelta;
canonical.state.focusStreak = resolution.nextFocusStreak;
canonical.state.lastCultivationAt = new Date();

user.addImmortalStones(resolution.encounter.spiritStoneDelta);
for (const definitionId of resolution.encounter.obtainedDefinitionIds) {
  user.grantInventoryDefinition(definitionId, 'focus');
}

user.syncLegacyCultivationShell();
await user.save();
```

Return both the new canonical fields and the compatibility aliases:

```ts
return {
  spiritualPower: resolution.totalPowerGain,
  immortalStones: resolution.encounter.spiritStoneDelta,
  cultivationAttainment: canonical.state.cultivationAttainment,
  cultivationAttainmentDelta: resolution.attainmentDelta,
  mainMethodName: getMainMethodById(canonical.state.mainMethodId).name,
  encounter: resolution.encounter,
  fortuneEvent: {
    power: 0,
    stones: resolution.encounter.spiritStoneDelta,
    message: resolution.encounter.message
  },
  newRealm: getRealmById(canonical.state.realmId).name,
  newStage: formatCanonicalStage(canonical.state.currentPower),
  realmChanged,
  newSpiritualPower: user.cultivation.spiritualPower,
  breakthroughReady: evaluateBreakthroughReadiness({
    currentRealmId: canonical.state.realmId,
    currentPower: canonical.state.currentPower,
    cultivationAttainment: canonical.state.cultivationAttainment,
    mainMethodId: canonical.state.mainMethodId,
    inventory: canonical.inventory
  }).ready
};
```

- [ ] **Step 3: Rewrite `getCultivationStatus` and `attemptBreakthrough` to read canonical state**

`getCultivationStatus` should expose both display info and state info:

```ts
const display = formatCanonicalRealmDisplay(canonical.state);

return {
  user,
  realm: display.realm,
  fullName: display.fullName,
  title: display.title,
  cultivationAttainment: canonical.state.cultivationAttainment,
  mainMethodName: getMainMethodById(canonical.state.mainMethodId).name,
  knownBattleArtCount: canonical.state.knownBattleArtIds.length,
  knownDivinePowerCount: canonical.state.knownDivinePowerIds.length,
  canBreakthrough: readiness.ready
};
```

`attemptBreakthrough` should call the deterministic engine and never use `currentRealm.breakthrough.successRate`.

- [ ] **Step 4: Update task-service tests and mocks to match the new reward payload**

Replace old mock payloads like this:

```ts
cultivationService = {
  awardCultivation: vi.fn().mockResolvedValue({
    spiritualPower: 2,
    immortalStones: 8,
    cultivationAttainment: 1,
    cultivationAttainmentDelta: 1,
    mainMethodName: '玄门吐纳法',
    encounter: {
      type: 'stones',
      message: '偶得灵石',
      spiritStoneDelta: 8,
      obtainedDefinitionIds: []
    },
    fortuneEvent: {
      power: 0,
      stones: 8,
      message: '偶得灵石'
    },
    newRealm: '胎息',
    newStage: '玄景',
    newSpiritualPower: 2,
    realmChanged: false,
    breakthroughReady: false
  })
};
```

This keeps `TaskService` green while the handler layer is still being updated.

- [ ] **Step 5: Run the service and integration regression tests**

Run:

```bash
npx vitest run tests/cultivation.test.ts tests/unit/services/TaskService.test.ts tests/unit/services/TaskService-ctdp-boundary.test.ts tests/integration/ctdp-reservation-flow.test.ts
```

Expected:

1. Focus completion still integrates through `TaskService`.
2. Canonical reward payloads no longer depend on the old `bonus + fortuneEvent.power` model.
3. CTDP reservation integration still accepts the cultivation reward shape.

- [ ] **Step 6: Commit the service refactor**

```bash
git add src/services/CultivationService.ts src/services/TaskService.ts tests/cultivation.test.ts tests/unit/services/TaskService.test.ts tests/unit/services/TaskService-ctdp-boundary.test.ts tests/integration/ctdp-reservation-flow.test.ts
git commit -m "refactor: route cultivation services through xuanjian runtime"
```

### Task 6: Update command handlers and normalize divination semantics

**Files:**
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/models/DivinationHistory.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/services/CultivationService.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/handlers/taskCommands.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/handlers/cultivationCommands.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/handlers/coreCommands.ts`
- Create: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/unit/handlers/cultivationCommands.test.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/unit/handlers/taskCommands.test.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/unit/handlers/coreCommands.test.ts`

- [ ] **Step 1: Update the task completion message to expose canonical gains instead of the old bonus model**

The canonical completion message should look like this:

```ts
let message = '✅ 闭关修炼结束！\n\n';
message += `⏰ 实际时长：${result.task.actualDuration ?? 0} 分钟\n`;
message += `\n⚡ 获得修为：${reward.spiritualPower} 点`;
message += `\n🧭 道行变化：+${reward.cultivationAttainmentDelta}`;
message += `\n💎 灵石变化：${reward.immortalStones >= 0 ? '+' : ''}${reward.immortalStones}`;
message += `\n📘 主修功法：${reward.mainMethodName}`;
if (reward.encounter.message) {
  message += `\n\n${reward.encounter.message}`;
}
if (reward.breakthroughReady) {
  message += '\n\n🌩️ 破境条件已满足，可使用 /breakthrough 尝试突破。';
}
```

Do not mention `x1.5 顿悟倍率` or `额外灵力` anymore.

- [ ] **Step 2: Update `/realm` and `/start` copy to show the xuanjian system**

Use state-page lines like:

```ts
message += `📊 当前境界：${status.fullName}\n`;
message += `⚡ 当前修为：${status.user.cultivation.spiritualPower}\n`;
message += `🧭 当前道行：${status.cultivationAttainment}\n`;
message += `📘 主修功法：${status.mainMethodName}\n`;
message += `🗂 已习法门：${status.knownBattleArtCount}\n`;
message += `✨ 已掌神通：${status.knownDivinePowerCount}\n`;
message += `💎 灵石：${status.immortalStones}\n`;
```

And change `/start` help copy to:

```ts
'胎息 → 练气 → 筑基 → 紫府 → 金丹 → 元婴'
```

- [ ] **Step 3: Normalize `/divination` so it only moves stones and history, not power**

In `CultivationService.castDivination`, remove `powerChange` mutations:

```ts
user.cultivation.immortalStones += result;
user.ensureCanonicalCultivation();
user.syncLegacyCultivationShell();
```

And persist `powerBefore === powerAfter` in `DivinationHistory`:

```ts
powerBefore: user.cultivation.spiritualPower,
powerAfter: user.cultivation.spiritualPower,
realmBefore: user.cultivation.realm,
realmAfter: user.cultivation.realm,
realmChanged: false
```

This prevents `/divination` from bypassing the “专注是主修为来源” rule.

- [ ] **Step 4: Add and update handler tests**

Create a handler test file with assertions like:

```ts
expect(bot.sendMessage).toHaveBeenCalledWith(
  chatId,
  expect.stringContaining('🧭 当前道行：'),
);

expect(bot.sendMessage).toHaveBeenCalledWith(
  chatId,
  expect.stringContaining('胎息 → 练气 → 筑基 → 紫府 → 金丹 → 元婴'),
  expect.any(Object)
);
```

Update the task command tests to assert `道行变化` and `灵石变化`, not `额外灵力`.

- [ ] **Step 5: Run the handler-focused tests**

Run:

```bash
npx vitest run tests/unit/handlers/taskCommands.test.ts tests/unit/handlers/cultivationCommands.test.ts tests/unit/handlers/coreCommands.test.ts
```

Expected:

1. Completion copy matches the canonical reward shape.
2. Realm/status copy exposes `cultivationAttainment` and main method.
3. `/start` no longer advertises the old nine-realm ladder.

- [ ] **Step 6: Commit the user-facing integration**

```bash
git add src/models/DivinationHistory.ts src/services/CultivationService.ts src/handlers/taskCommands.ts src/handlers/cultivationCommands.ts src/handlers/coreCommands.ts tests/unit/handlers/taskCommands.test.ts tests/unit/handlers/cultivationCommands.test.ts tests/unit/handlers/coreCommands.test.ts
git commit -m "feat: expose xuanjian canonical cultivation in commands"
```

### Task 7: Run full verification and migration handoff

**Files:**
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/docs/cultivation/xuanjian-dev-manual.md`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/README.md`

- [ ] **Step 1: Sync operator docs with the actual runtime entrypoints**

Add the implementation paths and script names that now exist:

```md
- Canonical config: `src/config/xuanjianCanonical.ts`
- Runtime state adapter: `src/services/CultivationStateAdapter.ts`
- Reward engine: `src/services/CultivationRewardEngine.ts`
- Breakthrough engine: `src/services/BreakthroughEngine.ts`
- Migration command: `npm run migrate:xuanjian-cultivation -- --dry-run`
```

- [ ] **Step 2: Run the complete validation set**

Run:

```bash
npm run typecheck
npm run build
npm test
git diff --check
```

Expected:

1. TypeScript passes with the new canonical state.
2. Build passes.
3. All Vitest suites pass.
4. No trailing whitespace or malformed patch output remains.

- [ ] **Step 3: Run the migration dry-run one last time against the real schema**

Run:

```bash
npm run migrate:xuanjian-cultivation -- --dry-run
```

Expected:

1. Existing users can be adapted without throwing.
2. The script reports how many users already had canonical state.
3. No persisted writes happen during dry-run.

- [ ] **Step 4: Commit the docs and verification sweep**

```bash
git add docs/cultivation/xuanjian-dev-manual.md README.md
git commit -m "docs: document xuanjian canonical runtime rollout"
```

## Acceptance Checklist

The implementation is complete when all of these are true:

1. Completing a focus task changes canonical `currentPower` and only then syncs legacy `spiritualPower`.
2. `cultivationAttainment` is stored, displayed, and grows from focus streak milestones.
3. Spirit stone gain/loss comes from encounter resolution or divination, not from the base focus formula.
4. At least one starter main method, one foundation, two battle arts, one divine power, and three breakthrough artifacts exist in static config.
5. `attemptBreakthrough` uses deterministic readiness rules and consumes configured materials.
6. `/realm` and task completion messages show canonical data such as main method and `cultivationAttainment`.
7. `/divination` no longer mutates power.
8. Existing users can be adapted by the migration script without manual database edits.
