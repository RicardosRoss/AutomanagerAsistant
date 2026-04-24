# Xuanjian Cultivation Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将当前通用九境修仙系统迁移为《玄鉴仙族》口径的六境体系，并以兼容优先的方式保留现有用户数据与核心玩法稳定性。

**Architecture:** 采用“设定先行、存储兼容、命令渐进切换”的方案。第一层在 `config/types` 中引入玄鉴体系配置和异构阶段模型；第二层在 `service/model` 中继续复用现有 `spiritualPower` 与 `immortalStones` 持久化字段，但将显示口径切换为 `修为/灵石` 并用六境重新解释进度；第三层在命令与文档中去除通用九境与飞升主线宣传，将 `飞升` 保留为默认关闭的 legacy 扩展而不是直接删除。

**Tech Stack:** TypeScript, Node.js ESM, Mongoose, Vitest, Telegram Bot API, MongoDB Memory Server

---

## File Map

**Core config and types**

- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/types/cultivation.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/types/services.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/config/cultivation.ts`

**Persistence and domain behavior**

- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/models/User.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/models/DivinationHistory.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/services/CultivationService.ts`

**Handlers and user-facing copy**

- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/handlers/cultivationCommands.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/handlers/coreCommands.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/handlers/taskCommands.ts`

**Migration tooling**

- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/package.json`
- Create: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/scripts/migrate-cultivation-to-xuanjian.ts`

**Tests**

- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/unit/config/cultivation.test.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/cultivation.test.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/unit/handlers/coreCommands.test.ts`
- Create: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/unit/handlers/cultivationCommands.test.ts`

**Current operator docs only**

- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/README.md`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/docs/CULTIVATION_SYSTEM.md`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/docs/BOTFATHER_COMMANDS.md`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/docs/COMMANDS_LIST.md`

**Do not touch in this plan**

- Historical implementation notes such as `docs/CULTIVATION_IMPLEMENTATION.md`, `docs/INTEGRATION_COMPLETE.md`, `docs/models-design.md`, `docs/database-design.md`
  - Keep them as archival records unless a later cleanup task explicitly targets them.

## Migration Principles

1. **Do not rename persisted numeric fields in the first pass.**
   - Keep `spiritualPower` and `immortalStones` in MongoDB.
   - Change display text and domain interpretation first.
   - Rationale: user-visible lore alignment matters; storage-key purity does not justify a risky schema rewrite in phase one.

2. **Treat `飞升` as a disabled legacy extension, not an immediately deleted subsystem.**
   - Keep stored `ascensions` and `immortalMarks`.
   - Stop advertising `/ascension` and `/confirm_ascension` in current help/welcome/docs.
   - Return a clear “玄鉴体系默认未启用飞升玩法” message if legacy users still invoke it.

3. **Keep early progression smooth by reusing current low/mid power thresholds.**
   - Recommended realm thresholds:
     - `胎息`: `0-999`
     - `练气`: `1000-2499`
     - `筑基`: `2500-4999`
     - `紫府`: `5000-7999`
     - `金丹`: `8000-11999`
     - `元婴`: `12000+`
   - This preserves the current progression curve for existing users while switching lore labels.

4. **Represent 胎息 as explicit wheels, not percentage quartiles.**
   - Recommended wheel mapping inside `0-999`:
     - `玄景`: `0-166`
     - `承明`: `167-333`
     - `周行`: `334-500`
     - `青元`: `501-667`
     - `玉京`: `668-834`
     - `灵初`: `835-999`

### Task 1: Lock the target behavior in tests before refactoring

**Files:**
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/unit/config/cultivation.test.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/cultivation.test.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/unit/handlers/coreCommands.test.ts`
- Create: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/unit/handlers/cultivationCommands.test.ts`

- [ ] **Step 1: Add failing config tests for six realms and胎息六轮**

Use these assertions as the new target:

```ts
expect(getCurrentRealm(0).name).toBe('胎息');
expect(getCurrentRealm(1000).name).toBe('练气');
expect(getCurrentRealm(5000).name).toBe('紫府');
expect(getCurrentRealm(12000).name).toBe('元婴');
expect(getRealmStage(0, getCurrentRealm(0)).name).toBe('玄景');
expect(getRealmStage(835, getCurrentRealm(835)).name).toBe('灵初');
expect(isCultivationFeatureEnabled('ascension')).toBe(false);
```

- [ ] **Step 2: Add failing service tests for new progression rules**

Add or update tests so they assert:

```ts
expect(status.realm.name).toBe('胎息');
expect(status.stage.name).toBe('玄景');

const breakthroughError = cultivationService.attemptBreakthrough(testUserId);
await expect(breakthroughError).rejects.toThrow('胎息阶段按灵轮推进');
```

Also add one service test proving that a user at `spiritualPower = 1000` is now `练气`, not `筑基`.

- [ ] **Step 3: Add failing handler tests for user-facing copy**

Add a new `cultivationCommands` handler test file that asserts:

```ts
expect(sendMessage).toHaveBeenCalledWith(
  chatId,
  expect.stringContaining('💎 灵石'),
);

expect(sendMessage).toHaveBeenCalledWith(
  chatId,
  expect.stringContaining('当前玄鉴体系默认未启用飞升玩法'),
);
```

Update the existing `/start` test so the welcome message is expected to mention:

```ts
expect(sendMessage).toHaveBeenCalledWith(
  userId,
  expect.stringContaining('胎息 → 练气 → 筑基 → 紫府 → 金丹 → 元婴'),
  expect.any(Object)
);
```

- [ ] **Step 4: Run the targeted tests to confirm RED**

Run:

```bash
rtk npm test -- tests/unit/config/cultivation.test.ts tests/cultivation.test.ts tests/unit/handlers/coreCommands.test.ts tests/unit/handlers/cultivationCommands.test.ts
```

Expected:

- `getCurrentRealm(1000)` still returns `筑基期`
- handler copy still contains `仙石` / `大乘期` / `飞升`
- `cultivationCommands.test.ts` fails because the file does not exist yet

- [ ] **Step 5: Commit the red test baseline**

```bash
rtk git add tests/unit/config/cultivation.test.ts tests/cultivation.test.ts tests/unit/handlers/coreCommands.test.ts tests/unit/handlers/cultivationCommands.test.ts
rtk git commit -m "test: lock xuanjian cultivation migration targets"
```

### Task 2: Refactor cultivation types and config to support the Xuanjian profile

**Files:**
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/types/cultivation.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/types/services.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/config/cultivation.ts`
- Test: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/unit/config/cultivation.test.ts`

- [ ] **Step 1: Expand cultivation domain types**

Add profile-aware and heterogeneous-stage support instead of assuming every realm uses four percentage bands:

```ts
export type CultivationFeature = 'divination' | 'breakthrough' | 'ascension';

export interface ExplicitRealmStage {
  name: string;
  minPower: number;
  maxPower: number;
  bonus: number;
}

export interface CultivationLabels {
  currency: string;
  power: string;
}

export interface CultivationRealm {
  id: number;
  name: string;
  minPower: number;
  maxPower: number;
  title: string;
  emoji: string;
  color: string;
  description: string;
  cultivationBonus: number;
  stages?: ExplicitRealmStage[];
  breakthrough?: BreakthroughConfig | null;
}
```

- [ ] **Step 2: Replace the generic nine-realm config with a Xuanjian profile**

Implement a single default profile in `src/config/cultivation.ts`:

```ts
export const CULTIVATION_LABELS = {
  currency: '灵石',
  power: '灵力'
} as const;

export const CULTIVATION_FEATURES = {
  divination: true,
  breakthrough: true,
  ascension: false
} as const;
```

And define the six realms using the threshold table from the principles section, with `胎息.stages` explicitly listing `玄景/承明/周行/青元/玉京/灵初`.

- [ ] **Step 3: Update helper functions to use explicit stages when present**

The target shape should look like:

```ts
export function getRealmStage(spiritualPower: number, realm: CultivationRealm): ExplicitRealmStage {
  if (realm.stages?.length) {
    return realm.stages.find((stage) => spiritualPower >= stage.minPower && spiritualPower <= stage.maxPower)
      ?? realm.stages[0]!;
  }

  // fallback for quartile realms
}
```

Also add:

```ts
export function isCultivationFeatureEnabled(feature: CultivationFeature): boolean {
  return CULTIVATION_FEATURES[feature];
}
```

- [ ] **Step 4: Update service result types to stop assuming ascension is always part of the active profile**

In `src/types/services.ts`, adjust result typing so callers can show `ascensions` and `immortalMarks` conditionally without implying the feature is always enabled.

- [ ] **Step 5: Run config tests to confirm GREEN**

Run:

```bash
rtk npm test -- tests/unit/config/cultivation.test.ts
```

Expected:

- all config tests pass
- `getCurrentRealm(12000)` resolves to `元婴`
- `getRealmStage(835, 胎息)` resolves to `灵初`

- [ ] **Step 6: Commit**

```bash
rtk git add src/types/cultivation.ts src/types/services.ts src/config/cultivation.ts tests/unit/config/cultivation.test.ts
rtk git commit -m "feat: add xuanjian cultivation profile"
```

### Task 3: Rewire model and service behavior while keeping the database schema compatible

**Files:**
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/models/User.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/models/DivinationHistory.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/services/CultivationService.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/cultivation.test.ts`

- [ ] **Step 1: Update model defaults to the new realm vocabulary**

Change the cultivation defaults in `User`:

```ts
realm: { type: String, default: '胎息' },
realmId: { type: Number, default: 1 },
realmStage: { type: String, default: '玄景' },
peakRealm: { type: String, default: '胎息' },
peakRealmId: { type: Number, default: 1 },
```

Do **not** rename `immortalStones`, `ascensions`, or `immortalMarks` in the schema in this task.

- [ ] **Step 2: Make `CultivationService` profile-driven**

Update `getCultivationStatus()` and `awardCultivation()` so they derive realm and stage entirely from the new config helpers:

```ts
const currentRealm = getCurrentRealm(user.cultivation.spiritualPower);
const currentStage = getRealmStage(user.cultivation.spiritualPower, currentRealm);
```

Replace user-facing strings from `仙石` to `灵石`.

- [ ] **Step 3: Gate breakthrough and ascension according to the active Xuanjian rules**

Implement these rules:

```ts
if (currentRealm.name === '胎息') {
  throw new Error('胎息阶段按灵轮推进，无需使用 /breakthrough。');
}

if (!isCultivationFeatureEnabled('ascension')) {
  throw new Error('当前玄鉴体系默认未启用飞升玩法。');
}
```

This keeps the legacy implementation callable but inactive under the default profile.

- [ ] **Step 4: Fix legacy display helpers that still leak `仙石`**

Update `DivinationHistory.formatDisplay()`:

```ts
return (
  `${this.guaEmoji} ${this.guaName} - ${this.meaning}\n` +
  `💰 下注：${this.betAmount} | ${resultEmoji} 结果：${resultText}\n` +
  `📊 灵石：${this.stonesAfter}`
);
```

- [ ] **Step 5: Run service tests to confirm GREEN**

Run:

```bash
rtk npm test -- tests/cultivation.test.ts
```

Expected:

- users start at `胎息 / 玄景`
- `1000` power now maps to `练气`
- calling `/breakthrough`-backed logic during胎息 returns the new guarded error

- [ ] **Step 6: Commit**

```bash
rtk git add src/models/User.ts src/models/DivinationHistory.ts src/services/CultivationService.ts tests/cultivation.test.ts
rtk git commit -m "feat: migrate cultivation service to xuanjian progression"
```

### Task 4: Add a real migration script and fix the broken package script entry

**Files:**
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/package.json`
- Create: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/scripts/migrate-cultivation-to-xuanjian.ts`
- Test via: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/unit/config/cultivation.test.ts`

- [ ] **Step 1: Replace the dead `migrate` path with a real targeted script**

Update `package.json`:

```json
{
  "scripts": {
    "migrate": "tsx scripts/migrate-cultivation-to-xuanjian.ts",
    "migrate:cultivation:xuanjian": "tsx scripts/migrate-cultivation-to-xuanjian.ts"
  }
}
```

Rationale:

- `scripts/migrate.js` does not exist today
- a working targeted script is better than a broken generic entry

- [ ] **Step 2: Create a dry-run capable migration script**

Implement a script with the following shape:

```ts
const dryRun = process.argv.includes('--dry-run');
const users = await User.find({});

for (const user of users) {
  const realm = getCurrentRealm(user.cultivation.spiritualPower);
  const stage = getRealmStage(user.cultivation.spiritualPower, realm);
  const peakRealm = getCurrentRealm(user.cultivation.peakSpiritualPower);

  if (!dryRun) {
    user.cultivation.realm = realm.name;
    user.cultivation.realmId = realm.id;
    user.cultivation.realmStage = stage.name;
    user.cultivation.peakRealm = peakRealm.name;
    user.cultivation.peakRealmId = peakRealm.id;
    await user.save();
  }
}
```

The script must log:

- total users scanned
- users updated
- per-realm counts after remapping

- [ ] **Step 3: Add a defensive note for ascension fields**

The migration script should **not** mutate:

```ts
user.cultivation.ascensions
user.cultivation.immortalMarks
user.cultivation.immortalStones
```

because they remain legacy-compatible fields in phase one.

- [ ] **Step 4: Run the migration script in dry-run mode**

Run:

```bash
rtk npm run migrate:cultivation:xuanjian -- --dry-run
```

Expected:

- script exits `0`
- logs show scan counts and target realm distribution
- no DB writes occur

- [ ] **Step 5: Commit**

```bash
rtk git add package.json scripts/migrate-cultivation-to-xuanjian.ts
rtk git commit -m "chore: add xuanjian cultivation migration script"
```

### Task 5: Update command handlers and live docs to the Xuanjian vocabulary

**Files:**
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/handlers/cultivationCommands.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/handlers/coreCommands.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/handlers/taskCommands.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/unit/handlers/coreCommands.test.ts`
- Create: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/unit/handlers/cultivationCommands.test.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/README.md`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/docs/CULTIVATION_SYSTEM.md`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/docs/BOTFATHER_COMMANDS.md`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/docs/COMMANDS_LIST.md`

- [ ] **Step 1: Update welcome/help/task reward copy**

Revise the core messages in handlers:

```ts
// coreCommands.ts
'胎息 → 练气 → 筑基 → 紫府 → 金丹 → 元婴'

// taskCommands.ts
`修仙奖励: +${cultivationReward.spiritualPower}灵力, +${cultivationReward.immortalStones}灵石`
```

Do **not** mention `大乘期` or “最终飞升成仙” in the new default copy.

- [ ] **Step 2: Make `/realm`, `/breakthrough`, `/ascension`, `/stones` consistent**

In `cultivationCommands.ts`:

- replace all `仙石` display text with `灵石`
- replace胎息阶段的 `/breakthrough` 引导文案
- keep `/ascension` registered, but return the profile-disabled message
- remove飞升榜、飞升记录 from normal status/rankings output unless the feature is enabled

Target guard:

```ts
if (!isCultivationFeatureEnabled('ascension')) {
  await this.bot.sendMessage(chatId, '❌ 当前玄鉴体系默认未启用飞升玩法。');
  return;
}
```

- [ ] **Step 3: Add handler tests for the new command surface**

The new `tests/unit/handlers/cultivationCommands.test.ts` should cover at least:

```ts
test('/realm displays 灵石 instead of 仙石', ...);
test('/ascension returns disabled message when feature flag is off', ...);
test('/breakthrough refuses 胎息 users with wheel-based guidance', ...);
```

- [ ] **Step 4: Update only current operator docs**

Bring these documents in sync with the new runtime:

- `README.md`
- `docs/CULTIVATION_SYSTEM.md`
- `docs/BOTFATHER_COMMANDS.md`
- `docs/COMMANDS_LIST.md`

Use this wording baseline:

```md
境界序列：胎息（玄景/承明/周行/青元/玉京/灵初）→ 练气 → 筑基 → 紫府 → 金丹 → 元婴
货币：灵石
默认关闭：飞升玩法
```

- [ ] **Step 5: Run handler and doc-adjacent tests**

Run:

```bash
rtk npm test -- tests/unit/handlers/coreCommands.test.ts tests/unit/handlers/cultivationCommands.test.ts
```

Expected:

- both test files pass
- `/start` copy no longer mentions nine境和飞升终局
- `/realm` copy shows `灵石`

- [ ] **Step 6: Commit**

```bash
rtk git add src/handlers/cultivationCommands.ts src/handlers/coreCommands.ts src/handlers/taskCommands.ts tests/unit/handlers/coreCommands.test.ts tests/unit/handlers/cultivationCommands.test.ts README.md docs/CULTIVATION_SYSTEM.md docs/BOTFATHER_COMMANDS.md docs/COMMANDS_LIST.md
rtk git commit -m "feat: switch cultivation copy to xuanjian vocabulary"
```

### Task 6: Full verification, dry-run rollout, and manual QA

**Files:**
- Modify as needed based on verification output

- [ ] **Step 1: Run the focused cultivation suite**

Run:

```bash
rtk npm test -- tests/unit/config/cultivation.test.ts tests/cultivation.test.ts tests/unit/handlers/coreCommands.test.ts tests/unit/handlers/cultivationCommands.test.ts
```

Expected:

- all cultivation config, service, and handler tests pass

- [ ] **Step 2: Run full validation**

Run:

```bash
rtk npm run typecheck
rtk npm test
```

Expected:

- `typecheck` exits `0`
- full `vitest` suite exits `0`

- [ ] **Step 3: Execute dry-run migration again after code lands**

Run:

```bash
rtk npm run migrate:cultivation:xuanjian -- --dry-run
```

Expected:

- no exceptions
- per-realm counts look plausible
- no user remains labeled `炼气期` / `大乘期`

- [ ] **Step 4: Manual QA checklist**

Verify these flows locally:

1. Start a new account and run `/start`
   - welcome text shows six realms
2. Run `/realm`
   - shows `胎息` and `玄景`
   - shows `灵石`, not `仙石`
3. Run `/breakthrough` on a new user
   - returns胎息轮次引导 instead of generic渡劫
4. Run `/ascension`
   - returns disabled legacy message
5. Complete a task
   - reward message uses `灵石`

- [ ] **Step 5: Final commit or squash according to branch policy**

```bash
rtk git status --short
rtk git add -A
rtk git commit -m "feat: migrate cultivation system to xuanjian profile"
```

## Self-Review

### Spec coverage

- Worldbuilding-aligned six-realm structure: covered by Task 2
- Compatibility-first storage strategy: covered by Task 3 and Task 4
- Command/doc vocabulary migration: covered by Task 5
- Migration script and rollout safety: covered by Task 4 and Task 6

### Placeholder scan

- No `TODO` / `TBD`
- All tasks name exact files
- All verification steps include commands and expected outcomes

### Type consistency

- Internal storage fields remain `spiritualPower` / `immortalStones`
- External vocabulary changes to `修为` / `灵石`
- Realm ladder is consistently `胎息 -> 练气 -> 筑基 -> 紫府 -> 金丹 -> 元婴`

## Rollout Notes

- This plan intentionally avoids renaming MongoDB field keys in the first implementation pass.
- If you later decide to purge legacy names like `immortalStones`, write a separate storage-normalization plan after the Xuanjian migration is live and stable.
- The missing `scripts/migrate.js` issue is resolved in this plan by introducing a concrete working migration command instead of preserving a broken generic entry.
