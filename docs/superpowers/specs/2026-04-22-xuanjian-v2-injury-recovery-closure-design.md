# 玄鉴 V2 伤势恢复闭环设计

- 日期：2026-04-22
- 状态：已完成脑暴，待用户 review
- 作用域：`src/services/CultivationService.ts`、`src/services/CultivationRewardEngine.ts`、`src/types/cultivationCanonical.ts`、`src/handlers/taskCommands.ts`、`docs/cultivation/xuanjian-dev-manual.md`
- 目标：在不扩展敌人池、不引入新命令、不提前启用冷却玩法的前提下，把 `injuryState` 从“战斗结果字段”推进为“会反向影响后续专注收益的修炼主循环状态”

## 一、目标与边界

这份设计只解决一个问题：

`战斗带来的伤势，如何在后续专注中自动恢复，并真实影响本次修为收益。`

本设计明确覆盖：

1. 伤势恢复触发条件
2. 伤势恢复对专注收益的扣减规则
3. 伤势恢复的状态迁移
4. 用户可见文案和测试边界

本设计明确不覆盖：

1. `cooldowns` 的真实玩法
2. 丹药、灵物、法器的疗伤加速
3. 伤势对战斗四维的进一步细化惩罚
4. 新的主动命令，例如 `/heal`
5. 宗门、坊市、百艺等外部恢复系统

这份设计的重点不是做“恢复资源系统”，而是先把 `战斗后果 -> 后续专注` 这条主循环闭环接起来。

## 二、Authority Stack 与依赖关系

本设计依赖顺序固定为：

1. [2026-04-20-xuanjian-canonical-schema-design.md](/Users/qingcongyu/telegramBots/AutomanagerAsistant/docs/superpowers/specs/2026-04-20-xuanjian-canonical-schema-design.md)
   负责定义 `injuryState`、`cooldowns` 等 `V2 reserved` 字段的存在边界。
2. [2026-04-20-xuanjian-cultivation-loop-redesign.md](/Users/qingcongyu/telegramBots/AutomanagerAsistant/docs/superpowers/specs/2026-04-20-xuanjian-cultivation-loop-redesign.md)
   负责定义当前修炼主循环中 `专注 -> 修为 -> 道行 -> 奇遇 -> 破境` 的主干。
3. [2026-04-21-xuanjian-active-combat-v2-design.md](/Users/qingcongyu/telegramBots/AutomanagerAsistant/docs/superpowers/specs/2026-04-21-xuanjian-active-combat-v2-design.md)
   负责定义主动战斗的结果回写边界，以及 `injuryState` 来自战斗而不是平空变化。
4. [2026-04-21-xuanjian-v2-roadmap-design.md](/Users/qingcongyu/telegramBots/AutomanagerAsistant/docs/superpowers/specs/2026-04-21-xuanjian-v2-roadmap-design.md)
   负责定义 `V2` 当前仍以奇遇战和小阶为主，不提前扩展到更大经济系统。

本设计是 `V2` 主循环深化的一小步，不修改上述文档的上位边界。

## 三、当前问题与设计目标

当前实现中，战斗已经可以把结果写回 `injuryState`，并且 `/realm` 可以展示当前伤势，但系统还停留在“受伤了”这一半：

1. 伤势没有稳定恢复路径
2. 伤势不会反过来影响后续修炼收益
3. 用户无法从主循环里感知“战斗后果正在持续存在”

这会导致主动战斗仍然更像一段附加文案，而不是已经接入修炼系统的一部分。

本设计要达成的目标只有 3 个：

1. 让伤势恢复挂到 `完成专注` 主循环上，而不是额外开新命令
2. 让恢复具有真实代价，但代价只落在 `修为收益`，不动 `道行`
3. 保持规则足够简单，方便后续再扩丹药恢复、冷却恢复和法器恢复

## 四、设计方案选择

本轮考虑过 3 条路径：

1. 直接把伤势恢复逻辑内联到 `CultivationService`
2. 新增独立 `InjuryRecoveryEngine`
3. 一步做成通用 `RecoveryEngine`，同时覆盖伤势、冷却和道具恢复

最终采用第 `2` 条路径：

`独立 InjuryRecoveryEngine`

原因如下：

1. 当前范围只做伤势恢复，直接做通用 `RecoveryEngine` 会提前超范围。
2. 直接内联到 `CultivationService` 会让主结算链继续膨胀，不利于后续扩展。
3. 独立纯函数引擎最容易补单元测试，也最方便后续把丹药和冷却恢复挂到同一层。

## 五、系统分层与职责

### 5.1 `CultivationRewardEngine`

继续只负责“原始专注收益”，不理解伤势恢复规则。

输出仍然是：

1. `rawPowerGain`
2. `attainmentDelta`
3. `encounter`
4. 其他现有专注结算结果

### 5.2 `InjuryRecoveryEngine`

新增独立纯函数层，负责：

1. 判断当前任务是否属于有效专注
2. 判断当前是否存在可恢复伤势
3. 计算本次是否恢复一档
4. 计算本次因疗伤被吞掉的修为收益
5. 生成恢复摘要

它不直接读写数据库，也不直接拼 Telegram 总消息。

### 5.3 `CultivationService`

负责把两段纯结果串起来：

1. 先调用 `CultivationRewardEngine`
2. 再调用 `InjuryRecoveryEngine`
3. 把最终修为收益、伤势状态和专注结果统一写回 canonical 状态

### 5.4 `taskCommands`

只负责展示恢复结果，不承担恢复规则判断。

## 六、主数据流

单次完成专注时，结算顺序调整为：

1. `CultivationRewardEngine` 先计算原始专注收益
2. `InjuryRecoveryEngine` 基于：
   - `duration`
   - `rawPowerGain`
   - `injuryState.level`
   计算恢复结果
3. `CultivationService` 根据恢复结果写回：
   - `finalPowerGain`
   - `injuryState.level`
4. 之后再继续现有的奇遇和战斗结果拼装逻辑

这里的关键点是：

`伤势恢复属于专注收益修正层，而不是奇遇层。`

也就是说，恢复逻辑只修改本次专注最终入账的修为值和新的伤势档位，不重写奇遇类型，不改道行计算，不发明新的战斗结果结构。

若本次专注后续又触发奇遇战并新增伤势，则这份新伤势从下一次专注开始参与恢复，不在同一次专注里立刻被抵消。

## 七、规则定义

### 7.1 触发门槛

只有达到当前“有效专注”门槛的任务，才允许触发伤势恢复。

本设计不再发明新的恢复门槛，而是直接复用现有主修为收益门槛常量。

结论：

1. 达到有效专注门槛：可进入伤势恢复结算
2. 低于有效专注门槛：不恢复伤势

### 7.2 触发前提

只有当前 `injuryState.level !== 'none'` 时，才进入恢复结算。

无伤时：

1. 不扣修为
2. 不生成恢复文案
3. 不改当前状态

### 7.3 自动触发

恢复抽成采用全自动触发。

也就是只要满足：

1. 本次任务达到有效专注门槛
2. 当前存在伤势

系统就会自动先做一次伤势恢复，再把剩余修为记入本次成长结果。

本轮不增加：

1. 手动切换疗伤模式
2. 独立疗伤命令
3. 恢复优先级配置

### 7.4 恢复幅度

单次有效专注最多恢复一档伤势，不做恢复点累积。

档位迁移规则固定为：

1. `heavy -> medium`
2. `medium -> light`
3. `light -> none`

本轮不允许：

1. 一次专注恢复两档
2. 一次专注直接从 `heavy` 到 `light`
3. 低于有效专注门槛时处理轻伤例外

### 7.5 收益扣减

只要本次有效专注成功推进一档伤势恢复，就从本次原始修为收益中扣掉固定比例作为疗伤代价。

固定比例确定为：

`50%`

也就是：

1. 先得到 `rawPowerGain`
2. 若本次恢复生效，则计算 `powerCost = floor(rawPowerGain * 0.5)`
3. 最终 `finalPowerGain = rawPowerGain - powerCost`

### 7.6 扣减范围

疗伤代价只扣本次修为收益，不扣本次道行收益。

结论：

1. `cultivationAttainmentDelta` 保持原值
2. 只有 `powerGain` 被伤势恢复修改

这样可以保持“修为是气机与资粮，道行是长期理解与积累”的语义分工。

### 7.7 扣减上限

疗伤代价不能导致本次最终修为变成负数。

因此需要满足：

1. `powerCost <= rawPowerGain`
2. `finalPowerGain >= 0`

### 7.8 冷却边界

`cooldowns` 在本轮继续只保留字段，不参与恢复逻辑。

这意味着：

1. 伤势恢复不会顺手减少任何冷却
2. 即使用户状态里已有冷却字段，也不会在本轮专注中自动衰减
3. 后续如果要做冷却恢复，应作为下一份独立设计接入

## 八、运行时接口建议

`InjuryRecoveryEngine` 建议返回一个窄结果对象，至少包含：

1. `applied`
2. `previousInjuryLevel`
3. `nextInjuryLevel`
4. `powerCost`
5. `finalPowerGain`
6. `summary`

建议语义如下：

1. `applied`
   表示本次是否真的发生恢复
2. `previousInjuryLevel`
   表示恢复前伤势档位
3. `nextInjuryLevel`
   表示恢复后伤势档位
4. `powerCost`
   表示本次疗伤吞掉的修为值
5. `finalPowerGain`
   表示最终应入账的修为值
6. `summary`
   供 handler 直接复用的简短恢复摘要

## 九、状态写回策略

`CultivationService` 在接到恢复结果后，只做以下写回：

1. 使用 `finalPowerGain` 作为本次最终修为入账值
2. 把 `injuryState.level` 改为 `nextInjuryLevel`
3. 若 `nextInjuryLevel === 'none'`，则将 `injuryState.modifiers` 清空或收敛为无伤状态

本轮不新增：

1. 额外恢复历史表
2. 专门的疗伤日志数组
3. 新的 cooldown 写回逻辑

## 十、用户可见表现

### 10.1 完成任务消息

当且仅当本次专注成功推进了一档伤势恢复时，在完成任务反馈中追加：

`🩹 伤势恢复：中伤 -> 轻伤`

本轮不显示：

1. `疗伤耗去修为：x 点`
2. 内部恢复公式
3. 额外恢复提示按钮

### 10.2 `/realm`

`/realm` 继续只展示当前伤势等级，不展示恢复算法，也不展示已吞掉的累计修为。

### 10.3 用户理解模型

用户只需要理解一句话：

`受伤后继续专注调息，可以慢慢恢复，但会占用一部分本次修为。`

## 十一、测试边界

至少需要覆盖以下测试：

1. 当前无伤时，不触发恢复，也不扣修为
2. 当前有伤但专注时长低于有效门槛时，不触发恢复
3. `light / medium / heavy` 都只能单次降一档
4. 恢复时只扣修为，不扣道行
5. `50%` 扣减后最终修为不为负数
6. 恢复成功时会产生恢复摘要
7. 恢复失败或未触发时不会产生多余文案

建议测试层次：

1. `unit`
   直接测试 `InjuryRecoveryEngine`
2. `integration`
   测 `完成专注 -> 状态写回 -> 任务消息摘要`
3. `bot`
   验证 TG 完成任务消息中恢复文案是否按预期出现或缺失

## 十二、完成标准

本设计落地后的完成标准为：

1. 战斗导致的伤势会真实影响后续专注收益
2. 用户不需要新命令，也能通过主循环自然疗伤
3. 疗伤代价只影响修为，不影响道行
4. 本轮没有提前把 `cooldowns`、丹药或法器恢复混进来
5. 所有恢复规则都集中在独立恢复引擎，而不是继续堆进 `CultivationService`

## 十三、后续扩展边界

这份设计完成后，后续可以在不推翻本轮规则的前提下继续扩：

1. 丹药和灵物的疗伤加速
2. `cooldowns` 的专注衰减规则
3. 伤势对战斗四维的进一步分档惩罚
4. 法器或护体类条目的疗伤协同

但这些都应作为下一阶段独立设计，而不是在本轮一起实现。
