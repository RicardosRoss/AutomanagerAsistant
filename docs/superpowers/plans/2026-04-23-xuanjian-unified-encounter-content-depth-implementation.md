# 玄鉴统一奇遇内容厚度 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把当前仍是“完成任务后直接结算”的 starter 奇遇战，升级为“统一敌人原型库 + 统一奇遇模板库 + 混池宝物 + 可离开/可争抢 + 高阶条目先入包待解锁”的前中期完整内容框架。

**Architecture:** 保持现有 `TaskService -> CultivationService -> CombatService -> CombatResolver` 主链路不变，不重写 `CombatResolver`。实现重点放在三层：`xuanjianCombat.ts` 负责统一内容配置与守宝实例化，`CultivationRewardEngine.ts / CultivationService.ts` 负责把奇遇改成“发现 -> 选择 -> 结算”的两段式流转，`taskCommands.ts / bot.ts` 负责 Telegram 回调与用户可见文案。

**Tech Stack:** TypeScript, Node.js ESM, Mongoose, Vitest, Telegram Bot API, MongoDB Memory Server

---

## Scope Check

这份计划只覆盖一个子系统：`统一奇遇内容厚度`。它虽然会改动配置、service、handler、tests 和 docs，但目标始终是同一件事：

1. 奇遇不再按境界拆三套内容
2. 高价值宝物进入混池，但风险靠守宝敌人与玩家选择控制
3. 高阶法门 / 神通掉落只入包，不直接变成立即可用内容

本计划明确不做：

1. `紫府+` 内容厚度扩展
2. `CombatResolver` 大规模机制重写
3. 守关战、破境战、PVP、长回合 `/fight`
4. 宝物线索回溯与二次追踪

## File Map

**Encounter contracts and static content**

- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/types/cultivationCombat.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/types/cultivationCanonical.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/types/services.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/config/xuanjianCombat.ts`

**Reward pipeline and persistence**

- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/services/CultivationRewardEngine.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/services/CultivationService.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/services/CombatService.ts`

**Telegram interaction**

- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/utils/constants.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/bot.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/handlers/taskCommands.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/handlers/cultivationCommands.ts`

**Tests**

- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/unit/config/xuanjianCombat.test.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/unit/services/CultivationRewardEngine.test.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/unit/handlers/taskCommands.test.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/unit/handlers/cultivationCommands.test.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/unit/bot.test.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/integration/xuanjian-task-cultivation-flow.test.ts`

**Docs**

- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/docs/cultivation/xuanjian-dev-manual.md`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/docs/cultivation/smoke-test-checklist.md`

## Implementation Rules

1. 仍然只做 `奇遇战`，不新增主动进入战斗的命令。
2. `CombatResolver` 继续只负责求解，不能知道 Telegram 选择流。
3. `pendingEncounterOffer` 只允许单个生效实例，后写覆盖旧值并视为旧 offer 失效。
4. `离开` 必须是无伤、无资源扣减、无战斗、宝物直接消失。
5. 混池掉落的高阶法门 / 神通只入包，不得直接写入 `knownBattleArtIds / knownDivinePowerIds`。
6. 所有新增 callback 必须走现有 `handleCallbackQuery` 去重与节流链路。
7. `NODE_ENV !== 'production'` 时，`/dev_encounter_set` 必须支持新的 `offer` 类型，保证真实 TG 可手测。

## Task 1: Add Unified Encounter Contracts And Static Content

**Files:**
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/types/cultivationCombat.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/types/cultivationCanonical.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/types/services.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/config/xuanjianCombat.ts`
- Test: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/unit/config/xuanjianCombat.test.ts`

- [ ] **Step 1: Write the failing config test for unified guardian content**

Append to `tests/unit/config/xuanjianCombat.test.ts`:

```ts
import {
  buildGuardianEncounter,
  formatEncounterRiskTierLabel,
  formatGuardianStyleLabel,
  getEncounterLootById
} from '../../../src/config/xuanjianCombat.js';

test('builds guardian encounters from shared prototypes and loot tiers', () => {
  const built = buildGuardianEncounter({
    prototypeId: 'guardian.hybrid',
    realmId: 'realm.zhuji',
    realmSubStageId: 'realmSubStage.zhuji.middle',
    lootTier: '地',
    seed: 7
  });

  expect(built.enemy.realmId).toBe('realm.zhuji');
  expect(built.enemy.realmSubStageId).toBe('realmSubStage.zhuji.middle');
  expect(built.enemy.tags).toContain('elite');
  expect(built.guardianStyle).toBe('hybrid');
  expect(built.riskTier).toBe('deadly');
  expect(built.encounter.id).toContain('guardian.hybrid');

  expect(getEncounterLootById('loot.scroll.returning_origin_shield')).toMatchObject({
    id: 'loot.scroll.returning_origin_shield',
    tier: '玄',
    grantMode: 'deferred_battle_art',
    contentId: 'art.returning_origin_shield'
  });

  expect(formatEncounterRiskTierLabel('deadly')).toBe('极险');
  expect(formatGuardianStyleLabel('hybrid')).toBe('混成');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
yarn vitest run tests/unit/config/xuanjianCombat.test.ts
```

Expected: FAIL because `buildGuardianEncounter`, `getEncounterLootById`, `formatEncounterRiskTierLabel`, and `formatGuardianStyleLabel` do not exist yet.

- [ ] **Step 3: Add the new contracts and unified static content**

In `src/types/cultivationCombat.ts`, add the shared encounter types:

```ts
export type EncounterRiskTier = 'ordinary' | 'tough' | 'dangerous' | 'deadly';
export type GuardianStyle = 'rush' | 'guard' | 'movement' | 'sense' | 'hybrid';
export type EncounterLootGrantMode = 'inventory' | 'deferred_battle_art' | 'deferred_divine_power';

export interface EncounterOfferSummary {
  offerId: string;
  lootDefinitionId: string;
  lootDisplayName: string;
  lootTier: '凡' | '黄' | '玄' | '地';
  guardianStyle: GuardianStyle;
  riskTier: EncounterRiskTier;
  guardianEncounterId: string;
  guardianName: string;
}

export interface PendingEncounterOfferState extends EncounterOfferSummary {
  createdAt: Date;
  grantMode: EncounterLootGrantMode;
  obtainedDefinitionIdsOnWin: string[];
  deferredContentId?: string;
}
```

In `src/types/cultivationCanonical.ts`, widen the dev script type and allow a single pending offer:

```ts
import type { PendingEncounterOfferState } from './cultivationCombat.js';

export type DevEncounterType = 'none' | 'stones' | 'item' | 'combat' | 'offer';

export interface CombatFlagsState {
  devEncounterScript?: DevEncounterScript;
  pendingEncounterOffer?: PendingEncounterOfferState;
  devCombatDetailEnabled?: boolean;
  [key: string]:
    | boolean
    | string
    | number
    | DevEncounterScript
    | PendingEncounterOfferState
    | undefined;
}
```

In `src/types/services.ts`, let encounter results carry a pending offer summary:

```ts
import type { CombatResolution, EncounterOfferSummary } from './cultivationCombat.js';

export interface CultivationEncounterResult {
  type: 'none' | 'stones' | 'item' | 'combat' | 'offer';
  message: string | null;
  spiritStoneDelta: number;
  obtainedDefinitionIds: string[];
  combatEncounterId?: string;
  combatSummary?: CombatEncounterSummary;
  offerSummary?: EncounterOfferSummary;
}
```

In `src/config/xuanjianCombat.ts`, add unified guardian and loot config plus helpers:

```ts
type GuardianPrototypeId =
  | 'guardian.rush'
  | 'guardian.guard'
  | 'guardian.movement'
  | 'guardian.sense'
  | 'guardian.support'
  | 'guardian.hybrid';

type EncounterTemplateId =
  | 'encounterTemplate.open_pickup'
  | 'encounterTemplate.guardian_standoff'
  | 'encounterTemplate.beast_den'
  | 'encounterTemplate.ruined_altar'
  | 'encounterTemplate.bright_peril'
  | 'encounterTemplate.ambush_take'
  | 'encounterTemplate.major_guardian';

interface EncounterLootDefinition {
  id: string;
  definitionId: string;
  displayName: string;
  tier: '凡' | '黄' | '玄' | '地';
  weight: number;
  grantMode: 'inventory' | 'deferred_battle_art' | 'deferred_divine_power';
  contentId?: string;
}

const ENCOUNTER_LOOT_POOL: EncounterLootDefinition[] = [
  {
    id: 'loot.pill.low_cultivation',
    definitionId: 'consumable.low_cultivation_pill',
    displayName: '低阶丹药',
    tier: '凡',
    weight: 40,
    grantMode: 'inventory'
  },
  {
    id: 'loot.token.yellow_breakthrough',
    definitionId: 'material.yellow_breakthrough_token',
    displayName: '黄阶破境辅材',
    tier: '黄',
    weight: 22,
    grantMode: 'inventory'
  },
  {
    id: 'loot.scroll.returning_origin_shield',
    definitionId: 'manual.art.returning_origin_shield',
    displayName: '归元盾传承玉简',
    tier: '玄',
    weight: 8,
    grantMode: 'deferred_battle_art',
    contentId: 'art.returning_origin_shield'
  },
  {
    id: 'loot.scroll.guarding_true_light',
    definitionId: 'manual.power.guarding_true_light',
    displayName: '护体真光残页',
    tier: '地',
    weight: 3,
    grantMode: 'deferred_divine_power',
    contentId: 'power.guarding_true_light'
  }
];

export function getEncounterLootById(id: string) {
  return ENCOUNTER_LOOT_POOL.find((entry) => entry.id === id) ?? null;
}

export function getEncounterLootByDefinitionId(definitionId: string) {
  return ENCOUNTER_LOOT_POOL.find((entry) => entry.definitionId === definitionId) ?? null;
}

export function formatEncounterRiskTierLabel(tier: EncounterRiskTier) {
  if (tier === 'tough') return '棘手';
  if (tier === 'dangerous') return '凶险';
  if (tier === 'deadly') return '极险';
  return '寻常';
}

export function formatGuardianStyleLabel(style: GuardianStyle) {
  if (style === 'guard') return '坚守';
  if (style === 'movement') return '游走';
  if (style === 'sense') return '灵识';
  if (style === 'hybrid') return '混成';
  return '迅攻';
}

export function rollEncounterLoot(rng: () => number) {
  const totalWeight = ENCOUNTER_LOOT_POOL.reduce((sum, item) => sum + item.weight, 0);
  let cursor = rng() * totalWeight;

  for (const item of ENCOUNTER_LOOT_POOL) {
    cursor -= item.weight;
    if (cursor <= 0) {
      return item;
    }
  }

  return ENCOUNTER_LOOT_POOL[0]!;
}

export function rollGuardianPrototypeId(
  rng: () => number,
  lootTier: EncounterLootDefinition['tier']
): GuardianPrototypeId {
  if (lootTier === '地') {
    return rng() < 0.5 ? 'guardian.hybrid' : 'guardian.sense';
  }

  if (lootTier === '玄') {
    return rng() < 0.5 ? 'guardian.guard' : 'guardian.hybrid';
  }

  if (lootTier === '黄') {
    return rng() < 0.5 ? 'guardian.rush' : 'guardian.guard';
  }

  return rng() < 0.5 ? 'guardian.rush' : 'guardian.movement';
}
```

Also add the builder that materializes a synthetic enemy/encounter pair:

```ts
export function buildGuardianEncounter(input: {
  prototypeId: GuardianPrototypeId;
  realmId: RealmId;
  realmSubStageId: string;
  lootTier: '凡' | '黄' | '玄' | '地';
  seed: number;
}) {
  const style: GuardianStyle = input.prototypeId === 'guardian.guard'
    ? 'guard'
    : input.prototypeId === 'guardian.movement'
      ? 'movement'
      : input.prototypeId === 'guardian.sense'
        ? 'sense'
        : input.prototypeId === 'guardian.hybrid'
          ? 'hybrid'
          : 'rush';

  const riskTier: EncounterRiskTier = input.lootTier === '地'
    ? 'deadly'
    : input.lootTier === '玄'
      ? 'dangerous'
      : input.lootTier === '黄'
        ? 'tough'
        : 'ordinary';

  const enemy = {
    id: `generated.enemy.${input.prototypeId}.${input.seed}`,
    name: style === 'hybrid' ? '镇宝异种' : style === 'guard' ? '守宝甲兽' : '护宝凶妖',
    realmId: input.realmId,
    realmSubStageId: input.realmSubStageId,
    currentPower: input.realmId === 'realm.zhuji' ? 760 : input.realmId === 'realm.lianqi' ? 210 : 72,
    dimensions: style === 'guard'
      ? { attack: 5, defense: 8, sense: 3, speed: 2 }
      : style === 'movement'
        ? { attack: 5, defense: 3, sense: 4, speed: 8 }
        : style === 'sense'
          ? { attack: 4, defense: 4, sense: 8, speed: 5 }
          : style === 'hybrid'
            ? { attack: 7, defense: 7, sense: 5, speed: 5 }
            : { attack: 7, defense: 4, sense: 3, speed: 6 },
    tags: style === 'hybrid' ? ['elite', 'hybrid'] : [style, 'guardian']
  };

  return {
    guardianStyle: style,
    riskTier,
    enemy,
    encounter: {
      id: `generated.encounter.${input.prototypeId}.${input.seed}`,
      enemyTemplateId: enemy.id,
      maxRounds: COMBAT_BALANCE.maxRounds,
      rewards: {
        spiritStoneDeltaOnWin: input.lootTier === '地' ? 8 : 4,
        attainmentDeltaOnWin: input.lootTier === '地' ? 2 : 1,
        obtainedDefinitionIdsOnWin: []
      },
      penalties: {
        injuryLevelOnLoss: input.lootTier === '地' ? 'medium' : 'light',
        spiritStoneDeltaOnLoss: input.lootTier === '地' ? -4 : -2
      }
    }
  };
}
```

- [ ] **Step 4: Run the config test again**

Run:

```bash
yarn vitest run tests/unit/config/xuanjianCombat.test.ts
```

Expected: PASS with the new encounter helpers exported from `xuanjianCombat.ts`.

- [ ] **Step 5: Commit the contract/config foundation**

```bash
git add src/types/cultivationCombat.ts src/types/cultivationCanonical.ts src/types/services.ts src/config/xuanjianCombat.ts tests/unit/config/xuanjianCombat.test.ts
git commit -m "feat: add unified xuanjian encounter contracts"
```

## Task 2: Roll Mixed Loot And Persist Pending Encounter Offers

**Files:**
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/services/CultivationRewardEngine.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/services/CultivationService.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/unit/services/CultivationRewardEngine.test.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/integration/xuanjian-task-cultivation-flow.test.ts`

- [ ] **Step 1: Write failing tests for guardian offers and pending persistence**

Append to `tests/unit/services/CultivationRewardEngine.test.ts`:

```ts
test('forced offer override returns a guardian offer instead of immediate combat', () => {
  const encounter = rollFocusEncounter(() => 0.12, 'realm.taixi', null, 'offer');

  expect(encounter).toMatchObject({
    type: 'offer',
    spiritStoneDelta: 0,
    obtainedDefinitionIds: []
  });
  expect(encounter.offerSummary).toMatchObject({
    lootDisplayName: expect.any(String),
    guardianStyle: expect.stringMatching(/rush|guard|movement|sense|hybrid/),
    riskTier: expect.stringMatching(/ordinary|tough|dangerous|deadly/)
  });
});
```

Append to `tests/integration/xuanjian-task-cultivation-flow.test.ts`:

```ts
test('守宝奇遇应先保存 pending offer，而不是立刻结算战斗或发放宝物', async () => {
  const userId = 602101;
  const cultivationService = new CultivationService();
  const created = await taskService.createTask(userId, 'phase-e guardian offer', 60);

  await cultivationService.setDevEncounterScript(userId, 'offer', 1);
  vi.spyOn(Math, 'random').mockReturnValue(0.15);

  await backdateTask(created.task.taskId, 60);
  const completed = await taskService.completeTask(userId, created.task.taskId, true);
  const refreshed = await User.findOne({ userId }).lean();

  expect(completed.cultivationReward?.encounter?.type).toBe('offer');
  expect(completed.cultivationReward?.immortalStones).toBe(0);
  expect(completed.cultivationReward?.encounter?.combatSummary).toBeUndefined();
  expect(refreshed?.cultivation.canonical.state.combatFlags.pendingEncounterOffer).toMatchObject({
    offerId: expect.any(String),
    lootDisplayName: expect.any(String)
  });
  expect(refreshed?.cultivation.canonical.state.inventoryItemIds).toEqual([]);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```bash
yarn vitest run tests/unit/services/CultivationRewardEngine.test.ts tests/integration/xuanjian-task-cultivation-flow.test.ts
```

Expected: FAIL because `offer` is not a supported encounter category and `awardCultivation()` still auto-resolves `combat`.

- [ ] **Step 3: Refactor the reward pipeline to emit offers and persist them**

In `src/services/CultivationRewardEngine.ts`, add a dedicated `offer` result branch:

```ts
import {
  buildGuardianEncounter,
  rollEncounterLoot,
  rollGuardianPrototypeId
} from '../config/xuanjianCombat.js';

function buildOfferResult(realmId: RealmId, rng: () => number): CultivationEncounterResult {
  const loot = rollEncounterLoot(rng);
  const prototypeId = rollGuardianPrototypeId(rng, loot.tier);
  const generated = buildGuardianEncounter({
    prototypeId,
    realmId,
    realmSubStageId: realmId === 'realm.zhuji'
      ? 'realmSubStage.zhuji.middle'
      : realmId === 'realm.lianqi'
        ? 'realmSubStage.lianqi.5'
        : 'realmSubStage.taixi.qingyuan',
    lootTier: loot.tier,
    seed: Math.floor(rng() * 1_000_000)
  });

  return {
    type: 'offer',
    message: `✨ 你发现了 ${loot.displayName}，却有守宝之物拦路。`,
    spiritStoneDelta: 0,
    obtainedDefinitionIds: [],
    offerSummary: {
      offerId: `offer_${Date.now()}`,
      lootDefinitionId: loot.definitionId,
      lootDisplayName: loot.displayName,
      lootTier: loot.tier,
      guardianStyle: generated.guardianStyle,
      riskTier: generated.riskTier,
      guardianEncounterId: generated.encounter.id,
      guardianName: generated.enemy.name
    }
  };
}
```

Update the dev override and default encounter selection:

```ts
export function rollFocusEncounter(
  rng: () => number,
  realmId: RealmId,
  buff?: DivinationBuff | null,
  forcedEncounterType?: DevEncounterType | null
): CultivationEncounterResult {
  if (forcedEncounterType === 'offer') {
    return buildOfferResult(realmId, rng);
  }

  // keep none / stones / item / combat branches unchanged
}
```

In `src/services/CultivationService.ts`, add pending-offer helpers and store the offer instead of resolving it immediately:

```ts
private getPendingEncounterOfferFromCanonical(canonical: IUserCultivationCanonical) {
  const rawOffer = canonical.state.combatFlags.pendingEncounterOffer;
  if (!rawOffer || typeof rawOffer !== 'object') {
    return null;
  }
  return rawOffer as PendingEncounterOfferState;
}

private setPendingEncounterOfferValue(
  canonical: IUserCultivationCanonical,
  offer: PendingEncounterOfferState | null
) {
  if (offer) {
    canonical.state.combatFlags.pendingEncounterOffer = offer;
    return;
  }

  delete canonical.state.combatFlags.pendingEncounterOffer;
}
```

Then in `awardCultivation()` replace the auto-combat branch with a store-only branch for `offer`:

```ts
if (encounter.type === 'offer' && encounter.offerSummary) {
  const loot = getEncounterLootByDefinitionId(encounter.offerSummary.lootDefinitionId);
  this.setPendingEncounterOfferValue(canonical, {
    ...encounter.offerSummary,
    createdAt: new Date(),
    grantMode: loot?.grantMode ?? 'inventory',
    obtainedDefinitionIdsOnWin: loot ? [loot.definitionId] : [],
    deferredContentId: loot?.contentId
  });
}

if (encounter.type === 'combat' && encounter.combatEncounterId) {
  // keep existing combat auto-resolution branch unchanged
}
```

Also make sure `offer` does not grant inventory or stones during task completion:

```ts
user.addImmortalStones(encounter.type === 'offer' ? 0 : encounter.spiritStoneDelta);
for (const definitionId of encounter.type === 'offer' ? [] : encounter.obtainedDefinitionIds) {
  user.grantInventoryDefinition(definitionId, encounter.type === 'combat' ? 'encounter' : 'focus');
}
```

- [ ] **Step 4: Run the focused reward tests again**

Run:

```bash
yarn vitest run tests/unit/services/CultivationRewardEngine.test.ts tests/integration/xuanjian-task-cultivation-flow.test.ts
```

Expected: PASS with `encounter.type === 'offer'` and `pendingEncounterOffer` persisted in canonical state.

- [ ] **Step 5: Commit the reward-pipeline refactor**

```bash
git add src/services/CultivationRewardEngine.ts src/services/CultivationService.ts tests/unit/services/CultivationRewardEngine.test.ts tests/integration/xuanjian-task-cultivation-flow.test.ts
git commit -m "feat: persist xuanjian guardian encounter offers"
```

## Task 3: Add Telegram Choice Callbacks And Resolve Guardian Contests

**Files:**
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/utils/constants.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/bot.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/handlers/taskCommands.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/services/CultivationService.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/services/CombatService.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/unit/handlers/taskCommands.test.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/unit/bot.test.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/integration/xuanjian-task-cultivation-flow.test.ts`

- [ ] **Step 1: Write failing tests for offer callbacks and contest resolution**

Append to `tests/unit/handlers/taskCommands.test.ts`:

```ts
test('完成任务消息在守宝奇遇时应追加风险文案和离开/争抢按钮', async () => {
  const handlers = new TaskCommandHandlers({
    bot: bot as never,
    taskService: taskService as never,
    cultivationService: {
      abandonEncounterOffer: vi.fn(),
      contestEncounterOffer: vi.fn()
    } as never,
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
        user: { stats: { currentStreak: 1 } }
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
```

Append to `tests/unit/bot.test.ts`:

```ts
test('routes guardian encounter callbacks to TaskCommandHandlers', async () => {
  const answerCallbackQuery = vi.fn().mockResolvedValue(undefined);
  const handleAbandonEncounterCallback = vi.fn().mockResolvedValue(undefined);
  const handleContestEncounterCallback = vi.fn().mockResolvedValue(undefined);
  const bot = Object.create(SelfControlBot.prototype) as SelfControlBot & {
    bot: { answerCallbackQuery: ReturnType<typeof vi.fn> };
    taskHandlers: {
      handleAbandonEncounterCallback: ReturnType<typeof vi.fn>;
      handleContestEncounterCallback: ReturnType<typeof vi.fn>;
    };
  };

  bot.bot = { answerCallbackQuery };
  bot.taskHandlers = {
    handleAbandonEncounterCallback,
    handleContestEncounterCallback
  };

  await bot.handleCallbackQuery({
    id: 'guardian-contest',
    from: { id: 5515965469 },
    data: 'encounter_contest_offer_1',
    message: { message_id: 901 }
  } as never);

  await bot.handleCallbackQuery({
    id: 'guardian-abandon',
    from: { id: 5515965469 },
    data: 'encounter_abandon_offer_1',
    message: { message_id: 902 }
  } as never);

  expect(handleContestEncounterCallback).toHaveBeenCalledWith(5515965469, 'encounter_contest_offer_1');
  expect(handleAbandonEncounterCallback).toHaveBeenCalledWith(5515965469, 'encounter_abandon_offer_1');
});
```

Append to `tests/integration/xuanjian-task-cultivation-flow.test.ts`:

```ts
test('放弃守宝奇遇应无伤结束，争抢守宝奇遇应清空 pending offer 并结算战斗', async () => {
  const userId = 602102;
  const cultivationService = new CultivationService();
  const user = await User.create({ userId, username: 'guardian-resolution' });
  const canonical = user.ensureCanonicalCultivation();
  canonical.state.combatFlags.pendingEncounterOffer = {
    offerId: 'offer_resolution_1',
    lootDefinitionId: 'manual.art.returning_origin_shield',
    lootDisplayName: '归元盾传承玉简',
    lootTier: '玄',
    guardianStyle: 'hybrid',
    riskTier: 'dangerous',
    guardianEncounterId: 'generated.encounter.guardian.hybrid.99',
    guardianName: '镇宝异种',
    createdAt: new Date('2026-04-23T08:00:00.000Z'),
    grantMode: 'deferred_battle_art',
    obtainedDefinitionIdsOnWin: ['manual.art.returning_origin_shield'],
    deferredContentId: 'art.returning_origin_shield'
  };
  user.replaceCanonicalCultivation(canonical);
  user.syncLegacyCultivationShell();
  await user.save();

  const abandoned = await cultivationService.abandonEncounterOffer(userId, 'offer_resolution_1');
  expect(abandoned.lootDisplayName).toBe('归元盾传承玉简');

  const afterAbandon = await User.findOne({ userId }).lean();
  expect(afterAbandon?.cultivation.canonical.state.combatFlags.pendingEncounterOffer).toBeUndefined();
  expect(afterAbandon?.cultivation.canonical.state.injuryState.level).toBe('none');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```bash
yarn vitest run tests/unit/handlers/taskCommands.test.ts tests/unit/bot.test.ts tests/integration/xuanjian-task-cultivation-flow.test.ts
```

Expected: FAIL because `encounter_abandon_` / `encounter_contest_` callbacks and `abandonEncounterOffer()` do not exist yet.

- [ ] **Step 3: Implement the callback surface and guardian resolution flow**

In `src/utils/constants.ts`, add callback prefixes:

```ts
export const CALLBACK_PREFIXES = {
  COMPLETE_TASK: 'complete_task_',
  FAIL_TASK: 'fail_task_',
  START_RESERVED: 'start_reserved_',
  DELAY_RESERVATION: 'delay_reservation_',
  CANCEL_RESERVATION: 'cancel_reservation_',
  ENCOUNTER_ABANDON: 'encounter_abandon_',
  ENCOUNTER_CONTEST: 'encounter_contest_',
  SETTINGS: 'settings_',
  PATTERN_EXECUTE: 'pattern_execute_',
  PRECEDENT_BREAK: 'precedent_break_',
  PRECEDENT_ALLOW: 'precedent_allow_'
} as const;
```

In `src/bot.ts`, wire them into the existing callback branch:

```ts
if (data.startsWith(CALLBACK_PREFIXES.COMPLETE_TASK)) {
  await this.getTaskHandlers().handleCompleteTaskCallback(userId, data);
} else if (data.startsWith(CALLBACK_PREFIXES.FAIL_TASK)) {
  await this.getTaskHandlers().handleFailTaskCallback(userId, data);
} else if (data.startsWith(CALLBACK_PREFIXES.ENCOUNTER_ABANDON)) {
  await this.getTaskHandlers().handleAbandonEncounterCallback(userId, data);
} else if (data.startsWith(CALLBACK_PREFIXES.ENCOUNTER_CONTEST)) {
  await this.getTaskHandlers().handleContestEncounterCallback(userId, data);
} else if (data.startsWith(CALLBACK_PREFIXES.START_RESERVED)) {
  await this.getTaskHandlers().handleStartReservedCallback(userId, data);
}
```

In `src/handlers/taskCommands.ts`, inject `cultivationService`, render offer messages with buttons, and add new callback handlers:

```ts
interface TaskCommandDependencies {
  bot: TelegramBot;
  taskService: TaskService;
  cultivationService: CultivationService;
  queueService: QueueService;
  ctdpService?: CTDPService;
  onError: ErrorReporter;
}
```

Also update `SelfControlBot.initializeHandlers()` in `src/bot.ts` so the handler actually receives the service:

```ts
this.taskHandlers = new TaskCommandHandlers({
  bot,
  taskService: this.taskService,
  cultivationService: this.cultivationService,
  queueService: this.queueService,
  ctdpService: this.ctdpService,
  onError: this.sendErrorMessage.bind(this)
});
```

```ts
if (reward.encounter?.offerSummary) {
  message += `\n💎 宝物：${reward.encounter.offerSummary.lootDisplayName}`;
  message += `\n⚠️ 风险：${formatEncounterRiskTierLabel(reward.encounter.offerSummary.riskTier)}`;
  message += `\n🧿 守宝风格：${formatGuardianStyleLabel(reward.encounter.offerSummary.guardianStyle)}`;

  await this.bot.sendMessage(userId, message, {
    reply_markup: {
      inline_keyboard: [[
        {
          text: '🚶 离开',
          callback_data: `${CALLBACK_PREFIXES.ENCOUNTER_ABANDON}${reward.encounter.offerSummary.offerId}`
        },
        {
          text: '⚔️ 争抢',
          callback_data: `${CALLBACK_PREFIXES.ENCOUNTER_CONTEST}${reward.encounter.offerSummary.offerId}`
        }
      ]]
    }
  });
  return;
}
```

Add the callback handlers:

```ts
async handleAbandonEncounterCallback(userId: number, data: string): Promise<void> {
  const offerId = data.replace(CALLBACK_PREFIXES.ENCOUNTER_ABANDON, '');
  const offer = await this.cultivationService.abandonEncounterOffer(userId, offerId);
  await this.bot.sendMessage(userId, `🚶 你放弃了 ${offer.lootDisplayName}，此宝已随机缘散去。`);
}

async handleContestEncounterCallback(userId: number, data: string): Promise<void> {
  const offerId = data.replace(CALLBACK_PREFIXES.ENCOUNTER_CONTEST, '');
  const encounter = await this.cultivationService.contestEncounterOffer(userId, offerId);

  let message = `⚔️ 你决定争抢 ${encounter.offerSummary?.lootDisplayName ?? '机缘宝物'}！\n`;
  message += `\n斗法结果：${formatCombatOutcomeLabel(encounter.combatSummary?.result ?? 'loss')}`;
  message += `\n对手：${encounter.combatSummary?.enemyName ?? '守宝敌手'}`;
  message += `\n战报：${encounter.combatSummary?.summary ?? '斗法落幕。'}`;

  if (encounter.combatSummary?.injuryLevel && encounter.combatSummary.injuryLevel !== 'none') {
    message += `\n伤势：${formatInjuryLevelLabel(encounter.combatSummary.injuryLevel)}`;
  }

  await this.bot.sendMessage(userId, message);
}
```

In `src/services/CombatService.ts`, add a generated-encounter path:

```ts
resolveGeneratedEncounterCombat(input: {
  canonical: IUserCultivationCanonical;
  offer: PendingEncounterOfferState;
  seed: number;
}) {
  const generated = buildGuardianEncounter({
    prototypeId: offer.guardianStyle === 'guard'
      ? 'guardian.guard'
      : offer.guardianStyle === 'movement'
        ? 'guardian.movement'
        : offer.guardianStyle === 'sense'
          ? 'guardian.sense'
          : offer.guardianStyle === 'hybrid'
            ? 'guardian.hybrid'
            : 'guardian.rush',
    realmId: input.canonical.state.realmId,
    realmSubStageId: input.canonical.state.realmSubStageId,
    lootTier: offer.lootTier,
    seed: input.seed
  });

  return this.resolveCombatFromDefinition({
    canonical: input.canonical,
    encounter: generated.encounter,
    enemyTemplate: generated.enemy,
    seed: input.seed
  });
}
```

In `src/services/CultivationService.ts`, add the offer-resolution methods:

```ts
async abandonEncounterOffer(userId: number, offerId: string): Promise<EncounterOfferSummary> {
  const user = await User.findOne({ userId });
  if (!user) throw new Error('用户不存在');

  const canonical = user.ensureCanonicalCultivation();
  this.normalizePhaseAState(canonical);
  const offer = this.getPendingEncounterOfferFromCanonical(canonical);
  if (!offer || offer.offerId !== offerId) {
    throw new Error('该守宝奇遇已失效');
  }

  this.setPendingEncounterOfferValue(canonical, null);
  user.replaceCanonicalCultivation(canonical);
  user.syncLegacyCultivationShell();
  await user.save();

  return offer;
}

async contestEncounterOffer(userId: number, offerId: string): Promise<CultivationEncounterResult> {
  const user = await User.findOne({ userId });
  if (!user) throw new Error('用户不存在');

  const canonical = user.ensureCanonicalCultivation();
  this.normalizePhaseAState(canonical);
  const offer = this.getPendingEncounterOfferFromCanonical(canonical);
  if (!offer || offer.offerId !== offerId) {
    throw new Error('该守宝奇遇已失效');
  }

  const combat = this.combatService.resolveGeneratedEncounterCombat({
    canonical,
    offer,
    seed: Math.floor(Math.random() * 1_000_000)
  });

  this.setPendingEncounterOfferValue(canonical, null);
  // reuse the existing injury / history / cooldown patch logic from awardCultivation()
```

Then finish `contestEncounterOffer()` by copying the same patch application shape already used in `awardCultivation()` and return:

```ts
  return {
    type: 'combat',
    message: `⚔️ 你与${combat.resolution.enemyName}争抢 ${offer.lootDisplayName}。`,
    spiritStoneDelta: combat.patch.spiritStoneDelta,
    obtainedDefinitionIds: combat.patch.obtainedDefinitionIds,
    offerSummary: offer,
    combatSummary: {
      encounterId: combat.resolution.encounterId,
      enemyName: combat.resolution.enemyName,
      result: combat.resolution.outcome,
      summary: combat.resolution.summary,
      injuryLevel: canonical.state.injuryState.level
    }
  };
}
```

- [ ] **Step 4: Run the callback and flow tests again**

Run:

```bash
yarn vitest run tests/unit/handlers/taskCommands.test.ts tests/unit/bot.test.ts tests/integration/xuanjian-task-cultivation-flow.test.ts
```

Expected: PASS with new callback routing and pending-offer resolution.

- [ ] **Step 5: Commit the interaction flow**

```bash
git add src/utils/constants.ts src/bot.ts src/handlers/taskCommands.ts src/services/CultivationService.ts src/services/CombatService.ts tests/unit/handlers/taskCommands.test.ts tests/unit/bot.test.ts tests/integration/xuanjian-task-cultivation-flow.test.ts
git commit -m "feat: add guardian encounter choice callbacks"
```

## Task 4: Add Deferred-Loot Gating, Dev Smoke Support, And Docs

**Files:**
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/services/CultivationService.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/handlers/cultivationCommands.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/unit/handlers/cultivationCommands.test.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/integration/xuanjian-task-cultivation-flow.test.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/docs/cultivation/xuanjian-dev-manual.md`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/docs/cultivation/smoke-test-checklist.md`

- [ ] **Step 1: Write failing tests for deferred loot and dev smoke**

Append to `tests/integration/xuanjian-task-cultivation-flow.test.ts`:

```ts
test('争抢高阶传承成功后应只入包待参悟，不应立刻写入 knownBattleArtIds', async () => {
  const userId = 602103;
  const cultivationService = new CultivationService();
  const user = await User.create({ userId, username: 'guardian-deferred-art' });
  const canonical = user.ensureCanonicalCultivation();
  canonical.state.combatFlags.pendingEncounterOffer = {
    offerId: 'offer_deferred_1',
    lootDefinitionId: 'manual.art.returning_origin_shield',
    lootDisplayName: '归元盾传承玉简',
    lootTier: '玄',
    guardianStyle: 'guard',
    riskTier: 'dangerous',
    guardianEncounterId: 'generated.encounter.guardian.guard.4',
    guardianName: '守宝甲兽',
    createdAt: new Date('2026-04-23T08:00:00.000Z'),
    grantMode: 'deferred_battle_art',
    obtainedDefinitionIdsOnWin: ['manual.art.returning_origin_shield'],
    deferredContentId: 'art.returning_origin_shield'
  };
  user.replaceCanonicalCultivation(canonical);
  user.syncLegacyCultivationShell();
  await user.save();

  vi.spyOn(Math, 'random').mockReturnValue(0.1);
  await cultivationService.contestEncounterOffer(userId, 'offer_deferred_1');

  const refreshed = await User.findOne({ userId }).lean();
  const inventoryDefinitionIds = refreshed?.cultivation.canonical.inventory.map((item) => item.definitionId) ?? [];

  expect(inventoryDefinitionIds).toContain('manual.art.returning_origin_shield');
  expect(refreshed?.cultivation.canonical.state.knownBattleArtIds).not.toContain('art.returning_origin_shield');
  expect(refreshed?.cultivation.canonical.state.battleLoadout.equippedBattleArtIds).not.toContain('art.returning_origin_shield');
});
```

Append to `tests/unit/handlers/cultivationCommands.test.ts`:

```ts
test('/dev_encounter_set 应接受 offer 类别用于守宝奇遇冒烟', async () => {
  const handler = new CultivationCommandHandlers({
    sendMessage,
    deleteMessage,
    onText
  } as never);

  handler.cultivationService = {
    setDevEncounterScript: vi.fn().mockResolvedValue({
      type: 'offer',
      remainingUses: 2
    })
  } as never;

  await handler.handleDevEncounterSetCommand({
    chat: { id: 5515965469 },
    from: { id: 5515965469 }
  } as never, ['/dev_encounter_set offer 2', 'offer', '2'] as never);

  expect(sendMessage).toHaveBeenCalledWith(
    5515965469,
    expect.stringContaining('类别：offer'),
    undefined
  );
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```bash
yarn vitest run tests/unit/handlers/cultivationCommands.test.ts tests/integration/xuanjian-task-cultivation-flow.test.ts
```

Expected: FAIL because `/dev_encounter_set` rejects `offer` and `contestEncounterOffer()` still grants loot without deferred gating.

- [ ] **Step 3: Implement deferred gating, dev hook support, and docs**

In `src/services/CultivationService.ts`, keep high-tier content out of runtime-ready ownership lists:

```ts
private grantEncounterOfferLoot(user: UserDocument, offer: PendingEncounterOfferState) {
  for (const definitionId of offer.obtainedDefinitionIdsOnWin) {
    user.grantInventoryDefinition(definitionId, 'encounter');
  }

  if (offer.grantMode === 'deferred_battle_art' || offer.grantMode === 'deferred_divine_power') {
    return;
  }
}
```

Call it in `contestEncounterOffer()` only on win / narrow_win:

```ts
if (combat.resolution.outcome !== 'loss') {
  this.grantEncounterOfferLoot(user, offer);
}
```

In `src/handlers/cultivationCommands.ts`, accept the new dev category:

```ts
if (!type || !countText) {
  await this.bot.sendMessage(chatId, '❌ 用法：/dev_encounter_set <none|stones|item|combat|offer> <count>');
  return;
}
```

Update the validation message returned by `CultivationService.setDevEncounterScript()`:

```ts
if (!['none', 'stones', 'item', 'combat', 'offer'].includes(type)) {
  throw new Error('奇遇类别必须是 none / stones / item / combat / offer');
}
```

In `docs/cultivation/xuanjian-dev-manual.md`, replace the starter-only description with the new interaction model:

```md
### 当前统一奇遇框架

- 奇遇池按宝物混池，不再按前中期大境拆表
- 高价值宝物通常会生成守宝敌人，但玩家拥有 `离开 / 争抢` 两个选择
- `离开` 时宝物直接消失，无伤无损
- 混池掉到的高阶法门 / 神通会先入包为 `待参悟`，不会直接变成立刻可用技能
```

In `docs/cultivation/smoke-test-checklist.md`, add a guardian-offer matrix:

```md
| E.1 | `/dev_encounter_set offer 1` | 完成 60 分钟任务 | 完成任务消息出现 `离开 / 争抢` 按钮 |
| E.2 | 点击 `离开` | 待处理守宝奇遇存在 | 宝物消失，无伤、无灵石扣减 |
| E.3 | 点击 `争抢` | 待处理守宝奇遇存在 | 进入斗法结算，落库 `combatHistorySummary` |
| E.4 | 掉落高阶传承 | 胎息 / 练气用户 | 入包 `manual.*`，不写入 `knownBattleArtIds / knownDivinePowerIds` |
```

- [ ] **Step 4: Run the full targeted regression suite**

Run:

```bash
yarn vitest run \
  tests/unit/config/xuanjianCombat.test.ts \
  tests/unit/services/CultivationRewardEngine.test.ts \
  tests/unit/handlers/taskCommands.test.ts \
  tests/unit/handlers/cultivationCommands.test.ts \
  tests/unit/bot.test.ts \
  tests/integration/xuanjian-task-cultivation-flow.test.ts
```

Expected: PASS with guardian offers, abandon/contest callbacks, deferred loot gating, and updated dev smoke hooks.

- [ ] **Step 5: Commit the final docs and deferred-loot closure**

```bash
git add src/services/CultivationService.ts src/handlers/cultivationCommands.ts tests/unit/handlers/cultivationCommands.test.ts tests/integration/xuanjian-task-cultivation-flow.test.ts docs/cultivation/xuanjian-dev-manual.md docs/cultivation/smoke-test-checklist.md
git commit -m "feat: finish xuanjian unified guardian encounter flow"
```
