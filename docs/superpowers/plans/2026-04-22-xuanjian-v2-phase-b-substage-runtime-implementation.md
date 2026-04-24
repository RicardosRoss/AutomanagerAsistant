# 玄鉴 V2 阶段 B 小阶运行时 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让玄鉴 `realmSubStageId` 进入真实成长与状态运行时，使小阶随修为和大境变化自动流转，并在 `/realm` 等状态入口稳定显示 `大境·小阶`，同时不提前启用主动战斗与槽位限制。

**Architecture:** 采用“先锁区间解析测试，再实现 registry 与统一重算函数，再把重算接入 `CultivationService` 的关键入口，最后统一状态 formatter 与命令展示”的顺序推进。`realmSubStageId` 保持为 canonical 中的持久化派生缓存，不新增第二条成长进度，也不新开平行存档。

**Tech Stack:** TypeScript, Node.js ESM, Mongoose, Vitest, Telegram Bot API, MongoDB Memory Server

---

## Scope Check

这份计划只实现 `V2 阶段 B：小阶境界真正生效` 的收口版范围：

1. 补全 `胎息六轮 / 练气九层 / 筑基三层` 的 registry 定义与区间解析。
2. 让小阶在状态读取、专注结算、破境、飞升/重置时自动重算并持久化。
3. 让 `/realm` 和修仙状态摘要显示 `大境·小阶`。
4. 保证未细分大境仅显示大境名。

这份计划明确不做：

1. `battleLoadout` 槽位限制
2. 法门或神通的小阶门槛拦截
3. 主动战斗求解器
4. 小阶额外奖励或惩罚

## File Map

**Registry and display**

- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/config/xuanjianV2Registry.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/config/xuanjianCanonical.ts`

**Runtime services**

- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/services/CultivationService.ts`

**Tests**

- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/unit/config/xuanjianV2Registry.test.ts`
- Create: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/unit/config/xuanjianRealmSubStageResolver.test.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/cultivation.test.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/integration/xuanjian-task-cultivation-flow.test.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/integration/xuanjian-cultivation-command-flow.test.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/integration/xuanjian-bot-command-routing.test.ts`

**Docs**

- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/docs/cultivation/xuanjian-dev-manual.md`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/docs/cultivation/smoke-test-checklist.md`

## Implementation Rules

1. `realmSubStageId` 是持久化派生字段，不允许自由写入成为第二条成长系统。
2. 小阶完全由 `realmId + currentPower` 推导，区间使用左闭右开，最后一段闭合收尾。
3. 未细分大境允许存在 fallback 小阶，但用户态显示只展示大境名。
4. 所有写回都通过 canonical 主状态完成，不新增子文档或并行缓存。
5. 阶段 B 不得引入任何战斗求解、槽位限制或法门门槛语义。

## Seed Decisions

阶段 B 采用以下小阶命名：

1. 胎息：`玄景 / 承明 / 周行 / 青元 / 玉京 / 灵初`
2. 练气：`一层` 到 `九层`
3. 筑基：`初层 / 中层 / 后层`

区间策略：

1. `realm.taixi` 按本大境修为包络均分为 6 段
2. `realm.lianqi` 均分为 9 段
3. `realm.zhuji` 均分为 3 段
4. `realm.zifu / realm.jindan / realm.yuanying` 仅提供 fallback 条目

### Task 1: Lock sub-stage resolution behavior in failing tests

**Files:**
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/unit/config/xuanjianV2Registry.test.ts`
- Create: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/unit/config/xuanjianRealmSubStageResolver.test.ts`

- [ ] **Step 1: Add failing registry coverage for the expanded sub-stage catalog**

Update `tests/unit/config/xuanjianV2Registry.test.ts` to assert the expanded seeds:

```ts
import { describe, expect, test } from 'vitest';
import {
  getRealmSubStageById,
  getRealmSubStagesByRealmId
} from '../../../src/config/xuanjianV2Registry.js';

describe('xuanjian V2 registry', () => {
  test('exposes full phase-B sub-stage seeds for taixi, lianqi, and zhuji', () => {
    expect(getRealmSubStagesByRealmId('realm.taixi').map((item) => item.label)).toEqual([
      '玄景', '承明', '周行', '青元', '玉京', '灵初'
    ]);
    expect(getRealmSubStagesByRealmId('realm.lianqi')).toHaveLength(9);
    expect(getRealmSubStagesByRealmId('realm.zhuji').map((item) => item.label)).toEqual([
      '初层', '中层', '后层'
    ]);
    expect(getRealmSubStageById('realmSubStage.taixi.qingyuan')?.displayName).toBe('胎息·青元');
  });
});
```

- [ ] **Step 2: Add a new failing resolver test file for interval mapping**

Create `tests/unit/config/xuanjianRealmSubStageResolver.test.ts` with:

```ts
import { describe, expect, test } from 'vitest';
import {
  formatRealmSubStageDisplay,
  resolveRealmSubStageId
} from '../../../src/config/xuanjianV2Registry.js';

describe('xuanjian realm sub-stage resolver', () => {
  test('maps taixi power bands to the six named sub-stages', () => {
    expect(resolveRealmSubStageId('realm.taixi', 0)).toBe('realmSubStage.taixi.xuanjing');
    expect(resolveRealmSubStageId('realm.taixi', 20)).toBe('realmSubStage.taixi.chengming');
    expect(resolveRealmSubStageId('realm.taixi', 40)).toBe('realmSubStage.taixi.zhouxing');
    expect(resolveRealmSubStageId('realm.taixi', 60)).toBe('realmSubStage.taixi.qingyuan');
    expect(resolveRealmSubStageId('realm.taixi', 80)).toBe('realmSubStage.taixi.yujing');
    expect(resolveRealmSubStageId('realm.taixi', 119)).toBe('realmSubStage.taixi.lingchu');
  });

  test('maps lianqi and zhuji by equalized realm bands', () => {
    expect(resolveRealmSubStageId('realm.lianqi', 120)).toBe('realmSubStage.lianqi.1');
    expect(resolveRealmSubStageId('realm.lianqi', 153)).toBe('realmSubStage.lianqi.2');
    expect(resolveRealmSubStageId('realm.lianqi', 419)).toBe('realmSubStage.lianqi.9');
    expect(resolveRealmSubStageId('realm.zhuji', 420)).toBe('realmSubStage.zhuji.early');
    expect(resolveRealmSubStageId('realm.zhuji', 654)).toBe('realmSubStage.zhuji.middle');
    expect(resolveRealmSubStageId('realm.zhuji', 1119)).toBe('realmSubStage.zhuji.late');
  });

  test('falls back to realm-only display when the realm is not phase-B segmented', () => {
    expect(formatRealmSubStageDisplay({ realmId: 'realm.zifu', currentPower: 1120, realmSubStageId: 'realmSubStage.zifu.default' })).toEqual({
      fullName: '紫府',
      realmName: '紫府',
      subStageName: null
    });
  });
});
```

- [ ] **Step 3: Run targeted tests to verify they fail**

Run:

```bash
yarn vitest run tests/unit/config/xuanjianV2Registry.test.ts tests/unit/config/xuanjianRealmSubStageResolver.test.ts
```

Expected: FAIL because the expanded registry entries and resolver helpers do not exist yet.

- [ ] **Step 4: Commit the failing-test checkpoint**

```bash
git add tests/unit/config/xuanjianV2Registry.test.ts tests/unit/config/xuanjianRealmSubStageResolver.test.ts
git commit -m "test: lock xuanjian phase-b substage rules"
```

### Task 2: Implement phase-B sub-stage registry and resolver helpers

**Files:**
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/config/xuanjianV2Registry.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/config/xuanjianCanonical.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/unit/config/xuanjianV2Registry.test.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/unit/config/xuanjianRealmSubStageResolver.test.ts`

- [ ] **Step 1: Expand the registry structure to include full phase-B sub-stage definitions**

Add a `RealmSubStageDefinition` shape and the full seed list in `src/config/xuanjianV2Registry.ts`:

```ts
type RealmSubStageDefinition = {
  id: string;
  parentRealmId: string;
  order: number;
  label: string;
  displayName: string;
  minPowerInclusive: number;
  maxPowerExclusive: number;
  isFallback?: boolean;
};

const REALM_SUB_STAGES: RealmSubStageDefinition[] = [
  { id: 'realmSubStage.taixi.xuanjing', parentRealmId: 'realm.taixi', order: 1, label: '玄景', displayName: '胎息·玄景', minPowerInclusive: 0, maxPowerExclusive: 20 },
  { id: 'realmSubStage.taixi.chengming', parentRealmId: 'realm.taixi', order: 2, label: '承明', displayName: '胎息·承明', minPowerInclusive: 20, maxPowerExclusive: 40 },
  { id: 'realmSubStage.taixi.zhouxing', parentRealmId: 'realm.taixi', order: 3, label: '周行', displayName: '胎息·周行', minPowerInclusive: 40, maxPowerExclusive: 60 },
  { id: 'realmSubStage.taixi.qingyuan', parentRealmId: 'realm.taixi', order: 4, label: '青元', displayName: '胎息·青元', minPowerInclusive: 60, maxPowerExclusive: 80 },
  { id: 'realmSubStage.taixi.yujing', parentRealmId: 'realm.taixi', order: 5, label: '玉京', displayName: '胎息·玉京', minPowerInclusive: 80, maxPowerExclusive: 100 },
  { id: 'realmSubStage.taixi.lingchu', parentRealmId: 'realm.taixi', order: 6, label: '灵初', displayName: '胎息·灵初', minPowerInclusive: 100, maxPowerExclusive: 120 },
  { id: 'realmSubStage.lianqi.1', parentRealmId: 'realm.lianqi', order: 1, label: '一层', displayName: '练气·一层', minPowerInclusive: 120, maxPowerExclusive: 153 },
  { id: 'realmSubStage.lianqi.2', parentRealmId: 'realm.lianqi', order: 2, label: '二层', displayName: '练气·二层', minPowerInclusive: 153, maxPowerExclusive: 187 },
  { id: 'realmSubStage.lianqi.3', parentRealmId: 'realm.lianqi', order: 3, label: '三层', displayName: '练气·三层', minPowerInclusive: 187, maxPowerExclusive: 220 },
  { id: 'realmSubStage.lianqi.4', parentRealmId: 'realm.lianqi', order: 4, label: '四层', displayName: '练气·四层', minPowerInclusive: 220, maxPowerExclusive: 253 },
  { id: 'realmSubStage.lianqi.5', parentRealmId: 'realm.lianqi', order: 5, label: '五层', displayName: '练气·五层', minPowerInclusive: 253, maxPowerExclusive: 287 },
  { id: 'realmSubStage.lianqi.6', parentRealmId: 'realm.lianqi', order: 6, label: '六层', displayName: '练气·六层', minPowerInclusive: 287, maxPowerExclusive: 320 },
  { id: 'realmSubStage.lianqi.7', parentRealmId: 'realm.lianqi', order: 7, label: '七层', displayName: '练气·七层', minPowerInclusive: 320, maxPowerExclusive: 353 },
  { id: 'realmSubStage.lianqi.8', parentRealmId: 'realm.lianqi', order: 8, label: '八层', displayName: '练气·八层', minPowerInclusive: 353, maxPowerExclusive: 387 },
  { id: 'realmSubStage.lianqi.9', parentRealmId: 'realm.lianqi', order: 9, label: '九层', displayName: '练气·九层', minPowerInclusive: 387, maxPowerExclusive: 420 },
  { id: 'realmSubStage.zhuji.early', parentRealmId: 'realm.zhuji', order: 1, label: '初层', displayName: '筑基·初层', minPowerInclusive: 420, maxPowerExclusive: 654 },
  { id: 'realmSubStage.zhuji.middle', parentRealmId: 'realm.zhuji', order: 2, label: '中层', displayName: '筑基·中层', minPowerInclusive: 654, maxPowerExclusive: 887 },
  { id: 'realmSubStage.zhuji.late', parentRealmId: 'realm.zhuji', order: 3, label: '后层', displayName: '筑基·后层', minPowerInclusive: 887, maxPowerExclusive: 1120 },
  { id: 'realmSubStage.zifu.default', parentRealmId: 'realm.zifu', order: 1, label: '紫府', displayName: '紫府', minPowerInclusive: 1120, maxPowerExclusive: 2620, isFallback: true },
  { id: 'realmSubStage.jindan.default', parentRealmId: 'realm.jindan', order: 1, label: '金丹', displayName: '金丹', minPowerInclusive: 2620, maxPowerExclusive: 5620, isFallback: true },
  { id: 'realmSubStage.yuanying.default', parentRealmId: 'realm.yuanying', order: 1, label: '元婴', displayName: '元婴', minPowerInclusive: 5620, maxPowerExclusive: Number.POSITIVE_INFINITY, isFallback: true }
];
```

- [ ] **Step 2: Add runtime helpers for lookup, resolution, and display**

Implement these helpers in `src/config/xuanjianV2Registry.ts`:

```ts
import { getRealmById, type RealmId } from './xuanjianCanonical.js';

export function getRealmSubStagesByRealmId(realmId: RealmId) {
  return REALM_SUB_STAGES.filter((item) => item.parentRealmId === realmId);
}

export function resolveRealmSubStageId(realmId: RealmId, currentPower: number) {
  const candidates = getRealmSubStagesByRealmId(realmId);
  if (candidates.length === 0) {
    throw new Error(`Realm sub-stage definitions missing for ${realmId}`);
  }

  const first = candidates[0];
  const last = candidates[candidates.length - 1];
  const clampedPower = Math.max(first.minPowerInclusive, Math.min(currentPower, last.maxPowerExclusive - 1));

  const resolved = candidates.find((item) => clampedPower >= item.minPowerInclusive && clampedPower < item.maxPowerExclusive);
  return (resolved ?? last).id;
}

export function formatRealmSubStageDisplay(input: { realmId: RealmId; currentPower: number; realmSubStageId?: string | null }) {
  const realm = getRealmById(input.realmId);
  const subStageId = resolveRealmSubStageId(input.realmId, input.currentPower);
  const subStage = getRealmSubStageById(subStageId);

  if (!subStage || subStage.isFallback) {
    return { fullName: realm.name, realmName: realm.name, subStageName: null };
  }

  return { fullName: subStage.displayName, realmName: realm.name, subStageName: subStage.label };
}
```

- [ ] **Step 3: Re-export the new helpers from `xuanjianCanonical.ts`**

Add:

```ts
export {
  formatRealmSubStageDisplay,
  getRealmSubStagesByRealmId,
  resolveRealmSubStageId
} from './xuanjianV2Registry.js';
```

- [ ] **Step 4: Run the targeted registry and resolver tests**

Run:

```bash
yarn vitest run tests/unit/config/xuanjianV2Registry.test.ts tests/unit/config/xuanjianRealmSubStageResolver.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit the registry/resolver implementation**

```bash
git add src/config/xuanjianV2Registry.ts src/config/xuanjianCanonical.ts tests/unit/config/xuanjianV2Registry.test.ts tests/unit/config/xuanjianRealmSubStageResolver.test.ts
git commit -m "feat: add xuanjian phase-b substage registry"
```

### Task 3: Attach unified sub-stage recomputation to cultivation runtime

**Files:**
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/services/CultivationService.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/cultivation.test.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/integration/xuanjian-task-cultivation-flow.test.ts`

- [ ] **Step 1: Add failing integration tests for automatic sub-stage recomputation**

Update `tests/cultivation.test.ts` to add:

```ts
test('获取修仙状态时应收敛脏小阶并持久化', async () => {
  const user = await User.create({ userId: 92001 });
  const canonical = user.ensureCanonicalCultivation();
  canonical.state.realmId = 'realm.taixi';
  canonical.state.currentPower = 60;
  canonical.state.realmSubStageId = 'realmSubStage.taixi.xuanjing';
  user.replaceCanonicalCultivation(canonical);
  await user.save();

  await cultivationService.getCultivationStatus(user.userId);

  const raw = await User.collection.findOne({ userId: user.userId });
  expect(raw?.cultivation.canonical.state.realmSubStageId).toBe('realmSubStage.taixi.qingyuan');
});

test('飞升后应回到胎息玄景', async () => {
  const user = await User.create({ userId: 92002 });
  const canonical = user.ensureCanonicalCultivation();
  canonical.state.realmId = 'realm.yuanying';
  canonical.state.currentPower = 5620;
  canonical.state.realmSubStageId = 'realmSubStage.yuanying.default';
  user.replaceCanonicalCultivation(canonical);
  user.syncLegacyCultivationShell();
  await user.save();

  await cultivationService.ascend(user.userId);

  const refreshed = await User.findOne({ userId: user.userId }).lean();
  expect(refreshed?.cultivation.canonical.state.realmSubStageId).toBe('realmSubStage.taixi.xuanjing');
});
```

Update `tests/integration/xuanjian-task-cultivation-flow.test.ts` to add:

```ts
test('60 分钟专注结算后应按新修为自动推进胎息小阶', async () => {
  const user = await User.create({ userId: 92003 });
  await taskService.createTask(user.userId, 'phase-b focus', 60);

  const task = await Task.findOne({ userId: user.userId }).lean();
  await taskService.completeTask(user.userId, task!._id.toString(), 60);

  const refreshed = await User.findOne({ userId: user.userId }).lean();
  expect(refreshed?.cultivation.canonical.state.realmSubStageId).not.toBe('realmSubStage.taixi.xuanjing');
});
```

- [ ] **Step 2: Run the targeted tests to verify failure**

Run:

```bash
yarn vitest run tests/cultivation.test.ts tests/integration/xuanjian-task-cultivation-flow.test.ts
```

Expected: FAIL because sub-stage recomputation is not wired to runtime entrypoints yet.

- [ ] **Step 3: Implement a unified recompute helper inside `CultivationService`**

In `src/services/CultivationService.ts`, add and use:

```ts
import {
  formatCanonicalRealmDisplay,
  formatCanonicalStage,
  getCanonicalRealmByPower,
  getMainMethodById,
  getRealmById,
  resolveRealmSubStageId
} from '../config/xuanjianCanonical.js';

private syncRealmSubStage(canonical: IUserCultivationCanonical): boolean {
  const nextSubStageId = resolveRealmSubStageId(canonical.state.realmId, canonical.state.currentPower);
  if (canonical.state.realmSubStageId === nextSubStageId) {
    return false;
  }
  canonical.state.realmSubStageId = nextSubStageId;
  return true;
}
```

Wire it into these places:

```ts
const normalizedPhaseA = this.normalizePhaseAState(canonical);
const normalizedPhaseB = this.syncRealmSubStage(canonical);
if (normalizedPhaseA || normalizedPhaseB) {
  user.replaceCanonicalCultivation(canonical);
}
```

And after any update to `realmId` or `currentPower`:

```ts
canonical.state.realmId = getCanonicalRealmByPower(canonical.state.currentPower).id;
this.syncRealmSubStage(canonical);
```

- [ ] **Step 4: Run the targeted runtime tests**

Run:

```bash
yarn vitest run tests/cultivation.test.ts tests/integration/xuanjian-task-cultivation-flow.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit the runtime recomputation work**

```bash
git add src/services/CultivationService.ts tests/cultivation.test.ts tests/integration/xuanjian-task-cultivation-flow.test.ts
git commit -m "feat: sync xuanjian substages with cultivation runtime"
```

### Task 4: Ensure breakthrough and reset paths land on correct first sub-stage

**Files:**
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/services/CultivationService.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/cultivation.test.ts`

- [ ] **Step 1: Add failing coverage for breakthrough-to-first-substage**

Add to `tests/cultivation.test.ts`:

```ts
test('突破大境后应切到新大境首个小阶', async () => {
  const user = await User.create({ userId: 92004 });
  const canonical = user.ensureCanonicalCultivation();
  canonical.state.realmId = 'realm.taixi';
  canonical.state.currentPower = 120;
  canonical.state.realmSubStageId = 'realmSubStage.taixi.lingchu';
  user.replaceCanonicalCultivation(canonical);
  user.syncLegacyCultivationShell();
  await user.save();

  await cultivationService.attemptBreakthrough(user.userId);

  const refreshed = await User.findOne({ userId: user.userId }).lean();
  expect(refreshed?.cultivation.canonical.state.realmId).toBe('realm.lianqi');
  expect(refreshed?.cultivation.canonical.state.realmSubStageId).toBe('realmSubStage.lianqi.1');
});
```

- [ ] **Step 2: Run the targeted test and verify failure**

Run:

```bash
yarn vitest run tests/cultivation.test.ts -t "突破大境后应切到新大境首个小阶"
```

Expected: FAIL if breakthrough path does not re-run sub-stage sync after realm mutation.

- [ ] **Step 3: Re-run sub-stage sync in the breakthrough success path**

In `src/services/CultivationService.ts`, after breakthrough resolution writes the new realm:

```ts
canonical.state.realmId = result.newRealmId;
canonical.state.currentPower = result.newPower;
this.syncRealmSubStage(canonical);
```

Ensure `ascend()` continues to use the same helper after reset:

```ts
user.ascend();
const canonical = user.ensureCanonicalCultivation();
this.normalizePhaseAState(canonical);
this.syncRealmSubStage(canonical);
user.replaceCanonicalCultivation(canonical);
user.syncLegacyCultivationShell();
await user.save();
```

- [ ] **Step 4: Run cultivation tests again**

Run:

```bash
yarn vitest run tests/cultivation.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit the breakthrough/reset fix**

```bash
git add src/services/CultivationService.ts tests/cultivation.test.ts
git commit -m "feat: keep xuanjian substages aligned on breakthroughs"
```

### Task 5: Unify realm display formatting for user-facing commands

**Files:**
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/config/xuanjianCanonical.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/integration/xuanjian-cultivation-command-flow.test.ts`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/tests/integration/xuanjian-bot-command-routing.test.ts`

- [ ] **Step 1: Add failing user-facing tests for `大境·小阶` display**

Update `tests/integration/xuanjian-cultivation-command-flow.test.ts`:

```ts
test('/realm 应展示 phase-B 小阶文案', async () => {
  const userId = 603010;
  const user = await User.create({ userId, cultivation: { immortalStones: 8 } });
  const canonical = user.ensureCanonicalCultivation();
  canonical.state.realmId = 'realm.taixi';
  canonical.state.currentPower = 60;
  canonical.state.realmSubStageId = 'realmSubStage.taixi.qingyuan';
  user.replaceCanonicalCultivation(canonical);
  user.syncLegacyCultivationShell();
  await user.save();

  await handler.handleRealmCommand({ chat: { id: userId }, from: { id: userId } } as never);

  const message = sendMessage.mock.calls[0]?.[1] as string;
  expect(message).toContain('📊 当前境界：胎息·青元');
});
```

Update `tests/integration/xuanjian-bot-command-routing.test.ts`:

```ts
expect(realmMessage).toContain('📊 当前境界：胎息·玄景');
```

Add a fallback display assertion:

```ts
expect(formatRealmSubStageDisplay({
  realmId: 'realm.zifu',
  currentPower: 1120,
  realmSubStageId: 'realmSubStage.zifu.default'
}).fullName).toBe('紫府');
```

- [ ] **Step 2: Run the command-facing tests and verify failure**

Run:

```bash
yarn vitest run tests/integration/xuanjian-cultivation-command-flow.test.ts tests/integration/xuanjian-bot-command-routing.test.ts
```

Expected: FAIL because user-facing formatting still uses `大境-阶段`.

- [ ] **Step 3: Update `formatCanonicalRealmDisplay()` to prefer sub-stage display**

In `src/config/xuanjianCanonical.ts`, use the phase-B formatter:

```ts
import { formatRealmSubStageDisplay } from './xuanjianV2Registry.js';

export function formatCanonicalRealmDisplay(state: { realmId: RealmId; currentPower: number; realmSubStageId?: string | null }): CanonicalRealmDisplay {
  const realm = getRealmById(state.realmId);
  const stage = getCanonicalRealmStageInRealm(state.currentPower, state.realmId).name;
  const subStageDisplay = formatRealmSubStageDisplay(state);

  return {
    realm: {
      id: realm.id,
      name: realm.name,
      minPower: realm.minPower,
      maxPower: realm.maxPower
    },
    stage: {
      name: subStageDisplay.subStageName ?? stage
    },
    fullName: subStageDisplay.fullName,
    title: realm.name
  };
}
```

- [ ] **Step 4: Run the command-facing tests**

Run:

```bash
yarn vitest run tests/integration/xuanjian-cultivation-command-flow.test.ts tests/integration/xuanjian-bot-command-routing.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit the formatter work**

```bash
git add src/config/xuanjianCanonical.ts tests/integration/xuanjian-cultivation-command-flow.test.ts tests/integration/xuanjian-bot-command-routing.test.ts
git commit -m "feat: show xuanjian substages in realm displays"
```

### Task 6: Update docs and run full verification

**Files:**
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/docs/cultivation/xuanjian-dev-manual.md`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/docs/cultivation/smoke-test-checklist.md`
- Modify: `/Users/qingcongyu/telegramBots/AutomanagerAsistant/docs/superpowers/specs/2026-04-22-xuanjian-v2-phase-b-substage-design.md`

- [ ] **Step 1: Update the dev manual and smoke checklist**

Add these points to `docs/cultivation/xuanjian-dev-manual.md`:

```md
- `realmSubStageId` 在 phase B 起由 `realmId + currentPower` 统一重算，不再是惰性默认值。
- `/realm` 等状态摘要优先显示 `大境·小阶`。
- `紫府 / 金丹 / 元婴` 在 phase B 仍只显示大境名，不展示 fallback 小阶。
```

Add these smoke checks to `docs/cultivation/smoke-test-checklist.md`:

```md
| B.1 | `/realm` shows sub-stage display | `胎息·玄景` |
| B.2 | focus reward advances sub-stage | same realm, later sub-stage |
| B.3 | breakthrough lands on first sub-stage of next realm | `练气·一层` |
| B.4 | ascension resets to `胎息·玄景` | pass |
```

- [ ] **Step 2: Run targeted verification for the whole phase-B surface**

Run:

```bash
yarn vitest run tests/unit/config/xuanjianV2Registry.test.ts tests/unit/config/xuanjianRealmSubStageResolver.test.ts tests/cultivation.test.ts tests/integration/xuanjian-task-cultivation-flow.test.ts tests/integration/xuanjian-cultivation-command-flow.test.ts tests/integration/xuanjian-bot-command-routing.test.ts
```

Expected: PASS

- [ ] **Step 3: Run full project verification**

Run:

```bash
yarn test
yarn typecheck
yarn build
git diff --check
```

Expected:

```text
All tests pass
TypeScript check passes
Build succeeds
git diff --check prints no output
```

- [ ] **Step 4: Commit the docs and verification checkpoint**

```bash
git add docs/cultivation/xuanjian-dev-manual.md docs/cultivation/smoke-test-checklist.md docs/superpowers/specs/2026-04-22-xuanjian-v2-phase-b-substage-design.md docs/superpowers/plans/2026-04-22-xuanjian-v2-phase-b-substage-runtime-implementation.md
git commit -m "docs: record xuanjian phase-b substage rollout"
```

## Self-Review

Spec coverage:

1. 小阶命名与区间规则 -> Task 1, Task 2
2. 统一重算与持久化 -> Task 3, Task 4
3. `/realm` 与状态摘要显示 -> Task 5
4. 文档与 smoke 验收 -> Task 6

Placeholder scan:

1. 所有任务都给出精确文件路径、命令和断言。
2. 没有 `TODO / TBD / implement later`。

Type consistency:

1. 统一使用 `resolveRealmSubStageId`
2. 统一使用 `formatRealmSubStageDisplay`
3. 统一使用 `realmSubStageId`

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-22-xuanjian-v2-phase-b-substage-runtime-implementation.md`. Two execution options:

1. Subagent-Driven (recommended) - 我按任务逐个派发子代理实现，并在任务间 review
2. Inline Execution - 我在当前会话里按这份 plan 顺序实现

Which approach?
