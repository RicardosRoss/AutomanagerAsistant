# 玄鉴主动战斗系统 V2 设计

- 日期：2026-04-21
- 状态：已完成脑暴，待用户 review
- 作用域：`docs/cultivation/xuanjian-combat-system.md`、`docs/cultivation/xuanjian-encounter-codex.md`、`docs/cultivation/xuanjian-dev-manual.md`、`docs/superpowers/specs/2026-04-20-xuanjian-canonical-schema-design.md`
- 目标：在不推翻现有 `V1 canonical 修炼运行时` 的前提下，新增独立的主动战斗运行时，使奇遇中的斗法分支可以基于主修功法、战斗法门、神通、法器、道行与小阶境界进行稳定结算，并把结果反馈回 canonical 存档

## 一、目标与边界

这份文档定义的不是世界观描述，也不是单纯的战斗字段表，而是一套独立的 `combat runtime` 设计，用来解决以下三件事：

1. 让奇遇中的斗法分支从“文档设定”变成“可计算、可测试、可回写”的运行时模块。
2. 让 `主修功法 / 战斗法门 / 神通 / 法器 / 道行 / 小阶境界` 真正成为战斗输入，而不只是条目展示。
3. 在现有 `canonical schema` 上启用 `V2 reserved` 扩展位，而不是重建第二套存档模型。

这份设计明确覆盖：

1. `主动战斗运行时`
   仅覆盖奇遇战，不覆盖守关战、试炼战、破境战或玩家间 PVP。
2. `V2 战斗前置扩展`
   包括更细分的小阶境界结构，以及更完整的法门/神通内容池接入方式。
3. `状态投影与结果回写`
   包括从 canonical 存档生成战斗快照、从战斗结果生成 canonical patch。
4. `测试、验收与实现顺序`
   明确 V2 主动战斗系统的工程落地边界。

这份设计明确不覆盖：

1. 宗门、坊市、百艺、灵田、供奉等外部经济系统。
2. NPC 势力关系、社会模拟、开放世界探索。
3. 飞升/登仙线。
4. 长线刷怪、地图循环战斗、复杂行为树 AI。

## 二、Authority Stack 与前置依赖

主动战斗系统的依赖顺序固定为：

1. [2026-04-20-xuanjian-canonical-schema-design.md](/Users/qingcongyu/telegramBots/AutomanagerAsistant/docs/superpowers/specs/2026-04-20-xuanjian-canonical-schema-design.md)
   负责定义 `V1 required` 与 `V2 reserved` 字段边界。
2. [2026-04-20-xuanjian-cultivation-loop-redesign.md](/Users/qingcongyu/telegramBots/AutomanagerAsistant/docs/superpowers/specs/2026-04-20-xuanjian-cultivation-loop-redesign.md)
   负责定义功法、战斗法门、神通、道行的语义分工。
3. [xuanjian-combat-system.md](/Users/qingcongyu/telegramBots/AutomanagerAsistant/docs/cultivation/xuanjian-combat-system.md)
   提供四维体系、战斗字段与战力表达语义。
4. [xuanjian-encounter-codex.md](/Users/qingcongyu/telegramBots/AutomanagerAsistant/docs/cultivation/xuanjian-encounter-codex.md)
   提供奇遇掉落、战斗法门/神通池和物品来源。
5. [xuanjian-dev-manual.md](/Users/qingcongyu/telegramBots/AutomanagerAsistant/docs/cultivation/xuanjian-dev-manual.md)
   提供实现触点与运行时文件清单。

本设计文档位于以上文档和实际实现之间，负责把“战斗设定”压成 `V2 runtime contract`。

## 三、系统分层与架构拆分

主动战斗系统不应继续膨胀 [CultivationService.ts](/Users/qingcongyu/telegramBots/AutomanagerAsistant/src/services/CultivationService.ts)，而应拆为 5 个单元。

### 3.1 `CombatConfig`

负责所有静态定义和查表，包括：

1. 小阶境界模板
2. 敌人模板
3. 法门/神通运行时投影规则
4. 四维权重、先手、命中、护体、伤害等数值锚点

它相当于战斗侧的 `xuanjianCanonical.ts`。

### 3.2 `CombatStateAdapter`

负责把当前 canonical 存档投影成战斗态，而不是让求解器直接读 Mongoose 文档。

输入：

1. 玩家 `cultivation.canonical`
2. 奇遇上下文
3. 当前可用构筑

输出：

1. 战斗境界与小阶
2. 主修功法、战斗法门、神通、法器
3. 道行加成
4. 攻/防/识/速与衍生值
5. 伤势、冷却、临时标记

### 3.3 `CombatResolver`

这是核心求解器，职责只包括：

1. 根据双方战斗快照和战斗定义结算回合
2. 处理先手、命中、闪避、格挡、护体、伤害、控制、神通释放
3. 输出胜负、关键触发和资源变化草案

它应保持纯函数或近纯函数，避免直接落库。

### 3.4 `CombatRewardBridge`

负责把战斗结果转成对 canonical 状态的回写补丁，包括：

1. 灵石、材料、掉落
2. `cultivationAttainment` 收益
3. 伤势和冷却
4. 物品消耗和背包变更
5. 奇遇后续分支标记

### 3.5 `CombatService / Handlers`

只负责入口编排和文案输出：

1. 从奇遇进入战斗
2. 调用 adapter、resolver、bridge
3. 生成 Telegram 短战报
4. 将摘要写入状态或事件流

## 四、数据模型与 Runtime 接口

V2 只扩展现有 canonical schema，不重建第二套模型。

### 4.1 建议启用的 V2 运行时字段

| 字段 | 用途 |
|------|------|
| `realmSubStageId` | 表达 `胎息六轮 / 练气九层 / 筑基三层` 等小阶 |
| `branchCultivationAttainments` | 对某一道统/法脉的专项道行 |
| `battleLoadout` | 当前战斗构筑，而不是只存“已掌握” |
| `injuryState` | 参与战斗判定的伤势结构 |
| `cooldowns` | 神通、秘法、保命手段的战后冷却 |
| `combatFlags` | 本场特殊标记，例如越阶战、已触发护命 |
| `combatHistorySummary` | 战斗摘要，不存完整长日志 |

### 4.2 `battleLoadout` 最小结构

`battleLoadout` 至少包含：

1. `equippedBattleArtIds`
2. `equippedDivinePowerIds`
3. `equippedArtifactIds`
4. `activeSupportArtId`

这层的目的不是表达“玩家拥有多少条目”，而是表达“当前进场战斗真正可用的构筑”。

### 4.3 四个核心运行时结构

#### 4.3.1 `CombatantSnapshot`

单个战斗体的快照，至少包含：

1. 基础状态：大境、小阶、当前修为、通用道行、专项道行
2. 构筑：主修功法、法门、神通、法器
3. 核心四维：攻、防、识、速
4. 衍生值：命中、闪避、护体、神识压制、施法稳定度
5. 状态限制：冷却、伤势、定身、沉默、护命次数

#### 4.3.2 `CombatEncounterDefinition`

一场奇遇战的定义，至少包含：

1. 敌方模板或敌方快照
2. 场景修正
3. 胜利奖励
4. 失败代价
5. 特殊规则
6. 随机种子

#### 4.3.3 `CombatResolution`

战斗求解结果，至少包含：

1. 胜负
2. 回合摘要
3. 关键触发事件
4. 资源变化
5. 伤势变化
6. 道行变化
7. Telegram 短战报摘要

#### 4.3.4 `CombatOutcomePatch`

专门用于回写 canonical 状态的结果补丁，至少包含：

1. `powerDelta`
2. `cultivationAttainmentDelta`
3. `stoneDelta`
4. `inventoryAdditions`
5. `inventoryConsumptions`
6. `injuryPatch`
7. `cooldownPatch`
8. `combatFlagsPatch`

`CombatResolver` 只返回结果和补丁，不直接操作数据库。

## 五、主动战斗求解规则与数值框架

### 5.1 战斗类型

V2 主动战斗系统本轮只做 `奇遇战`。

这里的“奇遇战”指的是：

1. 奇遇流程中遇敌后触发的短回合战斗
2. 斗法结果会直接影响奇遇奖励、损失与后续分支

本轮不包含：

1. 守关战
2. 试炼战
3. 破境战
4. 玩家对战

### 5.2 战斗目标

每场奇遇战只回答 3 个问题：

1. 玩家是否战胜当前敌人
2. 玩家为此付出了什么代价
3. 玩家因此获得了什么收益

这意味着 V2 主动战斗的目标是“为奇遇斗法提供可计算分支”，而不是扩展成独立长玩法。

### 5.3 战斗输入

每场战斗的输入固定为：

1. 玩家战斗快照
2. 敌人战斗模板
3. 场景修正
4. 随机种子

同一输入应可复现同一结果，便于测试、调参和回放。

### 5.4 基础四维

主动战斗继续以 `攻 / 防 / 识 / 速` 为核心四维。

1. `攻`
   决定输出、破防和部分法门伤害系数。
2. `防`
   决定承伤、护体、减伤、格挡。
3. `识`
   决定识破、命中修正、神通稳定度、对隐匿和幻术的克制。
4. `速`
   决定先手、追击、闪避、打断概率。

所有功法、法门、神通、法器、道行最终都要映射到这四维和少量衍生值上。

### 5.5 回合流程

每场战斗建议限制在 `3-5` 回合，采用固定流程：

1. 生成双方战斗快照
2. 计算先手顺序
3. 选择本回合行动
4. 结算命中、闪避、格挡、护体、伤害、控制
5. 检查是否结束
6. 生成结果补丁

行动优先级建议固定为：

1. 神通
2. 主动战斗法门
3. 身法或辅助法门
4. 普通出手

### 5.6 公式方向

本设计先定公式框架，不锁死最终平衡值：

1. `先手值 = 速 + 身法修正 + 小阶修正 + 随机微扰`
2. `命中对抗 = 攻/识侧权重` 对 `速/识/身法侧权重`
3. `有效伤害 = 输出侧总值 - 防御侧总值`，再乘技能系数和克制修正
4. `神通稳定度 = 识 + 对应道行 + 功法适配`
5. `越阶压制 = 大境差修正 + 小阶差修正`

这套框架的目标不是追求复杂，而是保证以下差异稳定可见：

1. 同境不同构筑有明显胜率差
2. 小阶领先有意义，但不形成无脑碾压
3. 越阶能赢，但必须依赖高质量构筑和专项加成

### 5.7 道行在战斗中的作用

道行分两层接入：

1. `cultivationAttainment`
   提供低幅通用修正，主要影响识破、抗压和神通稳定性。
2. `branchCultivationAttainments`
   对应道统、法脉、功法体系提供专项加成。

道行不应直接粗暴加总战力，而应更多体现为：

1. 提高法门或神通系数
2. 提高控制和识破成功率
3. 提高跨阶时的发挥稳定性

### 5.8 小阶境界的战斗作用

小阶必须真正参与战斗，而不只是展示文本。

它应至少影响：

1. 攻、防、识、速基线
2. 技能槽位与稳定释放条件
3. 越阶压制和抗压能力

但小阶只能做“包络内修正”，不能推翻 `V1` 已确定的大境修为包络。

## 六、内容池接入策略

### 6.1 先建统一结构，再做运行时投影

这一轮不要求所有内容条目一开始就拥有最终战斗数值。

内容池应分为三层：

1. `content registry`
   存完整条目结构，允许字段齐全但数值仍待平衡。
2. `balance profile`
   提供当前版本的战斗参数映射。
3. `runtime-ready projection`
   将 registry 条目编译成当前版本可供求解器使用的结构。

这样可以先把完整法门/神通池抽象成统一数据结构，再在实际启用时调数值。

### 6.2 小阶境界的 V2 接入范围

V2 首批建议只细化 3 个最影响前中期战斗体验的大境：

1. `胎息六轮`
2. `练气九层`
3. `筑基三层`

`紫府 / 金丹 / 元婴` 先保留为大境包络，不在首批进一步细分。

### 6.3 战斗法门池的运行时接入

首批进入 runtime 的战斗法门分为 4 类：

1. `attack`
2. `movement`
3. `support`
4. `guard`

每个法门至少需要被投影成以下运行时字段：

1. `artCategory`
2. `requiredRealmId`
3. `requiredRealmSubStageId`
4. `combatPower`
5. `combatBias`
6. `daoInsightScaling`
7. `actionProfile`
8. `cooldownProfile`
9. `counterTags`

重点不是“战力 +N”，而是把法门投影成真正的战斗行为。

### 6.4 神通池的运行时接入

神通和法门必须继续分层。

神通在 runtime 中的特点应为：

1. 更强，但更稀缺
2. 更依赖 `识`、道行和功法适配
3. 有明确冷却或触发限制
4. 在跨阶战中更关键

世界观分类可以继续保留为：

1. `body`
2. `mind`
3. `life`
4. `yang`
5. `hybrid`

但在运行时应映射成行为标签，例如：

1. 爆发
2. 控制
3. 护命
4. 压制
5. 识破
6. 场域

### 6.5 主修功法的战斗接入

主修功法不作为主动技能，而是战斗底盘：

1. 决定四维偏向
2. 决定槽位承载能力
3. 决定道统适配
4. 决定法门与神通的稳定度加成

功法负责定义“适合怎么打”，法门和神通负责定义“具体怎么打”。

## 七、测试、验收与发布策略

### 7.1 测试层级

主动战斗系统至少需要 4 层测试：

1. `config / registry unit tests`
   验证小阶定义、条目投影和 balance profile 映射。
2. `resolver unit tests`
   验证先手、越阶压制、道行专项加成、冷却、护体和胜负逻辑。
3. `service integration tests`
   验证奇遇战入口、结果落库和 canonical patch。
4. `bot flow tests`
   验证 Telegram 短战报和状态展示。

### 7.2 最小验收标准

V2 combat 至少要满足：

1. 同一随机种子下，战斗结果可复现。
2. 同一大境不同小阶时，战斗结果体现稳定差异。
3. 同道统高道行构筑能显著提升对应法门/神通表现。
4. 奇遇战胜利后，奖励能正确回写 canonical 状态。
5. 奇遇战失败后，损失、伤势和冷却能正确回写 canonical 状态。
6. 未启用的 `V2` 字段存在时，不影响 `V1` 主循环。
7. 全量测试下，现有修炼主循环无回归。

### 7.3 建议实现顺序

实现顺序固定为 5 段：

1. `combat registry / projection`
2. `CombatStateAdapter`
3. `CombatResolver`
4. `CombatRewardBridge + service integration`
5. `bot flow + polish`

这个顺序的目标是保证每一步都可独立测试，不让 UI 和文案先于核心求解器空转。

### 7.4 发布策略

V2 主动战斗不应一次性全开，建议分阶段启用：

1. `phase 1`
   只开放少量奇遇战模板和少量 runtime-ready 法门/神通。
2. `phase 2`
   扩大小阶覆盖和敌人模板覆盖。
3. `phase 3`
   逐步补更多内容条目和更复杂行为标签。

## 八、与 V1 的关系

主动战斗系统是 `V2 第一阶段`，但必须与已完成的 `V1 canonical 修炼运行时` 保持严格边界：

1. 不推翻现有 `专注 -> 修为 -> 道行 -> 奇遇 -> 破境` 主循环。
2. 不改变 `V1` 的修为包络与迁移策略。
3. 不让未启用的 `V2` 字段在 `V1` 服务层半启用。
4. 只在奇遇需要斗法时接入战斗系统，而不是让所有专注结算强制进入战斗。

## 九、成功标准

这份设计完成后，主动战斗系统的“完成”应被定义为：

1. 奇遇战拥有独立求解器，而不是散落在 service 里的临时公式。
2. 小阶境界、法门、神通、法器和道行都能通过统一 projection 进入战斗态。
3. 战斗结果能稳定回写 canonical 状态，并通过 Telegram 正确展示。
4. `V1` 主循环继续稳定运行，`V2` 模块可按开关渐进启用。
