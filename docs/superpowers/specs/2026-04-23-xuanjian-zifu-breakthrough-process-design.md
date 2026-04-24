# 玄鉴紫府破境过程法门设计

- 日期：2026-04-23
- 状态：已完成脑暴，用户已批准并进入实现
- 作用域：`src/types/cultivationCanonical.ts`、`src/config/xuanjianCanonical.ts`、`src/services/BreakthroughEngine.ts`、`src/services/CultivationService.ts`、相关测试与手册
- 目标：把 `筑基 -> 紫府` 从“通用材料过关 + 默认送首个神通”的占位实现，收敛为“破境法门决定过程差异”的正式过程层

## 一、结论

这轮只落地一条核心规则：

`筑基 -> 紫府` 的突破结果仍是进入紫府，但不同破境法门会决定额外门槛、附加材料、过程副作用与副产物。`

## 二、范围

本设计覆盖：

1. `zhuji_to_zifu` 的多法门静态定义
2. 破境法门兼容校验
3. 法门附加材料 / 环境 / 副作用 / 副产物
4. `BreakthroughEngine` 的紫府过程摘要

本设计不覆盖：

1. 紫府四关逐关判定
2. 失败立死或真实死亡分支
3. `branchChoice / branchProofs`
4. 金丹阶段求金 / 求闰

## 三、规则边界

### 3.1 公共突破门槛不变

`RealmBreakthroughRequirement` 继续负责：

1. `requiredPower`
2. `requiredAttainment`
3. `requiredItems`
4. `targetRealmId`

它不承担法门差异。

### 3.2 破境法门承载过程差异

`selectedBreakthroughMethodId` 指向 `applicableTransition = 'zhuji_to_zifu'` 的法门定义，负责：

1. `requiredItems`
2. `requiredEnvironment`
3. `compatibility`
4. `sideEffects`
5. `bonusOutcomeIds`
6. `successRateBonus / stabilityDelta`

### 3.3 兼容性语义

紫府过程法门的兼容性至少允许表达：

1. `requiresFoundation`
2. `allowedLineages / excludedLineages`
3. `minMethodGrade`
4. `requiredKnownPowerIds`

其中 `requiredKnownPowerIds` 在这轮只做校验，不扩展为完整分支证明系统。

### 3.4 持续后效应口径

这轮不新开长期副作用子系统。

若法门有持续后效应：

1. 优先写入 `breakthroughResolution.sideEffectsApplied`
2. 轻量持久化到 `combatFlags`
3. 如需数值型冷却，再写入 `cooldowns`

## 四、运行时流程

### 4.1 Readiness

`evaluateBreakthroughReadiness` 在 `currentRealmId = realm.zhuji` 时，依次检查：

1. 公共门槛
2. 已定仙基 / 主道统
3. 所选法门是否适用 `zhuji_to_zifu`
4. 法门兼容条件
5. 法门附加材料
6. 法门环境标签

### 4.2 Attempt

`resolveBreakthroughAttempt` 在成功进入紫府时，需要：

1. 扣除公共材料与法门附加材料
2. 生成 `breakthroughResolution`
3. 发放 `bonusOutcomeIds`
4. 记录 `sideEffectsApplied`

它这轮不负责：

1. 四关分段推进
2. 随机失败分支

## 五、完成标准

1. `zhuji_to_zifu` 至少存在多条行为不同的过程法门
2. 法门兼容与环境要求会进入 readiness
3. 突破成功后会按法门差异发放副产物，而不是只固定赠送 `power.zifu_first_light`
4. 副作用至少会进入过程摘要，并可轻量持久化
5. `branchChoice / branchProofs` 完全不介入本轮实现
