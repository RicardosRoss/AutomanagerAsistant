# 玄鉴仙族修仙体系迁移 - 开发手册

> **版本**: 1.0
> **日期**: 2026-04-19
> **定位**: 设定+技术混合手册，供开发者理解世界观并执行迁移
> **设定来源**: `docs/XUANJIAN_CULTIVATION_WORLDBUILDING.md` + NotebookLM 原文查询

---

## 第一部分：设定层 — 世界观速查

### 1.1 修炼体系总览

《玄鉴仙族》的修仙体系包含三层：

- **境界层**：胎息→练气→筑基→紫府→金丹→元婴（六境）
- **道统层**：青玄、兜玄、通玄（三玄），属于历史背景标签，非主线境界
- **资源层**：灵窍、符种、功法、灵石、灵物、法器、阵法、供奉与家族培养体系

### 1.2 寿命阶梯

| 境界 | 寿命 | 原文依据 |
|------|------|----------|
| 凡人 | ~70年 | 常规凡人寿命 |
| 胎息 | 120年 | "步入胎息，寿数一百二十载" |
| 练气 | 200年 | "练气虽说寿二百" |
| 筑基 | 300年 | "从此服气而生，得寿三百年" |
| 紫府 | 500年 | "紫府有五百之数" |
| 金丹 | 1000年 | "煅成金性，寿元一千年" |
| 元婴（道胎） | 长生不老 | "抵御百世轮回" |

### 1.3 境界卡片

#### 胎息（古称：养轮）

- **定位**：修行第一步，正式入道后的第一个大境界
- **内部阶段**：六轮（显式子阶段，非四阶段模板）
  1. **玄景**（入道之门，凝成后可施基础法术）
  2. **承明**
  3. **周行**（法力流转全身，强化目力、脚力与行动能力）
  4. **青元**
  5. **玉京**（诞生灵识，具备炼丹、炼器、布阵、使用储物袋能力）
  6. **灵初**
- **胎息三关**：玄景、周行、玉京 — 这三轮尤其困难，需在不同丹田位置"无中生有"凝聚灵轮
- **修成标志**：凝聚玄景轮即算入了胎息；六轮养满如月后方可入练气
- **修行方式**：通过人体之"窍"操控天地灵气，勾动太阴月华，吸纳月华反复运转法诀
- **核心功法**：《太阴吐纳养轮经》
- **风险**：未成玄景前若暴露"无灵窍而修行"事实，极易引来杀身之祸
- **寿命**：120年

#### 练气（古称：服气）

- **定位**：胎息之后的第二大境界
- **内部阶段**：**九层**（1-9层），非传统的初期/中期/后期/大圆满
  - 原文明确："练气本九层，没有什么九层之上练气巅峰、练气大圆满可言"
  - 所谓"练气巅峰"或"大圆满"是下层讨好无法突破者的尊称
  - 大宗门通常主张按前/中/后三阶段管理，但正统为九层
- **与胎息的根本区别**：必须纳一口"天地灵气"入体，与自身练气功法相合吞服提炼
- **修行路径**（三种）：
  1. **正法修行**（二品及以上功法）：跋山涉水采集特定天地灵气，战力强横，突破筑基的正统途径
  2. **大路货修行**（一品功法）：购买"小清灵气"，兼容性好但威力平庸，省去十几年采气光阴
  3. **吞服杂气**（杂气修士）：强行突破换取练气名头和200年寿命，代价是"终身不得筑基"
- **核心能力**：踏空飞行/御气飞行，驱使高阶法器与符箓
- **社会地位**：小世家和散修中的核心人物；大宗门中只做外派庶务的低阶弟子
- **寿命**：200年
- **突破筑基条件**：见筑基卡片

#### 筑基（常与"仙基"并提）

- **定位**：高于练气的重要跃迁境界，修士被尊称为"老祖"
- **内部阶段**：**三层**（初期/中期/后期），非四阶段
  - 原文明确："筑基虽然只有三层"
- **修成标志/核心仪式**：化去六轮，凝结仙基
  1. 服下筑基丹药（如遂元丹）
  2. 六轮从气海和识海中浮现，一齐兵解化为六道流光
  3. 流光在气海中卷起气浪，大量消耗真元
  4. 流光吸饱真元后碰撞凝结成仙基
- **仙基**：由功法决定形态和能力，已知类型包括：
  - 浩瀚海（古称泾龙王）：控水、善算水脉
  - 湖月秋：气青白，真元澄澈，善变化
  - 煌元关：镇压之能，克制魔修
  - 玄雷泊：祈雷引电
  - 镂金石：破阵、开山、毁敌法器
  - 玉庭将：血气充沛
  - 其他：溪上翁、长云暗、恨江去、愚赶山、天金等
- **仙基品级**：由功法品级决定（一品最次，九品最高），高品级关乎突破紫府潜力
- **核心能力**：仙基神妙 + 食气不饥 + 踏空飞行 + 大威力法术
- **社会地位**：越国上千万人口中筑基仅两百多位，重铸世家可跻身修仙高层
- **寿命**：300年
- **突破紫府条件**：见紫府卡片

#### 紫府（古称：炼神）

- **定位**：高于筑基的高阶境界，以神通闻名
- **内部阶段**：原文无明确细分，建议产品层采用四阶段（初期/中期/后期/圆满）
- **修成标志**：与"神通"高度绑定，显化神通即入紫府
- **突破条件（筑基→紫府）**：三重死关，突破失败立死
  1. **仙基入升阳**：仙基离开气海向上走进入阴交神阙，没有回头路
  2. **凝炼神通**：仙基冲入眉心升阳府，孕育转化为神通
  3. **割断凡胎**：以神通推升阳府入太虚，期间经历蒙昧之念和无限幻想
- **需要条件**：五品或六品以上功法 + 仙基温养圆满 + 紫府灵物/宝药（如紫明丹、明方天石）+ 同源化神通秘法
- **核心能力**：神通显化，对家族/宗门/地域格局有决定性影响
- **社会地位**：紫府修士寿五百年，具备强烈局势主导能力
- **寿命**：500年

#### 金丹（古称：求性）

- **定位**：紫府之后的高境界，修仙界绝对霸主
- **内部阶段**：**三阶段**（前期/中期/后期）
  - 原文明确："皆是金丹前期"、"已至金丹后期"
- **修成标志**：煅出"金性"（取"金之不朽"之意，非五行金属性）
  - "煅出那一点不坏的金性，再以那金性催化神通，证得金丹"
- **突破条件（紫府→金丹）**：
  - 必须在紫府境界修满五道神通
  - 采用"五行求金法"、"焜煌敛金法"、"三同二殊/四同一殊"、"闰阳/闰阴法"等路径之一，将五道神通作为柴火燃烧锤炼凝聚金性灵光
  - 需借助同根同源的极品宝药或特殊仙基催化
  - 习俗：邀请后辈观礼，互利互惠寻突破法子
  - 安全：有"司阴之人"暗中监视，防备突破失败后金性化为邪怪
- **称号体系**：神君、府君、真君、帝君（统称"真君"）
- **核心能力**：开辟洞天法界、金性不朽（身死也可凭金性长存）、仙人手段
- **社会地位**：越国三宗皆因背靠金丹道统而立，是宗门的绝对底蕴
- **寿命**：1000年

#### 元婴（仙道称"道胎"/"仙"，释教称"法相"/"世尊"）

- **定位**：六境序列终点，真正的"仙"
- **内部阶段**：原文未明确，建议暂不细化
- **修成标志**："天道混元，道胎为仙" — 金丹的极致升华
- **突破条件（金丹→元婴）**：几乎不可能
  - 需将金丹之路走到极致，"求道、证道、进无可进"
  - 当今天道残缺，需要"空证果位"等匪夷所思的通天手段
  - 释教路径需"九世转生，移性自居"或等待法相位子空出
- **六境之上**：玄主、仙君、金仙（更高层次），"往天外求道"（类似飞升但非传统飞升）
- **核心能力**：长生不老，改天换地，应身三十二，修作应土
- **社会地位**：绝对顶端，紫府/金丹在面前只是棋子
- **寿命**：长生不老

### 1.4 修行要素体系

#### 灵窍与玄珠符种

- 灵窍是大道之基
- 法鉴通过玄珠符种能让无灵窍者"从凡入圣"
- 符种契合度以"白毫"长度衡量，越长修行速度越接近灵窍者
- **三类起点**：
  - 灵窍者：正常修行
  - 符种受授者：由法鉴赐符种入门
  - 普通凡人：无灵窍无符种

#### 功法体系

- 品级：一品（最次）到九品（最好）
- 核心功法：
  - 《太阴吐纳养轮经》：胎息六轮基础功法，"写不出也念不出"
  - 《玄珠祀灵术》：法鉴本命法诀，凝聚玄珠符种
- 功法品质直接影响仙基类型、战力和突破潜力

#### 战斗法门与神通体系

- **主修功法**：长期平台层，决定修炼倍率、法力质量、道统、道基/仙基方向与技能承载上限
- **战斗法门**：独立主动技能层，覆盖攻击术法、兵术、身法/遁法、辅助秘法；少数顶尖法门已接近神通表现，应标记为“准神通级法门”
- **神通**：紫府后的独立构筑层；已核定条目可分术神通、身神通、命神通，少数如 `洞泉声` 属兼类神通，另有一批具名但未定类神通应留在 NPC/资料态
- **破境法门**：需拆成 `接引法`、`化神通秘法`、`求金/求闰法`、`旁门成道法`，只服务突破流程，不进入战斗技能槽
- **道行**：作为长期成长轴，不只放大战斗法门与神通威力，还影响高阶功法理解、复杂机制解锁与破境路径发挥

#### 资源经济

- **灵石**：修仙界硬通货，类似凡人金银
  - 十枚白元果 ≈ 一枚灵石
  - 一百斤灵稻 ≈ 一枚灵石
- **灵物/宝药**：越往上修越依赖高级灵物，普通灵物效果递减
- **仙基道参**：同源仙基互为"道参"（魔道称"同丹"），高阶可"挖出仙基吞服补足"
- 资源逻辑非线性增长，而是强烈稀缺、层级分明、与势力结构深度绑定

#### 法器、阵法与修仙百艺

- 玉京轮诞生灵识后方可炼丹、炼器、布阵、使用储物袋
- 修仙百艺传承高度封锁，宗门和世家控制知识扩散
- 坊市可买成品但未必买得到完整传承

---

## 第二部分：映射层 — 设定→游戏机制

### 2.1 进度模型映射

| 境界 | 进度模型 | 阶段数 | 原文依据 |
|------|----------|--------|----------|
| 胎息 | 显式子阶段（六轮） | 6 | 原文明确六轮全名 |
| 练气 | 层数制（九层） | 9 | 原文"练气本九层" |
| 筑基 | 三层制 | 3 | 原文"筑基虽然只有三层" |
| 紫府 | 四阶段（产品层） | 4 | 原文无明确细分 |
| 金丹 | 三阶段 | 3 | 原文明确前/中/后 |
| 元婴 | 待定（暂不细化） | - | 原文不足 |

**灵力阈值分配**（兼容现有数据）：

| 境界 | 灵力范围 | 内部阶段阈值 |
|------|----------|------------|
| 胎息 | 0 - 999 | 玄景:0-166, 承明:167-277, 周行:278-444, 青元:445-555, 玉京:556-722, 灵初:723-999 |
| 练气 | 1000 - 2499 | 1层:1000-1166, 2层:1167-1333, ..., 9层:2329-2499 |
| 筑基 | 2500 - 4999 | 初期:2500-3332, 中期:3333-4165, 后期:4166-4999 |
| 紫府 | 5000 - 7999 | 初期:5000-5749, 中期:5750-6499, 后期:6500-7249, 圆满:7250-7999 |
| 金丹 | 8000 - 11999 | 前期:8000-9332, 中期:9333-10665, 后期:10666-11999 |
| 元婴 | 12000+ | 待定 |

### 2.2 突破机制映射

**核心规则：收集即突破** — 只有集齐对应道基所需的指定宝物，才能发起突破。宝物通过完成专注任务时的奇遇掉落获得。

| 突破点 | 机制类型 | 实现方式 |
|--------|----------|----------|
| 胎息六轮间 | 线性推进，不走随机渡劫 | 灵力达到阈值自动晋升下一轮，无需 `/breakthrough` |
| 练气各层间 | 线性推进 | 灵力达到阈值自动晋升下一层 |
| 练气→筑基 | **收集驱动** | 必须集齐：黄阶丹药×1 + 黄阶灵材×1 + 黄阶功法×1（功法决定仙基类型），额外收集物可提升成功率 |
| 筑基→紫府 | **高风险收集突破** | 必须集齐：玄阶丹药×2 + 玄阶灵材×2 + 玄阶功法×1 + 玄阶破境法门×1（化神通秘法），突破时三重死关独立判定 |
| 紫府→金丹 | **高阶收集突破** | 必须集齐：地阶破境法门×1 + 地阶灵材×2 + 地阶法宝×1，并满足五神通等长期条件 |
| 金丹→元婴 | 终局目标 | 保留为远期目标，暂不实现具体机制 |

> 详细突破收集物表见 `docs/cultivation/xuanjian-encounter-codex.md` → 道基突破收集机制

### 2.3 资源体系映射

| 旧系统 | 新系统 | 说明 |
|--------|--------|------|
| `仙石` (immortalStones) | `灵石` | 显示文案切换，字段名不改 |
| `灵力` (spiritualPower) | `修为` | 前台文案用"修为"，内部字段不改 |
| 无 | `奇遇宝物` | 完成专注任务概率掉落，存入用户背包 |
| 无 | `战斗法门` | 独立技能池，作为主动斗法构筑 |
| 无 | `神通` | 紫府后解锁的独立高阶技能槽，允许兼类神通 |
| 无 | `破境法门` | 分为接引法 / 化神通秘法 / 求金法 / 旁门成道法，不进入战斗构筑 |
| 无 | `道基/仙基` | 突破时由收集的功法决定类型，凝结后永久拥有 |
| 无 | `卜卦增益` | 卜卦仅提升下次专注的宝物掉率，不直接给宝物 |
| 无 | `月华` | 修炼收益的可视化概念（可选扩展） |

### 2.4 文案替换规则

| 旧文案 | 新文案 | 作用域 |
|--------|--------|--------|
| 炼气期 | 胎息 / 练气 | 所有文案 |
| 仙石 | 灵石 | 所有文案 |
| 渡劫突破 | 破关 / 冲关 / 凝结仙基 / 飞举仙基 | 按境界区分 |
| 飞升 | 默认关闭，返回"玄鉴体系未启用" | 命令守卫 |
| 大乘期 | 不再作为主线境界 | 所有文案 |
| 初期/中期/后期/大圆满（通用） | 按境界分别：胎息→六轮名，练气→X层，筑基→三阶段 | 进度显示 |
| 灵力 | 修为 | 前台显示 |

### 2.5 功能开关

```ts
const CULTIVATION_FEATURES = {
  divination: true,     // 占卜系统保留
  breakthrough: true,    // 突破系统保留（但胎息阶段改为轮次推进）
  ascension: false       // 飞升系统默认关闭
};
```

---

## 第三部分：实现层 — 技术落地指南

### 3.0 当前运行时入口（已落地）

当前仓库里已经存在并投入使用的玄鉴 canonical runtime 入口如下：

- Canonical config: `src/config/xuanjianCanonical.ts`
- Runtime state adapter: `src/services/CultivationStateAdapter.ts`
- Reward engine: `src/services/CultivationRewardEngine.ts`
- Breakthrough engine: `src/services/BreakthroughEngine.ts`
- Migration command: `npm run migrate:xuanjian-cultivation -- --dry-run`

这批文件是当前实现层的真实入口，优先级高于本手册中仍保留的旧迁移草案、旧九境界示意和历史设计占位。

### 3.1 核心文件变更清单

#### 类型和配置层

| 文件 | 变更类型 | 关键改动 |
|------|----------|----------|
| `src/types/cultivation.ts` | 兼容扩展 | 保留 legacy 类型出口，并 re-export canonical 基础类型 |
| `src/types/cultivationCanonical.ts` | 新建 | canonical 六境界、定义项、运行态、背包实例类型 |
| `src/config/cultivation.ts` | 兼容层 | 保留 legacy helper，同时转发 canonical helper |
| `src/config/xuanjianCanonical.ts` | 新建 | 六境数值锚点、主修功法 seed、破境需求、canonical formatter |
| `src/types/services.ts` | 修改 | 奖励/状态 payload 扩展到 canonical 字段与兼容别名 |

#### 持久化和行为层

| 文件 | 变更类型 | 关键改动 |
|------|----------|----------|
| `src/models/User.ts` | 修改 | 增加 `cultivation.canonical` 子状态、背包与同步 helper |
| `src/models/DivinationHistory.ts` | 沿用现有 schema | 通过服务层保证占卜只改灵石，不再改修为/境界 |
| `src/services/CultivationStateAdapter.ts` | 新建 | legacy 壳字段 → canonical 新开局状态初始化 |
| `src/services/CultivationRewardEngine.ts` | 新建 | 专注收益、道行增长、奇遇掉落的纯函数引擎 |
| `src/services/BreakthroughEngine.ts` | 新建 | 破境条件检查与 deterministic 突破解析 |
| `src/services/CultivationService.ts` | 重构 | 专注奖励、状态查询、破境接线切到 canonical 运行时 |

#### 命令处理和文案层

| 文件 | 变更类型 | 关键改动 |
|------|----------|----------|
| `src/handlers/cultivationCommands.ts` | 修改 | `/realm`、`/rankings`、`/divination` 切换玄鉴六境与 canonical 文案 |
| `src/handlers/coreCommands.ts` | 修改 | 欢迎文案改为六境阶梯：胎息→元婴 |
| `src/handlers/taskCommands.ts` | 修改 | 完成任务反馈改为修为/道行/灵石/主修功法文案 |

#### 迁移工具

| 文件 | 变更类型 | 关键改动 |
|------|----------|----------|
| `package.json` | 修改 | 添加 `migrate:xuanjian-cultivation` 脚本 |
| `scripts/migrate-xuanjian-cultivation.ts` | 新建 | dry-run 模式的 canonical 状态补写与 legacy shell 同步脚本 |

#### 测试

| 文件 | 变更类型 | 关键改动 |
|------|----------|----------|
| `tests/unit/config/xuanjianCanonical.test.ts` | 新建 | canonical 六境数值锚点、formatter、破境需求断言 |
| `tests/unit/services/CultivationStateAdapter.test.ts` | 新建 | legacy→canonical 状态映射与 shell 同步断言 |
| `tests/unit/services/CultivationRewardEngine.test.ts` | 新建 | 专注收益、奇遇与道行增长断言 |
| `tests/unit/services/BreakthroughEngine.test.ts` | 新建 | 破境就绪/消耗/授予神通断言 |
| `tests/cultivation.test.ts` | 修改 | canonical 运行时服务行为断言 |
| `tests/unit/handlers/coreCommands.test.ts` | 修改 | 欢迎文案断言 |
| `tests/unit/handlers/cultivationCommands.test.ts` | 新建 | `/realm`、`/divination`、`/ascension`、`/rankings` canonical 文案断言 |

### 3.2 配置结构设计

```ts
// === src/types/cultivation.ts ===

export type CultivationFeature = 'divination' | 'breakthrough' | 'ascension';

export interface ExplicitRealmStage {
  name: string;
  minPower: number;
  maxPower: number;
  bonus: number;
}

export interface CultivationLabels {
  currency: string;  // '灵石'
  power: string;     // '修为'
}

export interface BreakthroughConfig {
  difficulty: CultivationDifficulty;
  successRate: number;
  failurePenalty: number;
  message: string;
}

export interface CultivationRealm {
  id: number;
  name: string;
  minPower: number;
  maxPower: number;
  title: string;
  emoji: string;
  color: string;
  description: string;
  cultivationBonus: number;
  stages: ExplicitRealmStage[];       // 显式阶段列表
  breakthrough?: BreakthroughConfig | null;  // null 表示不走 /breakthrough
}

// === 奇遇掉落与收集系统 ===

export type Tier = '凡' | '黄' | '玄' | '地';
export type ItemCategory =
  | '丹药'
  | '灵材'
  | '法宝'
  | '功法'
  | '战斗法门'
  | '神通'
  | '破境法门'
  | '道基';
export type ArtCategory = '攻击术法' | '兵术' | '身法' | '遁法' | '辅助秘法';
export type DivinePowerType = '术神通' | '身神通' | '命神通';
export type EncounterScope = 'common' | 'heritage' | 'majorFortune' | 'breakthroughOnly';

export interface EncounterItem {
  id: string;
  name: string;
  category: ItemCategory;
  tier: Tier;
  description: string;
  effect: {
    cultivationXP?: number;
    cultivationMultiplier?: number;
    breakthroughBonus?: number;
    combatPower?: number;
    artCategory?: ArtCategory;
    divinePowerType?: DivinePowerType;
    secondaryDivinePowerType?: DivinePowerType;
    daoInsightScaling?: number;
    artSlots?: number;
    divinePowerSlots?: number;
    specialEffect?: string;
    streakProtection?: boolean;
    durationBonus?: number;
    healingPower?: string;
    foundationBind?: string;
    requiredAura?: string | string[];
    isBreakthroughMethod?: boolean;
    isQuasiDivineArt?: boolean;
    requiresManualClassification?: boolean;
    dropScope?: EncounterScope;
  };
  source: string;
}

export interface UserInventoryItem {
  itemId: string;
  obtainedAt: Date;
  fromDuration: number;     // 来自多长的专注任务
  used: boolean;
}

export interface BreakthroughRequirement {
  targetRealm: string;
  mechanism: 'auto' | 'collection' | 'deadgate' | 'gold-core';
  requiredItems: {
    category: ItemCategory;
    tier: Tier;
    minCount: number;
  }[];
  hardConditions?: string[];
  bonusItems?: {
    category: ItemCategory;
    tier: Tier;
    bonusRate: number;
  }[];
  failureOutcome: string;
  notes?: string[];
}

export interface DivinationBuff {
  categoryBoost: Partial<Record<ItemCategory, number>>;
  tierBoost: Partial<Record<Tier, number>>;
  expiresAfterNextFocus: true;
}

export interface UserFoundation {
  name: string;             // 道基/仙基名称
  realm: string;            // 在哪个境界凝结
  formedAt: Date;
  sourceTechnique: string;  // 来源功法
}
```

```ts
// === src/config/cultivation.ts 核心结构 ===

export const CULTIVATION_LABELS: CultivationLabels = {
  currency: '灵石',
  power: '修为'
};

export const CULTIVATION_FEATURES: Record<CultivationFeature, boolean> = {
  divination: true,
  breakthrough: true,
  ascension: false
};

export const CULTIVATION_REALMS: CultivationRealm[] = [
  {
    id: 1,
    name: '胎息',
    minPower: 0,
    maxPower: 999,
    title: '胎息修士',
    emoji: '🌙',
    color: '#C0C0C0',
    description: '修行第一步，凝聚六灵轮',
    cultivationBonus: 1.0,
    stages: [
      { name: '玄景', minPower: 0,   maxPower: 166, bonus: 1.0 },
      { name: '承明', minPower: 167, maxPower: 277, bonus: 1.05 },
      { name: '周行', minPower: 278, maxPower: 444, bonus: 1.1 },
      { name: '青元', minPower: 445, maxPower: 555, bonus: 1.15 },
      { name: '玉京', minPower: 556, maxPower: 722, bonus: 1.2 },
      { name: '灵初', minPower: 723, maxPower: 999, bonus: 1.3 },
    ],
    breakthrough: null,  // 胎息不走 /breakthrough，按轮推进
  },
  {
    id: 2,
    name: '练气',
    minPower: 1000,
    maxPower: 2499,
    title: '练气修士',
    emoji: '💨',
    color: '#90EE90',
    description: '纳天地灵气入体，法力充沛，可踏空而行',
    cultivationBonus: 1.2,
    stages: [
      { name: '一层', minPower: 1000, maxPower: 1166, bonus: 1.0 },
      { name: '二层', minPower: 1167, maxPower: 1333, bonus: 1.02 },
      { name: '三层', minPower: 1334, maxPower: 1499, bonus: 1.04 },
      { name: '四层', minPower: 1500, maxPower: 1666, bonus: 1.06 },
      { name: '五层', minPower: 1667, maxPower: 1833, bonus: 1.08 },
      { name: '六层', minPower: 1834, maxPower: 1999, bonus: 1.1 },
      { name: '七层', minPower: 2000, maxPower: 2166, bonus: 1.12 },
      { name: '八层', minPower: 2167, maxPower: 2328, bonus: 1.14 },
      { name: '九层', minPower: 2329, maxPower: 2499, bonus: 1.2 },
    ],
    breakthrough: null,  // 练气各层自动推进
  },
  {
    id: 3,
    name: '筑基',
    minPower: 2500,
    maxPower: 4999,
    title: '筑基修士',
    emoji: '🏔️',
    color: '#8B4513',
    description: '化去六轮，凝结仙基，铸就大道之基',
    cultivationBonus: 1.5,
    stages: [
      { name: '初期', minPower: 2500, maxPower: 3332, bonus: 1.0 },
      { name: '中期', minPower: 3333, maxPower: 4165, bonus: 1.1 },
      { name: '后期', minPower: 4166, maxPower: 4999, bonus: 1.2 },
    ],
    breakthrough: {
      difficulty: 'extreme',
      successRate: 30,
      failurePenalty: 500,
      message: '仙基飞举，冲上升阳！',
    },
  },
  {
    id: 4,
    name: '紫府',
    minPower: 5000,
    maxPower: 7999,
    title: '紫府真人',
    emoji: '🔮',
    color: '#9370DB',
    description: '仙基入升阳，凝炼神通，以神通见长',
    cultivationBonus: 2.0,
    stages: [
      { name: '初期', minPower: 5000, maxPower: 5749, bonus: 1.0 },
      { name: '中期', minPower: 5750, maxPower: 6499, bonus: 1.1 },
      { name: '后期', minPower: 6500, maxPower: 7249, bonus: 1.2 },
      { name: '圆满', minPower: 7250, maxPower: 7999, bonus: 1.3 },
    ],
    breakthrough: {
      difficulty: 'extreme',
      successRate: 20,
      failurePenalty: 2000,
      message: '煅金性，证金丹！',
    },
  },
  {
    id: 5,
    name: '金丹',
    minPower: 8000,
    maxPower: 11999,
    title: '金丹真君',
    emoji: '💎',
    color: '#FFD700',
    description: '煅成金性，寿元千载，开辟洞天法界',
    cultivationBonus: 2.5,
    stages: [
      { name: '前期', minPower: 8000,  maxPower: 9332,  bonus: 1.0 },
      { name: '中期', minPower: 9333,  maxPower: 10665, bonus: 1.1 },
      { name: '后期', minPower: 10666, maxPower: 11999, bonus: 1.2 },
    ],
    breakthrough: {
      difficulty: 'ascension',
      successRate: 10,
      failurePenalty: 5000,
      message: '天道混元，证道胎为仙！',
    },
  },
  {
    id: 6,
    name: '元婴',
    minPower: 12000,
    maxPower: Infinity,
    title: '道胎仙君',
    emoji: '🌟',
    color: '#FFD700',
    description: '天道混元，道胎为仙，长生不老',
    cultivationBonus: 3.0,
    stages: [
      { name: '初入', minPower: 12000, maxPower: 14999, bonus: 1.0 },
      { name: '稳固', minPower: 15000, maxPower: 19999, bonus: 1.1 },
      { name: '圆满', minPower: 20000, maxPower: Infinity, bonus: 1.2 },
    ],
    breakthrough: null,  // 元婴暂无突破目标
  },
];

// 辅助函数
export function getCurrentRealm(spiritualPower: number): CultivationRealm { ... }
export function getRealmStage(spiritualPower: number, realm: CultivationRealm): ExplicitRealmStage { ... }
export function getRealmById(id: number): CultivationRealm { ... }
export function getNextRealm(currentRealmId: number): CultivationRealm | null { ... }
export function isCultivationFeatureEnabled(feature: CultivationFeature): boolean { ... }
export function canAttemptBreakthrough(spiritualPower: number, realm: CultivationRealm): boolean { ... }
```

### 3.3 辅助函数实现要点

```ts
// getRealmStage 使用显式阶段而非百分比四分位
export function getRealmStage(spiritualPower: number, realm: CultivationRealm): ExplicitRealmStage {
  if (realm.stages?.length) {
    return realm.stages.find(
      (s) => spiritualPower >= s.minPower && spiritualPower <= s.maxPower
    ) ?? realm.stages[0]!;
  }
  // 不应到达此处——所有境界都应有显式 stages
  throw new Error(`境界 ${realm.name} 缺少 stages 配置`);
}

// canAttemptBreakthrough: 胎息和练气永远返回 false
export function canAttemptBreakthrough(spiritualPower: number, realm: CultivationRealm): boolean {
  if (!realm.breakthrough) return false;
  if (realm.maxPower === Infinity) return spiritualPower >= 50000;
  return spiritualPower >= realm.maxPower;
}
```

### 3.4 数据兼容策略

**原则**：不改 MongoDB 字段名，只改显示口径和逻辑解释。

| 存储字段 | 保留 | 说明 |
|----------|------|------|
| `spiritualPower` | 是 | 内部字段不改，前台显示"修为" |
| `immortalStones` | 是 | 内部字段不改，前台显示"灵石" |
| `ascensions` | 是 | 遗留字段，不删除不宣传 |
| `immortalMarks` | 是 | 遗留字段，不删除不宣传 |
| `realm` | 是 | 存储值改为新境界名 |
| `realmStage` | 是 | 存储值改为新阶段名 |
| `realmId` | 是 | 存储值改为新境界 ID |

**迁移策略**：
- 提供迁移脚本，为旧用户补写 canonical 初始状态，不再按 `spiritualPower` 折算玄鉴境界
- canonical 初始状态统一从 `胎息 / 修为 0 / cultivationAttainment 0` 开始
- 迁移脚本支持 `--dry-run` 模式
- 不触碰 `ascensions`、`immortalMarks`、`immortalStones` 数值

### 3.5 服务层关键逻辑变更

#### CultivationService.getCultivationStatus

- 使用新配置的 `formatRealmDisplay` 获取境界显示
- 文案输出使用 `CULTIVATION_LABELS` 而非硬编码

#### CultivationService.awardCultivation

- 奖励文案：`仙石`→`灵石`，`灵力`→`修为`
- 使用 `CULTIVATION_LABELS` 动态获取文案

#### CultivationService.attemptBreakthrough

突破逻辑改为**收集检查 + 道基凝结**：

```ts
async attemptBreakthrough(userId: number): Promise<BreakthroughResult> {
  // ... 获取用户和当前境界 ...

  if (currentRealm.name === '胎息') {
    throw new Error('胎息阶段按灵轮推进，无需使用 /breakthrough。\n六轮养满如月后方可入练气。');
  }

  if (currentRealm.name === '练气') {
    throw new Error('练气各层按修为自动推进，无需使用 /breakthrough。\n达到九层后需收集指定宝物方可冲击仙基。');
  }

  // 检查是否满足收集要求
  const requirement = BREAKTHROUGH_REQUIREMENTS.find(r => r.targetRealm === nextRealm.name);
  if (!requirement) {
    throw new Error('暂无可突破的更高境界。');
  }

  const inventory = await this.getUserInventory(userId);
  const missingItems = checkMissingItems(inventory, requirement.requiredItems);
  if (missingItems.length > 0) {
    const hint = missingItems.map(m => `${m.category}(${m.tier}阶)×${m.minCount}`).join('、');
    throw new Error(`突破 ${nextRealm.name} 尚需收集：${hint}\n完成更多专注任务获取宝物吧！`);
  }

  // 计算成功率（基础率 + 额外收集物加成）
  const bonusRate = calculateBonusRate(inventory, requirement.bonusItems);
  const totalRate = Math.min(requirement.baseRate + bonusRate, 95);

  // 执行突破判定
  const success = Math.random() * 100 < totalRate;

  if (success) {
    // 凝结道基：根据收集的功法决定道基类型
    const technique = inventory.find(i => i.category === '功法' && !i.used);
    const foundationName = technique
      ? (FOUNDATION_BINDINGS[technique.name] ?? '无名道基')
      : '无名道基';

    // 消耗收集物
    await this.consumeBreakthroughItems(userId, requirement);

    return {
      success: true,
      message: `仙基凝结——${foundationName}！\n成功突破至${nextRealm.title}！`,
      foundation: { name: foundationName, realm: nextRealm.name, sourceTechnique: technique?.name },
    };
  } else {
    // 失败不消耗收集物，只扣修为
    return {
      success: false,
      message: `突破失败，修为有所散失。收集的宝物保留完好，下次再试吧。`,
      penalty: currentRealm.breakthrough?.failurePenalty ?? 0,
    };
  }
}
```

#### CultivationService.ascend

```ts
async ascend(userId: number): Promise<AscensionResult> {
  if (!isCultivationFeatureEnabled('ascension')) {
    throw new Error('当前玄鉴体系默认未启用飞升玩法。');
  }
  // ... 原有逻辑保留 ...
}
```

### 3.6 命令处理器文案变更要点

#### coreCommands.ts — `/start` 欢迎文案

```
修仙之路：
胎息（玄景→承明→周行→青元→玉京→灵初）
→ 练气（九层）
→ 筑基（铸就仙基）
→ 紫府（凝炼神通）
→ 金丹（煅成金性）
→ 元婴（道胎为仙）
```

#### taskCommands.ts — 任务完成奖励

```
修仙奖励: +${power}修为, +${stones}灵石

${encounterMessage}
// encounterMessage 示例：
// "你在修炼中偶得一枚【遂元丹】（黄阶·丹药）！"
// "此番修炼未有收获，再接再厉。"
```

任务完成时需调用 `EncounterService.rollEncounter(duration)` 判定奇遇掉落。

#### cultivationCommands.ts — 各命令

- `/realm`：显示 `灵石` 而非 `仙石`，显示 `修为` 而非 `灵力`
- `/breakthrough`：胎息/练气用户返回引导文案而非执行突破
- `/ascension`：返回"当前玄鉴体系默认未启用飞升玩法"
- `/stats`：使用新境界名和阶段名
- `/rank`：去除飞升榜（除非功能开启）

### 3.7 测试要求

#### 配置层测试

```ts
// 境界映射
expect(getCurrentRealm(0).name).toBe('胎息');
expect(getCurrentRealm(1000).name).toBe('练气');
expect(getCurrentRealm(2500).name).toBe('筑基');
expect(getCurrentRealm(5000).name).toBe('紫府');
expect(getCurrentRealm(8000).name).toBe('金丹');
expect(getCurrentRealm(12000).name).toBe('元婴');

// 胎息六轮
expect(getRealmStage(0, getCurrentRealm(0)).name).toBe('玄景');
expect(getRealmStage(723, getCurrentRealm(723)).name).toBe('灵初');

// 练气九层
expect(getRealmStage(1000, getCurrentRealm(1000)).name).toBe('一层');
expect(getRealmStage(2329, getCurrentRealm(2329)).name).toBe('九层');

// 筑基三层
expect(getRealmStage(2500, getCurrentRealm(2500)).name).toBe('初期');
expect(getRealmStage(4166, getCurrentRealm(4166)).name).toBe('后期');

// 功能开关
expect(isCultivationFeatureEnabled('ascension')).toBe(false);
expect(isCultivationFeatureEnabled('breakthrough')).toBe(true);
```

#### 服务层测试

```ts
// 胎息用户尝试突破
await expect(cultivationService.attemptBreakthrough(testUserId))
  .rejects.toThrow('胎息阶段按灵轮推进');

// 练气用户尝试突破
await expect(cultivationService.attemptBreakthrough(testUserId))
  .rejects.toThrow('练气各层按修为自动推进');

// 筑基用户未收集够宝物
await expect(cultivationService.attemptBreakthrough(testUserId))
  .rejects.toThrow('尚需收集');

// 筑基用户收集够宝物后突破成功
const result = await cultivationService.attemptBreakthrough(testUserId);
expect(result.success).toBe(true);
expect(result.foundation.name).toBeDefined();

// 飞升关闭
await expect(cultivationService.ascend(testUserId))
  .rejects.toThrow('当前玄鉴体系默认未启用飞升玩法');

// 奇遇掉落测试
const encounter = rollEncounter(50);  // 50分钟专注
// 应按 medium 概率表掉落
const noEncounter = rollEncounter(25);
// 30% 概率返回 null

// 卜卦增益测试
const buff: DivinationBuff = { categoryBoost: { 丹药: 0.15 }, tierBoost: { 玄: 0.10 }, expiresAfterNextFocus: true };
const rates = applyDivinationBuff(getDropRates(25), buff);
expect(rates['玄']).toBeGreaterThan(BASE_DROP_RATES['玄']);
```

#### 命令层测试

```ts
// /start 文案
expect(sendMessage).toHaveBeenCalledWith(
  userId,
  expect.stringContaining('胎息'),
  expect.any(Object)
);
expect(sendMessage).toHaveBeenCalledWith(
  userId,
  expect.not.stringContaining('大乘期'),
  expect.any(Object)
);

// /realm 文案
expect(sendMessage).toHaveBeenCalledWith(
  chatId,
  expect.stringContaining('灵石'),
);
expect(sendMessage).toHaveBeenCalledWith(
  chatId,
  expect.not.stringContaining('仙石'),
);

// /ascension 关闭
expect(sendMessage).toHaveBeenCalledWith(
  chatId,
  expect.stringContaining('未启用飞升玩法'),
);

// /breakthrough 胎息引导
expect(sendMessage).toHaveBeenCalledWith(
  chatId,
  expect.stringContaining('灵轮推进'),
);

// /breakthrough 未收集够宝物
expect(sendMessage).toHaveBeenCalledWith(
  chatId,
  expect.stringContaining('尚需收集'),
);

// /breakthrough 成功凝结道基
expect(sendMessage).toHaveBeenCalledWith(
  chatId,
  expect.stringContaining('仙基凝结'),
);
```

### 3.8 实施顺序

1. **类型 + 配置层**：重写 `cultivation.ts` 类型和配置，先写测试锁定目标行为
2. **奇遇掉落系统**：实现 `EncounterService`，含掉落概率表、专注时长影响、卜卦增益
3. **背包与收集系统**：实现 `UserInventory` 模型，`InventoryService` 管理宝物存取和消耗
4. **模型 + 服务层**：更新 `User` 默认值、`CultivationService` 突破逻辑（收集检查 + 道基凝结）
5. **迁移脚本**：创建 `scripts/migrate-cultivation-to-xuanjian.ts`（含 dry-run）
6. **命令处理器 + 文案**：更新所有 handler 中的文案
7. **全量验证**：typecheck + 全部测试 + dry-run 迁移

### 3.9 不触碰的文件

以下文件作为存档保留，不在本次迁移中修改：

- `docs/CULTIVATION_IMPLEMENTATION.md`
- `docs/INTEGRATION_COMPLETE.md`
- `docs/models-design.md`
- `docs/database-design.md`
- `docs/plans/2026-04-19-xuanjian-cultivation-migration-plan.md`（已有迁移计划，独立存档）

---

## 附录 A：关键原文引用索引

| 主题 | 证据来源 |
|------|----------|
| 六境总表 | `rag/xuanjian-clean/0007.txt` |
| 胎息六轮与灵窍 | `rag/xuanjian-clean/0011.txt` |
| 胎息三关 | `rag/xuanjian-clean/0019.txt` |
| 练气九层 | NotebookLM 查询"练气境界" |
| 筑基三层 | NotebookLM 查询"筑基境界" |
| 筑基突破仪式 | NotebookLM 查询"筑基境界" |
| 紫府突破机制 | `rag/xuanjian-clean/0726.txt` |
| 金丹阶段划分 | NotebookLM 查询"金丹境界" |
| 金丹突破条件 | NotebookLM 查询"金丹境界" |
| 元婴/道胎设定 | NotebookLM 查询"元婴境界" |
| 寿命阶梯 | NotebookLM 查询"修仙寿命体系" |
| 古称体系 | `rag/xuanjian-clean/0244.txt` |
| 灵石经济 | `rag/xuanjian-clean/0034.txt` |
| 道统三玄 | `rag/xuanjian-clean/0894.txt` |
| 功法品级与修行路径 | NotebookLM 查询"练气境界" |

## 附录 B：待确认项

以下内容在手册中标注为"待确认"，不建议直接写死进配置：

- 元婴内部阶段的 canonical 划分
- 三玄与玩家成长路径之间是否做直接映射
- 是否引入宗门/家族/道统阵营系统
- 功法系统是否做完整实现（影响仙基类型和战力）
- 灵物/宝药系统的完整道具表
- 练气三种修行路径（正法/大路货/杂气）是否做差异化实现
- 符种/灵窍三类起点是否做初始选择机制

## 附录 C：NotebookLM 查询记录

本次手册编写中通过 NotebookLM 查询了以下主题，所有回答均基于原文内容：

1. 金丹境界完整修炼体系（突破条件、阶段划分、能力、寿命）
2. 练气境界完整修炼体系（内部阶段、突破条件、能力、功法）
3. 筑基（仙基）境界完整信息（突破仪式、仙基类型、品级、寿命）
4. 元婴境界与高层设定（道胎/法相、寿命体系、飞升概念）

---

## V2 Phase A Runtime Foundations

Phase A 在不改变 V1 修炼主循环的前提下，为 V2 战斗和进阶系统建立了可扩展的承载层。

### 已启用的 V2 字段

以下字段已持久化到 `cultivation.canonical.state` 但不参与 V1 逻辑：

- `realmSubStageId` — 小阶标识；phase B 起由 `realmId + currentPower` 统一重算，并在状态读取、专注结算、破境、飞升时自动收敛
- `battleLoadout` — 战斗装备栏，默认含 `art.basic_guarding_hand`，不触发战斗求解
- `branchCultivationAttainments` — 分支修炼成就，空对象
- `cooldowns` — 冷却计时器，空对象
- `combatFlags` — 战斗标记，空对象
- `combatHistorySummary` — 战斗历史摘要，空数组

### Registry 与 Projection

`src/config/xuanjianV2Registry.ts` 提供最小 registry 和 runtime-ready projection：

- `getRealmSubStageById(id)` — 查找小阶定义
- `getRealmSubStagesByRealmId(realmId)` — 返回某一大境的小阶定义列表
- `resolveRealmSubStageId(realmId, currentPower)` — 根据大境和当前修为解析唯一合法小阶
- `formatRealmSubStageDisplay(state)` — 统一输出 `大境·小阶` 或大境 fallback 显示
- `getBattleArtRegistryEntry(id)` — 查找战技注册条目
- `getStarterBattleArtIds()` — 返回 starter 法门种子列表，供 canonical 初始态和 model 默认值复用
- `createDefaultBattleLoadoutState()` — 返回默认战斗构筑 seed，避免在 service/model 中散落 battleLoadout 字面量
- `projectBattleArtRuntimeProfile(id)` — 投影为 runtime-ready 战技配置
- `getRuntimeReadyContentBatch()` — 返回当前已可进入 runtime 的法门/神通批次清单，供 resolver、smoke 和后续内容扩池统一复用

Phase B 已将小阶扩展为：

- `胎息六轮`：`玄景 / 承明 / 周行 / 青元 / 玉京 / 灵初`
- `练气九层`：`一层` 至 `九层`
- `筑基三层`：`初层 / 中层 / 后层`

`紫府 / 金丹 / 元婴` 当前仍只显示大境名，不展示 fallback 小阶文案。完整战斗与槽位限制仍留到后续 phase。

## V2 Phase C Active Combat Runtime

Phase C 将 starter 级奇遇战接入了专注完成链路，但仍然保持 `V1` 的修为主循环不变。

### 新增运行时文件

- `src/types/cultivationCombat.ts` — 主动战斗的最小类型契约
- `src/config/xuanjianCombat.ts` — starter 战斗配置、敌方模板和文案 formatter
- `src/services/CombatStateAdapter.ts` — canonical 状态 -> 战斗快照
- `src/services/CombatResolver.ts` — 同 seed 可复现的最小求解器；动作池来源统一走 `getRuntimeReadyContentBatch()`，不再直接扫描 raw registry
- `src/services/CombatRewardBridge.ts` — 战斗胜负 -> canonical patch
- `src/services/CombatService.ts` — 奇遇战编排

### 当前 starter 奇遇战

- `combatEncounter.taixi.roadside_wolf`
- 敌方模板：`enemy.taixi.roadside_wolf`
- 胜利收益：`+3` 灵石、`+1` 道行
- 失败代价：`轻伤`、`-2` 灵石

### 当前用户可见表现

- `TaskCommandHandlers.handleCompleteTaskCallback()` 会在完成任务消息里追加斗法结果、对手和短战报
- 正式短战报不再是单一固定模板，而是由 `CombatResolver.buildOutcomeSummary()` 按 `玩家首个动作类型 + 敌方风格 + 胜负` 组合生成
- `CultivationCommandHandlers.handleRealmCommand()` 会在 `/realm` 输出当前伤势与最近一次斗法摘要
- `cultivation.canonical.state.combatHistorySummary` 目前只保留最近 `5` 条摘要

### 当前开发态手测入口

- `/dev_grant_art <id[,id...]>` — 仅测试环境可用，授予法门
- `/dev_grant_power <id[,id...]>` — 仅测试环境可用，授予神通
- `/dev_combat_detail on|off|status` — 仅测试环境可用，控制是否在完成任务消息里追加详细回合日志

### 伤势恢复闭环

- `injuryState` 不再只是战斗结果字段；有效专注会自动尝试疗伤
- 疗伤只影响本次修为收益，不影响道行
- 当前规则：单次有效专注最多恢复一档伤势，并吞掉 `floor(rawPowerGain * 0.5)` 的本次修为
- `cooldowns` 仍只保留字段，不参与本轮恢复玩法
