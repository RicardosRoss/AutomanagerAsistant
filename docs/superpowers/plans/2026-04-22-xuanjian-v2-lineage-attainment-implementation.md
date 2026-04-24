# Xuanjian V2 Lineage Attainment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在保持 `cultivationAttainment` 作为唯一道行数值的前提下，实现“筑基定主道统、主道统专项强化匹配内容、前中期保持通用”的 V2 道统归属系统。

**Architecture:** 这次实现沿用现有 `xuanjianCanonical -> reward/combat engine -> CultivationService -> commands` 主链，不新增第二套道行账本。第一层先补 `universal + 5 条 MVP 道统` 的运行时常量、legacy 兼容归一化、`lineageTag` 数据出口和最小主修功法 seed；第二层在 `BreakthroughEngine/CultivationService` 中把“练气 -> 筑基”突破接成主道统锁定点；第三层把主道统倍率接到专注收益和战斗 runtime bias；最后更新 `/realm` 展示与回归测试。

**Tech Stack:** TypeScript, Node.js ESM, Mongoose, Vitest, Telegram Bot API

---

## Scope Check

这份计划只覆盖一个子系统：`主道统归属与唯一道行专项加成`。

它会实现：

1. `mainDaoTrack` 从 `neutral` 占位状态收敛到 `universal / 具体道统`
2. `cultivationAttainment` 继续作为唯一道行数值
3. 练气前后“通用 / 具体道统”阶段分隔
4. 筑基时锁定主道统
5. 主道统对匹配主修功法、法门、神通的专项加成
6. `/realm` 可见文案与测试覆盖

它明确不做：

1. 新的主修功法切换命令
2. 全量道统开放
3. `branchCultivationAttainments` 的玩法启用
4. 道统相克/相生/互斥
5. `cooldowns`、法器、破境特殊条件联动

## File Map

**Canonical lineage primitives and compatibility**

- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/types/cultivationCanonical.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/config/xuanjianCanonical.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/services/CultivationStateAdapter.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/models/User.ts`
- Test: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/unit/config/xuanjianCanonical.test.ts`
- Test: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/unit/services/CultivationStateAdapter.v2.test.ts`
- Test: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/integration/xuanjian-v2-phase-a-compatibility.test.ts`

**Lineage-tagged content and runtime projection**

- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/types/cultivationV2.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/config/xuanjianV2Registry.ts`
- Test: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/unit/config/xuanjianV2Registry.test.ts`

**Breakthrough lock-in and focus reward wiring**

- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/services/BreakthroughEngine.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/services/CultivationRewardEngine.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/services/CultivationService.ts`
- Test: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/unit/services/BreakthroughEngine.test.ts`
- Test: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/unit/services/CultivationRewardEngine.test.ts`
- Test: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/integration/xuanjian-task-cultivation-flow.test.ts`

**Combat projection and status display**

- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/services/CombatStateAdapter.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/handlers/cultivationCommands.ts`
- Test: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/unit/services/CombatStateAdapter.test.ts`
- Test: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/unit/handlers/cultivationCommands.test.ts`
- Test: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/integration/xuanjian-cultivation-command-flow.test.ts`

**Docs**

- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/docs/cultivation/xuanjian-dev-manual.md`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/docs/cultivation/smoke-test-checklist.md`

## Implementation Rules

1. `cultivationAttainment` 继续是唯一道行值，绝不新增第二套“分支道行”结算。
2. `branchCultivationAttainments` 第一版只保留为空对象，不参与任何倍率读取。
3. 运行时统一使用 `universal` 表示“通用/未定道基”；旧存档里的 `neutral` 必须在读写边界自动归一化。
4. 主道统只允许在 `练气 -> 筑基` 成功突破时从 `universal` 锁定为具体道统；之后不得漂移。
5. 主道统专项倍率使用 `cultivationAttainment` 的 `10 / 30 / 60 => 1.02 / 1.05 / 1.08`。
6. 专项倍率只作用于 `lineageTag === mainDaoTrack` 的主修功法、法门、神通；不直接改全局人物四维。
7. 这轮不做玩家侧主修功法切换 UI；为使系统可测试，计划补一组最小的 lineaged main method seed，并在突破逻辑中用它们决定筑基后的 `foundationId/mainDaoTrack`。

## Task 1: Add lineage primitives, legacy normalization, and seed methods

**Files:**
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/types/cultivationCanonical.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/config/xuanjianCanonical.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/services/CultivationStateAdapter.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/models/User.ts`
- Test: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/unit/config/xuanjianCanonical.test.ts`
- Test: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/unit/services/CultivationStateAdapter.v2.test.ts`
- Test: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/integration/xuanjian-v2-phase-a-compatibility.test.ts`

- [ ] **Step 1: Write failing tests for lineage helpers and `neutral -> universal` compatibility**

Update `tests/unit/config/xuanjianCanonical.test.ts`:

```ts
import {
  UNIVERSAL_DAO_TRACK,
  getMainLineageMultiplier,
  isUniversalDaoTrack,
  normalizeMainDaoTrack,
  getMainDaoTrackDisplayName,
  getMainMethodById
} from '../../../src/config/xuanjianCanonical.js';

test('normalizes legacy neutral dao track into universal', () => {
  expect(normalizeMainDaoTrack('neutral')).toBe(UNIVERSAL_DAO_TRACK);
  expect(normalizeMainDaoTrack('')).toBe(UNIVERSAL_DAO_TRACK);
  expect(normalizeMainDaoTrack('mingyang')).toBe('mingyang');
});

test('treats universal track as non-specialized', () => {
  expect(isUniversalDaoTrack('universal')).toBe(true);
  expect(isUniversalDaoTrack('neutral')).toBe(true);
  expect(isUniversalDaoTrack('mingyang')).toBe(false);
});

test('returns conservative lineage multiplier bands', () => {
  expect(getMainLineageMultiplier(0)).toBe(1);
  expect(getMainLineageMultiplier(10)).toBe(1.02);
  expect(getMainLineageMultiplier(30)).toBe(1.05);
  expect(getMainLineageMultiplier(60)).toBe(1.08);
});

test('exposes seeded lineage methods and display names', () => {
  expect(getMainMethodById('method.zhuji_mingyang_script').lineageTag).toBe('mingyang');
  expect(getMainMethodById('method.zhuji_duijin_script').lineageTag).toBe('duijin');
  expect(getMainDaoTrackDisplayName('universal')).toBe('通用');
  expect(getMainDaoTrackDisplayName('lihuo')).toBe('离火');
});
```

Update `tests/unit/services/CultivationStateAdapter.v2.test.ts` and `tests/integration/xuanjian-v2-phase-a-compatibility.test.ts` expectations from `neutral` to `universal`.

- [ ] **Step 2: Run the focused compatibility test slice and verify it fails**

Run:

```bash
yarn vitest run tests/unit/config/xuanjianCanonical.test.ts tests/unit/services/CultivationStateAdapter.v2.test.ts tests/integration/xuanjian-v2-phase-a-compatibility.test.ts
```

Expected: FAIL on missing exports such as `UNIVERSAL_DAO_TRACK` / `normalizeMainDaoTrack`, and on old `neutral` expectations.

- [ ] **Step 3: Implement canonical lineage primitives and seed methods**

Update `src/types/cultivationCanonical.ts`:

```ts
export type LineageId =
  | 'universal'
  | 'mingyang'
  | 'zhengmu'
  | 'pinshui'
  | 'lihuo'
  | 'duijin';
```

Keep `mainDaoTrack: string` for schema compatibility, but runtime helpers must only emit the `LineageId` set above.

Update `src/config/xuanjianCanonical.ts`:

```ts
export const UNIVERSAL_DAO_TRACK = 'universal' as const;

const MAIN_DAO_TRACK_LABELS: Record<LineageId, string> = {
  universal: '通用',
  mingyang: '明阳',
  zhengmu: '正木',
  pinshui: '牝水',
  lihuo: '离火',
  duijin: '兑金'
};

export function normalizeMainDaoTrack(track: string | null | undefined): LineageId {
  if (!track || track === 'neutral' || track === UNIVERSAL_DAO_TRACK) {
    return UNIVERSAL_DAO_TRACK;
  }

  if (track in MAIN_DAO_TRACK_LABELS) {
    return track as LineageId;
  }

  return UNIVERSAL_DAO_TRACK;
}

export function isUniversalDaoTrack(track: string | null | undefined) {
  return normalizeMainDaoTrack(track) === UNIVERSAL_DAO_TRACK;
}

export function getMainLineageMultiplier(attainment: number): number {
  const safe = Math.max(0, Math.floor(attainment));
  if (safe >= 60) return 1.08;
  if (safe >= 30) return 1.05;
  if (safe >= 10) return 1.02;
  return 1;
}

export function getMainDaoTrackDisplayName(track: string | null | undefined): string {
  return MAIN_DAO_TRACK_LABELS[normalizeMainDaoTrack(track)];
}
```

Extend `XUANJIAN_MAIN_METHODS` with minimal zhuji-bound method seeds:

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
  lineageTag: 'mingyang'
},
{
  id: 'method.zhuji_lihuo_script',
  name: '大离书',
  category: 'main_method',
  tier: '玄',
  realmFloor: 'realm.zhuji',
  realmCeiling: 'realm.zifu',
  source: 'runtime.seed',
  tags: ['lihuo', 'zhuji'],
  dropScope: 'heritage',
  enabledInV1: false,
  reservedForV2: false,
  grade: 5,
  cultivationMultiplier: 1.08,
  combatBias: { attack: 1, defense: 0, sense: 0, speed: 1 },
  foundationAffinity: ['foundation.zhuji_lihuo'],
  artSlotsBonus: 0,
  divinePowerSlotsBonus: 0,
  breakthroughAssist: [],
  requiredAura: [],
  lineageTag: 'lihuo'
}
```

Mirror this pattern for `duijin / pinshui / zhengmu`.

Update `src/services/CultivationStateAdapter.ts` and `src/models/User.ts` defaults to `mainDaoTrack: 'universal'`, and normalize any loaded legacy value through `normalizeMainDaoTrack(...)`.

- [ ] **Step 4: Run the focused compatibility slice and verify it passes**

Run:

```bash
yarn vitest run tests/unit/config/xuanjianCanonical.test.ts tests/unit/services/CultivationStateAdapter.v2.test.ts tests/integration/xuanjian-v2-phase-a-compatibility.test.ts
```

Expected: PASS with the new `universal` defaults and lineage helper coverage.

- [ ] **Step 5: Commit the canonical lineage slice**

```bash
git add src/types/cultivationCanonical.ts src/config/xuanjianCanonical.ts src/services/CultivationStateAdapter.ts src/models/User.ts tests/unit/config/xuanjianCanonical.test.ts tests/unit/services/CultivationStateAdapter.v2.test.ts tests/integration/xuanjian-v2-phase-a-compatibility.test.ts
git commit -m "feat: add xuanjian lineage canonical primitives"
```

## Task 2: Add `lineageTag` to runtime-ready arts and divine powers

**Files:**
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/types/cultivationV2.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/config/xuanjianV2Registry.ts`
- Test: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/unit/config/xuanjianV2Registry.test.ts`

- [ ] **Step 1: Write failing registry tests for lineage-tagged runtime projection**

Append to `tests/unit/config/xuanjianV2Registry.test.ts`:

```ts
test('projects lineageTag onto runtime-ready battle arts and divine powers', () => {
  const battleArt = getBattleArtRuntimeProfile('art.golden_light_art');
  const divinePower = getDivinePowerRuntimeProfile('power.invoking_heaven_gate');

  expect(battleArt?.lineageTag).toBe('duijin');
  expect(divinePower?.lineageTag).toBe('mingyang');
});

test('keeps non-lineaged starter content undefined', () => {
  const starter = getBattleArtRuntimeProfile('art.basic_guarding_hand');
  expect(starter?.lineageTag).toBeUndefined();
});
```

- [ ] **Step 2: Run the registry test file and verify it fails**

Run:

```bash
yarn vitest run tests/unit/config/xuanjianV2Registry.test.ts
```

Expected: FAIL because runtime profiles do not yet expose `lineageTag`.

- [ ] **Step 3: Implement `lineageTag` on registry entries and projected profiles**

Update `src/types/cultivationV2.ts` runtime profile contracts:

```ts
export interface RuntimeReadyBattleArtProfile {
  id: string;
  actionProfile: {
    actionType: 'attack' | 'guard' | 'movement' | 'support';
    tags: string[];
  };
  balanceProfile: { /* existing fields */ };
  lineageTag?: LineageId;
}

export interface RuntimeReadyDivinePowerProfile {
  id: string;
  actionProfile: {
    actionType: 'burst' | 'control' | 'ward' | 'domain';
    tags: string[];
  };
  balanceProfile: { /* existing fields */ };
  lineageTag?: LineageId;
}
```

Update `src/config/xuanjianV2Registry.ts` entry definitions and projectors, for example:

```ts
{
  id: 'art.golden_light_art',
  runtimeReady: true,
  category: 'attack',
  tags: ['jin', 'starter-attack'],
  requiredRealmId: 'realm.taixi',
  lineageTag: 'duijin'
}
```

```ts
{
  id: 'power.invoking_heaven_gate',
  runtimeReady: true,
  category: 'domain',
  tags: ['zifu', 'mingyang', 'suppression'],
  requiredRealmId: 'realm.zifu',
  lineageTag: 'mingyang'
}
```

Also tag the first-wave MVP content:

1. `art.fire_sparrow_art` -> `lihuo`
2. `art.clear_eye_spirit_gaze` -> `pinshui`
3. `art.heart_cauldron_dispel` -> `zhengmu`
4. `art.crimson_split_spear` -> `mingyang`
5. `power.orderly_conquest` -> `lihuo`
6. `power.rank_from_luo` -> `duijin`

- [ ] **Step 4: Run the registry tests and verify they pass**

Run:

```bash
yarn vitest run tests/unit/config/xuanjianV2Registry.test.ts
```

Expected: PASS with projected `lineageTag` assertions green.

- [ ] **Step 5: Commit the runtime lineage-tag slice**

```bash
git add src/types/cultivationV2.ts src/config/xuanjianV2Registry.ts tests/unit/config/xuanjianV2Registry.test.ts
git commit -m "feat: tag xuanjian runtime content with lineages"
```

## Task 3: Lock `mainDaoTrack` on lianqi -> zhuji breakthrough and wire focus reward specialization

**Files:**
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/services/BreakthroughEngine.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/services/CultivationRewardEngine.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/services/CultivationService.ts`
- Test: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/unit/services/BreakthroughEngine.test.ts`
- Test: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/unit/services/CultivationRewardEngine.test.ts`
- Test: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/integration/xuanjian-task-cultivation-flow.test.ts`

- [ ] **Step 1: Write failing tests for zhuji lock-in and post-zhuji specialization**

Append to `tests/unit/services/BreakthroughEngine.test.ts`:

```ts
test('lianqi to zhuji breakthrough resolves concrete dao track from lineage method', () => {
  const result = resolveBreakthroughAttempt({
    currentRealmId: 'realm.lianqi',
    currentPower: 420,
    cultivationAttainment: 10,
    mainMethodId: 'method.zhuji_mingyang_script',
    inventory: [{ definitionId: 'material.yellow_breakthrough_token', used: false, stackCount: 1 } as any],
    knownDivinePowerIds: []
  });

  expect(result.success).toBe(true);
  if (result.success) {
    expect(result.nextMainDaoTrack).toBe('mingyang');
    expect(result.nextFoundationId).toBe('foundation.zhuji_mingyang');
  }
});
```

Append to `tests/unit/services/CultivationRewardEngine.test.ts`:

```ts
test('universal dao track does not add lineage specialization before zhuji', () => {
  const result = resolveFocusReward({
    duration: 60,
    rng: () => 0.99,
    state: {
      ...baseState,
      realmId: 'realm.lianqi',
      mainDaoTrack: 'universal',
      cultivationAttainment: 60,
      mainMethodId: 'method.zhuji_mingyang_script'
    }
  });

  expect(result.totalPowerGain).toBe(1);
});

test('post-zhuji matching dao track adds lineage specialization to main method', () => {
  const result = resolveFocusReward({
    duration: 60,
    rng: () => 0.99,
    state: {
      ...baseState,
      realmId: 'realm.zhuji',
      mainDaoTrack: 'mingyang',
      cultivationAttainment: 60,
      mainMethodId: 'method.zhuji_mingyang_script'
    }
  });

  expect(result.totalPowerGain).toBeGreaterThan(1);
});
```

Append to `tests/integration/xuanjian-task-cultivation-flow.test.ts`:

```ts
test('successful zhuji breakthrough locks mainDaoTrack without resetting cultivationAttainment', async () => {
  const user = await User.create({ userId: 99123, username: 'zhuji-lineage-lock' });
  const canonical = user.ensureCanonicalCultivation();
  canonical.state.realmId = 'realm.lianqi';
  canonical.state.currentPower = 420;
  canonical.state.cultivationAttainment = 30;
  canonical.state.mainMethodId = 'method.zhuji_duijin_script';
  canonical.inventory.push({
    instanceId: 'token-1',
    definitionId: 'material.yellow_breakthrough_token',
    obtainedAt: new Date(),
    sourceType: 'admin',
    bound: false,
    used: false,
    stackCount: 1,
    instanceMeta: {}
  });
  user.replaceCanonicalCultivation(canonical);
  await user.save();

  const result = await cultivationService.attemptBreakthrough(99123);
  const refreshed = await User.findOne({ userId: 99123 });

  expect(result.success).toBe(true);
  expect(refreshed?.cultivation.canonical?.state.mainDaoTrack).toBe('duijin');
  expect(refreshed?.cultivation.canonical?.state.cultivationAttainment).toBe(30);
});
```

- [ ] **Step 2: Run the reward/breakthrough test slice and verify it fails**

Run:

```bash
yarn vitest run tests/unit/services/BreakthroughEngine.test.ts tests/unit/services/CultivationRewardEngine.test.ts tests/integration/xuanjian-task-cultivation-flow.test.ts
```

Expected: FAIL on missing `nextMainDaoTrack/nextFoundationId`, and on unchanged focus reward math.

- [ ] **Step 3: Implement zhuji lock-in and focus specialization**

Update `src/services/BreakthroughEngine.ts` result contracts:

```ts
export interface BreakthroughAttemptSuccessResult {
  success: true;
  targetRealmId: RealmId;
  missing: [];
  reason: 'ready';
  consumedDefinitionIds: string[];
  updatedInventory: InventoryInstance[];
  updatedKnownDivinePowerIds: string[];
  nextMainDaoTrack: LineageId;
  nextFoundationId: string;
  resetBreakthroughState: true;
  nextBreakthroughState: null;
}
```

Resolve zhuji lock-in from main method:

```ts
const nextMainDaoTrack =
  readiness.targetRealmId === 'realm.zhuji'
    ? resolveLineageDaoTrackForBreakthrough(input.mainMethodId)
    : UNIVERSAL_DAO_TRACK;

const nextFoundationId =
  readiness.targetRealmId === 'realm.zhuji'
    ? resolveFoundationIdForDaoTrack(nextMainDaoTrack)
    : 'foundation.unshaped';
```

Update `src/services/CultivationService.ts` breakthrough success branch:

```ts
canonical.state.realmId = result.targetRealmId;
canonical.state.currentPower = Math.max(canonical.state.currentPower, nextRealm.minPower);
if (result.targetRealmId === 'realm.zhuji') {
  canonical.state.mainDaoTrack = result.nextMainDaoTrack;
  canonical.state.foundationId = result.nextFoundationId;
}
```

Update `src/services/CultivationRewardEngine.ts` to replace same-school helper usage:

```ts
const lineageMultiplier = shouldApplyMainLineageToMethod({
  realmId: input.state.realmId,
  mainDaoTrack: input.state.mainDaoTrack,
  methodLineageTag: method.lineageTag
})
  ? getMainLineageMultiplier(input.state.cultivationAttainment)
  : 1;

const totalPowerGain = Math.floor(
  baseValue * realmCoefficient * method.cultivationMultiplier * attainmentMultiplier * lineageMultiplier
);
```

Do not touch `cultivationAttainmentDelta`.

- [ ] **Step 4: Run the reward/breakthrough slice and verify it passes**

Run:

```bash
yarn vitest run tests/unit/services/BreakthroughEngine.test.ts tests/unit/services/CultivationRewardEngine.test.ts tests/integration/xuanjian-task-cultivation-flow.test.ts
```

Expected: PASS with `mainDaoTrack` locked on zhuji breakthrough and unchanged single-attainment accounting.

- [ ] **Step 5: Commit the dao-track lock-in slice**

```bash
git add src/services/BreakthroughEngine.ts src/services/CultivationRewardEngine.ts src/services/CultivationService.ts tests/unit/services/BreakthroughEngine.test.ts tests/unit/services/CultivationRewardEngine.test.ts tests/integration/xuanjian-task-cultivation-flow.test.ts
git commit -m "feat: lock xuanjian dao track on zhuji breakthrough"
```

## Task 4: Apply lineage specialization to combat runtime bias and `/realm` display

**Files:**
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/services/CombatStateAdapter.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/handlers/cultivationCommands.ts`
- Test: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/unit/services/CombatStateAdapter.test.ts`
- Test: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/unit/handlers/cultivationCommands.test.ts`
- Test: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/integration/xuanjian-cultivation-command-flow.test.ts`

- [ ] **Step 1: Write failing combat/display tests**

Append to `tests/unit/services/CombatStateAdapter.test.ts`:

```ts
test('matching mainDaoTrack boosts only matching lineage content bias after zhuji', () => {
  const baseline = buildPlayerCombatSnapshot({
    ...baseState,
    realmId: 'realm.zhuji',
    mainDaoTrack: 'universal',
    cultivationAttainment: 60,
    knownBattleArtIds: ['art.golden_light_art'],
    battleLoadout: {
      equippedBattleArtIds: ['art.golden_light_art'],
      equippedDivinePowerIds: [],
      equippedArtifactIds: [],
      activeSupportArtId: null
    }
  });

  const specialized = buildPlayerCombatSnapshot({
    ...baseState,
    realmId: 'realm.zhuji',
    mainDaoTrack: 'duijin',
    cultivationAttainment: 60,
    knownBattleArtIds: ['art.golden_light_art'],
    battleLoadout: {
      equippedBattleArtIds: ['art.golden_light_art'],
      equippedDivinePowerIds: [],
      equippedArtifactIds: [],
      activeSupportArtId: null
    }
  });

  expect(specialized.dimensions.attack).toBeGreaterThan(baseline.dimensions.attack);
});

test('non-matching lineage content gets no specialization bonus', () => {
  const snapshot = buildPlayerCombatSnapshot({
    ...baseState,
    realmId: 'realm.zhuji',
    mainDaoTrack: 'mingyang',
    cultivationAttainment: 60,
    knownBattleArtIds: ['art.golden_light_art'],
    battleLoadout: {
      equippedBattleArtIds: ['art.golden_light_art'],
      equippedDivinePowerIds: [],
      equippedArtifactIds: [],
      activeSupportArtId: null
    }
  });

  expect(snapshot.dimensions.attack).toBeLessThanOrEqual(13);
});
```

Append to `tests/unit/handlers/cultivationCommands.test.ts`:

```ts
expect(realmMessage).toContain('☯️ 当前道统：通用');
expect(realmMessage).toContain('☯️ 当前主道统：明阳');
```

- [ ] **Step 2: Run the combat/display slice and verify it fails**

Run:

```bash
yarn vitest run tests/unit/services/CombatStateAdapter.test.ts tests/unit/handlers/cultivationCommands.test.ts tests/integration/xuanjian-cultivation-command-flow.test.ts
```

Expected: FAIL because no lineage bias or dao-track display exists yet.

- [ ] **Step 3: Implement combat specialization and `/realm` dao-track display**

Update `src/services/CombatStateAdapter.ts`:

```ts
function getProfileLineageBonus(state: PlayerCultivationState, lineageTag?: string) {
  if (!lineageTag) return 0;
  if (isUniversalDaoTrack(state.mainDaoTrack)) return 0;
  if (normalizeMainDaoTrack(state.mainDaoTrack) !== lineageTag) return 0;

  const multiplier = getMainLineageMultiplier(state.cultivationAttainment);
  return Math.round((multiplier - 1) * 4);
}
```

Apply it only to matching profile sums:

```ts
const battleArtAttackBias = loadout.battleArtProfiles.reduce((sum, profile) => (
  sum
  + Math.round((profile.balanceProfile.attackWeight - 0.25) * 4)
  + getProfileLineageBonus(state, profile.lineageTag)
), 0);
```

Mirror this for defense/sense/speed/stability using the profile’s own `lineageTag`.

Update `src/handlers/cultivationCommands.ts`:

```ts
const daoTrackLabel = getMainDaoTrackDisplayName(status.canonicalState?.mainDaoTrack);
message += `☯️ 当前${daoTrackLabel === '通用' ? '道统' : '主道统'}：${daoTrackLabel}\n`;
```

Place it under the `当前道行` line and before `主修功法`.

- [ ] **Step 4: Run the combat/display slice and verify it passes**

Run:

```bash
yarn vitest run tests/unit/services/CombatStateAdapter.test.ts tests/unit/handlers/cultivationCommands.test.ts tests/integration/xuanjian-cultivation-command-flow.test.ts
```

Expected: PASS with matching-lineage combat bias and `/realm` text updated.

- [ ] **Step 5: Commit the combat/display slice**

```bash
git add src/services/CombatStateAdapter.ts src/handlers/cultivationCommands.ts tests/unit/services/CombatStateAdapter.test.ts tests/unit/handlers/cultivationCommands.test.ts tests/integration/xuanjian-cultivation-command-flow.test.ts
git commit -m "feat: surface xuanjian main dao track effects"
```

## Task 5: Update docs and run the final regression sweep

**Files:**
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/docs/cultivation/xuanjian-dev-manual.md`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/docs/cultivation/smoke-test-checklist.md`

- [ ] **Step 1: Update developer and smoke-test docs**

Add to `docs/cultivation/xuanjian-dev-manual.md`:

```md
### 主道统第一版口径

1. `cultivationAttainment` 是唯一道行数值。
2. 胎息、练气阶段 `mainDaoTrack = universal`，状态页显示“通用”。
3. `练气 -> 筑基` 成功突破时，若当前主修功法带首批 `lineageTag`，则锁定 `mainDaoTrack` 与对应 `foundationId`。
4. 筑基后主道统只强化匹配 `lineageTag` 的主修功法、法门、神通。
5. `branchCultivationAttainments` 第一版仅保留为 schema 预留字段，不参与运行时倍率。
```

Update `docs/cultivation/smoke-test-checklist.md` with:

```md
| 道统状态 | 练气阶段 `/realm` | `☯️ 当前道统：通用` |
| 道统状态 | 筑基后 `/realm` | `☯️ 当前主道统：明阳/离火/兑金/牝水/正木` |
| 运行时表现 | 匹配主道统内容 | 专注修为或战斗 bias 出现专项加成 |
| 运行时表现 | 未匹配主道统内容 | 不出现专项加成 |
```

- [ ] **Step 2: Run the final regression sweep**

Run:

```bash
yarn vitest run tests/unit/config/xuanjianCanonical.test.ts tests/unit/config/xuanjianV2Registry.test.ts tests/unit/services/CultivationRewardEngine.test.ts tests/unit/services/BreakthroughEngine.test.ts tests/unit/services/CombatStateAdapter.test.ts tests/unit/handlers/cultivationCommands.test.ts tests/unit/services/CultivationStateAdapter.v2.test.ts tests/integration/xuanjian-v2-phase-a-compatibility.test.ts tests/integration/xuanjian-task-cultivation-flow.test.ts tests/integration/xuanjian-cultivation-command-flow.test.ts
yarn typecheck
```

Expected:

1. All selected Vitest files PASS
2. `yarn typecheck` exits `0`

- [ ] **Step 3: Do a targeted manual smoke checklist update**

Use the existing dev/test helpers and record these manual cases in `docs/cultivation/smoke-test-checklist.md`:

```md
1. 练气账号 `/realm` 显示“通用”
2. 以 lineaged main method fixture 完成筑基后 `/realm` 显示具体主道统
3. 切换非本道统法门后，战报仍可运行但不再吃专项强化
4. `neutral` 旧档首次读取后自动收敛为 `universal`
```

- [ ] **Step 4: Commit docs and verification notes**

```bash
git add docs/cultivation/xuanjian-dev-manual.md docs/cultivation/smoke-test-checklist.md
git commit -m "docs: document xuanjian main dao track runtime"
```

- [ ] **Step 5: Prepare handoff summary**

Capture these points in the execution handoff:

```md
1. `cultivationAttainment` remains the only attainment value.
2. `mainDaoTrack` now normalizes `neutral -> universal`.
3. ZHuji breakthrough locks the first-wave dao track when the active main method is lineaged.
4. Matching lineaged methods/arts/powers receive specialized bonuses; unmatched content does not.
5. No player-facing main-method switching command was added in this slice.
```

## Self-Review

Spec coverage check:

1. `cultivationAttainment` 作为唯一道行数值：Task 1 + Task 3
2. `mainDaoTrack` 在筑基时确定且之后不漂移：Task 3
3. 仅对带 `lineageTag` 的主修功法/法门/神通生效：Task 2 + Task 3 + Task 4
4. `10 / 30 / 60` 保守专项倍率：Task 1 + Task 3 + Task 4
5. `/realm` 通用/主道统展示：Task 4
6. `branchCultivationAttainments` 第一版保持 inert：Task 1 + regression tests

Placeholder scan:

1. No `TODO`, `TBD`, or “implement later” markers remain.
2. Every task includes an exact file set, commands, and concrete code snippets.

Type consistency check:

1. The plan consistently uses `LineageId`, `UNIVERSAL_DAO_TRACK`, `lineageTag`, `getMainLineageMultiplier`, and `normalizeMainDaoTrack`.
2. Breakthrough success wiring consistently uses `nextMainDaoTrack` and `nextFoundationId`.

