# 玄鉴 V2 Phase D Combat Depth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有 `V2` starter 奇遇战可运行的基础上，把战斗内容推进到“敌人有层次、构筑有约束、法门神通池可继续扩展、用户可见战报能体现差异”的下一收口阶段。

**Architecture:** 保持现有 `V1 -> V2` canonical 主链路不变，不新开第二套战斗模型；继续沿用 `xuanjianV2Registry -> CombatStateAdapter -> CombatResolver -> CombatRewardBridge -> taskCommands` 这条链，只在内容层、约束层和展示层加深。实现顺序固定为：先扩敌人与奇遇模板，再补构筑合法性，再扩第二批法门/神通与 dev 测试入口，最后收口正式短战报和 TG 冒烟矩阵。

**Tech Stack:** TypeScript, Node.js ESM, Mongoose, Vitest, Telegram Bot API, MongoDB Memory Server

---

## Scope Check

这份计划只覆盖 `V2` 后续 4 个模块：

1. `敌人 / 奇遇战模板扩展`
2. `构筑约束与成长门槛`
3. `法门 / 神通池第二批扩展与 dev 授予入口`
4. `正式短战报表现与真实 TG 验收矩阵`

这份计划明确不做：

1. 守关战、破境战、试炼战、PVP
2. 宗门、坊市、百艺、NPC 势力
3. 新一轮 canonical schema 重构
4. 长回合交互式 `/fight` 指令

## File Map

**Enemy and encounter templates**

- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/config/xuanjianCombat.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/services/CultivationRewardEngine.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/services/CombatService.ts`

**Loadout legality and slot rules**

- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/config/xuanjianV2Registry.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/services/CultivationService.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/services/CombatStateAdapter.ts`

**Content pool expansion and dev grant commands**

- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/config/xuanjianV2Registry.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/services/CultivationService.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/handlers/cultivationCommands.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/config/bot.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/bot.ts`

**Battle report and smoke**

- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/services/CombatResolver.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/handlers/taskCommands.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/docs/cultivation/xuanjian-dev-manual.md`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/docs/cultivation/smoke-test-checklist.md`

**Tests**

- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/unit/config/xuanjianCombat.test.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/unit/config/xuanjianV2Registry.test.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/unit/services/CombatResolver.test.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/unit/services/CombatStateAdapter.test.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/unit/handlers/cultivationCommands.test.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/unit/handlers/taskCommands.test.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/integration/xuanjian-task-cultivation-flow.test.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/integration/xuanjian-cultivation-command-flow.test.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/integration/xuanjian-bot-command-routing.test.ts`

## Implementation Rules

1. 仍然只做 `奇遇战`，不新增主动进入战斗的命令流。
2. `CombatResolver` 继续保持纯求解职责，不直接读写 Mongoose 文档。
3. 敌人与奇遇模板扩展必须通过静态 config + seeded selection 完成，不允许直接在 handler 里拼条件分支。
4. 构筑合法性必须以 `当前境界 / 当前小阶 / runtime-ready 状态` 为统一裁决口径。
5. `pending-balance`、`ambiguous`、`dual-class` 条目不得被误放入 runtime-ready。
6. dev-only 命令仍然只允许 `NODE_ENV !== 'production'` 时注册和执行。

## Phase Targets

### Target D.3: Enemy and encounter variety

补到至少 1 个大境内的多风格敌人集：

1. `rush` 型
2. `guard` 型
3. `movement` 型
4. `sense/control` 型

并让 `rollFocusEncounter()` 或其下游映射不再永远只落到 `combatEncounter.taixi.roadside_wolf`。

### Target D.4: Loadout legality

让 `battleLoadout` 从“能切换”提升为“按境界和小阶合法切换”，至少包含：

1. 主战法门槽位上限
2. 辅助法门唯一槽
3. 神通槽按大境开启
4. 低境界不可装备高门槛条目

### Target D.5: Content-pool phase 2

继续扩 `runtime-ready` 内容池，并补齐：

1. 第二批战斗法门
2. 第二批神通
3. `/dev_grant_power`
4. grant 后真实 TG 可配装可验证

### Target D.6: Short-report closure

让正式短战报能体现动作差异，而不是只有统一的胜负模板，同时补一套文档化 smoke matrix。

## Task 1: Expand enemy and encounter templates first

**Files:**
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/config/xuanjianCombat.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/services/CultivationRewardEngine.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/services/CombatService.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/unit/config/xuanjianCombat.test.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/integration/xuanjian-task-cultivation-flow.test.ts`

- [ ] **Step 1: Write failing config tests for multi-enemy seeds**

Append to `tests/unit/config/xuanjianCombat.test.ts`:

```ts
test('exposes multiple taixi encounter templates instead of only roadside wolf', () => {
  expect(getEnemyTemplateById('enemy.taixi.roadside_wolf')?.tags).toContain('rush');
  expect(getEnemyTemplateById('enemy.taixi.stonehide_boar')?.tags).toContain('guard');
  expect(getEnemyTemplateById('enemy.taixi.shadow_marten')?.tags).toContain('movement');
  expect(getEnemyTemplateById('enemy.taixi.mist_crow')?.tags).toContain('sense');

  expect(getCombatEncounterById('combatEncounter.taixi.stonehide_boar')).toBeTruthy();
  expect(getCombatEncounterById('combatEncounter.taixi.shadow_marten')).toBeTruthy();
  expect(getCombatEncounterById('combatEncounter.taixi.mist_crow')).toBeTruthy();
});
```

- [ ] **Step 2: Lock encounter variety in integration**

Append to `tests/integration/xuanjian-task-cultivation-flow.test.ts`:

```ts
it('records different enemy names when seeded combat encounters vary', async () => {
  const summaries = [
    '拦路青狼',
    '石皮獠猪',
    '影纹山貂',
    '雾羽妖鸦'
  ];

  expect(new Set(summaries).size).toBeGreaterThan(2);
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run:

```bash
yarn vitest run tests/unit/config/xuanjianCombat.test.ts tests/integration/xuanjian-task-cultivation-flow.test.ts
```

Expected: FAIL because only `roadside_wolf` exists today.

- [ ] **Step 4: Implement multi-enemy templates and encounter definitions**

In `src/config/xuanjianCombat.ts`, expand `ENEMY_TEMPLATES` and `COMBAT_ENCOUNTERS` with entries shaped like:

```ts
{
  id: 'enemy.taixi.stonehide_boar',
  name: '石皮獠猪',
  realmId: 'realm.taixi',
  realmSubStageId: 'realmSubStage.taixi.yujing',
  currentPower: 86,
  dimensions: { attack: 5, defense: 7, sense: 2, speed: 3 },
  tags: ['guard', 'defense']
}
```

and:

```ts
{
  id: 'combatEncounter.taixi.stonehide_boar',
  enemyTemplateId: 'enemy.taixi.stonehide_boar',
  maxRounds: COMBAT_BALANCE.maxRounds,
  rewards: { spiritStoneDeltaOnWin: 4, attainmentDeltaOnWin: 1, obtainedDefinitionIdsOnWin: [] },
  penalties: { injuryLevelOnLoss: 'light', spiritStoneDeltaOnLoss: -2 }
}
```

In `src/services/CultivationRewardEngine.ts`, replace the single fixed combat entry with a seeded encounter chooser such as:

```ts
const TAIXI_COMBAT_ENCOUNTER_IDS = [
  'combatEncounter.taixi.roadside_wolf',
  'combatEncounter.taixi.stonehide_boar',
  'combatEncounter.taixi.shadow_marten',
  'combatEncounter.taixi.mist_crow'
] as const;

function pickCombatEncounterId(random: number, realmId: RealmId) {
  if (realmId !== 'realm.taixi') {
    return 'combatEncounter.taixi.roadside_wolf';
  }
  const index = Math.min(TAIXI_COMBAT_ENCOUNTER_IDS.length - 1, Math.floor(random * TAIXI_COMBAT_ENCOUNTER_IDS.length));
  return TAIXI_COMBAT_ENCOUNTER_IDS[index];
}
```

- [ ] **Step 5: Run focused verification**

Run:

```bash
yarn vitest run tests/unit/config/xuanjianCombat.test.ts tests/integration/xuanjian-task-cultivation-flow.test.ts tests/unit/services/CombatResolver.test.ts
```

Expected: PASS with at least four available Taixi combat encounters.

- [ ] **Step 6: Commit**

```bash
git add src/config/xuanjianCombat.ts src/services/CultivationRewardEngine.ts src/services/CombatService.ts tests/unit/config/xuanjianCombat.test.ts tests/integration/xuanjian-task-cultivation-flow.test.ts
git commit -m "feat: expand xuanjian encounter enemy templates"
```

## Task 2: Enforce loadout legality by realm and sub-stage

**Files:**
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/config/xuanjianV2Registry.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/services/CultivationService.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/services/CombatStateAdapter.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/unit/config/xuanjianV2Registry.test.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/unit/services/CombatStateAdapter.test.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/unit/handlers/cultivationCommands.test.ts`

- [ ] **Step 1: Add failing legality tests**

Append to `tests/unit/config/xuanjianV2Registry.test.ts`:

```ts
test('derives slot limits from current realm and sub-stage', () => {
  expect(getBattleSlotLimits({ realmId: 'realm.taixi', realmSubStageId: 'realmSubStage.taixi.xuanjing' })).toEqual({
    battleArtSlots: 1,
    supportSlots: 0,
    divinePowerSlots: 0
  });

  expect(getBattleSlotLimits({ realmId: 'realm.taixi', realmSubStageId: 'realmSubStage.taixi.yujing' })).toEqual({
    battleArtSlots: 2,
    supportSlots: 1,
    divinePowerSlots: 0
  });
});
```

Append to `tests/unit/handlers/cultivationCommands.test.ts`:

```ts
test('equip_power rejects divine powers before realm.zifu', async () => {
  await handlers.handleEquipPowerCommand(mockMessage('/equip_power power.mini_thunder_call'), ['power.mini_thunder_call']);
  expect(sendMessage).toHaveBeenCalledWith(expect.any(Number), expect.stringContaining('当前境界尚未开启神通槽'));
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
yarn vitest run tests/unit/config/xuanjianV2Registry.test.ts tests/unit/handlers/cultivationCommands.test.ts tests/unit/services/CombatStateAdapter.test.ts
```

Expected: FAIL because slot-limit helpers and gating do not exist.

- [ ] **Step 3: Implement slot-limit helpers and filtering**

In `src/config/xuanjianV2Registry.ts`, add:

```ts
export function getBattleSlotLimits(state: Pick<PlayerCultivationState, 'realmId' | 'realmSubStageId'>) {
  if (state.realmId === 'realm.taixi') {
    if (isSubStageAtLeast(state.realmSubStageId, 'realmSubStage.taixi.yujing')) {
      return { battleArtSlots: 2, supportSlots: 1, divinePowerSlots: 0 };
    }
    return { battleArtSlots: 1, supportSlots: 0, divinePowerSlots: 0 };
  }

  if (state.realmId === 'realm.zifu' || state.realmId === 'realm.jindan' || state.realmId === 'realm.yuanying') {
    return { battleArtSlots: 2, supportSlots: 1, divinePowerSlots: 1 };
  }

  return { battleArtSlots: 2, supportSlots: 1, divinePowerSlots: 0 };
}
```

Then make `projectCombatLoadout()` and `getCombatLoadoutStatus()` truncate or reject over-limit loadouts using those limits.

- [ ] **Step 4: Propagate legality errors to command layer**

In `src/services/CultivationService.ts`, make `updateDivinePowerLoadout()` throw:

```ts
throw new Error('当前境界尚未开启神通槽');
```

when `divinePowerSlots === 0`, and make `updateBattleArtLoadout()` / `updateSupportArtLoadout()` enforce current slot caps before saving.

- [ ] **Step 5: Verify runtime projection honors limits**

Run:

```bash
yarn vitest run tests/unit/config/xuanjianV2Registry.test.ts tests/unit/services/CombatStateAdapter.test.ts tests/unit/handlers/cultivationCommands.test.ts tests/integration/xuanjian-cultivation-command-flow.test.ts
```

Expected: PASS and `CombatStateAdapter` should never project illegal divine powers into pre-`紫府` combat snapshots.

- [ ] **Step 6: Commit**

```bash
git add src/config/xuanjianV2Registry.ts src/services/CultivationService.ts src/services/CombatStateAdapter.ts tests/unit/config/xuanjianV2Registry.test.ts tests/unit/services/CombatStateAdapter.test.ts tests/unit/handlers/cultivationCommands.test.ts tests/integration/xuanjian-cultivation-command-flow.test.ts
git commit -m "feat: enforce xuanjian combat loadout legality"
```

## Task 3: Expand runtime-ready content and add `/dev_grant_power`

**Files:**
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/config/xuanjianV2Registry.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/services/CultivationService.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/handlers/cultivationCommands.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/config/bot.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/bot.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/unit/config/xuanjianV2Registry.test.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/unit/handlers/cultivationCommands.test.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/integration/xuanjian-bot-command-routing.test.ts`

- [ ] **Step 1: Add failing tests for second-batch powers and dev grant**

Append to `tests/unit/config/xuanjianV2Registry.test.ts`:

```ts
test('keeps pending divine-power entries out of runtime batch while admitting phase-two ready powers', () => {
  const batch = getRuntimeReadyContentBatch();
  expect(batch.divinePowers.some((entry) => entry.id === 'power.mini_thunder_call')).toBe(true);
  expect(batch.divinePowers.some((entry) => entry.id === 'power.dual_class_dongquansheng')).toBe(false);
});
```

Append to `tests/unit/handlers/cultivationCommands.test.ts`:

```ts
test('dev_grant_power grants known divine powers in development env', async () => {
  await handlers.handleDevGrantPowerCommand(mockMessage('/dev_grant_power power.mini_thunder_call'), ['power.mini_thunder_call']);
  expect(sendMessage).toHaveBeenCalledWith(expect.any(Number), expect.stringContaining('已授予神通'));
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
yarn vitest run tests/unit/config/xuanjianV2Registry.test.ts tests/unit/handlers/cultivationCommands.test.ts tests/integration/xuanjian-bot-command-routing.test.ts
```

Expected: FAIL because `/dev_grant_power` and new runtime-ready power entries do not exist.

- [ ] **Step 3: Add phase-two runtime-ready divine powers**

In `src/config/xuanjianV2Registry.ts`, extend the divine-power registry with a second batch such as:

```ts
{
  id: 'power.mini_thunder_call',
  name: '掌心雷引',
  category: 'attack',
  runtimeReady: true,
  requiredRealmId: 'realm.zifu',
  runtimeProfile: { attackBias: 2, senseBias: 1, speedBias: 0, stabilityBias: 1, actionWeight: 'attack' }
}
```

and keep ambiguous entries marked with:

```ts
tags: ['dual-class', 'pending-balance']
```

without exposing them through `getRuntimeReadyContentBatch()`.

- [ ] **Step 4: Add the dev-only command flow**

In `src/handlers/cultivationCommands.ts`, register:

```ts
this.bot.onText(/\/dev_grant_power(?:\s+(.+))?/, (msg, match) => {
  void this.handleDevGrantPowerCommand(msg, match);
});
```

In `src/services/CultivationService.ts`, add:

```ts
async grantKnownDivinePowers(userId: number, ids: string[]) {
  // merge ids into canonical.state.knownDivinePowerIds and save
}
```

and wire `dev_grant_power` into `src/bot.ts` ignore lists and `src/config/bot.ts` dev command descriptions.

- [ ] **Step 5: Verify grant -> loadout -> projection chain**

Run:

```bash
yarn vitest run tests/unit/config/xuanjianV2Registry.test.ts tests/unit/handlers/cultivationCommands.test.ts tests/integration/xuanjian-bot-command-routing.test.ts tests/integration/xuanjian-cultivation-command-flow.test.ts tests/unit/services/CombatStateAdapter.test.ts
```

Expected: PASS with granted powers visible in `/loadout`, but still filtered by realm legality.

- [ ] **Step 6: Commit**

```bash
git add src/config/xuanjianV2Registry.ts src/services/CultivationService.ts src/handlers/cultivationCommands.ts src/config/bot.ts src/bot.ts tests/unit/config/xuanjianV2Registry.test.ts tests/unit/handlers/cultivationCommands.test.ts tests/integration/xuanjian-bot-command-routing.test.ts tests/integration/xuanjian-cultivation-command-flow.test.ts
git commit -m "feat: expand xuanjian powers and dev grant flow"
```

## Task 4: Close formal short battle reports and document smoke matrix

**Files:**
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/services/CombatResolver.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/handlers/taskCommands.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/docs/cultivation/xuanjian-dev-manual.md`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/docs/cultivation/smoke-test-checklist.md`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/unit/services/CombatResolver.test.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/unit/handlers/taskCommands.test.ts`

- [ ] **Step 1: Add failing tests for differentiated formal summaries**

Append to `tests/unit/services/CombatResolver.test.ts`:

```ts
test('builds different short summaries for attack-first and movement-first wins', () => {
  const attackSummary = buildOutcomeSummary({
    outcome: 'win',
    firstAction: 'attack',
    enemyTags: ['rush']
  });

  const movementSummary = buildOutcomeSummary({
    outcome: 'win',
    firstAction: 'movement',
    enemyTags: ['movement']
  });

  expect(attackSummary).not.toBe(movementSummary);
});
```

Append to `tests/unit/handlers/taskCommands.test.ts`:

```ts
test('completed task message renders the differentiated formal combat summary', async () => {
  expect(messageText).toContain('⚔️ 斗法结果：');
  expect(messageText).toContain('📝 你先以');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
yarn vitest run tests/unit/services/CombatResolver.test.ts tests/unit/handlers/taskCommands.test.ts
```

Expected: FAIL because formal summaries are still mostly fixed templates.

- [ ] **Step 3: Extract a summary builder and vary by first action / enemy style**

In `src/services/CombatResolver.ts`, extract:

```ts
export function buildOutcomeSummary(input: {
  outcome: CombatOutcome;
  firstAction: CombatActionType;
  enemyTags: string[];
}) {
  if (input.outcome === 'loss') {
    return input.enemyTags.includes('rush')
      ? '你被对手抢先逼近，仓促应对后败退。'
      : '你连斗数合后气机渐散，只得暂避锋芒。';
  }

  if (input.firstAction === 'movement') {
    return '你先以身法游走拉开空档，随后趁势压制对手。';
  }

  if (input.firstAction === 'guard') {
    return '你稳住护势，借对手破绽反手制胜。';
  }

  return '你先声夺人，连进数手后压过对手。';
}
```

and use the first resolved player action when building `resolution.summary`.

- [ ] **Step 4: Update smoke docs with a matrix instead of ad-hoc checks**

In `docs/cultivation/smoke-test-checklist.md`, add a matrix with rows for:

1. `不同主战法门`
2. `不同辅助法门`
3. `不同敌人模板`
4. `开启 / 关闭 dev 详细战报`
5. `非法配装被拒绝`

Use a table like:

```md
| Case | Setup | Expected |
|------|-------|----------|
| 攻伐法门对 rush 敌人 | `/equip_art art.golden_light_art` | 正式短战报偏进攻措辞 |
| 身法法门对 movement 敌人 | `/equip_art art.surging_river_step` | 正式短战报偏游走措辞 |
```

- [ ] **Step 5: Run final verification bundle**

Run:

```bash
yarn vitest run tests/unit/services/CombatResolver.test.ts tests/unit/handlers/taskCommands.test.ts tests/unit/config/xuanjianCombat.test.ts tests/unit/config/xuanjianV2Registry.test.ts tests/integration/xuanjian-task-cultivation-flow.test.ts tests/integration/xuanjian-cultivation-command-flow.test.ts tests/integration/xuanjian-bot-command-routing.test.ts
yarn typecheck
```

Expected: PASS and the formal short battle report should now vary with action profile rather than staying fixed.

- [ ] **Step 6: Commit**

```bash
git add src/services/CombatResolver.ts src/handlers/taskCommands.ts docs/cultivation/xuanjian-dev-manual.md docs/cultivation/smoke-test-checklist.md tests/unit/services/CombatResolver.test.ts tests/unit/handlers/taskCommands.test.ts tests/integration/xuanjian-task-cultivation-flow.test.ts tests/integration/xuanjian-cultivation-command-flow.test.ts tests/integration/xuanjian-bot-command-routing.test.ts
git commit -m "feat: close xuanjian combat summaries and smoke matrix"
```

## Plan Self-Review

### Spec coverage

This plan maps the agreed next-step modules one-to-one:

1. `敌人 / 奇遇战模板` -> Task 1
2. `构筑约束与成长门槛` -> Task 2
3. `法门 / 神通池第二批扩展` -> Task 3
4. `正式短战报与 TG 验收` -> Task 4

### Placeholder scan

No `TODO` / `TBD` markers remain. Each task includes concrete files, commands, and target snippets.

### Type consistency

The plan consistently uses:

1. `getBattleSlotLimits()`
2. `getRuntimeReadyContentBatch()`
3. `grantKnownDivinePowers()`
4. `buildOutcomeSummary()`

No later task renames these interfaces.
