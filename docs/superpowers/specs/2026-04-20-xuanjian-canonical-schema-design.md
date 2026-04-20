# 玄鉴修仙 Canonical Schema 与数值锚点设计

- 日期：2026-04-20
- 状态：已完成脑暴，待用户 review
- 作用域：`docs/cultivation/xuanjian-worldbuilding.md`、`docs/cultivation/xuanjian-encounter-codex.md`、`docs/cultivation/xuanjian-combat-system.md`、`docs/cultivation/xuanjian-dev-manual.md`
- 目标：把当前玄鉴文档里已经确认的设定压成一套统一的 `canonical schema + numeric contract`，供 `src/types`、`src/config`、`src/models`、`src/services` 后续实现时共同遵守

## 一、目标与边界

这份设计文档的定位不是继续补世界观，也不是直接改运行时代码，而是定义一层独立的 `canonical contract`，专门解决以下三件事：

1. 把当前玄鉴文档里已经确认的设定，压成统一字段、统一归类、统一结算口径。
2. 给 `V1` 提供可直接落到 `src/types`、`src/config`、`CultivationService`、`EncounterService` 的最小实现约束。
3. 给 `V2` 预留不会打破 `V1` 的扩展位，包括更细的境界阶段、更复杂的突破分支、更强的道行分化与经济系统。

这份设计明确覆盖：

1. `实体 schema`
   主修功法、战斗法门、神通、破境法门、丹药、灵物、法器、道基、玩家修炼状态。
2. `运行态 schema`
   玩家当前境界、修为、道行、主修功法、已装备法门、已掌握神通、突破准备、背包与伤势。
3. `数值 contract`
   专注收益、功法倍率、道行修正、奇遇波动、突破需求、战斗四维映射。
4. `版本 contract`
   每个字段都标记 `V1 required`、`V2 reserved` 或 `V2 active when enabled`。

这份设计明确不覆盖：

1. 原文世界观考据本身。
2. 全部条目的逐项定数。
3. UI / 命令文案的逐句设计。
4. 宗门、坊市、灵田、供奉、百艺等 `V2` 扩展玩法的完整方案。

## 二、Authority Stack 与依赖关系

当前玄鉴体系的文档依赖顺序应固定为：

1. [xuanjian-worldbuilding.md](/Users/qingcongyu/telegramBots/AutomanagerAsistant/docs/cultivation/xuanjian-worldbuilding.md)
   提供世界观事实、境界边界、资源语义与设定约束。
2. [2026-04-20-xuanjian-cultivation-loop-redesign.md](/Users/qingcongyu/telegramBots/AutomanagerAsistant/docs/superpowers/specs/2026-04-20-xuanjian-cultivation-loop-redesign.md)
   提供主循环设计、成长线拆层、功法/道行/奇遇的重新分工。
3. [xuanjian-encounter-codex.md](/Users/qingcongyu/telegramBots/AutomanagerAsistant/docs/cultivation/xuanjian-encounter-codex.md)
   提供掉落池、条目分类、突破物与资源语义。
4. [xuanjian-combat-system.md](/Users/qingcongyu/telegramBots/AutomanagerAsistant/docs/cultivation/xuanjian-combat-system.md)
   提供战斗字段、四维系统、技能表达和效果语义。
5. [xuanjian-dev-manual.md](/Users/qingcongyu/telegramBots/AutomanagerAsistant/docs/cultivation/xuanjian-dev-manual.md)
   提供落地文件清单、迁移触点与技术约束。

本设计文档是上述文档之间的中间契约层：

1. 上承设定与玩法语义。
2. 下接配置、类型、服务层与迁移脚本。
3. 不直接替代上游文档，而是定义“实现时唯一应该照着写的结构约束”。

## 三、Canonical 实体模型

### 3.1 建模原则

这一层的核心原则如下：

1. `一个条目只有一个主归属`
   同一个名字不能同时既是 `主修功法` 又是 `破境法门`。如果存在世界观上的关联，用 `relatedIds`、`unlockBy`、`lineage` 表达，不靠重复归类解决。
2. `静态定义` 与 `玩家实例` 分离
   文档中的条目定义只描述公共属性；玩家持有、装备、已习得状态属于运行态实例。
3. `统一基础头部`
   所有可配置实体共享一套最小头部，保证掉落、展示、战斗、突破和迁移都能引用同一 `id`。
4. `V1/V2 不分两套 schema`
   只保留一套 canonical schema，但在设计文档中标记字段的版本状态；版本标签不进入玩家存档。

### 3.2 统一基础字段

所有静态定义实体共享以下字段：

| 字段 | 说明 | 版本 |
|------|------|------|
| `id` | 稳定主键，建议命名空间化，如 `method.taiyin_qingxu_jue` | V1 required |
| `name` | 展示名 | V1 required |
| `category` | 主类目，只能取一个 | V1 required |
| `tier` | `凡 / 黄 / 玄 / 地` 或独立层级 | V1 required |
| `realmFloor` | 最低有效境界 | V1 required |
| `realmCeiling` | 建议生效上限或投放上限 | V1 required |
| `source` | 对应设定/文档来源说明 | V1 required |
| `tags` | 道统、五行、兵器适配等次级语义 | V1 required |
| `dropScope` | `common / heritage / majorFortune / breakthroughOnly / npcOnly` | V1 required |
| `relatedIds` | 关联条目 | V2 reserved |
| `enabledInV1` | 是否进入 `V1` 投放与实现 | V1 required |
| `reservedForV2` | 是否仅留接口暂不开放 | V1 required |

### 3.3 核心实体类型

#### 3.3.1 `RealmDefinition`

负责定义六大境界及 `V2` 的细分阶段。

| 字段 | 说明 | 版本 |
|------|------|------|
| `order` | 境界顺序 | V1 required |
| `powerRange` | 修为区间 | V1 required |
| `baseStatProfile` | 战斗四维基础模板 | V1 required |
| `breakthroughMode` | `auto / collection / branch` | V1 required |
| `subStages` | 练气九层、筑基三层等 | V2 reserved |
| `titleVariants` | 古称/别称 | V2 reserved |
| `lifespanBand` | 寿元区间 | V2 reserved |
| `npcGenerationWeight` | 敌人/NPC 生成权重 | V2 reserved |

#### 3.3.2 `MainMethodDefinition`

对应主修功法。

| 字段 | 说明 | 版本 |
|------|------|------|
| `grade` | 品级 | V1 required |
| `cultivationMultiplier` | 修炼倍率 | V1 required |
| `combatBias` | 四维偏向 | V1 required |
| `foundationAffinity` | 道基/仙基倾向 | V1 required |
| `artSlotsBonus` | 战斗法门槽位修正 | V1 required |
| `divinePowerSlotsBonus` | 神通槽位修正 | V1 required |
| `breakthroughAssist` | 破境辅助语义 | V1 required |
| `requiredAura` | 灵气/道统前置条件 | V1 required |
| `lineage` | 法脉/道统归属 | V2 reserved |
| `variantPath` | 分支演化路线 | V2 reserved |
| `hiddenSynergies` | 隐藏联动 | V2 reserved |
| `methodEvolution` | 功法演化定义 | V2 reserved |

#### 3.3.3 `BattleArtDefinition`

对应攻击术法、兵术、身法、遁法、辅助秘法。

| 字段 | 说明 | 版本 |
|------|------|------|
| `artCategory` | `攻击术法 / 兵术 / 身法 / 遁法 / 辅助秘法` | V1 required |
| `slotType` | 占用的战斗槽位类型 | V1 required |
| `combatEffects` | 战斗效果载荷 | V1 required |
| `daoScaling` | 道行缩放权重 | V1 required |
| `requiresWeaponType` | 是否依赖特定兵器 | V1 required |
| `isQuasiDivineArt` | 准神通级法门标记 | V1 required |
| `preferredDaoTrack` | 偏好道统 | V2 reserved |
| `comboTags` | 连招标签 | V2 reserved |
| `stanceMode` | 架势/蓄力模式 | V2 reserved |
| `counterWindows` | 反制窗口 | V2 reserved |

#### 3.3.4 `DivinePowerDefinition`

对应术神通、身神通、命神通和兼类神通。

| 字段 | 说明 | 版本 |
|------|------|------|
| `divinePowerType` | 主类型 | V1 required |
| `secondaryType` | 次类型 | V1 required |
| `unlockRealm` | 最低解锁境界 | V1 required |
| `combatPattern` | 战斗模式描述 | V1 required |
| `daoScaling` | 道行缩放权重 | V1 required |
| `requiresManualClassification` | 是否仍需人工校订 | V1 required |
| `originFoundation` | 源道基/仙基 | V2 reserved |
| `evolutionTrack` | 演化路线 | V2 reserved |
| `suppressionRules` | 高阶压制规则 | V2 reserved |
| `crossRealmPressure` | 跨阶威压表达 | V2 reserved |

#### 3.3.5 `BreakthroughMethodDefinition`

对应接引法、化神通秘法、求金法、闰法、旁门成道法。

| 字段 | 说明 | 版本 |
|------|------|------|
| `targetRealm` | 目标境界 | V1 required |
| `pathType` | 突破路线类型 | V1 required |
| `requiredItems` | 必需材料/条目 | V1 required |
| `hardConditions` | 硬性条件 | V1 required |
| `stabilityBonus` | 稳定度修正 | V1 required |
| `failureOutcome` | 失败结果 | V1 required |
| `branchingPaths` | 分支路径 | V2 reserved |
| `exclusiveWith` | 互斥路径 | V2 reserved |
| `lineageRequirement` | 道统/法脉要求 | V2 reserved |
| `consumablePattern` | 消耗模板 | V2 reserved |

#### 3.3.6 `EquipmentDefinition`

对应武器、护具、法器、法宝。

| 字段 | 说明 | 版本 |
|------|------|------|
| `slot` | 装备槽位 | V1 required |
| `weaponType` | 兵器类型 | V1 required |
| `statModifiers` | 四维修正 | V1 required |
| `specialEffects` | 特效载荷 | V1 required |
| `bindArtTags` | 适配法门标签 | V1 required |
| `spiritRefineStage` | 炼化阶段 | V2 reserved |
| `setBonus` | 套装/组合加成 | V2 reserved |
| `artifactGrowthPath` | 法宝成长路径 | V2 reserved |

#### 3.3.7 `ConsumableDefinition` 与 `MaterialDefinition`

逻辑上分两类，存储层可以共用父结构：

1. `consumable`
   对应丹药、宝药、一次性灵物。
2. `material`
   对应灵矿、灵植、突破辅材、交易物。

| 字段 | 说明 | 版本 |
|------|------|------|
| `effectType` | `cultivation / healing / breakthrough / combat / clue / currency` | V1 required |
| `effectPayload` | 具体效果载荷 | V1 required |
| `stackRule` | 堆叠规则 | V1 required |
| `valueBand` | 价值带 | V1 required |
| `craftInputs` | 可作为配方输入 | V2 reserved |
| `marketUse` | 市场用途 | V2 reserved |
| `refinementPath` | 提炼/炼制路径 | V2 reserved |

#### 3.3.8 `FoundationDefinition`

对应道基/仙基。

| 字段 | 说明 | 版本 |
|------|------|------|
| `foundationType` | 道基/仙基类别 | V1 required |
| `affinityTags` | 道统/五行适配 | V1 required |
| `combatBias` | 四维偏向 | V1 required |
| `breakthroughHooks` | 对突破条件和收益的影响 | V1 required |
| `divinePowerBias` | 神通倾向 | V1 required |
| `foundationMutation` | 异变路径 | V2 reserved |
| `hybridCompatibility` | 混合兼容性 | V2 reserved |
| `sectInheritanceWeight` | 宗门/家族继承权重 | V2 reserved |

### 3.4 掉落表不是源头模型

`EncounterItem` 不应再是源头类型。它在实现中最多作为“掉落入口视图”存在：

```text
奇遇掉落表
  -> 引用 canonical 实体 ID
  -> 由实体定义决定修炼 / 战斗 / 突破效果
```

这意味着：

1. 不再把所有效果直接硬塞进掉落表。
2. 奇遇表负责“能掉什么”，实体定义负责“这是什么、怎么生效”。
3. 同一个条目可以被多个奇遇池引用，但只维护一份权威定义。

## 四、运行态状态模型

### 4.1 建模原则

运行态模型遵守以下规则：

1. `静态定义只存 ID 引用`
   玩家档案里存 `mainMethodId`，不复制功法倍率和槽位等静态字段。
2. `持久状态` 与 `派生状态` 分离
   修为、道行、已学技能、装备与背包属于持久状态；战斗四维、总倍率、可用槽位按需现算。
3. `日常修炼状态` 与 `战斗快照` 分离
   用户档案不长期存整套战斗结果，战斗时由运行态和静态定义动态拼出 `CombatProfile`。

### 4.2 核心运行态结构

#### 4.2.1 `PlayerCultivationState`

玩家修炼主档。

| 字段 | 说明 | 版本 |
|------|------|------|
| `realmId` | 当前境界 | V1 required |
| `currentPower` | 当前修为 | V1 required |
| `mainMethodId` | 当前主修功法 | V1 required |
| `mainDaoTrack` | 主道统/主修方向 | V1 required |
| `cultivationAttainment` | 道行总量 | V1 required |
| `foundationId` | 当前道基/仙基 | V1 required |
| `knownBattleArtIds` | 已掌握法门 | V1 required |
| `equippedBattleArtIds` | 已装备法门 | V1 required |
| `knownDivinePowerIds` | 已掌握神通 | V1 required |
| `equippedDivinePowerIds` | 已装备神通 | V1 required |
| `equipmentLoadout` | 当前装备 | V1 required |
| `inventoryItemIds` | 背包实例引用 | V1 required |
| `injuryState` | 伤势档案 | V1 required |
| `focusStreak` | 连续专注计数 | V1 required |
| `lastCultivationAt` | 最近一次修炼结算时间 | V1 required |
| `schemaVersion` | 存档版本 | V1 required |
| `realmSubStageId` | 细分境界阶段 | V2 reserved |
| `branchCultivationAttainments` | 分支道行 | V2 reserved |
| `methodEvolutionState` | 功法演化状态 | V2 reserved |
| `secondaryFoundationId` | 副道基/异变基 | V2 reserved |
| `sectAffiliation` | 宗门/家族归属 | V2 reserved |
| `craftSpecializations` | 百艺专长 | V2 reserved |
| `marketFlags` | 经济/市场状态 | V2 reserved |

#### 4.2.2 `PlayerBreakthroughState`

独立的破境准备档，不与主档混写。

| 字段 | 说明 | 版本 |
|------|------|------|
| `targetRealm` | 目标境界 | V1 required |
| `selectedBreakthroughMethodId` | 当前选定破境法门 | V1 required |
| `requirementProgress` | 条件进度 | V1 required |
| `hardConditionFlags` | 硬条件完成情况 | V1 required |
| `stabilityScore` | 稳定度 | V1 required |
| `attemptHistory` | 尝试记录 | V1 required |
| `branchChoice` | 分支选择 | V2 reserved |
| `branchProofs` | 分支佐证 | V2 reserved |

#### 4.2.3 `InventoryInstance`

静态定义之外，玩家实例只存最小必要信息。

| 字段 | 说明 | 版本 |
|------|------|------|
| `definitionId` | 对应 canonical 实体 ID | V1 required |
| `obtainedAt` | 获得时间 | V1 required |
| `sourceType` | 来源 | V1 required |
| `bound` | 是否绑定 | V1 required |
| `used` | 是否消耗/已用 | V1 required |
| `stackCount` | 堆叠数 | V1 required |
| `instanceMeta` | 少数实例差异数据 | V1 required |

#### 4.2.4 `DerivedCombatProfile`

不建议持久化，只在查看状态、进入战斗或结算时现算。

它由以下输入动态生成：

1. 当前境界
2. 主修功法
3. `cultivationAttainment`
4. 道基/仙基
5. 已装备法门
6. 已装备神通
7. 已装备法器
8. 伤势与临时状态

### 4.3 不应持久化的派生值

以下字段不应作为权威存档值存在：

1. `cultivationMultiplier`
2. `combatPower`
3. `availableArtSlots`
4. `availableDivinePowerSlots`
5. `sameSchoolBonus`
6. `totalCultivationGainMultiplier`

如果为了性能缓存它们，也只能作为可丢弃缓存，不能作为权威值。

## 五、主循环结算公式

### 5.1 结算顺序

一次专注后的结算严格按以下顺序执行：

1. 结算 `基础修为`
2. 应用 `主修功法倍率`
3. 应用 `cultivationAttainment` 的通用修正
4. 应用 `cultivationAttainment` 的同道统发挥修正
5. 应用少数直接增修为的丹药/灵物修正
6. 结算本次 `cultivationAttainment` 增长
7. 判定奇遇 / 战斗 / 灵石波动 / 掉落
8. 更新突破准备进度
9. 仅在条件满足时标记 `breakthroughReady`，不自动突破

标准流水如下：

```text
完成专注
  -> durationProfile
  -> basePowerGain
  -> methodAdjustedPower
  -> attainmentAdjustedPower
  -> schoolAdjustedPower
  -> consumableAdjustedPower
  -> attainmentGain
  -> encounterResolution
  -> breakthroughProgressUpdate
```

### 5.2 修为结算公式

`V1` 主公式如下：

```text
本次修为收益
= 时长基础值
× 当前境界修炼模板系数
× 主修功法倍率
× 通用道行修正
× 同道统发挥修正
× 临时修炼修正
+ 固定修为型物品收益
```

各项含义固定为：

1. `时长基础值`
   仅由专注时长档位决定。
2. `当前境界修炼模板系数`
   用于约束节奏和单次结算边界，不作为“高境界吸收更少”的惩罚项。
3. `主修功法倍率`
   体现主修功法高低品与正法/秘法差异，是核心长期乘区。
4. `通用道行修正`
   体现长期理解对修炼与斗法的稳定优化。
5. `同道统发挥修正`
   体现高道行对同道统功法、法门、神通的额外加成。
6. `临时修炼修正`
   包括卜卦增益、洞府环境、闭关状态等。
7. `固定修为型物品收益`
   只允许少数丹药与灵物显式提供。

### 5.3 境界难度表达原则

高境界更难，不通过“同样专注但吸收更少修为”来体现，而主要通过以下项体现：

1. `nextRealmRequiredPower` 更高
2. `breakthroughRequirement` 更重
3. 对主修功法、道行、破境法门和同源外物要求更严

因此：

1. `当前境界` 影响的是修炼模板和总需求值。
2. `主修为来源` 始终是完成专注任务。
3. 奇遇不再承担主要修为来源。

## 六、V1 数值锚点

### 6.1 数值原则

`V1` 数值优先解决三个问题：

1. 玩家完成一次专注后必须有清晰成长反馈。
2. 大境界差距主要靠总需求与破境条件拉开。
3. 高品功法、高道行与高阶构筑能显著拉开同境差距，但不默认抹平大境界差。

### 6.2 境界修为需求

| 境界 | 修为区间 | 升至下一境新增需求 |
|------|----------|-------------------|
| 胎息 | `0 - 120` | `120` |
| 练气 | `120 - 420` | `300` |
| 筑基 | `420 - 1120` | `700` |
| 紫府 | `1120 - 2620` | `1500` |
| 金丹 | `2620 - 5620` | `3000` |
| 元婴 | `5620 - 10620` | `5000` |

`V2` 如果要做 `练气九层 / 筑基三层 / 金丹三阶段`，只允许在这些包络线内细分，不推翻 `V1` 总盘子。

### 6.3 专注收益模板

时长基础值：

| 专注时长 | 时长基础值 |
|----------|------------|
| `30` 分钟 | `10` |
| `60` 分钟 | `24` |
| `75` 分钟及以上 | `36` |

境界修炼模板系数：

| 境界 | 模板系数 |
|------|----------|
| 胎息 / 练气 | `1.00` |
| 筑基 | `1.05` |
| 紫府 | `1.10` |
| 金丹 | `1.15` |
| 元婴 | `1.20` |

### 6.4 主修功法倍率

| 品级 | 修炼倍率 |
|------|----------|
| 一品 | `1.00` |
| 二品 | `1.10` |
| 三品 | `1.25` |
| 四品 | `1.45` |
| 五品 | `1.75` |
| 六品 | `2.10` |

附加修饰：

1. `古法` 在原倍率上再乘 `1.10 ~ 1.20`
2. `秘法` 在原倍率上再乘 `0.85 ~ 0.95`

### 6.5 `cultivationAttainment` 修正与增长

原则如下：

1. `cultivationAttainment` 总量不设上限。
2. 数值收益采用分段递减。
3. 高道行除通用加成外，还应强化同道统功法、法门、神通。
4. 高道行更偏长期底蕴与机制解锁，不以无限线性乘区压过境界与功法。

修正模型：

```text
总道行修正
= 通用道行修正 × 同道统发挥修正
```

分段递减锚点：

| 道行区间 | 通用修炼/战斗修正 |
|----------|------------------|
| `1 - 10` | 每点 `+2.0%` |
| `11 - 30` | 每点 `+1.0%` |
| `31 - 60` | 每点 `+0.5%` |
| `61+` | 每点 `+0.2%` |

同道统发挥锚点：

| 匹配条件 | 额外加成建议 |
|----------|-------------|
| 主修功法与主道统一致 | `+5% ~ +10%` |
| 战斗法门与主道统一致 | `+3% ~ +8%` |
| 神通与主道统一致 | `+5% ~ +12%` |

V1 的道行来源：

| 来源 | 建议收益 |
|------|----------|
| 连续专注达 `5` 次 | `+1` |
| 连续专注达 `50` 次 | `+1` |
| 连续专注达 `100` 次及以上的每次专注 | `+1` |
| 战胜越阶对手 | `+2` |
| 战胜守护者 / 首领 | `+3` |
| 顿悟事件 | `+1 ~ +3` |
| 练气 / 筑基级关键破关 | `+4` |
| 紫府级关键破关 | `+6` |
| 金丹及以上关键破关 | `+8` |

### 6.6 槽位锚点

| 境界 | 已装备战斗法门上限 | 已装备神通上限 |
|------|-------------------|----------------|
| 胎息 | `1` | `0` |
| 练气 | `2` | `0` |
| 筑基 | `3` | `0` |
| 紫府 | `3` | `1` |
| 金丹 | `4` | `2` |
| 元婴 | `4` | `3` |

`mainMethod` 不占这里的槽位，只提供平台层修正。

### 6.7 灵石波动与直接修为型物品

奇遇灵石波动区间：

| 奇遇品阶 | 灵石建议变动区间 |
|----------|------------------|
| 凡阶 | `-3 ~ +8` |
| 黄阶 | `-8 ~ +20` |
| 玄阶 | `-15 ~ +45` |
| 地阶 | `-30 ~ +90` |

允许直接增修为的丹药/灵物，仅对描述明确符合的条目开放，锚点如下：

| 品阶 | 直接修为收益建议 |
|------|------------------|
| 凡阶 | `+6 ~ +12` |
| 黄阶 | `+15 ~ +30` |
| 玄阶 | `+35 ~ +70` |
| 地阶 | `+80 ~ +150` |

### 6.8 突破门槛锚点

| 突破 | V1 硬条件建议 | V2 预留 |
|------|----------------|---------|
| 胎息 → 练气 | 修为达标 | 灵窍/轮次细分 |
| 练气 → 筑基 | 修为达标 + 装备主修功法 + `黄阶及以上` 基础突破辅材 `1` 件 | 更细的仙基凝结路线 |
| 筑基 → 紫府 | 修为达标 + `玄阶` 破境法门 `1` 件 + `cultivationAttainment >= 10` + 已定道基/仙基方向 | 更严格的同源化神通要求 |
| 紫府 → 金丹 | 修为达标 + `求金 / 求闰 / 同类` 破境法门 `1` 件 + 已掌握神通 `1` 道 + `cultivationAttainment >= 18` | 原设“五道神通”与更复杂分支 |
| 金丹 → 元婴 | 修为达标 + 高阶破境法门 `1` 件 + 已掌握神通 `2` 道 + `cultivationAttainment >= 28` | 更细的证道/旁门成道路径 |

### 6.9 战斗四维表达

`combatBias` 与法器、法门、神通统一使用四维权重向量：

1. `attack`
2. `defense`
3. `insight`
4. `speed`

V1 约束：

1. 默认中性模板为 `25 / 25 / 25 / 25`
2. 主修功法允许产生明显偏科，但单一维度建议不超过 `40`
3. 单件法器 / 单道法门产生局部修正，不单独改写整套战斗人格
4. 神通更多决定战斗模式，而非只堆基础数值

## 七、V2 预留字段与启用条件

### 7.1 预留规则

1. `V2 reserved` 字段在 `V1` 可以存在，但默认不参与结算。
2. 某个字段从 `reserved` 变成 `active`，必须通过显式功能开关。
3. 任一 `V2` 模块启用前必须同时满足：
   - 功能开关开启
   - 对应静态配置已补齐
   - 存档版本完成迁移
4. `V1` 服务层如果读到 `V2` 字段但功能未开，应忽略而非半启用。

### 7.2 预留模块

#### 7.2.1 `realmSubStages`

用于 `练气九层 / 筑基三层 / 金丹三阶段`。

| 侧面 | 字段 |
|------|------|
| 静态 | `RealmDefinition.subStages` |
| 运行态 | `PlayerCultivationState.realmSubStageId` |
| 开关 | `features.realmSubStages` |

#### 7.2.2 `branchCultivationAttainments`

用于“主道行 + 分支道行”。

| 侧面 | 字段 |
|------|------|
| 静态 | `MainMethodDefinition.supportedDaoTracks`、`BattleArtDefinition.preferredDaoTrack`、`DivinePowerDefinition.preferredDaoTrack` |
| 运行态 | `PlayerCultivationState.branchCultivationAttainments` |
| 开关 | `features.branchAttainment` |

#### 7.2.3 `methodEvolution`

用于古法转化、秘法副作用、功法演化支线。

| 侧面 | 字段 |
|------|------|
| 静态 | `MainMethodDefinition.methodEvolution` |
| 运行态 | `PlayerCultivationState.methodEvolutionState` |
| 开关 | `features.methodEvolution` |

#### 7.2.4 `advancedBreakthroughBranches`

用于紫府后更复杂的同源化神通、五道神通、求金/求闰分歧。

| 侧面 | 字段 |
|------|------|
| 静态 | `BreakthroughMethodDefinition.branchingPaths`、`exclusiveWith` |
| 运行态 | `PlayerBreakthroughState.branchChoice`、`branchProofs` |
| 开关 | `features.advancedBreakthrough` |

#### 7.2.5 `foundationMutation`

用于双基、异变仙基、混合兼容。

| 侧面 | 字段 |
|------|------|
| 静态 | `FoundationDefinition.hybridCompatibility`、`foundationMutation` |
| 运行态 | `PlayerCultivationState.secondaryFoundationId`、`foundationMutationState` |
| 开关 | `features.foundationMutation` |

#### 7.2.6 `professionAndEconomy`

用于丹器阵符、坊市、宗门供给、灵田与百艺。

| 侧面 | 字段 |
|------|------|
| 静态 | `MaterialDefinition.marketUse`、`ConsumableDefinition.craftInputs` |
| 运行态 | `PlayerCultivationState.craftSpecializations`、`marketFlags`、`sectAffiliation` |
| 开关 | `features.professionEconomy` |

### 7.3 功能开关结构

建议统一使用：

```ts
interface CultivationFeatureFlags {
  realmSubStages: boolean;
  branchAttainment: boolean;
  methodEvolution: boolean;
  advancedBreakthrough: boolean;
  foundationMutation: boolean;
  professionEconomy: boolean;
}
```

启用顺序建议：

1. `realmSubStages`
2. `advancedBreakthrough`
3. `branchAttainment`
4. `methodEvolution`
5. `foundationMutation`
6. `professionEconomy`

## 八、迁移映射与兼容规则

### 8.1 兼容原则

1. `V1` 实现优先保留现有 MongoDB 字段名：
   - `spiritualPower`
   - `immortalStones`
   - `realm`
   - `realmStage`
   - `realmId`
   - `ascensions`
   - `immortalMarks`
2. 显示语义与业务语义切换为玄鉴口径：
   - `spiritualPower` 前台显示为“修为”
   - `immortalStones` 前台显示为“灵石”
3. `ascensions` 与 `immortalMarks` 在 `V1` 视为遗留扩展字段，不删除、不宣传、默认不启用。
4. `canonical schema` 是目标解释层，旧字段只是存储兼容壳。

### 8.2 旧字段到 canonical 语义的映射

| 旧字段 | canonical 语义 | 说明 |
|--------|----------------|------|
| `spiritualPower` | `currentPower` | 内部字段名保留，业务语义切换为“修为” |
| `immortalStones` | `spiritStoneBalance` | 内部字段名保留，前台显示“灵石” |
| `realm` | `realmId` 对应的展示缓存 | 不再作为权威值 |
| `realmStage` | `realmSubStageId` 或展示缓存 | 不再作为权威值 |
| `realmId` | 当前境界缓存 | 由 canonical 境界表重算 |
| `ascensions` | legacy 扩展状态 | `V1` 默认不参与主循环 |
| `immortalMarks` | legacy 扩展状态 | `V1` 默认不参与主循环 |

### 8.3 旧九境到新六境的迁移策略

当前旧系统是“通用九境”，并不与玄鉴六境一一等价。因此迁移时不应宣称“世界观对位”，而应采用“兼容映射”。

推荐策略：

1. 迁移脚本以旧境界带内进度做插值，而不是简单保留旧境界名。
2. 旧九境仅用于计算迁移时的相对进度，不再作为新系统权威分类。
3. 新系统上线后，一切状态判断都以 canonical `RealmDefinition` 为准。

带内映射建议如下：

| 旧系统境界 | 旧修为带 | 新系统目标境界 | 映射方式 |
|------------|----------|----------------|----------|
| 炼气期 | `0 - 999` | 胎息 | 保留带内相对进度，映射到 `0 - 120` |
| 筑基期 | `1000 - 2499` | 练气 | 保留带内相对进度，映射到 `120 - 420` |
| 金丹期 | `2500 - 4999` | 筑基 | 保留带内相对进度，映射到 `420 - 1120` |
| 元婴期 | `5000 - 7999` | 紫府 | 保留带内相对进度，映射到 `1120 - 2620` |
| 化神期 | `8000 - 11999` | 金丹 | 保留带内相对进度，映射到 `2620 - 5620` |
| 炼虚期及以上 | `12000+` | 元婴 | 进入顶层支持区间，超额部分按压缩映射或顶层溢出规则处理 |

其中：

1. 这张表是兼容映射，不是世界观等价表。
2. 对于旧系统高阶玩家，`V1` 允许将超额部分压缩到元婴顶层，以避免大规模数值清零。
3. 是否为顶层元婴保留额外扩展区间，由实现阶段结合榜单与历史用户分布决定。

### 8.4 迁移执行要求

`V1` 迁移最少需要满足：

1. 迁移脚本支持 `--dry-run`
2. 输出迁移前后境界分布对比
3. 输出异常记录与未映射记录
4. 不破坏旧存档中的 `ascensions`、`immortalMarks`、`immortalStones`
5. 所有新写入记录必须包含 `schemaVersion`

## 九、验收标准

### 9.1 文档验收

满足以下条件，才能认为这份 schema 设计成立：

1. 所有修炼相关实体都能归入唯一主类目。
2. `EncounterItem` 不再被当作唯一源头模型。
3. `mainMethod / battleArt / divinePower / breakthroughMethod / foundation` 五层职责已彻底拆开。
4. `cultivationAttainment` 已作为独立长期成长轴进入 schema。
5. `V1 required` 与 `V2 reserved` 字段边界清晰。

### 9.2 实现前验收

在进入实现计划前，应至少满足：

1. 能从一次专注任务推导完整结算链：
   `时长 -> 修为 -> 道行 -> 奇遇 -> 战斗/掉落 -> 突破进度`
2. 能从一条静态实体定义推导：
   `掉落展示 -> 背包实例 -> 装备/学习 -> 修炼/战斗/突破生效`
3. 能从旧用户存档推导到 canonical 运行态，不需要手工修数值。
4. 能解释任一高阶条目为什么属于 `主修功法`、`战斗法门`、`神通` 或 `破境法门`，而不是继续交叉混类。

### 9.3 进入实现阶段的最小 Done 定义

当后续代码实现完成时，最低应能验证：

1. 完成一轮专注后，系统能结算修为、`cultivationAttainment`、灵石波动和掉落。
2. 玩家状态页能正确展示当前境界、主修功法、道行、已装备法门、已掌握神通和突破准备。
3. 战斗构筑读取的是 canonical 实体定义，而不是临时拼接字符串效果。
4. `V2` 开关全部关闭时，系统仍能完整运行。
5. 任意 `V2` 模块单独开启前，都有对应迁移与配置校验。

## 十、下一步建议

这份设计文档通过后，后续工作应按这个顺序推进：

1. 基于本设计写一份独立的 implementation plan
2. 先落 `src/types` 与 `src/config` 的 canonical 结构
3. 再改 `User` 模型与 `CultivationService / EncounterService`
4. 最后切命令文案、迁移脚本与测试

`V1` 的目标不是一次性做完整个玄鉴世界，而是先把“主循环 + schema + 兼容迁移”三件事做对。
