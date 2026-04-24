# 玄鉴仙族文档梳理与实现路径

## 目标

这份文档只做两件事：

1. 整理当前仓库里与《玄鉴仙族》改造相关的 Markdown 文档。
2. 给出一条可落地、低返工的实现路径，作为后续改造入口。

---

## 一、当前玄鉴相关文档分层

### 1. 设定源文档

这些文档回答“《玄鉴仙族》原设定是什么”。

| 文件 | 作用 | 结论 |
| --- | --- | --- |
| `docs/XUANJIAN_CULTIVATION_WORLDBUILDING.md` | 世界观与修炼体系底稿，区分 `原文明确 / RAG 汇总 / 映射建议` | 作为最高优先级的设定源 |

### 2. 设计源文档

这些文档回答“设定如何映射到当前 bot”。

| 文件 | 作用 | 结论 |
| --- | --- | --- |
| `docs/superpowers/specs/2026-04-19-xuanjian-dev-manual-design.md` | 设定层、映射层、实现层合并手册 | 作为目标产品设计稿 |
| `docs/plans/2026-04-19-xuanjian-cultivation-migration-plan.md` | 面向实现的详细迁移任务 | 作为执行计划底稿 |

### 3. 需要被玄鉴方案替换的现行说明文档

这些文档描述的是当前“通用九境修仙”系统，不应继续被当作玄鉴实现的权威口径。

| 文件 | 当前状态 | 后续处理 |
| --- | --- | --- |
| `README.md` | 仍宣传九境、大乘、飞升 | 迁移完成后更新 |
| `docs/CULTIVATION_SYSTEM.md` | 对外使用文档，仍是九境/仙石/飞升主线 | 迁移完成后重写或替换 |
| `docs/COMMANDS_LIST.md` | 命令文案仍暴露仙石、飞升榜、大乘期 | 迁移完成后更新 |
| `docs/BOTFATHER_COMMANDS.md` | BotFather 命令描述仍使用旧口径 | 迁移完成后更新 |

### 4. 历史实现/架构档案

这些文档有参考价值，但不应主导玄鉴方案。

| 文件 | 用途 | 处理建议 |
| --- | --- | --- |
| `docs/CULTIVATION_IMPLEMENTATION.md` | 旧修仙系统实现总结 | 保留为历史记录 |
| `docs/INTEGRATION_COMPLETE.md` | 旧集成说明 | 保留为历史记录 |
| `docs/cultivation-system.md` | 旧技术说明，且与 `docs/CULTIVATION_SYSTEM.md` 重复 | 后续合并或归档 |
| `docs/models-design.md` | 数据模型旧说明 | 仅作字段兼容参考 |
| `docs/database-design.md` | 数据库存储旧说明 | 仅作字段兼容参考 |
| `docs/core-services.md` | 服务层旧说明 | 仅作代码入口索引 |
| `docs/command-handlers.md` | 命令处理器旧说明 | 仅作代码入口索引 |

---

## 二、当前实现与玄鉴目标的实际差距

当前代码仍然是“通用九境修仙”实现，主要偏差集中在这些位置：

| 文件 | 当前问题 |
| --- | --- |
| `src/config/cultivation.ts` | 九境配置、统一四阶段、飞升主线仍在 |
| `src/types/cultivation.ts` | 类型只支持统一阶段模型，不支持胎息六轮/异构阶段 |
| `src/services/CultivationService.ts` | 突破仍是统一概率模型，飞升为默认主线 |
| `src/handlers/cultivationCommands.ts` | `/realm` `/divination` `/stones` `/rankings` 等仍大量输出 `仙石`、`飞升`、`大乘期` |
| `src/handlers/coreCommands.ts` | `/start` 欢迎文案仍明确宣传九境与飞升终局 |
| `src/handlers/taskCommands.ts` | 奖励文案仍输出 `灵力 + 仙石` |
| `src/models/User.ts` | 默认境界仍是 `炼气期`，峰值境界仍按旧系统记录 |
| `tests/unit/config/cultivation.test.ts` | 断言仍以九境为准 |
| `tests/cultivation.test.ts` | 服务行为仍以旧境界和旧突破逻辑为准 |

结论：当前仓库已经有“玄鉴文档”，但代码和公开说明仍未进入玄鉴迁移阶段。

---

## 三、文档之间的冲突点与归一建议

### 1. 阶段模型冲突

当前三份玄鉴核心文档并不完全一致：

| 文档 | 胎息 | 练气 | 筑基 | 金丹 | 元婴 |
| --- | --- | --- | --- | --- | --- |
| `WORLDBUILDING` | 六轮 | 通用阶段化建议 | 通用阶段化建议 | 通用阶段化建议 | 通用阶段化建议 |
| `dev-manual-design` | 六轮 | 九层 | 三层 | 三阶段 | 暂不细化 |
| `migration-plan` | 六轮 | 默认四段 fallback | 默认四段 fallback | 默认四段 fallback | 终局 fallback |

推荐归一方式：

1. `设定权威` 仍以 `docs/XUANJIAN_CULTIVATION_WORLDBUILDING.md` 为准。
2. `产品目标` 以 `docs/superpowers/specs/2026-04-19-xuanjian-dev-manual-design.md` 为准。
3. `实现路径` 不要一次吃掉全部 canonical 细节，改成“两阶段迁移”：
   - `V1 兼容迁移`：六境 + 胎息六轮 + 飞升默认关闭 + 对外口径切换。
   - `V2 设定深化`：练气九层、筑基三层、金丹三阶段、资源驱动突破。

### 2. 胎息阈值冲突

`dev-manual-design` 与 `migration-plan` 对胎息六轮的阈值拆分不同。

- `dev-manual-design`：不均分
- `migration-plan`：近似均分

推荐结论：

- `V1` 使用 `migration-plan` 的近似均分阈值，原因是：
  - 实现最简单
  - 对现有存量用户最容易解释
  - 测试断言更稳定
- `V2` 再决定是否要根据设定或数值体验细调轮次阈值

建议 V1 阈值固定为：

| 轮次 | 灵力区间 |
| --- | --- |
| 玄景 | 0-166 |
| 承明 | 167-333 |
| 周行 | 334-500 |
| 青元 | 501-667 |
| 玉京 | 668-834 |
| 灵初 | 835-999 |

### 3. 文案术语冲突

推荐统一为：

| 内部字段 | 对外文案 |
| --- | --- |
| `spiritualPower` | `修为` |
| `immortalStones` | `灵石` |
| `breakthrough` | 按境界显示为 `破关 / 冲关 / 凝结仙基 / 飞举仙基` |
| `ascension` | 默认关闭，不作为主线展示 |

说明：

- 存储字段先不改名，避免迁移风险。
- 外显文案先完成“玄鉴化”，这是最小风险收益最大的第一步。

### 4. 飞升处理方式冲突

推荐统一为：

- 不删字段：保留 `ascensions`、`immortalMarks`
- 不删命令入口：保留 `/ascension`、`/confirm_ascension`
- 改默认行为：返回“当前玄鉴体系默认未启用飞升玩法”
- 不再在 `/start`、帮助文案、README、排行榜中主动宣传飞升

---

## 四、推荐的文档权威顺序

后续只要遇到冲突，按下面顺序判断：

1. `docs/XUANJIAN_CULTIVATION_WORLDBUILDING.md`
   作用：判断“玄鉴原设定到底是什么”
2. `docs/superpowers/specs/2026-04-19-xuanjian-dev-manual-design.md`
   作用：判断“目标产品形态应该长什么样”
3. `docs/plans/2026-04-19-xuanjian-cultivation-migration-plan.md`
   作用：判断“本轮代码迁移具体先做什么”
4. `README.md` / `docs/CULTIVATION_SYSTEM.md` / `docs/COMMANDS_LIST.md` / `docs/BOTFATHER_COMMANDS.md`
   作用：对外说明，必须跟随实现更新，不再反向指导实现
5. 其他历史文档
   作用：仅供检索旧字段、旧命令、旧流程

---

## 五、推荐实现路径

### 路径选择

推荐走一条“两阶段迁移路径”，而不是“一次性完全玄鉴化”。

原因：

- 当前代码、测试、README、命令说明都还站在九境口径上。
- 一步到位会同时改动配置、服务、文案、测试、数据迁移，返工概率高。
- 先做 `V1 兼容迁移`，可以先把世界观口径、命令展示和基础进度模型切过来。
- 再做 `V2 设定深化`，把更重的 canonical 细节逐层吃掉。

### Phase 0: 文档冻结与口径定稿

目标：先冻结“本轮到底实现到哪一层”。

产出：

- 本文档作为索引入口
- 以 `docs/XUANJIAN_CULTIVATION_WORLDBUILDING.md` 为设定源
- 以 `docs/plans/2026-04-19-xuanjian-cultivation-migration-plan.md` 为 V1 执行底稿

本阶段要明确：

1. `V1` 只做六境 + 胎息六轮 + 文案切换 + 飞升关闭。
2. `V1` 不强行一次落地练气九层/筑基三层/金丹三阶段。
3. `V2` 再做 canonical 阶段深化与资源化突破。

### Phase 1: 类型与配置先行

目标：先把“九境模板”改成“可表达玄鉴”的配置模型。

优先修改文件：

- `src/types/cultivation.ts`
- `src/types/services.ts`
- `src/config/cultivation.ts`
- `tests/unit/config/cultivation.test.ts`

完成标准：

- `getCurrentRealm()` 返回六境
- `getRealmStage()` 支持胎息六轮
- 新增功能开关，`ascension: false`
- 现有九境相关测试全部转成玄鉴基线

### Phase 2: 服务层兼容迁移

目标：在不改 MongoDB 字段名的前提下，让业务行为先切到玄鉴口径。

优先修改文件：

- `src/models/User.ts`
- `src/models/DivinationHistory.ts`
- `src/services/CultivationService.ts`
- `tests/cultivation.test.ts`

完成标准：

- 默认境界改为 `胎息`
- 对外展示 `修为 / 灵石`
- 胎息阶段不再走统一随机渡劫
- `/ascension` 相关服务默认受功能开关保护
- 老字段 `spiritualPower` / `immortalStones` 继续兼容

### Phase 3: 命令与公开文案切换

目标：把用户真正会看到的内容从“通用修仙”切到“玄鉴口径”。

优先修改文件：

- `src/handlers/cultivationCommands.ts`
- `src/handlers/coreCommands.ts`
- `src/handlers/taskCommands.ts`
- `tests/unit/handlers/coreCommands.test.ts`
- 新增 `tests/unit/handlers/cultivationCommands.test.ts`

完成标准：

- `/start` 不再宣传九境、大乘、飞升终局
- `/realm` 显示 `胎息/练气/筑基/紫府/金丹/元婴`
- `/stones`、占卜、奖励文案统一改成 `灵石`
- `/ascension`、`/confirm_ascension` 默认返回“未启用”
- `/rankings` 不再默认输出飞升榜

### Phase 4: 数据迁移脚本与灰度验证

目标：保证旧用户数据能安全过渡。

优先修改文件：

- `scripts/migrate-cultivation-to-xuanjian.ts`
- `package.json`

完成标准：

- 提供 dry-run 模式
- 允许批量把旧 `realm` 文案映射为新六境口径
- 不直接重写 `spiritualPower` 和 `immortalStones` 字段名
- 迁移前后可对比统计用户数量、境界分布、异常记录

### Phase 5: 公开文档替换

目标：把对外说明和当前实现对齐。

优先修改文件：

- `README.md`
- `docs/CULTIVATION_SYSTEM.md`
- `docs/COMMANDS_LIST.md`
- `docs/BOTFATHER_COMMANDS.md`

处理策略：

- 这些文件在 V1 代码完成后再更新
- 不建议先改文档再改代码，否则仓库会出现“文档是玄鉴，代码还是九境”的假一致

### Phase 6: V2 设定深化

目标：从“兼容迁移版玄鉴”升级到“更贴近原设定的玄鉴”。

这一阶段再考虑：

- 练气九层
- 筑基三层
- 金丹三阶段
- 练气→筑基的资源/丹药/功法条件
- 筑基→紫府的三重死关
- 功法、灵物、家族、宗门、供奉等系统扩展

这部分应另开新计划，不建议混入 V1 迁移。

---

## 六、建议的实际执行顺序

如果现在就开始做，建议按下面顺序推进：

1. 先确认 V1 目标只做到“六境 + 胎息六轮 + 文案切换 + 飞升关闭”。
2. 执行 `docs/plans/2026-04-19-xuanjian-cultivation-migration-plan.md`，但以本文补充的归一规则为准。
3. 先改 `config/types/tests`，再改 `service/model`，最后改 `handlers/docs`。
4. V1 完成后，再决定是否启动 V2 的 canonical 深化计划。

一句话总结：

> 先把项目从“通用九境修仙 bot”迁到“玄鉴口径兼容版 bot”，再从“兼容版玄鉴”升级到“设定深入版玄鉴”。

---

## 七、建议的文档整理动作

这部分不是现在立刻要做的代码任务，而是建议的文档治理动作。

### 建议保留并继续维护

- `docs/XUANJIAN_CULTIVATION_WORLDBUILDING.md`
- `docs/superpowers/specs/2026-04-19-xuanjian-dev-manual-design.md`
- `docs/plans/2026-04-19-xuanjian-cultivation-migration-plan.md`
- `docs/plans/2026-04-19-xuanjian-docs-implementation-path.md`

### 建议在 V1 完成后更新

- `README.md`
- `docs/CULTIVATION_SYSTEM.md`
- `docs/COMMANDS_LIST.md`
- `docs/BOTFATHER_COMMANDS.md`

### 建议标记为历史档案

- `docs/CULTIVATION_IMPLEMENTATION.md`
- `docs/INTEGRATION_COMPLETE.md`
- `docs/cultivation-system.md`
- `docs/models-design.md`
- `docs/database-design.md`
- `docs/core-services.md`
- `docs/command-handlers.md`

如果后续要继续整理目录，建议新增 `docs/archive/`，把这些旧说明迁过去，但这一步应在 V1 完成后再做。
