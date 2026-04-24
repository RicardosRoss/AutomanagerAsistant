# 玄鉴紫府四阶段、金丹求金求闰与内容池存储设计

- 日期：2026-04-24
- 状态：已完成脑暴，待用户 review
- 作用域：`src/types/cultivationCanonical.ts`、`src/types/cultivationV2.ts`、`src/config/xuanjianCanonical.ts`、`src/config/xuanjianV2Registry.ts`、`src/services/BreakthroughEngine.ts`、`src/services/CultivationService.ts`、后续内容定义模型与迁移脚本
- 目标：在现有 `V2 A/B/C` 运行时基础上，补齐紫府四阶段与金丹求金/求闰的开发边界，并决定法门/神通内容池从纯代码 registry 走向可扩容内容存储的方式

## 一、结论

这轮设计固定三条规则：

1. `紫府` 进入真实四阶段运行时，但暂时不处理第三到第五道神通之间的复杂互斥。
2. `金丹` 作为 `紫府圆满 + 五道神通 + 求金/求闰路线` 的高阶突破系统来设计，不触碰元婴/道胎。
3. 法门/神通内容池推荐采用 `数据库主存储 + 代码 seed/fallback` 的混合方案，而不是继续把不断扩容的全部条目硬编码在 TypeScript 文件里。

当前范围只推进“修炼体系主干”和“内容池承载能力”。宗门、坊市、百艺、灵田、供奉、NPC 势力、社会模拟、地图、刷怪、PVP、元婴道胎、道统克制与组合都不进入本轮。

## 二、范围与非范围

### 2.1 本设计覆盖

1. `紫府四阶段`
   - `紫府·初期`
   - `紫府·中期`
   - `紫府·后期`
   - `紫府·圆满`
2. 紫府四阶段对以下 runtime 的影响：
   - 状态展示
   - 修为区间
   - 神通数量门槛
   - 战斗基线
   - 金丹突破 readiness
3. `金丹求金 / 求闰` 的突破模型：
   - 五道神通齐备
   - 求金法
   - 闰法
   - 同源宝药
   - 五行/同殊配比摘要
   - 成功进入金丹
   - 失败损伤
4. 内容池从代码 registry 向数据库内容定义迁移的目标架构。

### 2.2 本设计不覆盖

1. 元婴、道胎、飞升、空证果位。
2. 第三到第五道神通之间的复杂互斥网络。
3. 道统克制、组合、兼修崩解、闰位争夺。
4. 宗门、坊市、百艺、灵田、供奉、家族培养。
5. NPC 势力、社会模拟、长线地图、刷怪循环、PVP。
6. 管理后台 UI。

## 三、紫府四阶段设计

### 3.1 阶段定义

当前 `realm.zifu` 只有 fallback 小阶。下一步应把它改成显式四阶段：

| 小阶 ID | 展示名 | 语义 |
| --- | --- | --- |
| `realmSubStage.zifu.early` | 紫府·初期 | 首神通显化，紫府根基初成 |
| `realmSubStage.zifu.middle` | 紫府·中期 | 第二、第三神通开始成体系 |
| `realmSubStage.zifu.late` | 紫府·后期 | 第四、第五神通冲刺期 |
| `realmSubStage.zifu.perfect` | 紫府·圆满 | 五道神通齐备，准备求金/求闰 |

阶段仍由 `realmId + currentPower` 解析，不新增第二条成长进度。`realmSubStageId` 继续作为可持久化派生缓存，由 `CultivationService.syncRealmSubStage()` 在状态读取、专注结算、破境成功/失败后收敛。

### 3.2 与神通数量的关系

本轮不做复杂神通互斥，但需要让紫府阶段和神通数量形成最小可验证关系：

1. `紫府·初期`
   - 至少拥有首神通。
   - 可以准备第二道神通冲关。
2. `紫府·中期`
   - 目标是拥有二到三道神通。
   - 后续神通冲关仍走既有 `zifu_divine_power`。
3. `紫府·后期`
   - 目标是拥有四到五道神通。
   - 允许积累求金/求闰所需资源。
4. `紫府·圆满`
   - 金丹 readiness 必须要求五道神通齐备。
   - 没有五道神通时，即使修为到达圆满，也不能发起金丹突破。

这不是互斥系统，只是数量和阶段的门槛系统。

### 3.3 战斗与展示影响

紫府四阶段应影响两类 runtime：

1. `展示`
   - `/realm` 显示 `紫府·初期` 等阶段名。
   - 最近斗法摘要继续保留。
   - 金丹 readiness 可以显示“尚缺第 N 道神通”。
2. `战斗基线`
   - `CombatStateAdapter` 根据小阶提高四维基线。
   - `紫府·圆满` 的基线应明显高于 `紫府·初期`。
   - 法门/神通槽位仍由 `getBattleSlotLimits()` 控制，不在本轮引入复杂构筑互斥。

### 3.4 完成标准

紫府四阶段完成后，需要满足：

1. `resolveRealmSubStageId('realm.zifu', power)` 能返回四个真实小阶之一。
2. `/realm` 能显示紫府小阶。
3. 同为紫府，不同小阶的战斗快照有可测差异。
4. 金丹突破 readiness 能识别 `紫府·圆满` 与五道神通门槛。
5. 现有筑基、紫府首神通、第二道神通冲关测试无回归。

## 四、金丹求金 / 求闰体系设计

### 4.1 核心口径

金丹不是普通大境升级。它应被建模为：

`紫府圆满 + 五道神通齐备 + 求金/求闰路线 + 同源宝药/特殊条件 -> 煅成金性 -> 进入金丹`

本轮只设计到 `紫府 -> 金丹`。进入金丹后的三阶段成长可以后续单独展开，元婴完全不进入本轮。

### 4.2 新增突破类型

建议扩展：

```ts
type BreakthroughAttemptKind =
  | 'realm_zhuji_to_zifu'
  | 'zifu_divine_power'
  | 'realm_zifu_to_jindan';
```

`realm_zifu_to_jindan` 是大境突破，但它不应和普通 `RealmBreakthroughRequirement` 完全混在一起。建议保留公共大境 requirement，同时新增金丹专用 requirement。

### 4.3 金丹 requirement

建议新增：

```ts
interface JindanBreakthroughRequirement {
  id: string;
  requiredRealmSubStageId: 'realmSubStage.zifu.perfect';
  requiredDivinePowerCount: 5;
  requiredPower: number;
  requiredAttainment: number;
  requiredItems: Array<{ definitionId: string; count: number }>;
  requiredMethodGrade?: number;
}
```

公共门槛负责“够不够资格”，路线法门负责“怎么求金/求闰”。

### 4.4 求金法与闰法

`BreakthroughMethodDefinition` 需要支持金丹路线：

```ts
type JindanMethodPathType =
  | 'direct_gold'
  | 'same_three_different_two'
  | 'same_four_different_one'
  | 'runyang'
  | 'runyin'
  | 'side_path';
```

建议字段：

```ts
interface JindanBreakthroughMethodPayload {
  pathType: JindanMethodPathType;
  requiredPowerPattern?: {
    sameLineageCount?: number;
    differentLineageCount?: number;
    requiredPowerIds?: string[];
  };
  requiredCatalystIds: string[];
  requiredTreasureIds: string[];
  stabilityBonus: number;
  failureRisk: 'low' | 'medium' | 'high' | 'catastrophic';
  resultGoldNatureTag: string;
}
```

解释：

1. `direct_gold`
   - 最正统的求金路线。
   - 要求神通同源度高、主修功法品级足够、宝药昂贵。
2. `same_three_different_two`
   - 三同二殊。
   - 允许五道神通中有两道异质神通，稳定性较低，但构筑更灵活。
3. `same_four_different_one`
   - 四同一殊。
   - 稳定性高于三同二殊，仍保留一点异质补强。
4. `runyang / runyin`
   - 闰阳 / 闰阴。
   - 解决构筑缺口或路线偏斜，适合作为更高风险但更可玩的替代路线。
5. `side_path`
   - 旁门成道。
   - 暂时只保留 schema，不建议第一版开放给玩家 runtime。

### 4.5 Readiness 流程

`evaluateBreakthroughReadiness(kind = 'realm_zifu_to_jindan')` 检查顺序：

1. 当前境界必须是 `realm.zifu`。
2. 当前小阶必须是 `realmSubStage.zifu.perfect`。
3. `knownDivinePowerIds.length >= 5`。
4. 修为和道行达到金丹 requirement。
5. 背包拥有公共材料。
6. `selectedBreakthroughMethodId` 指向适配 `zifu_to_jindan` 的求金/求闰法。
7. 神通组合满足该路线的 `requiredPowerPattern`。
8. 背包拥有该路线额外需要的同源宝药、催化物或闰法材料。

如果失败，返回缺口时应尽量用用户能理解的中文标签，例如：

- `尚未紫府圆满`
- `五道神通未齐`
- `求金法缺少同源宝药`
- `当前神通组合不满足三同二殊`

### 4.6 Attempt 流程

`resolveBreakthroughAttempt(kind = 'realm_zifu_to_jindan')` 的成功结果：

1. 扣除公共材料和路线材料。
2. `realmId = realm.jindan`。
3. `realmSubStageId` 收敛到金丹默认或未来金丹阶段。
4. 记录 `breakthroughResolution`：
   - 使用的求金/求闰路线
   - 五道神通摘要
   - 金性标签
   - 消耗材料
5. 写入轻量结果字段：
   - `combatFlags.jindanPathType`
   - `combatFlags.goldNatureTag`

失败结果：

1. 不进入金丹。
2. 扣 `currentPower` 和 `cultivationAttainment`。
3. 消耗部分或全部材料，具体由路线 `failureRisk` 决定。
4. 可施加伤势或 cooldown，但第一版不做“金性化邪怪”、立死或删号。

### 4.7 完成标准

金丹求金/求闰第一版完成后，需要满足：

1. 紫府圆满但神通不足时，不能突破金丹。
2. 五道神通齐备但未选择求金/求闰法时，不能突破金丹。
3. 不同路线能产生不同 readiness 缺口和 `breakthroughResolution`。
4. 成功后能进入 `realm.jindan` 并保留路线摘要。
5. 失败后能产生明确代价，但不触发元婴、道胎或删号逻辑。

## 五、法门/神通内容池存储策略

### 5.1 当前问题

当前 `src/config/xuanjianV2Registry.ts` 适合作为早期 seed 和测试 fixture，但如果后续法门/神通数量大增，并且需要手写大量原创内容，纯代码 registry 会出现几个问题：

1. 内容条目和运行时代码耦合太紧。
2. 扩容会导致 config 文件不断膨胀。
3. 想调平衡、改文案、加条目时都需要发代码版本。
4. 很难区分“内容草稿”“已校订”“runtime-ready”“禁用”。
5. 不利于后续做内容导入脚本、审校流程或管理后台。

### 5.2 可选方案

#### 方案 A：继续纯代码 registry

优点：

1. 类型安全最好。
2. 测试简单。
3. 没有数据库读取和缓存复杂度。

缺点：

1. 不适合大量内容扩容。
2. 每次内容调整都要改代码。
3. 创作和实现边界混在一起。

适用场景：只保留几十个固定条目。

#### 方案 B：全部改成数据库动态内容

优点：

1. 扩容最灵活。
2. 可以支持后续自定义法门/神通。
3. 可以做内容状态流转。

缺点：

1. 首次迁移成本高。
2. 测试和本地启动更依赖数据库 seed。
3. 如果缺少 schema 校验，容易把坏内容送进 runtime。
4. 核心 starter 内容也会受数据库状态影响。

适用场景：已有成熟后台和内容审核流程。

#### 方案 C：数据库主存储 + 代码 seed/fallback

这是推荐方案。

优点：

1. 允许内容池持续扩容。
2. 核心 starter 条目仍能稳定测试和 fallback。
3. 数据库内容可以有状态：`draft / review / runtime_ready / disabled`。
4. 运行时仍通过统一 projection 校验后使用，不让脏数据直接进入战斗求解器。
5. 可以先做脚本导入，不必马上做后台。

缺点：

1. 需要新增内容模型、校验器、缓存和 seed 脚本。
2. 测试要区分纯函数 fixture 与数据库集成测试。

推荐采用方案 C。

### 5.3 内容模型

建议新增统一内容定义模型，例如 `ContentDefinition`：

```ts
interface ContentDefinitionDocument {
  definitionId: string;
  category:
    | 'battle_art'
    | 'divine_power'
    | 'breakthrough_method'
    | 'main_method'
    | 'material'
    | 'consumable';
  name: string;
  version: number;
  status: 'draft' | 'review' | 'runtime_ready' | 'disabled';
  source: 'builtin_seed' | 'manual' | 'migration' | 'generated';
  tags: string[];
  realmFloor: string;
  realmCeiling?: string;
  payload: unknown;
  balanceProfile?: unknown;
  createdAt: Date;
  updatedAt: Date;
}
```

索引：

```ts
contentDefinitionSchema.index({ definitionId: 1, version: 1 }, { unique: true });
contentDefinitionSchema.index({ category: 1, status: 1 });
contentDefinitionSchema.index({ tags: 1 });
```

`payload` 不应直接进入 runtime。必须先通过 category-specific validator 转换成当前已有的 runtime profile。

### 5.4 服务边界

建议新增 `ContentDefinitionService`：

1. `loadRuntimeReadyContentBatch()`
   - 从数据库读取 `runtime_ready` 条目。
   - 合并 builtin seed。
   - 返回经过校验和 projection 的内容批次。
2. `getBattleArtDefinition(id)`
3. `getDivinePowerDefinition(id)`
4. `getBreakthroughMethodDefinition(id)`
5. `validateContentDefinition(document)`
6. `refreshContentCache()`

运行时调用原则：

1. `CombatResolver` 不直接查 MongoDB。
2. `BreakthroughEngine` 不直接查 MongoDB。
3. 上层 service 在启动或请求前加载 content projection。
4. 求解器只接受已经投影好的 runtime-ready 结构。

这样可以保留当前纯函数求解器的可测试性。

### 5.5 Seed 与迁移

第一步不做后台，只做脚本：

1. `scripts/seed-xuanjian-content.ts`
   - 把当前代码 registry 中的 runtime-ready 条目写入数据库。
   - `definitionId + version` 幂等。
2. `scripts/validate-xuanjian-content.ts`
   - 扫描数据库内容。
   - 输出哪些条目无法 projection。
3. `scripts/export-xuanjian-content.ts`
   - 把数据库内容导出成 JSON，便于 review 和备份。

代码 seed 的职责：

1. 提供 starter 内容。
2. 提供测试 fixture。
3. 数据库不可用时让开发环境仍可启动基础修炼/战斗测试。

数据库内容的职责：

1. 承载扩容条目。
2. 承载原创法门/神通。
3. 承载 `draft -> runtime_ready` 状态流转。

### 5.6 完成标准

内容池存储第一版完成后，需要满足：

1. 现有代码 registry 条目可以 seed 到数据库。
2. 数据库中 `runtime_ready` 的法门/神通能被 projection 成现有 runtime profile。
3. `draft / review / disabled` 条目不会进入战斗或突破 runtime。
4. 数据库缺失时，测试环境仍能使用 builtin seed 跑核心用例。
5. 新增一个原创法门或神通不需要修改 `CombatResolver` 或 `BreakthroughEngine`。

## 六、推荐实施顺序

推荐拆成三段，不要一次混做：

1. `紫府四阶段`
   - 最小变更，先让高境界小阶真实进入 runtime。
   - 这是金丹 readiness 的前置。
2. `金丹求金/求闰`
   - 在紫府圆满和五道神通门槛稳定后实现。
   - 先做 2 到 3 条路线，不追求一次覆盖全部原著复杂路径。
3. `内容池数据库化`
   - 先建立内容模型和 seed/validate 脚本。
   - 再逐步把法门/神通读取从 `xuanjianV2Registry.ts` 迁移到 `ContentDefinitionService`。

不建议先做内容池数据库化再做金丹，因为金丹 requirement 和 route payload 还没稳定时，数据库 schema 容易被返工。

## 七、测试路线

### 7.1 紫府四阶段测试

1. `resolveRealmSubStageId` 覆盖紫府四阶段边界。
2. `/realm` 展示紫府小阶。
3. `CombatStateAdapter` 对不同紫府小阶生成不同四维。
4. 破境进入紫府后小阶自动收敛到初期。

### 7.2 金丹求金/求闰测试

1. 紫府未圆满不能求金。
2. 少于五道神通不能求金。
3. 缺少求金法或闰法不能求金。
4. 三同二殊 / 四同一殊路线能正确校验神通组合。
5. 成功进入金丹后写入路线摘要。
6. 失败时扣修为和道行，但不触发元婴或删号。

### 7.3 内容池测试

1. seed 脚本幂等。
2. validator 拦截 payload 缺字段、非法 category、非法 status。
3. `runtime_ready` 条目进入 projection。
4. `draft / review / disabled` 条目不进入 projection。
5. 数据库不可用时 builtin seed 可以支撑核心单元测试。

## 八、文档同步

实现后需要同步：

1. `docs/cultivation/xuanjian-dev-manual.md`
   - 补紫府四阶段。
   - 补金丹求金/求闰 runtime 口径。
   - 补内容池数据库化边界。
2. `docs/cultivation/smoke-test-checklist.md`
   - 补紫府小阶 smoke。
   - 补金丹 readiness smoke。
3. `docs/cultivation/xuanjian-lineage-codex.md`
   - 只补求金/求闰路线引用，不展开道统克制。

## 九、最终完成定义

这轮后续实现完成时，应能回答三个问题：

1. 用户到紫府后，为什么还要继续修到初期、中期、后期、圆满。
2. 用户冲金丹时，为什么不是普通突破，而是要围绕五道神通选择求金/求闰路线。
3. 开发者以后新增大量原创法门/神通时，为什么不需要不断扩大一个 TypeScript registry 文件。

只要这三个问题在代码、测试和文档中都有稳定答案，本阶段就算完成。
