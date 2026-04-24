# 玄鉴冒烟验收报告

**日期**: 2026-04-21
**分支**: features/xuanjian-cultivation
**基线提交**: e0f1b41 (docs: tune xuanjian focus yield anchors)
**验收人**: RicardosRoss

---

## 1. 验收范围

本次冒烟验收覆盖 4 项用户反馈问题，均在未提交的工作树中完成修复：

| # | 问题描述 | 严重程度 |
|---|----------|----------|
| 1 | 境界显示格式：胎息应显示为"胎息-玄景"而非"胎息玄景" | 显示缺陷 |
| 2 | 占卜缺少 buff 机制：按设计文档应影响下次专注奇遇概率 | 功能缺失 |
| 3 | 境界小阶命名跨域错误：练气仍显示胎息六轮名"玄景" | 逻辑缺陷 |
| 4 | 新用户 /realm 显示"渡劫记录 0/0"无意义噪音 | UX 缺陷 |

---

## 2. 修复详情

### 2.1 境界显示格式修正

**文件**: `src/config/xuanjianCanonical.ts`

- fullName 生成由 `${realm}${stage}` 改为 `${realm}-${stage}`
- 例：胎息玄景 → 胎息-玄景，练气三层 → 练气-三层

**影响范围**: `/realm`、`/breakthrough` 所有包含境界名称的文案输出。

### 2.2 占卜 Buff 系统

**新增文件**: 无（全部在已有文件中扩展）

**修改文件**:

| 文件 | 变更 |
|------|------|
| `src/types/cultivationCanonical.ts` | 新增 `DivinationBuff` 接口及 `pendingDivinationBuff` 字段 |
| `src/services/CultivationRewardEngine.ts` | 新增 DIVINATION_BUFF_TABLE (8 级卦象)、`getDivinationBuff()`、buff 参数传入 `rollFocusEncounter()` |
| `src/services/CultivationService.ts` | `castDivination` 存储 buff → `awardCultivation` 消费 buff → `getCultivationStatus` 显示活跃 buff |
| `src/models/User.ts` | canonical.state schema 添加 `pendingDivinationBuff` 字段 |
| `src/types/services.ts` | `DivinationCastResult` 增加 `buff` 字段；`CultivationStatusResult` 增加 `activeBuff` |
| `src/handlers/cultivationCommands.ts` | 占卜结果展示 buff 标签；`/realm` 展示活跃 buff |

**Buff 管线**:
```
占卜摇卦(roll 1-8) → buff 存入 pendingDivinationBuff
       ↓
下次专注完成 → resolveFocusReward 读取 buff → 传入 rollFocusEncounter
       ↓
buff 影响 "无奇遇" 阈值（encounterBonus）和掉率（qualityBonus）
       ↓
buff 消费，pendingDivinationBuff = null
```

**Buff 数值表**:

| 卦象 | roll | encounterBonus | qualityBonus | 标签 |
|------|------|----------------|--------------|------|
| 大吉 | 8 | -0.15 | +0.05 | 大吉加持 |
| 吉 | 7 | -0.10 | +0.03 | 吉运 |
| 小吉 | 6 | -0.05 | 0 | 小吉 |
| 平 | 5-4 | 0 | 0 | 平卦 |
| 小凶 | 3 | +0.05 | -0.02 | 小凶 |
| 凶 | 2 | +0.10 | -0.03 | 凶兆 |
| 大凶 | 1 | +0.15 | -0.05 | 大凶 |

> encounterBonus 为负 → "无奇遇" 阈值降低 → 奇遇概率增加。
> encounterBonus 为正 → "无奇遇" 阈值升高 → 奇遇概率降低。

### 2.3 境界小阶命名域化

**文件**: `src/config/xuanjianCanonical.ts`

将单一 `getCanonicalRealmStage()` 替换为 6 个域函数 + 1 个调度器：

| 境界 | 小阶体系 | 阶数 |
|------|----------|------|
| 胎息 | 六轮（玄景/承明/周行/青元/玉京/灵初） | 6 |
| 练气 | 九层（一层~九层） | 9 |
| 筑基 | 三期（初期/中期/后期） | 3 |
| 紫府 | 四段（初期/中期/后期/圆满） | 4 |
| 金丹 | 三段（前期/中期/后期） | 3 |
| 元婴 | 三期（初期/中期/后期） | 3 |

`getStageNameByRealm(realmId, progress)` 根据 progress (0-100) 计算当前小阶。

### 2.4 隐藏空渡劫记录

**文件**: `src/handlers/cultivationCommands.ts`

`/realm` 命令的渡劫记录部分改为条件渲染：
```typescript
if (status.breakthroughSuccesses + status.breakthroughFailures > 0) {
  // 仅在有记录时显示
}
```

新用户不再看到"渡劫记录：成功 0 次 / 失败 0 次"。

---

## 3. 测试验证

### 3.1 自动化测试

```
Test Files:  38 passed
Tests:       220 passed, 0 failed
Duration:    14.2s
```

### 3.2 受影响测试文件

以下测试文件因上述修改更新了断言：

| 测试文件 | 变更说明 |
|----------|----------|
| `tests/unit/config/xuanjianCanonical.test.ts` | 小阶阈值更新（17 代替 20）、显示格式加横杠 |
| `tests/unit/handlers/cultivationCommands.test.ts` | mock 补充 buff 字段、筑基显示"初期"非"玄景" |
| `tests/unit/services/CultivationStateAdapter.test.ts` | pendingDivinationBuff:null、筑基阶段断言修正 |
| `tests/unit/services/CultivationRewardEngine.test.ts` | pendingDivinationBuff:null |
| `tests/unit/services/CultivationMigration.test.ts` | pendingDivinationBuff:null |
| `tests/integration/xuanjian-cultivation-command-flow.test.ts` | 胎息玄景→胎息-玄景 |
| `tests/integration/xuanjian-bot-command-routing.test.ts` | 胎息玄景→胎息-玄景 |
| `tests/integration/migrate-xuanjian-cultivation-dry-run.test.ts` | pendingDivinationBuff:null |

### 3.3 关键集成测试覆盖

| 测试场景 | 文件 | 验证点 |
|----------|------|--------|
| `/realm` 展示 canonical 持久化状态 | xuanjian-cultivation-command-flow | 境界-小阶格式、灵石、道行 |
| `/realm` onText 接线 | xuanjian-bot-command-routing | FakeTelegramBot → handler 全链路 |
| `/divination` 不影响 canonical 修为 | xuanjian-cultivation-command-flow | 灵石变化、修为不变 |
| `/breakthrough` 全链路 | xuanjian-bot-command-routing | 胎息→练气、legacy sync |
| 迁移 dry-run | migrate-xuanjian-cultivation-dry-run | 不修改数据、统计输出正确 |

---

## 4. 变更统计

```
43 files changed, 1388 insertions(+), 3160 deletions(-)
```

其中：
- 源码修改：18 个文件
- 测试修改：12 个文件
- 新增源码文件（untracked）：6 个
  - `src/config/xuanjianCanonical.ts`
  - `src/types/cultivationCanonical.ts`
  - `src/services/CultivationRewardEngine.ts`
  - `src/services/CultivationStateAdapter.ts`
  - `src/services/CultivationMigration.ts`
  - `src/services/BreakthroughEngine.ts`

---

## 5. 遗留项

| 项目 | 状态 | 说明 |
|------|------|------|
| peak 字段更新 | 待修复 | 破境后 peakRealm/peakRealmId/peakSpiritualPower 未更新（已有 plan，尚未实施） |
| 占卜奇遇 tier/category 权重系统 | V2 范围 | 设计文档定义了精细的 tier 权重，当前 V1 用简单阈值表实现 |
| 占卜 buff 显示文案 | 已实现 | 占卜结果展示 buff 标签+描述，`/realm` 展示活跃 buff |

---

## 6. 验收结论

4 项反馈问题全部修复，220 项自动化测试零失败。变更涉及显示层、业务逻辑层和数据模型层，核心管线（占卜→buff→专注→奇遇）首次完整贯通。

**状态**: ✅ 通过
