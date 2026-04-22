# 玄鉴 V2 道统法脉偏向设计

- 日期：2026-04-22
- 状态：已完成脑暴，待用户 review
- 作用域：`docs/cultivation/xuanjian-lineage-codex.md`、`src/config/xuanjianV2Registry.ts`、`src/config/xuanjianCanonical.ts`、`src/services/CultivationRewardEngine.ts`、`src/services/CombatStateAdapter.ts`、`src/services/CultivationService.ts`、`src/handlers/cultivationCommands.ts`
- 目标：把 `branchCultivationAttainments` 与 `mainDaoTrack` 从 V2 预留字段推进为真实生效的专项成长系统，使修炼偏向和战斗偏向开始与具体道统绑定

## 一、目标与边界

这份设计只解决一个问题：

`玩家对某一道统的长期偏修，如何在专注修炼和奇遇战里形成可持续、可见、可验证的专项成长。`

本设计明确覆盖：

1. `mainDaoTrack` 与 `branchCultivationAttainments` 的真实语义
2. 道统标签如何映射到主修功法、法门、神通
3. 分支道统点数的增长来源
4. 分支道统对修炼收益与战斗 runtime bias 的加成规则
5. `/realm` 里的主道统与分支道统展示

本设计明确不覆盖：

1. `cooldowns` 的真实玩法
2. 法器与法宝成长系统
3. 破境条件中的道统专修要求
4. 全量道统一次性开放
5. 道统相克、相生、互斥的完整战斗结算
6. 新的主动命令，例如 `/set_dao_track`

这份设计的重点不是一次性完成完整道统生态，而是先把：

`实际修炼/实际战斗使用 -> 分支道统成长 -> 对应内容更强`

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
   负责定义 `branchCultivationAttainments` 是 V2 地基的一部分，但此前尚未真正进入玩法。
5. [xuanjian-lineage-codex.md](/Users/qingcongyu/telegramBots/AutomanagerAsistant/docs/cultivation/xuanjian-lineage-codex.md)
   负责提供第一版道统粒度、MVP 道统优先级和后续扩展方向。

本设计是对 `branchCultivationAttainments` 的第一轮落地，不修改上述文档的上位边界。

## 三、当前问题与设计目标

当前实现里：

1. `mainDaoTrack` 已存在，但仍然更像占位字符串。
2. `branchCultivationAttainments` 已持久化，但几乎没有真实增长来源。
3. 总道行 `cultivationAttainment` 已能影响修炼与战斗，但“专项偏修”还不存在。

这会带来三个问题：

1. 玩家很难感知“我在修什么道统”。
2. 专项内容和通用内容之间没有明显差异。
3. `branchCultivationAttainments` 虽然在 schema 里，但还不构成玩法闭环。

本设计要达成的目标只有 3 个：

1. 让分支道统点数从“实际修炼/实际战斗使用”中增长。
2. 让分支道统只强化“对应道统内容”，而不是无差别抬高角色整体数值。
3. 保持第一版范围足够小，方便后续逐批扩充更多道统映射与特殊关系。

## 四、第一版范围与启用道统

### 4.1 第一版启用范围

第一版只对以下内容启用分支道统收益：

1. 主修功法
2. 战斗法门
3. 神通

并且仅当这些内容带有明确 `lineageTag` 时才生效。

未带 `lineageTag` 的内容继续遵守当前规则：

1. 只吃总道行 `cultivationAttainment`
2. 不增长分支道统点数
3. 不吃分支道统专项倍率

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

### 5.1 `mainDaoTrack`

`mainDaoTrack` 在第一版中不再表示抽象方向，而是表示：

`当前玩家最主要的具体道统 ID`

例如：

1. `mingyang`
2. `lihuo`
3. `duijin`

### 5.2 `branchCultivationAttainments`

`branchCultivationAttainments` 改为：

`Record<LineageId, number>`

其中键直接使用具体道统 ID，而不是五行大类、功能 tag 或其他抽象分类。

示例：

```ts
{
  mingyang: 12,
  lihuo: 4,
  duijin: 8
}
```

### 5.3 `lineageTag`

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

## 六、增长规则

### 6.1 主修专注增长

完成一次专注时，若当前主修功法带 `lineageTag`，则对应分支道统点数 `+1`。

结论：

1. 命中对应主修功法：`+1`
2. 未标注 `lineageTag`：`+0`

第一版不按时长额外放大主修分支点数，避免长专注直接把专项成长刷爆。

### 6.2 战斗使用增长

单场奇遇战中，只要实际使用过某个带 `lineageTag` 的法门或神通，则对应分支道统本场结算最多 `+1`。

这里的“实际使用过”指：

1. 该条目进入本场动作池
2. 并且在实际回合动作中被调用过

结论：

1. 单场战斗同一道统最多 `+1`
2. 不按回合数累加
3. 不因为“只是配装了但没打出来”而给点

### 6.3 第一版不覆盖的增长来源

以下来源第一版暂不接入分支道统：

1. 顿悟
2. 破境
3. 奇遇掉落
4. 只是配装但未实际使用
5. 文本背景事件

这样可以保证第一版分支道统增长只来自：

`实际修炼`

和

`实际战斗使用`

## 七、主道统自动判定规则

第一版 `mainDaoTrack` 自动维护，不新增手动切换命令。

判定顺序固定为：

1. 取 `branchCultivationAttainments` 中点数最高的道统
2. 若存在并列，优先保留当前 `mainDaoTrack`
3. 若当前值为空或不在并列候选中，则用当前主修功法的 `lineageTag` 兜底

这条规则的目标是：

1. 让主道统随长期偏修自然形成
2. 防止一次战斗或一次并列导致主道统来回跳动
3. 保持 `/realm` 展示足够稳定

## 八、专项倍率规则

### 8.1 阈值与幅度

第一版分支道统使用独立且保守的倍率阈值：

1. `10` 点：`+2%`
2. `30` 点：`+5%`
3. `60` 点：`+8%`

未达到 `10` 点时，不提供专项倍率。

### 8.2 修炼侧作用范围

分支道统倍率只作用于：

`带相同 lineageTag 的主修功法修为收益`

也就是说：

1. `mainMethod.lineageTag === branchLineageId` 时，可读取对应分支倍率
2. 不匹配时，分支倍率视为 `1.0`

第一版不让分支道统额外强化：

1. 总道行收益
2. 灵石收益
3. 奇遇掉落
4. 破境判定

### 8.3 战斗侧作用范围

分支道统倍率只作用于：

`带相同 lineageTag 的法门/神通 runtime bias`

第一版不直接改角色全局四维，而是只在条目侧增强对应 runtime profile 的 bias 投影。

这样可以保证：

1. 偏修某一道统只会强化该道统内容
2. 不会把专项偏修做成“全局无差别变强”
3. 用户更容易感知“我换上对应道统内容时更强”

### 8.4 未匹配条目

任何未匹配当前分支道统的条目：

1. 不吃该专项倍率
2. 仍正常吃总道行与其他已有战斗修正

## 九、系统分层与职责

### 9.1 `xuanjian-lineage-codex.md`

作为道统粒度与优先级的世界观来源，不直接承担 runtime 计算。

### 9.2 `xuanjianV2Registry`

负责给第一版已启用的主修功法、法门、神通补齐 `lineageTag`，并保证 runtime-ready projection 能把该标签带到运行时 profile。

### 9.3 `xuanjianCanonical`

负责提供分支道统相关 helper，例如：

1. `getBranchLineageMultiplier(points)`
2. `resolveMainDaoTrack(...)`

它不直接负责数据库写入。

### 9.4 `CultivationRewardEngine`

继续负责原始专注收益，但在主修功法已带 `lineageTag` 时，把对应分支道统倍率接入修为收益计算。

### 9.5 `CombatStateAdapter` 或 runtime projection

负责把分支道统倍率折算到匹配 `lineageTag` 的法门/神通 runtime bias。

它不直接管理分支点数的增长。

### 9.6 `CultivationService`

负责在专注结算和战斗结算后：

1. 增长对应 `branchCultivationAttainments`
2. 自动重算 `mainDaoTrack`
3. 持久化结果

### 9.7 `cultivationCommands`

负责把主道统和主要分支积累展示给用户，不承担规则判断。

## 十、用户可见展示

第一版只在 `/realm` 里补最少必要信息：

1. `当前主道统：明阳`
2. `专项积累：明阳 12，离火 4，兑金 8`

展示规则建议为：

1. 主道统固定展示 1 条
2. 分支积累只展示前 3 个最高项
3. 不展示倍率公式
4. 不展示未启用或为 `0` 的道统

这样既能让用户感知“自己在偏修什么”，又不把状态页刷得过满。

## 十一、测试边界

第一版至少需要覆盖以下场景：

1. 带 `lineageTag` 的主修功法完成一次专注后，对应分支 `+1`
2. 未带 `lineageTag` 的主修功法完成一次专注后，分支不增长
3. 单场战斗里实际使用过带 `lineageTag` 的法门/神通，对应分支本场最多 `+1`
4. 只是配装但未实际使用时，不增长分支
5. `mainDaoTrack` 会按最高分支自动切换，并列时保持稳定
6. `10 / 30 / 60` 三档倍率只作用于匹配 `lineageTag` 的主修功法
7. `10 / 30 / 60` 三档倍率只作用于匹配 `lineageTag` 的法门/神通 runtime bias
8. 未匹配 `lineageTag` 的内容不吃专项倍率

## 十二、后续扩展方向

第一版落地后，后续最自然的扩展顺序是：

1. 扩充第二批道统，例如 `jimu / lushui / taiyang / gengjin`
2. 接入道统相克、互斥和兼修限制
3. 把分支道统部分接入破境与特殊奇遇
4. 与法器、冷却和更高阶神通联动

但这些都不属于本设计的第一版实现范围。
