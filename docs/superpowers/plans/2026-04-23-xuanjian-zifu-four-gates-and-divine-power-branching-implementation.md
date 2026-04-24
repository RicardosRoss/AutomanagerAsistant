# 玄鉴紫府四关与后续神通冲关 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `筑基 -> 紫府` 升级为真实四关流程，并补上紫府内后续神通冲关的最小 branch 闭环，同时保持首神通自动映射与后续 `branchChoice` 分层。

**Architecture:** 沿用现有 `xuanjianCanonical -> BreakthroughEngine -> CultivationService` 主链，不新开第二套突破系统。第一段先把静态定义和首入紫府四关做实，再在同一套引擎上补 `zifu_divine_power` 尝试类型、`branchChoice / branchProofs` 校验和最小成功/失败闭环。复杂互斥、求金/求闰明确延后，不在本轮 runtime 引入。

**Tech Stack:** TypeScript, Node.js ESM, Mongoose, Vitest, Telegram Bot API

---

## Scope Check

这份 spec 覆盖两个紧耦合子系统：

1. `筑基 -> 紫府` 四关与首神通自动映射
2. `紫府内新增神通` 的最小 branch 闭环

它们共享同一组类型、配置和服务链路，不适合拆成两份独立计划。实现顺序固定为：

1. 静态模型
2. 首入紫府四关
3. 后续神通冲关最小闭环
4. 文档与回归验证

## File Map

**Canonical contracts and static content**

- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/types/cultivationCanonical.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/types/models.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/config/xuanjianCanonical.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/config/xuanjianV2Registry.ts`

**Breakthrough runtime**

- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/services/BreakthroughEngine.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/services/CultivationService.ts`

**Docs**

- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/docs/cultivation/xuanjian-dev-manual.md`

**Tests**

- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/unit/config/xuanjianCanonical.test.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/unit/config/xuanjianV2Registry.test.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/unit/services/BreakthroughEngine.test.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/integration/xuanjian-task-cultivation-flow.test.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/unit/services/CultivationMigration.test.ts`

## Implementation Rules

1. `selectedBreakthroughMethodId` 继续只表示“这次怎么破”，不得反向决定首神通或后续 branch 目标。
2. 首入紫府的首神通必须只由 `foundationId -> firstDivinePowerId` 映射得到。
3. `branchChoice / branchProofs` 只在 `zifu_divine_power` 启用；`realm_zhuji_to_zifu` 必须忽略它们。
4. 本轮失败后果只允许损伤 `currentPower / cultivationAttainment`，不引入立死、删号、废基或复杂长期 debuff。
5. 第三到第五道神通的复杂互斥、以及 `紫府 -> 金丹` 的求金/求闰，本轮明确不做。

## Task 1: Extend canonical contracts and static definitions first

**Files:**
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/types/cultivationCanonical.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/types/models.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/config/xuanjianCanonical.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/config/xuanjianV2Registry.ts`
- Test: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/unit/config/xuanjianCanonical.test.ts`
- Test: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/unit/config/xuanjianV2Registry.test.ts`

- [ ] **Step 1: Write the failing config tests for foundation mapping, attempt kind scaffolding, and branch storage**

Append to `tests/unit/config/xuanjianCanonical.test.ts`:

```ts
test('exposes deterministic first divine powers for zhuji foundations', () => {
  expect(getFoundationById('foundation.zhuji_mingyang')).toMatchObject({
    id: 'foundation.zhuji_mingyang',
    firstDivinePowerId: 'power.invoking_heaven_gate'
  });
  expect(getFoundationById('foundation.zhuji_lihuo')).toMatchObject({
    id: 'foundation.zhuji_lihuo',
    firstDivinePowerId: 'power.great_departure_book'
  });
});

test('defines zifu divine power breakthrough transition and follow-up requirements', () => {
  expect(getBreakthroughMethodById('breakthrough.zifu_divine_power_base')?.applicableTransition).toBe('zifu_divine_power');
  expect(getDivinePowerBreakthroughRequirement(2)).toMatchObject({
    targetPowerOrdinal: 2,
    requiredPower: 1360
  });
});
```

Append to `tests/unit/config/xuanjianV2Registry.test.ts`:

```ts
test('projects zifu acquisition metadata for follow-up divine powers', () => {
  expect(getDivinePowerRegistryEntry('power.clear_heart')).toMatchObject({
    id: 'power.clear_heart',
    zifuAcquisition: {
      minExistingPowerCount: 1,
      proofRequirementIds: ['proof.mingyang_fate_anchor']
    }
  });
});
```

Expected: FAIL because `getFoundationById`, `getDivinePowerBreakthroughRequirement`, `zifu_divine_power`, and `zifuAcquisition` do not exist yet.

- [ ] **Step 2: Run the focused config tests to verify they fail**

Run:

```bash
yarn vitest run tests/unit/config/xuanjianCanonical.test.ts tests/unit/config/xuanjianV2Registry.test.ts
```

Expected: FAIL with missing exports and missing registry fields.

- [ ] **Step 3: Add the new canonical types and state contract**

In `src/types/cultivationCanonical.ts`, add the new contracts:

```ts
export type BreakthroughTransitionId =
  | 'taixi_to_lianqi'
  | 'lianqi_to_zhuji'
  | 'zhuji_to_zifu'
  | 'zifu_divine_power';

export type BreakthroughAttemptKind =
  | 'realm_zhuji_to_zifu'
  | 'zifu_divine_power';

export interface FoundationDefinition {
  id: string;
  name: string;
  mainDaoTrack: SpecializedLineageId;
  firstDivinePowerId: string;
}

export interface DivinePowerBreakthroughRequirement {
  id: string;
  targetPowerOrdinal: 2 | 3 | 4 | 5;
  requiredPower: number;
  requiredAttainment: number;
  requiredItems: Array<{ definitionId: string; count: number }>;
}

export interface BreakthroughGateResolution {
  id: 'lift_foundation' | 'cross_illusion' | 'gestate_power' | 'enter_taixu' | 'shape_aux_foundation' | 'gestate_target_power';
  passed: boolean;
}
```

In `src/types/models.ts`, expand the mixed breakthrough contract so service code and tests stop relying on untyped branch fields:

```ts
breakthrough: {
  targetRealm: import('./cultivationCanonical.js').RealmId;
  selectedBreakthroughMethodId: string | null;
  requirementProgress: Record<string, number>;
  hardConditionFlags: Record<string, boolean>;
  branchChoice?: string | null;
  branchProofs?: Record<string, boolean>;
  stabilityScore: number;
  attemptHistory: Array<{
    attemptedAt: Date;
    success: boolean;
    consumedDefinitionIds: string[];
  }>;
} | null;
```

- [ ] **Step 4: Add foundations, zifu coverage, follow-up requirements, and branch-ready divine power metadata**

In `src/config/xuanjianCanonical.ts`, add deterministic foundation definitions and follow-up helpers:

```ts
const XUANJIAN_FOUNDATIONS: FoundationDefinition[] = [
  { id: 'foundation.zhuji_mingyang', name: '明阳道基', mainDaoTrack: 'mingyang', firstDivinePowerId: 'power.invoking_heaven_gate' },
  { id: 'foundation.zhuji_lihuo', name: '离火道基', mainDaoTrack: 'lihuo', firstDivinePowerId: 'power.great_departure_book' },
  { id: 'foundation.zhuji_duijin', name: '兑金道基', mainDaoTrack: 'duijin', firstDivinePowerId: 'power.asking_two_forgetfulness' },
  { id: 'foundation.zhuji_pinshui', name: '牝水道基', mainDaoTrack: 'pinshui', firstDivinePowerId: 'power.southern_sorrow_water' },
  { id: 'foundation.zhuji_zhengmu', name: '正木道基', mainDaoTrack: 'zhengmu', firstDivinePowerId: 'power.hundred_bodies' }
];

const ZIFU_DIVINE_POWER_REQUIREMENTS: DivinePowerBreakthroughRequirement[] = [
  {
    id: 'requirement.zifu_power_2',
    targetPowerOrdinal: 2,
    requiredPower: 1360,
    requiredAttainment: 18,
    requiredItems: [{ definitionId: 'material.zifu_second_power_token', count: 1 }]
  }
];

export function getFoundationById(id: string) {
  return XUANJIAN_FOUNDATIONS.find((entry) => entry.id === id) ?? null;
}

export function resolveFirstDivinePowerFromFoundation(foundationId: string) {
  return getFoundationById(foundationId)?.firstDivinePowerId ?? null;
}

export function getDivinePowerBreakthroughRequirement(targetPowerOrdinal: 2 | 3 | 4 | 5) {
  return ZIFU_DIVINE_POWER_REQUIREMENTS.find((entry) => entry.targetPowerOrdinal === targetPowerOrdinal) ?? null;
}
```

Also extend the zhuji methods with minimal coverage:

```ts
{
  id: 'method.zhuji_mingyang_script',
  name: '上府明谒经',
  category: 'main_method',
  tier: '玄',
  realmFloor: 'realm.zhuji',
  realmCeiling: 'realm.zifu',
  source: 'runtime.seed',
  tags: ['mingyang', 'zhuji'],
  dropScope: 'heritage',
  enabledInV1: false,
  reservedForV2: false,
  grade: 5,
  cultivationMultiplier: 1.08,
  combatBias: { attack: 1, defense: 0, sense: 1, speed: 0 },
  foundationAffinity: ['foundation.zhuji_mingyang'],
  artSlotsBonus: 0,
  divinePowerSlotsBonus: 0,
  breakthroughAssist: [],
  requiredAura: [],
  lineageTag: 'mingyang',
  zifuPowerCoverage: {
    candidatePowerIds: ['power.clear_heart', 'power.long_bright_steps', 'power.imperial_gaze_origin'],
    maxPowerCount: 5
  }
}
```

In `src/config/xuanjianCanonical.ts`, add the follow-up process method:

```ts
{
  id: 'breakthrough.zifu_divine_power_base',
  name: '续神凝基术',
  applicableTransition: 'zifu_divine_power',
  successRateBonus: 0,
  stabilityDelta: 0,
  requiredItems: []
}
```

In `src/config/xuanjianV2Registry.ts`, extend `DivinePowerRegistryEntry` and seed one follow-up target:

```ts
export interface DivinePowerRegistryEntry {
  id: string;
  runtimeReady: boolean;
  category: 'burst' | 'control' | 'ward' | 'domain';
  tags: string[];
  lineageTag?: LineageId;
  requiredRealmId: RealmId;
  requiredRealmSubStageId?: string;
  zifuAcquisition?: {
    minExistingPowerCount: number;
    proofRequirementIds?: string[];
  };
}

{
  id: 'power.clear_heart',
  runtimeReady: true,
  category: 'control',
  tags: ['zifu', 'mingyang', 'fate'],
  requiredRealmId: 'realm.zifu',
  zifuAcquisition: {
    minExistingPowerCount: 1,
    proofRequirementIds: ['proof.mingyang_fate_anchor']
  }
}
```

- [ ] **Step 5: Run the config tests to verify the scaffolding passes**

Run:

```bash
yarn vitest run tests/unit/config/xuanjianCanonical.test.ts tests/unit/config/xuanjianV2Registry.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit the static-model scaffold**

```bash
git add src/types/cultivationCanonical.ts src/types/models.ts src/config/xuanjianCanonical.ts src/config/xuanjianV2Registry.ts tests/unit/config/xuanjianCanonical.test.ts tests/unit/config/xuanjianV2Registry.test.ts
git commit -m "feat: scaffold zifu four-gate breakthrough contracts"
```

## Task 2: Implement four-gate `zhuji -> zifu` resolution in `BreakthroughEngine`

**Files:**
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/services/BreakthroughEngine.ts`
- Test: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/unit/services/BreakthroughEngine.test.ts`

- [ ] **Step 1: Add failing unit tests for four-gate success and failure with losses**

Append to `tests/unit/services/BreakthroughEngine.test.ts`:

```ts
test('zhuji to zifu uses foundation mapping for the first divine power instead of breakthrough bonus outcomes', () => {
  const result = resolveBreakthroughAttempt({
    attemptKind: 'realm_zhuji_to_zifu',
    currentRealmId: 'realm.zhuji',
    currentPower: 1120,
    cultivationAttainment: 12,
    mainMethodId: 'method.zhuji_mingyang_script',
    mainDaoTrack: 'mingyang',
    foundationId: 'foundation.zhuji_mingyang',
    selectedBreakthroughMethodId: 'breakthrough.zhuji_to_zifu_base',
    knownDivinePowerIds: [],
    hardConditionFlags: {},
    inventory: []
  });

  expect(result.success).toBe(true);
  expect(result.updatedKnownDivinePowerIds).toContain('power.invoking_heaven_gate');
  expect(result.breakthroughResolution.attemptKind).toBe('realm_zhuji_to_zifu');
  expect(result.breakthroughResolution.gates.map((gate) => gate.id)).toEqual([
    'lift_foundation',
    'cross_illusion',
    'gestate_power',
    'enter_taixu'
  ]);
});

test('failed zhuji to zifu attempt applies power and attainment loss without changing realm', () => {
  const result = resolveBreakthroughAttempt({
    attemptKind: 'realm_zhuji_to_zifu',
    currentRealmId: 'realm.zhuji',
    currentPower: 1120,
    cultivationAttainment: 12,
    mainMethodId: 'method.zhuji_mingyang_script',
    mainDaoTrack: 'mingyang',
    foundationId: 'foundation.zhuji_mingyang',
    selectedBreakthroughMethodId: 'breakthrough.zhuji_to_zifu_base',
    knownDivinePowerIds: [],
    hardConditionFlags: {
      'gate.cross_illusion.force_fail': true
    },
    inventory: []
  });

  expect(result.success).toBe(false);
  expect(result.reason).toBe('attempt_failed');
  expect(result.nextRealmId).toBe('realm.zhuji');
  expect(result.powerLossApplied).toBeGreaterThan(0);
  expect(result.attainmentLossApplied).toBeGreaterThan(0);
  expect(result.failedGateId).toBe('cross_illusion');
});
```

Expected: FAIL because `attemptKind`, gate summaries, and failure-with-loss results do not exist.

- [ ] **Step 2: Run the BreakthroughEngine tests to verify they fail**

Run:

```bash
yarn vitest run tests/unit/services/BreakthroughEngine.test.ts
```

Expected: FAIL with type errors or missing properties like `attemptKind` and `gates`.

- [ ] **Step 3: Introduce attempt-kind aware readiness and four-gate summaries**

In `src/services/BreakthroughEngine.ts`, extend the public contracts:

```ts
export interface ResolveBreakthroughAttemptInput {
  attemptKind?: BreakthroughAttemptKind;
  currentRealmId: RealmId;
  currentPower: number;
  cultivationAttainment: number;
  mainMethodId: string;
  mainDaoTrack?: string | null;
  foundationId?: string | null;
  selectedBreakthroughMethodId?: string | null;
  inventory: InventoryInstance[];
  knownDivinePowerIds: string[];
  hardConditionFlags?: Record<string, boolean>;
  branchChoice?: string | null;
  branchProofs?: Record<string, boolean>;
}

export interface BreakthroughResolutionSummary {
  attemptKind: BreakthroughAttemptKind;
  methodId: string | null;
  targetDivinePowerId: string | null;
  gates: BreakthroughGateResolution[];
  failedGateId: string | null;
  powerLossApplied: number;
  attainmentLossApplied: number;
  successRateApplied: number;
  consumedDefinitionIds: string[];
  sideEffectsApplied: string[];
  bonusOutcomeIds: string[];
}
```

Also introduce a dedicated failure reason:

```ts
reason: 'not_ready' | 'max_realm' | 'missing_requirement' | 'attempt_failed';
```

- [ ] **Step 4: Implement first-zifu gate resolution and deterministic first-power grant**

Add helpers in `BreakthroughEngine.ts`:

```ts
function resolveAttemptKind(input: ResolveBreakthroughAttemptInput): BreakthroughAttemptKind {
  if (input.attemptKind) return input.attemptKind;
  return input.currentRealmId === 'realm.zhuji' ? 'realm_zhuji_to_zifu' : 'zifu_divine_power';
}

function buildSuccessfulGates(ids: BreakthroughGateResolution['id'][]): BreakthroughGateResolution[] {
  return ids.map((id) => ({ id, passed: true }));
}

function buildFailedGateSequence(
  ids: BreakthroughGateResolution['id'][],
  failedGateId: BreakthroughGateResolution['id']
) {
  return ids.map((id) => ({ id, passed: id !== failedGateId && ids.indexOf(id) < ids.indexOf(failedGateId) }));
}
```

Then replace the old zifu success bonus-path with deterministic first-power grant:

```ts
if (attemptKind === 'realm_zhuji_to_zifu') {
  const firstDivinePowerId = resolveFirstDivinePowerFromFoundation(input.foundationId ?? '');
  if (!firstDivinePowerId) {
    return readinessFailure('missing_requirement', ['firstDivinePowerId']);
  }

  if (input.hardConditionFlags?.['gate.cross_illusion.force_fail'] === true) {
    return {
      success: false,
      reason: 'attempt_failed',
      targetRealmId: 'realm.zhuji',
      nextRealmId: 'realm.zhuji',
      powerLossApplied: 80,
      attainmentLossApplied: 3,
      failedGateId: 'cross_illusion',
      breakthroughResolution: {
        attemptKind,
        methodId: breakthroughMethodId ?? null,
        targetDivinePowerId: firstDivinePowerId,
        gates: buildFailedGateSequence(['lift_foundation', 'cross_illusion', 'gestate_power', 'enter_taixu'], 'cross_illusion'),
        failedGateId: 'cross_illusion',
        powerLossApplied: 80,
        attainmentLossApplied: 3,
        successRateApplied: 1 + (breakthroughMethod?.successRateBonus ?? 0),
        consumedDefinitionIds,
        sideEffectsApplied: [...(breakthroughMethod?.sideEffects ?? [])],
        bonusOutcomeIds: []
      }
    };
  }

  if (!updatedKnownDivinePowerIds.includes(firstDivinePowerId)) {
    updatedKnownDivinePowerIds.push(firstDivinePowerId);
  }
}
```

- [ ] **Step 5: Run the BreakthroughEngine tests to verify first-zifu four-gate behavior passes**

Run:

```bash
yarn vitest run tests/unit/services/BreakthroughEngine.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit the four-gate engine changes**

```bash
git add src/services/BreakthroughEngine.ts tests/unit/services/BreakthroughEngine.test.ts
git commit -m "feat: add four-gate zifu breakthrough resolution"
```

## Task 3: Integrate four-gate state persistence and user-facing results in `CultivationService`

**Files:**
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/services/CultivationService.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/integration/xuanjian-task-cultivation-flow.test.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/unit/services/CultivationMigration.test.ts`

- [ ] **Step 1: Add failing integration tests for zifu breakthrough success and failure persistence**

Append to `tests/integration/xuanjian-task-cultivation-flow.test.ts`:

```ts
it('persists first divine power and gate summary when zhuji to zifu succeeds', async () => {
  const result = await cultivationService.attemptBreakthrough(userId);
  const reloaded = await User.findOne({ userId });
  const canonical = reloaded!.cultivation.canonical!;

  expect(result.success).toBe(true);
  expect(canonical.state.realmId).toBe('realm.zifu');
  expect(canonical.state.knownDivinePowerIds).toContain('power.invoking_heaven_gate');
  expect(result.message).toContain('四关');
});

it('applies power and attainment loss when zhuji to zifu fails at a gate', async () => {
  canonical.breakthrough!.hardConditionFlags = { 'gate.cross_illusion.force_fail': true };
  await user.save();

  const result = await cultivationService.attemptBreakthrough(userId);
  const reloaded = await User.findOne({ userId });
  const nextCanonical = reloaded!.cultivation.canonical!;

  expect(result.success).toBe(false);
  expect(nextCanonical.state.realmId).toBe('realm.zhuji');
  expect(nextCanonical.state.currentPower).toBeLessThan(1120);
  expect(nextCanonical.state.cultivationAttainment).toBeLessThan(12);
});
```

Append to `tests/unit/services/CultivationMigration.test.ts`:

```ts
test('normalizePhaseAState backfills branchChoice and branchProofs for older canonical breakthrough state', () => {
  const changed = service['normalizePhaseAState'](canonicalWithoutBranchFields);
  expect(changed).toBe(true);
  expect(canonicalWithoutBranchFields.breakthrough?.branchChoice).toBeNull();
  expect(canonicalWithoutBranchFields.breakthrough?.branchProofs).toEqual({});
});

test('normalizePhaseAState does not recompute first divine power for existing zifu users', () => {
  canonical.state.realmId = 'realm.zifu';
  canonical.state.foundationId = 'foundation.zhuji_mingyang';
  canonical.state.knownDivinePowerIds = ['power.clear_heart'];

  service['normalizePhaseAState'](canonical);

  expect(canonical.state.knownDivinePowerIds).toEqual(['power.clear_heart']);
});
```

Expected: FAIL because service does not persist losses or backfill branch fields yet.

- [ ] **Step 2: Run the integration and migration tests to verify they fail**

Run:

```bash
yarn vitest run tests/integration/xuanjian-task-cultivation-flow.test.ts tests/unit/services/CultivationMigration.test.ts
```

Expected: FAIL with unchanged realm/power or missing `branchChoice` defaults.

- [ ] **Step 3: Backfill branch fields and persist gate-based success/failure**

In `src/services/CultivationService.ts`, update `normalizePhaseAState`:

```ts
if (canonical.breakthrough) {
  if (!Object.prototype.hasOwnProperty.call(canonical.breakthrough, 'branchChoice')) {
    canonical.breakthrough.branchChoice = null;
    changed = true;
  }
  if (!canonical.breakthrough.branchProofs) {
    canonical.breakthrough.branchProofs = {};
    changed = true;
  }
}
```

Then update `attemptBreakthrough()` so success and failure both write back canonical state:

```ts
const result = resolveBreakthroughAttempt({
  attemptKind: canonical.state.realmId === 'realm.zhuji' ? 'realm_zhuji_to_zifu' : 'zifu_divine_power',
  currentRealmId: canonical.state.realmId,
  currentPower: canonical.state.currentPower,
  cultivationAttainment: canonical.state.cultivationAttainment,
  mainMethodId: canonical.state.mainMethodId,
  mainDaoTrack: canonical.state.mainDaoTrack,
  foundationId: canonical.state.foundationId,
  selectedBreakthroughMethodId: canonical.breakthrough?.selectedBreakthroughMethodId ?? null,
  inventory: canonical.inventory,
  knownDivinePowerIds: canonical.state.knownDivinePowerIds,
  hardConditionFlags: canonical.breakthrough?.hardConditionFlags ?? {},
  branchChoice: canonical.breakthrough?.branchChoice ?? null,
  branchProofs: canonical.breakthrough?.branchProofs ?? {}
});

if (!result.success && result.reason === 'attempt_failed') {
  canonical.state.currentPower = Math.max(getRealmById(canonical.state.realmId).minPower, canonical.state.currentPower - result.powerLossApplied);
  canonical.state.cultivationAttainment = Math.max(0, canonical.state.cultivationAttainment - result.attainmentLossApplied);
  user.recordBreakthrough(false);
  user.replaceCanonicalCultivation(canonical);
  await user.save();

  return {
    success: false,
    message: `⚠️ 紫府四关受挫：${result.failedGateId}\n修为 -${result.powerLossApplied}，道行 -${result.attainmentLossApplied}`,
    penalty: result.powerLossApplied,
    realmDemoted: false,
    newRealm: getRealmById(canonical.state.realmId).name,
    currentPower: canonical.state.currentPower
  };
}
```

Also enrich the success message with gate summary:

```ts
const gateSummary = result.breakthroughResolution.gates
  .map((gate) => `${gate.passed ? '✅' : '❌'} ${gate.id}`)
  .join('\n');
```

- [ ] **Step 4: Run the integration and migration tests to verify persistence passes**

Run:

```bash
yarn vitest run tests/integration/xuanjian-task-cultivation-flow.test.ts tests/unit/services/CultivationMigration.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the service integration**

```bash
git add src/services/CultivationService.ts tests/integration/xuanjian-task-cultivation-flow.test.ts tests/unit/services/CultivationMigration.test.ts
git commit -m "feat: persist zifu gate outcomes in cultivation service"
```

## Task 4: Implement minimal `zifu_divine_power` branching flow

**Files:**
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/services/BreakthroughEngine.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/services/CultivationService.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/unit/services/BreakthroughEngine.test.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/integration/xuanjian-task-cultivation-flow.test.ts`

- [ ] **Step 1: Add failing unit tests for second divine power branch readiness and success**

Append to `tests/unit/services/BreakthroughEngine.test.ts`:

```ts
test('zifu divine power readiness requires branchChoice, proofs, and coverage alignment', () => {
  const result = evaluateBreakthroughReadiness({
    attemptKind: 'zifu_divine_power',
    currentRealmId: 'realm.zifu',
    currentPower: 1360,
    cultivationAttainment: 18,
    mainMethodId: 'method.zhuji_mingyang_script',
    mainDaoTrack: 'mingyang',
    foundationId: 'foundation.zhuji_mingyang',
    selectedBreakthroughMethodId: 'breakthrough.zifu_divine_power_base',
    knownDivinePowerIds: ['power.invoking_heaven_gate'],
    branchChoice: 'power.clear_heart',
    branchProofs: {},
    inventory: []
  });

  expect(result.ready).toBe(false);
  expect(result.missing).toContain('proof.mingyang_fate_anchor');
});

test('zifu divine power success adds branchChoice target and clears branch state', () => {
  const result = resolveBreakthroughAttempt({
    attemptKind: 'zifu_divine_power',
    currentRealmId: 'realm.zifu',
    currentPower: 1360,
    cultivationAttainment: 18,
    mainMethodId: 'method.zhuji_mingyang_script',
    mainDaoTrack: 'mingyang',
    foundationId: 'foundation.zhuji_mingyang',
    selectedBreakthroughMethodId: 'breakthrough.zifu_divine_power_base',
    knownDivinePowerIds: ['power.invoking_heaven_gate'],
    branchChoice: 'power.clear_heart',
    branchProofs: { 'proof.mingyang_fate_anchor': true },
    inventory: [
      {
        instanceId: 'inv_dp_1',
        definitionId: 'material.zifu_second_power_token',
        obtainedAt: new Date('2026-04-23T00:00:00.000Z'),
        sourceType: 'encounter',
        bound: false,
        used: false,
        stackCount: 1,
        instanceMeta: {}
      }
    ]
  });

  expect(result.success).toBe(true);
  expect(result.targetRealmId).toBe('realm.zifu');
  expect(result.updatedKnownDivinePowerIds).toContain('power.clear_heart');
  expect(result.breakthroughResolution.targetDivinePowerId).toBe('power.clear_heart');
});
```

Expected: FAIL because readiness does not know `zifu_divine_power`, `branchChoice`, or proof requirements yet.

- [ ] **Step 2: Run the unit test to verify the new branch cases fail**

Run:

```bash
yarn vitest run tests/unit/services/BreakthroughEngine.test.ts
```

Expected: FAIL with missing branch checks.

- [ ] **Step 3: Implement `zifu_divine_power` readiness and attempt resolution**

In `src/services/BreakthroughEngine.ts`, add helpers:

```ts
function resolveTargetPowerOrdinal(knownDivinePowerIds: string[]) {
  return (knownDivinePowerIds.length + 1) as 2 | 3 | 4 | 5;
}

function resolveDivinePowerBranchReadiness(input: ResolveBreakthroughAttemptInput, mainMethod: CanonicalMainMethod) {
  const targetPowerId = input.branchChoice ?? null;
  const targetPowerOrdinal = resolveTargetPowerOrdinal(input.knownDivinePowerIds);
  const requirement = getDivinePowerBreakthroughRequirement(targetPowerOrdinal);
  const targetPowerEntry = targetPowerId ? getDivinePowerRegistryEntry(targetPowerId) : null;
  const missing: string[] = [];

  if (input.currentRealmId !== 'realm.zifu') missing.push('realm.zifu');
  if (!targetPowerId) missing.push('branchChoice');
  if (!requirement) missing.push('divinePowerBreakthroughRequirement');
  if (!targetPowerEntry) missing.push('branchChoice');
  if (!mainMethod.zifuPowerCoverage?.candidatePowerIds.includes(targetPowerId ?? '')) {
    missing.push('branchChoice');
  }
  if (
    targetPowerEntry?.zifuAcquisition
    && input.knownDivinePowerIds.length < targetPowerEntry.zifuAcquisition.minExistingPowerCount
  ) {
    missing.push('minExistingPowerCount');
  }

  for (const proofId of targetPowerEntry?.zifuAcquisition?.proofRequirementIds ?? []) {
    if (input.branchProofs?.[proofId] !== true) {
      missing.push(proofId);
    }
  }

  return {
    targetPowerId,
    targetPowerEntry,
    requirement,
    missing
  };
}
```

Then enforce the minimum checks:

```ts
if (attemptKind === 'zifu_divine_power') {
  if (input.currentRealmId !== 'realm.zifu') missing.push('realm.zifu');
  if (!input.branchChoice) missing.push('branchChoice');

  const targetPowerEntry = input.branchChoice ? getDivinePowerRegistryEntry(input.branchChoice) : null;
  const coverage = getMainMethodById(input.mainMethodId).zifuPowerCoverage;

  if (!targetPowerEntry) missing.push('branchChoice');
  if (!coverage?.candidatePowerIds.includes(input.branchChoice ?? '')) missing.push('branchChoice');

  for (const proofId of targetPowerEntry?.zifuAcquisition?.proofRequirementIds ?? []) {
    if (input.branchProofs?.[proofId] !== true) {
      missing.push(proofId);
    }
  }
}
```

On success, append the new target divine power and clear transient branch state:

```ts
if (attemptKind === 'zifu_divine_power') {
  const targetDivinePowerId = input.branchChoice!;
  if (!updatedKnownDivinePowerIds.includes(targetDivinePowerId)) {
    updatedKnownDivinePowerIds.push(targetDivinePowerId);
  }

  return {
    success: true,
    targetRealmId: 'realm.zifu',
    missing: [],
    reason: 'ready',
    consumedDefinitionIds,
    updatedInventory,
    updatedKnownDivinePowerIds,
    resetBreakthroughState: true,
    nextBreakthroughState: {
      targetRealm: 'realm.jindan',
      selectedBreakthroughMethodId: 'breakthrough.zifu_divine_power_base',
      requirementProgress: {},
      hardConditionFlags: {},
      branchChoice: null,
      branchProofs: {},
      stabilityScore: 0,
      attemptHistory: []
    },
    nextMainDaoTrack: null,
    nextFoundationId: null,
    nextMainMethodId: null,
    nextRealmId: 'realm.zifu',
    powerLossApplied: 0,
    attainmentLossApplied: 0,
    failedGateId: null,
    breakthroughResolution: {
      attemptKind,
      methodId: breakthroughMethodId ?? null,
      targetDivinePowerId,
      gates: buildSuccessfulGates(['shape_aux_foundation', 'cross_illusion', 'gestate_target_power', 'enter_taixu']),
      failedGateId: null,
      powerLossApplied: 0,
      attainmentLossApplied: 0,
      successRateApplied: 1 + (breakthroughMethod?.successRateBonus ?? 0),
      consumedDefinitionIds,
      sideEffectsApplied: breakthroughMethod?.sideEffects ?? [],
      bonusOutcomeIds: breakthroughMethod?.bonusOutcomeIds ?? []
    }
  };
}
```

- [ ] **Step 4: Persist branch clearing and proof handling through the service layer**

In `src/services/CultivationService.ts`, pass branch fields through both readiness and attempt calls:

```ts
branchChoice: canonical.breakthrough?.branchChoice ?? null,
branchProofs: canonical.breakthrough?.branchProofs ?? {}
```

On success, preserve the cleared state:

```ts
if (result.resetBreakthroughState) {
  canonical.breakthrough = result.nextBreakthroughState;
} else if (canonical.breakthrough) {
  canonical.breakthrough.branchChoice = null;
  canonical.breakthrough.branchProofs = {};
}
```

Also add a service-level integration test:

```ts
it('adds the second divine power through zifu_divine_power attempt', async () => {
  canonical.state.realmId = 'realm.zifu';
  canonical.state.currentPower = 1360;
  canonical.state.knownDivinePowerIds = ['power.invoking_heaven_gate'];
  canonical.breakthrough!.selectedBreakthroughMethodId = 'breakthrough.zifu_divine_power_base';
  canonical.breakthrough!.branchChoice = 'power.clear_heart';
  canonical.breakthrough!.branchProofs = { 'proof.mingyang_fate_anchor': true };
  canonical.inventory.push({
    instanceId: 'inv_dp_2',
    definitionId: 'material.zifu_second_power_token',
    obtainedAt: new Date('2026-04-23T00:00:00.000Z'),
    sourceType: 'encounter',
    bound: false,
    used: false,
    stackCount: 1,
    instanceMeta: {}
  });

  const result = await cultivationService.attemptBreakthrough(userId);
  const reloaded = await User.findOne({ userId });

  expect(result.success).toBe(true);
  expect(reloaded!.cultivation.canonical!.state.knownDivinePowerIds).toContain('power.clear_heart');
  expect(reloaded!.cultivation.canonical!.breakthrough?.branchChoice).toBeNull();
});
```

- [ ] **Step 5: Run focused follow-up breakthrough tests**

Run:

```bash
yarn vitest run tests/unit/services/BreakthroughEngine.test.ts tests/integration/xuanjian-task-cultivation-flow.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit the follow-up divine power flow**

```bash
git add src/services/BreakthroughEngine.ts src/services/CultivationService.ts tests/unit/services/BreakthroughEngine.test.ts tests/integration/xuanjian-task-cultivation-flow.test.ts
git commit -m "feat: add zifu divine power branch breakthroughs"
```

## Task 5: Sync docs and run full verification

**Files:**
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/docs/cultivation/xuanjian-dev-manual.md`
- Verify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/unit/config/xuanjianCanonical.test.ts`
- Verify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/unit/config/xuanjianV2Registry.test.ts`
- Verify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/unit/services/BreakthroughEngine.test.ts`
- Verify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/integration/xuanjian-task-cultivation-flow.test.ts`
- Verify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/yarn tsc --noEmit`

- [ ] **Step 1: Update the dev manual to match the new runtime boundary**

In `docs/cultivation/xuanjian-dev-manual.md`, replace the current purple-mansion runtime note with:

```md
- **当前 runtime 口径**：
  1. `筑基 -> 紫府` 已按四关流程求解
  2. 首个神通由 `foundationId -> firstDivinePowerId` 自动映射
  3. 失败会损伤修为与道行，不做立死/删号
  4. 后续神通冲关已启用最小 `branchChoice / branchProofs`
  5. 第三到第五道神通复杂互斥与求金/求闰仍留待后续
```

- [ ] **Step 2: Run the focused verification suite**

Run:

```bash
yarn vitest run tests/unit/config/xuanjianCanonical.test.ts tests/unit/config/xuanjianV2Registry.test.ts tests/unit/services/BreakthroughEngine.test.ts tests/integration/xuanjian-task-cultivation-flow.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run TypeScript verification**

Run:

```bash
yarn tsc --noEmit
```

Expected: PASS.

- [ ] **Step 4: Commit the doc sync and verification checkpoint**

```bash
git add docs/cultivation/xuanjian-dev-manual.md
git commit -m "docs: sync zifu four-gate runtime manual"
```
