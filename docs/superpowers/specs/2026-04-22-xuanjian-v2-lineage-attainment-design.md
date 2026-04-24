# 玄鉴 V2 道统法脉偏向设计

- 日期：2026-04-22
- 状态：已完成脑暴，待用户 review
- 作用域：`docs/cultivation/xuanjian-lineage-codex.md`、`src/config/xuanjianV2Registry.ts`、`src/config/xuanjianCanonical.ts`、`src/services/CultivationRewardEngine.ts`、`src/services/CombatStateAdapter.ts`、`src/services/CultivationService.ts`、`src/handlers/cultivationCommands.ts`
- 目标：把 `mainDaoTrack` 从 V2 预留字段推进为真实生效的道统归属系统，并明确 `cultivationAttainment` 是唯一道行数值，使修炼偏向和战斗偏向在筑基成道基后开始与具体道统绑定

## 一、目标与边界

这份设计只解决一个问题：

`玩家的道统何时确定、如何与唯一道行数值绑定，以及这种绑定在筑基后如何影响修炼与战斗。`

本设计明确覆盖：

1. `cultivationAttainment`、`mainDaoTrack` 与 `branchCultivationAttainments` 的真实语义
2. 道统标签如何映射到主修功法、法门、神通
3. 道统在筑基前后的判定规则
4. 唯一道行数值对修炼收益与战斗 runtime bias 的加成规则
5. `/realm` 里的通用/主道统展示

本设计明确不覆盖：

1. `cooldowns` 的真实玩法
2. 法器与法宝成长系统
3. 破境条件中的道统专修要求
4. 全量道统一次性开放
5. 道统相克、相生、互斥的完整战斗结算
6. 新的主动命令，例如 `/set_dao_track`

这份设计的重点不是一次性完成完整道统生态，而是先把：

`通用道行 -> 筑基成道基 -> 主道统固定 -> 对应内容更强`

这条最小闭环接起来。

## 二、Authority Stack 与依赖关系

本设计依赖顺序固定为：

1. [2026-04-20-xuanjian-canonical-schema-design.md](/Users/qingcongyu/telegramBots/AutomanagerAsistant/docs/superpowers/specs/2026-04-20-xuanjian-canonical-schema-design.md)
   负责定义 `mainDaoTrack`、`branchCultivationAttainments` 等 V2 字段的存在边界。
2. [2026-04-20-xuanjian-cultivation-loop-redesign.md](/Users/qingcongyu/telegramBots/AutomanagerAsistant/docs/superpowers/specs/2026-04-20-xuanjian-cultivation-loop-redesign.md)
   负责定义当前主循环仍然是 `专注 -> 修为 -> 道行 -> 奇遇 -> 破境`。
3. [2026-04-21-xuanjian-active-combat-v2-design.md](/Users/qingcongyu/telegramBots/AutomanagerAsistant/docs/superpowers/specs/2026-04-21-xuanjian-active-combat-v2-design.md)
   负责定义当前主动战斗仍然以奇遇战为主，专项成长只能先挂在现有 runtime bias 与 action pool 上。
4. [2026-04-21-xuanjian-v2-roadmap-design.md](/Users/qingcongyu/telegramBots/AutomanagerAsistant/docs/superpowers/specs/2026-04-21-xuanjian-v2-roadmap-design.md)
   负责定义 `mainDaoTrack / branchCultivationAttainments` 是 V2 地基的一部分，但具体玩法口径仍需落定。
5. [xuanjian-lineage-codex.md](/Users/qingcongyu/telegramBots/AutomanagerAsistant/docs/cultivation/xuanjian-lineage-codex.md)
   负责提供第一版道统粒度、MVP 道统优先级和后续扩展方向。

本设计是对道统归属系统的第一轮落地，不修改上述文档的上位边界。

## 三、当前问题与设计目标

当前实现里：

1. `mainDaoTrack` 已存在，但仍然更像占位字符串。
2. `branchCultivationAttainments` 已持久化，但如果把它做成第二套道行数值，会与 `cultivationAttainment` 语义冲突。
3. 总道行 `cultivationAttainment` 已能影响修炼与战斗，但“何时确定道统、如何让它与这份道行绑定”还不存在。

这会带来三个问题：

1. 玩家很难感知“我什么时候才算正式入了某一道统”。
2. 如果同时存在“总道行”和“分支道行”，系统会出现两套道行账本。
3. 专项内容和通用内容之间没有清晰的阶段分隔。

本设计要达成的目标只有 3 个：

1. 明确 `cultivationAttainment` 是唯一道行数值。
2. 明确道统只在筑基成道基时确定，且之后不再变更。
3. 让筑基后的主道统只强化“对应道统内容”，而不是无差别抬高角色整体数值。

## 四、第一版范围与启用道统

### 4.1 第一版启用范围

第一版只对以下内容启用主道统收益：

1. 主修功法
2. 战斗法门
3. 神通

并且仅当这些内容带有明确 `lineageTag` 时才生效。

未带 `lineageTag` 的内容继续遵守当前规则：

1. 只吃总道行 `cultivationAttainment`
2. 不吃主道统专项倍率
3. 继续按通用内容处理

### 4.2 第一版启用道统

第一版只开放 [xuanjian-lineage-codex.md](/Users/qingcongyu/telegramBots/AutomanagerAsistant/docs/cultivation/xuanjian-lineage-codex.md#L317) 中的 5 条 MVP 核心道统：

1. `mingyang`
2. `zhengmu`
3. `pinshui`
4. `lihuo`
5. `duijin`

原因如下：

1. 资料完整度最高。
2. 已与当前法门/神通池存在可映射关系。
3. 便于第一版先把增长、加成、显示和测试闭环接通。

第一版不提前开放：

1. `jimu`
2. `lushui`
3. `taiyang`
4. `gengjin`
5. 其他十二炁与并古法

它们留给后续批次扩展。

## 五、数据模型与标签语义

### 5.1 `cultivationAttainment`

`cultivationAttainment` 是玩家当前唯一的道行数值。

第一版明确不再区分：

1. 总道行
2. 分支道行

也就是说：

1. 胎息、练气阶段积累的是通用道行
2. 筑基以后积累的仍然是同一个 `cultivationAttainment`
3. 不再额外发明第二套“分支点数池”

### 5.2 `mainDaoTrack`

`mainDaoTrack` 在第一版中的语义固定为：

`玩家筑基成道基后确定的主道统 ID`

例如：

1. `mingyang`
2. `lihuo`
3. `duijin`

它不是一条会在日常修炼中频繁变化的偏好字段，而是：

`筑基后固定的道基归属`

### 5.3 `branchCultivationAttainments`

`branchCultivationAttainments` 在第一版中不再承担成长数值职责。

处理口径固定为：

1. 保留字段以兼容 V2 schema
2. 第一版不向其中写入真实玩法数值
3. 第一版不从其中读取成长倍率

它只保留为未来兼修、多道统特殊玩法的扩展位。

### 5.4 `lineageTag`

第一版为主修功法、战斗法门、神通新增或补齐：

`lineageTag?: LineageId`

它与现有 `tags` 的分工固定为：

1. `tags` 继续用于动作风格、功能分类、世界观附加标签。
2. `lineageTag` 只用于道统归属与专项成长。

第一版不允许直接拿当前全部 `tags` 充当道统键，因为其中混有：

1. `burst`
2. `support`
3. `movement`
4. `guard`

这些标签属于战斗功能，不属于道统本体。

## 六、阶段规则与道基转化

### 6.1 胎息、练气阶段

胎息与练气阶段不区分具体道统。

这一阶段的口径固定为：

1. `mainDaoTrack = 'universal'` 或等价通用占位值
2. `/realm` 只显示 `通用`
3. 当前全部 `cultivationAttainment` 都视为通用道行
4. 不启用任何具体道统专项倍率

这条规则的意义是：

1. 保持前中期修炼表达简单
2. 避免还未成道基时就过早锁死玩家路数
3. 让“筑基定道统”成为清晰阶段分水岭

### 6.2 筑基时确定主道统

第一版规定：

`玩家只有在筑基时，才正式确定主道统。`

确定依据固定为：

1. 当前筑基结果对应的道基归属
2. 该道基必须映射到第一版已启用的具体道统之一

也就是说：

1. 胎息、练气阶段只有通用道行
2. 完成筑基并成对应道基后，才把 `mainDaoTrack` 从通用切换到具体道统

### 6.3 通用道行向主道统转化

筑基时不重新发明一套“转化后数值”，而是直接采用：

`当前已有的通用 cultivationAttainment，继续作为同一份数值保留`

只是它从这一刻开始被解释为：

`当前主道统下的有效道行`

结论：

1. 不清零
2. 不拆分
3. 不复制到 `branchCultivationAttainments`
4. 不生成第二套专项点数池

### 6.4 筑基后不可变更

第一版规定：

`mainDaoTrack` 一旦在筑基时确定，之后不再变化。`

也就是说：

1. 后续更换主修功法，不改变主道统
2. 后续配装不同法门、神通，不改变主道统
3. 不提供手动改道统命令
4. 不提供自动漂移判定

这条规则的核心是：

`道统是道基归属，不是日常偏好。`

## 七、专项倍率规则

### 7.1 阈值与幅度

第一版主道统倍率直接读取唯一道行 `cultivationAttainment`，并采用保守阈值：

1. `10` 点：`+2%`
2. `30` 点：`+5%`
3. `60` 点：`+8%`

未达到 `10` 点时，不提供主道统专项倍率。

### 7.2 修炼侧作用范围

主道统倍率只作用于：

`带相同 lineageTag 的主修功法修为收益`

也就是说：

1. 玩家已筑基并确定 `mainDaoTrack`
2. `mainMethod.lineageTag === mainDaoTrack`
3. 满足以上条件时，按当前 `cultivationAttainment` 读取专项倍率
4. 不匹配时，专项倍率视为 `1.0`

第一版不让主道统额外强化：

1. 总道行收益
2. 灵石收益
3. 奇遇掉落
4. 破境判定

### 7.3 战斗侧作用范围

主道统倍率只作用于：

`带相同 lineageTag 的法门/神通 runtime bias`

第一版不直接改角色全局四维，而是只在条目侧增强对应 runtime profile 的 bias 投影。

这样可以保证：

1. 已定某一道统后，只会强化该道统内容
2. 不会把主道统做成“全局无差别变强”
3. 用户更容易感知“筑基定道统后，换上本道统内容时更强”

### 7.4 未匹配条目

任何未匹配当前 `mainDaoTrack` 的条目：

1. 不吃该专项倍率
2. 仍正常吃总道行与其他已有战斗修正

## 八、系统分层与职责

### 8.1 `xuanjian-lineage-codex.md`

作为道统粒度与优先级的世界观来源，不直接承担 runtime 计算。

### 8.2 `xuanjianV2Registry`

负责给第一版已启用的主修功法、法门、神通补齐 `lineageTag`，并保证 runtime-ready projection 能把该标签带到运行时 profile。

### 8.3 `xuanjianCanonical`

负责提供主道统相关 helper，例如：

1. `getMainLineageMultiplier(attainment)`
2. `isUniversalDaoTrack(...)`

它不直接负责数据库写入。

### 8.4 `CultivationRewardEngine`

继续负责原始专注收益，但仅在玩家已筑基、主修功法已带 `lineageTag` 且与 `mainDaoTrack` 匹配时，把对应主道统倍率接入修为收益计算。

### 8.5 `CombatStateAdapter` 或 runtime projection

负责把主道统倍率折算到匹配 `lineageTag` 的法门/神通 runtime bias。

它不直接管理道统判定。

### 8.6 `CultivationService`

负责在筑基结算时：

1. 把 `mainDaoTrack` 从通用切换到具体道统
2. 保留现有 `cultivationAttainment`
3. 持久化结果

并在后续专注、战斗结算中：

1. 只读取 `mainDaoTrack`
2. 不再重算或漂移主道统

### 8.7 `cultivationCommands`

负责把“通用 / 主道统”状态展示给用户，不承担规则判断。

## 九、用户可见展示

第一版只在 `/realm` 里补最少必要信息：

1. 胎息、练气阶段：`当前道统：通用`
2. 筑基后：`当前主道统：明阳`

展示规则建议为：

1. 不展示 `branchCultivationAttainments`
2. 不展示倍率公式
3. 不展示未启用道统
4. 只在筑基后显示具体主道统名

这样既能让用户感知“是否已经定道基”，又不把状态页刷得过满。

## 十、测试边界

第一版至少需要覆盖以下场景：

1. 胎息、练气阶段固定显示 `通用`，不启用具体道统倍率
2. 筑基时可把 `mainDaoTrack` 从通用切换到指定道统
3. 切换为指定道统时，不清空 `cultivationAttainment`
4. 筑基后 `mainDaoTrack` 不再因主修功法或战斗配装变化而改变
5. `10 / 30 / 60` 三档倍率只作用于匹配 `mainDaoTrack` 的主修功法
6. `10 / 30 / 60` 三档倍率只作用于匹配 `mainDaoTrack` 的法门/神通 runtime bias
7. 未匹配 `lineageTag` 的内容不吃专项倍率
8. `branchCultivationAttainments` 在第一版不参与真实玩法

## 十一、后续扩展方向

第一版落地后，后续最自然的扩展顺序是：

1. 扩充第二批道统，例如 `jimu / lushui / taiyang / gengjin`
2. 接入不同道基的筑基判定与生成逻辑
3. 接入道统相克、互斥和兼修限制
4. 与法器、冷却和更高阶神通联动

但这些都不属于本设计的第一版实现范围。
