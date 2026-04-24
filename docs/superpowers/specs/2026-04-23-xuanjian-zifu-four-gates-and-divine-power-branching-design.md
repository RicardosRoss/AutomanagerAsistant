# 玄鉴紫府四关与后续神通冲关设计

- 日期：2026-04-23
- 状态：已完成脑暴，待用户 review
- 作用域：`src/types/cultivationCanonical.ts`、`src/config/xuanjianCanonical.ts`、`src/services/BreakthroughEngine.ts`、`src/services/CultivationService.ts`、相关测试与手册
- 目标：把 `筑基 -> 紫府` 从“过程法门层”推进为“完整四关流程”，并为紫府内后续神通冲关补上最小闭环，同时保持 `selectedBreakthroughMethodId` 与 `branchChoice` 的职责分离

## 一、结论

这轮设计同时固定两条规则：

1. `筑基 -> 紫府` 的首个神通不是选择结果，而是 `foundationId` 的确定性映射。
2. `第二道及之后神通` 才真正启用 `branchChoice / branchProofs`，并与 `selectedBreakthroughMethodId` 分层。

对应关系如下：

- `selectedBreakthroughMethodId`
  负责这次冲关怎么破，影响成功率、代价、副作用、失败损伤。
- `foundationId -> firstDivinePowerId`
  负责首入紫府时得到哪一道首神通。
- `branchChoice / branchProofs`
  负责紫府内新增神通时，本次想凝哪一道神通，以及为它准备了哪些佐证。

## 二、范围与非范围

### 2.1 本设计覆盖

1. `筑基 -> 紫府` 的四关流程
2. 首入紫府成功后的 `foundationId -> firstDivinePowerId` 自动映射
3. 四关失败后的 `currentPower / cultivationAttainment` 损伤
4. `zifu_divine_power` 作为独立冲关类型
5. 第二道及之后神通的最小 `branchChoice / branchProofs` 闭环

### 2.2 本设计不覆盖

1. 立死、删号、废基或掉回筑基
2. 第三到第五道神通的复杂互斥网络
3. `紫府 -> 金丹` 的求金 / 求闰 / 三同二殊 / 四同一殊
4. 金丹与元婴阶段的完整突破设计
5. 新开长期副作用子系统

本轮关于后续神通的边界是：

- 先支持“后续神通冲关”这套机制存在
- 先不把复杂互斥和求金约束提前塞进紫府期 runtime

## 三、静态模型拆分

### 3.1 `foundationId` 负责首个神通

首入紫府没有 `branchChoice`。

建议在仙基定义上补：

```ts
firstDivinePowerId: string;
```

语义：

1. `练气 -> 筑基` 时锁定 `foundationId`
2. `筑基 -> 紫府` 成功时，直接由 `foundationId.firstDivinePowerId` 发放首神通
3. `selectedBreakthroughMethodId` 不改首神通结果

### 3.2 `MainMethodDefinition` 负责后续神通覆盖面

后续第二到第五道神通的候选范围来自紫府期主修功法。

建议补：

```ts
zifuPowerCoverage?: {
  candidatePowerIds: string[];
  maxPowerCount: 5;
}
```

它只定义：

- 这门主修功法允许你后续修哪些神通

它不定义：

- 首个神通
- 过程法门
- 失败后果

### 3.3 `DivinePowerDefinition` 负责后续取得条件

建议为神通定义补：

```ts
zifuAcquisition?: {
  minExistingPowerCount: number; // 1..4
  proofRequirementIds?: string[];
}
```

这轮暂不把复杂互斥写进 runtime 必需条件。

当前只保留：

1. `minExistingPowerCount`
2. `proofRequirementIds`

复杂互斥、求金关联、序列封锁留待后续 `紫府 -> 金丹` 冲刺阶段统一设计。

### 3.4 `BreakthroughMethodDefinition` 继续只管过程

`BreakthroughTransitionId` 需要新增：

```ts
| 'zifu_divine_power'
```

`BreakthroughMethodDefinition` 继续负责：

1. `requiredItems`
2. `requiredEnvironment`
3. `compatibility`
4. `sideEffects`
5. `bonusOutcomeIds`
6. `successRateBonus / stabilityDelta`

它不决定：

1. 首个神通是什么
2. 后续目标神通是什么

### 3.5 `branchChoice / branchProofs` 的最终语义

这轮把语义写死：

- `realm_zhuji_to_zifu`
  - `branchChoice = null`
  - `branchProofs = {}`
- `zifu_divine_power`
  - `branchChoice = targetDivinePowerId`
  - `branchProofs = 为该目标神通准备的 proofs`

也就是：

- 首入紫府无 branch
- 后续神通冲关才启用 branch

### 3.6 独立的紫府内神通冲关 requirement

第二到第五道神通不是大境突破，不应硬塞进 `RealmBreakthroughRequirement`。

建议新增：

```ts
interface DivinePowerBreakthroughRequirement {
  id: string;
  targetPowerOrdinal: 2 | 3 | 4 | 5;
  requiredPower: number;
  requiredAttainment: number;
  requiredItems: Array<{ definitionId: string; count: number }>;
}
```

职责拆分：

- `RealmBreakthroughRequirement`
  只管大境突破
- `DivinePowerBreakthroughRequirement`
  只管紫府内第二到第五道神通

## 四、运行时流程

### 4.1 显式区分冲关类型

runtime 不应再只靠 `currentRealmId` 反推突破类型。

建议显式引入：

```ts
type BreakthroughAttemptKind =
  | 'realm_zhuji_to_zifu'
  | 'zifu_divine_power';
```

### 4.2 首入紫府：四关推进 + 自动首神通

`evaluateBreakthroughReadiness(kind = 'realm_zhuji_to_zifu')` 依次检查：

1. 公共大境突破门槛
2. 已定仙基与主道统
3. 所选 `selectedBreakthroughMethodId` 是否适配 `zhuji_to_zifu`
4. `foundationId -> firstDivinePowerId` 是否存在唯一映射

`resolveBreakthroughAttempt` 跑固定四关：

1. `lift_foundation`
   推仙基入升阳
2. `cross_illusion`
   过蒙昧与幻象
3. `gestate_power`
   仙基蜕为首神通
4. `enter_taixu`
   升举完成，正式入紫府

成功结果：

1. `realmId = realm.zifu`
2. 自动获得 `firstDivinePowerId`
3. 保留既有 `foundationId / mainDaoTrack`
4. 写入四关摘要

失败结果：

1. 不进紫府
2. 停在失败关卡
3. 扣 `currentPower`
4. 扣 `cultivationAttainment`
5. 材料与过程法门代价照常结算

这轮失败不会导致：

1. 删号
2. 掉回筑基前阶段
3. 丢失既有仙基

### 4.3 后续神通冲关：`branchChoice / branchProofs` 真正启用

`evaluateBreakthroughReadiness(kind = 'zifu_divine_power')` 依次检查：

1. 当前已在 `realm.zifu`
2. 当前已掌握神通数量，确定本次是第几道
3. `branchChoice` 必填，且为目标神通 id
4. 目标神通必须落在：
   - `mainMethodId.zifuPowerCoverage`
   - `divinePower.zifuAcquisition`
   - `当前已掌握神通状态`
5. `branchProofs` 满足该神通的基础 proof 要求
6. `selectedBreakthroughMethodId` 适配 `zifu_divine_power`

`resolveBreakthroughAttempt` 仍复用四关壳，但第三关换成目标神通凝聚：

1. `shape_aux_foundation`
   为目标神通凝新基底
2. `cross_illusion`
   过蒙昧与稳定性校验
3. `gestate_target_power`
   凝成 `branchChoice` 指向的目标神通
4. `enter_taixu`
   收口本轮神通冲关

成功结果：

1. `realmId` 仍为 `realm.zifu`
2. 新增 `branchChoice` 对应神通
3. 清空本次 `branchChoice / branchProofs`
4. 写入四关摘要

失败结果：

1. 不丢已有神通
2. 不掉回筑基
3. 扣 `currentPower`
4. 扣 `cultivationAttainment`
5. 清空本次冲关态

### 4.4 失败惩罚统一为“修为 / 道行损伤”

这轮失败后果只结算两类核心损失：

1. `currentPowerLoss`
2. `cultivationAttainmentLoss`

它们的来源可以叠加：

1. 失败关卡基础倍率
2. `selectedBreakthroughMethodId` 的过程修正
3. 特定目标神通的风险修正

这轮不引入：

1. 立死
2. 废基
3. 长期封号式 debuff

## 五、数据结构调整

### 5.1 仙基定义

在 `FoundationDefinition` 上补：

```ts
firstDivinePowerId: string;
```

### 5.2 主修功法定义

在紫府期主修功法上补：

```ts
zifuPowerCoverage?: {
  candidatePowerIds: string[];
  maxPowerCount: 5;
}
```

### 5.3 神通定义

在神通定义上补：

```ts
zifuAcquisition?: {
  minExistingPowerCount: number;
  proofRequirementIds?: string[];
}
```

### 5.4 突破类型

扩充：

```ts
type BreakthroughTransitionId =
  | 'taixi_to_lianqi'
  | 'lianqi_to_zhuji'
  | 'zhuji_to_zifu'
  | 'zifu_divine_power';
```

### 5.5 突破运行态

`PlayerBreakthroughState` 继续承载：

- `selectedBreakthroughMethodId`
- `requirementProgress`
- `hardConditionFlags`
- `branchChoice`
- `branchProofs`

但本轮语义必须与冲关类型绑定：

- `realm_zhuji_to_zifu` 不读取 `branchChoice / branchProofs`
- `zifu_divine_power` 才正式读取它们

### 5.6 四关摘要

`BreakthroughResolutionSummary` 至少扩到：

```ts
{
  attemptKind: 'realm_zhuji_to_zifu' | 'zifu_divine_power';
  methodId: string | null;
  targetDivinePowerId: string | null;
  gates: Array<{
    id: string;
    passed: boolean;
  }>;
  failedGateId: string | null;
  powerLossApplied: number;
  attainmentLossApplied: number;
  consumedDefinitionIds: string[];
  sideEffectsApplied: string[];
  bonusOutcomeIds: string[];
}
```

## 六、阶段范围与迁移策略

### 6.1 本轮实现按两段收口

代码分两段落地：

1. `A. 首入紫府完整四关`
2. `B. 后续神通冲关最小闭环`

其中 `B` 这轮先以“能打通后续神通冲关机制”为目标，不追求第三到第五道神通的复杂互斥网络。

### 6.2 实施顺序固定

推荐顺序：

1. 先补静态模型
2. 再补首入紫府四关
3. 最后补后续神通冲关最小闭环

### 6.3 旧存档兼容规则

1. 若玩家已是 `realm.zifu`，但没有“首神通来源记录”
   现有 `knownDivinePowerIds` 视为历史状态，不回滚、不重算。
2. 若玩家处于 `realm.zhuji`，且已有 `foundationId`
   可直接按新规则进入“首入紫府四关”。
3. 若旧 `canonical.breakthrough` 没有 `branchChoice / branchProofs`
   自动补默认值：
   - `branchChoice = null`
   - `branchProofs = {}`
4. 若旧紫府号已有 1 道以上神通
   后续新增神通时，仅按“当前已有数量”推导本次是第几道，不要求补历史 branch 记录。

## 七、测试边界

### 7.1 首入紫府

至少覆盖：

1. `foundationId` 可唯一映射 `firstDivinePowerId`
2. 四关摘要可见
3. 失败时扣修为 / 道行，不进紫府
4. 成功时自动获得首神通，不读取 `branchChoice`

### 7.2 后续神通冲关

至少覆盖：

1. 第二道神通必须填写 `branchChoice`
2. `branchChoice` 必须落在 `mainMethodId.zifuPowerCoverage` 内
3. `branchProofs` 缺失时 readiness 失败
4. 成功后新增目标神通
5. 失败时不丢已有神通，只损修为 / 道行

## 八、完成定义

这轮 Done 定义为：

1. `筑基 -> 紫府` 变成真实四关流程
2. 首个神通由 `foundationId` 自动映射，不走 `branchChoice`
3. 失败会损伤 `currentPower + cultivationAttainment`
4. `zifu_divine_power` 作为独立冲关类型跑通
5. `branchChoice / branchProofs` 只在后续神通冲关启用
6. 旧存档不被回滚或重算

## 九、后续延期项

以下内容明确延期到后续阶段，不在本轮实现：

1. 第三到第五道神通的复杂互斥
2. 求金 / 求闰与金丹冲刺约束
3. 更重的失败后果
4. `紫府 -> 金丹`

本轮目标是先把“首入紫府完整四关”与“后续神通冲关的最小 branch 闭环”做成稳定 runtime，而不是提前把金丹期收束逻辑塞进紫府阶段。
