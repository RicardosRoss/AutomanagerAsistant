# 玄鉴筑基专修约束设计

- 日期：2026-04-23
- 状态：已完成脑暴，用户已批准并进入实现
- 作用域：`src/config/xuanjianCanonical.ts`、`src/services/BreakthroughEngine.ts`、`src/services/CultivationService.ts`、`src/services/CultivationStateAdapter.ts`、相关测试与手册
- 目标：把 `练气 -> 筑基` 从“提前用筑基功法反推结果”的过渡实现，收敛为“主修功法决定筑基结果，破境法门决定冲关过程”的正式模型

## 一、结论

这轮只落地一条核心规则：

`练气突破筑基时，主修功法决定仙基、主道统与后续潜力；破境法门只影响冲关过程，不改写筑基结果。`

## 二、范围

本设计覆盖：

1. `练气 -> 筑基` 的主修功法结果映射
2. `selectedBreakthroughMethodId` 的正式过程语义
3. 现有 `BreakthroughEngine` 的 readiness / attempt 判定重构
4. 当前 pre-zhuji 存档里 `method.zhuji_*` 的兼容收敛

本设计不覆盖：

1. `筑基 -> 紫府` 四关仪式完整实现
2. `branchChoice / branchProofs` 的真实分支玩法
3. 破境随机失败和完整风险结算系统
4. 玩家侧主修/破境法门切换命令

## 三、规则边界

### 3.1 主修功法决定结果

`mainMethodId` 对 `练气 -> 筑基` 负责：

1. `foundationId`
2. `mainDaoTrack`
3. `grade` 底蕴
4. 筑基后的延续主修功法

因此，主修功法需要显式携带：

- `zhujiOutcome`

而不是继续依赖 `foundationAffinity[0] + lineageTag` 的隐式推断。

### 3.2 破境法门决定过程

`selectedBreakthroughMethodId` 指向“本次冲关使用的术/仪式路线”，负责：

1. 兼容的境界跃迁
2. 额外所需材料或环境
3. 过程摘要
4. 预留的成功率/副作用/副产物字段

它不能决定：

1. `foundationId`
2. `mainDaoTrack`
3. 主修功法的筑基结果

### 3.3 真正的分支留到紫府

`branchChoice / branchProofs` 这轮不进入 `练气 -> 筑基` 判定。

它们继续预留给：

1. `筑基 -> 紫府` 的四关仪式
2. 神通分支
3. 更高境界的专修分歧

## 四、运行时流程

### 4.1 Readiness

`evaluateBreakthroughReadiness` 顺序固定为：

1. 检查当前境界公共门槛
2. 检查主修功法是否能产出目标筑基结果
3. 检查破境法门是否适用于当前跃迁
4. 检查破境法门附加材料/环境

输出仍保持：

- `ready`
- `missing`
- `targetRealmId`
- `reason`

### 4.2 Attempt

`resolveBreakthroughAttempt` 负责：

1. 复用 readiness
2. 从 `mainMethodId.zhujiOutcome` 锁定筑基结果
3. 从 `selectedBreakthroughMethodId` 生成过程摘要
4. 消耗公共材料与破境法门附加材料
5. 成功后切到对应筑基主修功法

## 五、兼容迁移

### 5.1 pre-zhuji 旧写法

若存档满足：

1. `realmId < realm.zhuji`
2. `mainMethodId` 为 `method.zhuji_*`

则在读写边界自动收敛到对应的 `method.lianqi_*_route`。

### 5.2 post-zhuji 旧写法

若用户已在筑基及以上，且 `mainMethodId` 为 `method.zhuji_*`，保持不动。

### 5.3 已锁定结果不回滚

若旧存档已存在具体 `foundationId / mainDaoTrack`，以现有结果为准，不重新推导。

## 六、完成标准

1. `练气 -> 筑基` 的 `foundationId / mainDaoTrack` 仅由主修功法决定
2. `selectedBreakthroughMethodId` 只影响过程，不改结果
3. 成功筑基后自动切到对应筑基主修功法
4. pre-zhuji 的旧 `method.zhuji_*` 写法可自动收敛
5. `branchChoice / branchProofs` 不介入筑基判定
