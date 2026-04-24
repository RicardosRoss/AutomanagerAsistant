# 玄鉴 V2 路线设计

- 日期：2026-04-21
- 状态：已完成脑暴，待用户 review
- 作用域：`docs/superpowers/specs/2026-04-20-xuanjian-canonical-schema-design.md`、`docs/superpowers/specs/2026-04-21-xuanjian-active-combat-v2-design.md`、`docs/cultivation/xuanjian-combat-system.md`、`docs/cultivation/xuanjian-encounter-codex.md`、`docs/cultivation/xuanjian-dev-manual.md`
- 目标：在已完成 `V1 canonical 修炼主循环` 的基础上，定义一个可连续交付的 `V2` 路线，把玄鉴系统推进到“可战斗、可细分小阶、可承载更完整构筑池”的第二阶段，同时保持单一 canonical schema，不扩展到宗门经济和飞升线

## 一、V2 总目标与范围

这份文档不是主动战斗系统的细化设计，也不是未来所有玄鉴玩法的愿望清单，而是一份 `V2` 的总路线定义，专门回答以下问题：

1. `V2` 到底包含哪些子模块。
2. 这些模块之间的依赖顺序是什么。
3. 哪些内容属于当前阶段必须交付，哪些只是后续可扩展能力。
4. 如何在不破坏 `V1` 的前提下推进下一阶段实现。

这份路线文档明确覆盖 3 个模块：

1. `主动战斗系统`
   只包含奇遇战运行时、状态投影、战斗求解与结果回写。
2. `细分境界/小阶`
   把 `胎息六轮 / 练气九层 / 筑基三层` 从展示概念变成真正影响 runtime 的结构。
3. `更完整法门/神通池`
   把已整理内容统一接入 registry，并按 projection 分批进入 runtime。

这份路线文档明确不覆盖：

1. 宗门、坊市、百艺、灵田、供奉等经济系统。
2. NPC 势力和社会模拟。
3. 飞升/登仙线。
4. 长线地图玩法、刷怪循环和 PVP。
5. 新一轮 schema 重构。

## 二、Authority Stack 与依赖关系

`V2` 路线的依赖顺序固定为：

1. [2026-04-20-xuanjian-canonical-schema-design.md](/Users/qingcongyu/telegramBots/AutomanagerAsistant/docs/superpowers/specs/2026-04-20-xuanjian-canonical-schema-design.md)
   负责定义 `V1 required / V2 reserved` 边界。
2. [2026-04-20-xuanjian-cultivation-loop-redesign.md](/Users/qingcongyu/telegramBots/AutomanagerAsistant/docs/superpowers/specs/2026-04-20-xuanjian-cultivation-loop-redesign.md)
   负责定义修炼、功法、道行与奇遇的主循环关系。
3. [2026-04-21-xuanjian-active-combat-v2-design.md](/Users/qingcongyu/telegramBots/AutomanagerAsistant/docs/superpowers/specs/2026-04-21-xuanjian-active-combat-v2-design.md)
   负责定义主动战斗系统的具体运行时设计。
4. [xuanjian-combat-system.md](/Users/qingcongyu/telegramBots/AutomanagerAsistant/docs/cultivation/xuanjian-combat-system.md)
   负责保留世界观与战斗字段语义。
5. [xuanjian-encounter-codex.md](/Users/qingcongyu/telegramBots/AutomanagerAsistant/docs/cultivation/xuanjian-encounter-codex.md)
   负责内容池、奇遇掉落和物品来源。

本路线文档是“阶段拆分与交付顺序”的中间契约层，不重复第一份主动战斗 spec 的求解规则细节。

## 三、V2 的阶段拆分与推荐顺序

`V2` 不应按系统类型平铺推进，而应按依赖顺序拆成 4 个阶段。

### 3.1 阶段 A：V2 扩展层就位

这一阶段不直接开放新玩法，先完成运行时承载层：

1. 启用 `realmSubStageId`
2. 启用 `battleLoadout`
3. 启用 `branchCultivationAttainments`
4. 补 `cooldowns / combatFlags / combatHistorySummary`
5. 建立 `content registry -> balance profile -> runtime-ready projection` 三层结构

这一阶段的目标是把 `V2` 接口地基定住。

### 3.2 阶段 B：小阶境界真正生效

这一阶段把前中期小阶正式接入 runtime：

1. `胎息六轮`
2. `练气九层`
3. `筑基三层`

这些小阶不仅用于显示，还要影响：

1. 状态展示
2. 技能与槽位解锁
3. 战斗四维基线
4. 敌我强度包络

### 3.3 阶段 C：主动战斗系统上线

这一阶段把第一份 spec 中定义的战斗系统接起来：

1. `CombatConfig`
2. `CombatStateAdapter`
3. `CombatResolver`
4. `CombatRewardBridge`
5. 奇遇战 service 和 bot 接线

这一阶段依赖 A 和 B：

1. 没有扩展层，战斗接口会漂移。
2. 没有小阶，战斗强度模型会过粗。

### 3.4 阶段 D：完整法门/神通池逐步接入

这一阶段不是一次性导入所有条目，而是把 registry 中已整理条目按批进入 runtime：

1. 先接稳定的前中期法门
2. 再接高境神通
3. 最后补兼类与高歧义条目的人工校订结果

推荐顺序固定为：

1. `A 扩展层`
2. `B 小阶生效`
3. `C 主动战斗`
4. `D 内容池扩展`

## 四、每个阶段的交付物与完成标准

### 4.1 阶段 A：V2 扩展层就位

交付物：

1. canonical schema 启用 `realmSubStageId`
2. canonical schema 启用 `battleLoadout`
3. canonical schema 启用 `branchCultivationAttainments`
4. 新增 `cooldowns / combatFlags / combatHistorySummary`
5. 建立 `content registry / balance profile / runtime-ready projection`
6. 对应 unit tests

完成标准：

1. V2 字段存在但未启用时，不影响 V1 主循环。
2. projection 可以把条目安全转换成 runtime-ready 结构。
3. 旧用户或当前存档可以无损升级到包含这些字段的状态。

### 4.2 阶段 B：小阶境界真正生效

交付物：

1. `胎息六轮 / 练气九层 / 筑基三层` 配置定义
2. 小阶显示 formatter
3. 小阶对成长、槽位和战斗基线的修正逻辑
4. 小阶相关 unit 和 integration tests

完成标准：

1. 状态页能稳定显示大境与小阶。
2. 小阶不只是展示字段，而是确实影响 runtime 结果。
3. 同大境不同小阶的角色，在配置和测试里能表现出可验证差异。

### 4.3 阶段 C：主动战斗系统上线

交付物：

1. `CombatConfig`
2. `CombatStateAdapter`
3. `CombatResolver`
4. `CombatRewardBridge`
5. 奇遇战 service 接线
6. bot 战报摘要输出
7. 对应 unit、integration、bot tests

完成标准：

1. 至少一种奇遇战模板可以完整跑通。
2. 战斗结果可复现、可回写、可展示。
3. 胜负、伤势、奖励、道行变化都能落回 canonical 状态。
4. V1 原有专注主循环测试无回归。

### 4.4 阶段 D：完整法门/神通池逐步接入

交付物：

1. 更完整的法门 registry
2. 更完整的神通 registry
3. 条目分类与 projection 扩展
4. 内容池导入和校验测试
5. runtime-ready 批次清单

完成标准：

1. 条目可以先进 registry，再按批进入 runtime。
2. runtime 不直接依赖手工硬编码的少数条目。
3. 高歧义条目不会误入 runtime。
4. 战斗系统可以在不改核心求解器的前提下持续扩池。

每个阶段都必须能独立验收，而不是堆到最后一起检查。

## 五、V2 与 V1 的兼容原则

`V2` 推进过程中必须遵守以下 6 条原则：

1. `单一 canonical schema` 不变
   V2 只能启用和扩展现有 schema 里的预留字段，不能再发明第二套修仙存档。
2. `V1 主循环仍然是主干`
   当前已经成立的 `专注 -> 修为 -> 道行 -> 奇遇 -> 破境` 仍然是系统主干；V2 战斗只是奇遇中的一个分支结果。
3. `未启用的 V2 字段必须无害`
   即使数据库里已有新字段，只要 V2 模块没开，V1 服务层就必须忽略它们。
4. `内容池扩展不得倒逼主循环改写`
   新条目接入不能反复推翻 V1 的修为模板、破境模板和灵石主循环。
5. `战斗结果只通过 bridge 回写`
   不允许 handler、service 或 resolver 直接随意改用户主文档。
6. `V2 默认渐进启用`
   小阶显示、小阶生效、奇遇战、法门池扩展、神通池扩展都应可单独开关。

这些原则的本质只有一句话：

`V2` 是在 `V1` 上加层，而不是借机重写 `V1`。

## 六、V2 的测试与验收路线

### 6.1 阶段 A 的测试重点

1. 新字段存在但未启用时，V1 行为不变。
2. registry 条目能安全投影为 runtime-ready 条目。
3. 非 runtime-ready 条目不会误进入求解器。
4. canonical 状态升级后仍可正常读取和保存。

### 6.2 阶段 B 的测试重点

1. 同大境不同小阶时，显示正确。
2. 同大境不同小阶时，四维基线有差异。
3. 小阶影响槽位和技能可用性。
4. 小阶不开启时，系统仍可按 V1 粗粒度运行。

### 6.3 阶段 C 的测试重点

1. 同随机种子下战斗可复现。
2. 奇遇战可从状态生成战斗快照。
3. 战斗结果可回写 canonical 状态。
4. 状态页、奇遇结果页和战报文案能展示正确摘要。
5. 战败代价和战胜奖励都能正确入库。

### 6.4 阶段 D 的测试重点

1. 新条目进 registry 不会导致旧条目失效。
2. projection 扩展后旧测试仍通过。
3. 高歧义条目不会误入 runtime。
4. 同类条目在行为分类上保持一致性。

### 6.5 冒烟验收路线

每个阶段都应配一轮最小 smoke：

1. 阶段 A
   验证 schema 升级后，老用户主循环仍正常运行。
2. 阶段 B
   验证状态页正确显示小阶，且小阶差异真实生效。
3. 阶段 C
   在真实 Telegram 环境中跑一场奇遇战，检查战报、落库和状态回写。
4. 阶段 D
   抽样验证新增法门/神通条目能被正确加载、投影和使用。

## 七、V2 的完成定义

V2 的“完成”建议被定义为：

1. 小阶境界已经进入 runtime，而不是只在文档中存在。
2. 奇遇战拥有独立、可测试、可回写的主动战斗求解器。
3. 法门/神通池已经从零散条目变成 `registry + projection + runtime-ready` 三层结构。
4. 整个 V2 建立在不破坏 V1 主循环的前提下。

## 八、与第一份主动战斗 Spec 的关系

这份路线文档与 [2026-04-21-xuanjian-active-combat-v2-design.md](/Users/qingcongyu/telegramBots/AutomanagerAsistant/docs/superpowers/specs/2026-04-21-xuanjian-active-combat-v2-design.md) 的分工固定为：

1. 第一份文档回答：主动战斗系统本身怎么设计。
2. 这份文档回答：整个 V2 怎么拆阶段、按什么顺序实现、每个阶段什么算完成。

两份文档共同组成 `V2` 的上层设计约束：

1. 主动战斗 spec 提供运行时结构与求解规则。
2. V2 路线 spec 提供阶段拆分、依赖关系、兼容边界与验收路线。
