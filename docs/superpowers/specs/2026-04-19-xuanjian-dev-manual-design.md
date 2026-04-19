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
- **需要条件**：五品或六品以上功法 + 仙基温养圆满 + 紫府灵物/宝药（如紫明丹、明方天石）
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
  - 采用"水火相济"或"五行求金法"等古法，将五道神通作为柴火燃烧锤炼凝聚金性灵光
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

| 突破点 | 机制类型 | 实现方式 |
|--------|----------|----------|
| 胎息六轮间 | 线性推进，不走随机渡劫 | 灵力达到阈值自动晋升下一轮，无需 `/breakthrough` |
| 练气各层间 | 线性推进 | 灵力达到阈值自动晋升下一层 |
| 练气→筑基 | 资源+条件驱动 | 需要：灵石+筑基丹+功法条件，用户主动触发 |
| 筑基→紫府 | 高风险事件 | 三重死关独立判定，每关通过/失败各有结果 |
| 紫府→金丹 | 长期积累+仪式 | 需修满条件+宝药+观礼事件，成功率极低 |
| 金丹→元婴 | 终局目标 | 保留为远期目标，暂不实现具体机制 |

### 2.3 资源体系映射

| 旧系统 | 新系统 | 说明 |
|--------|--------|------|
| `仙石` (immortalStones) | `灵石` | 显示文案切换，字段名不改 |
| `灵力` (spiritualPower) | `修为` | 前台文案用"修为"，内部字段不改 |
| 无 | `月华` | 修炼收益的可视化概念（可选扩展） |
| 无 | `功法` | 影响仙基类型和战力（可选扩展） |
| 无 | `灵物/宝药` | 突破辅助道具（可选扩展） |

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

### 3.1 核心文件变更清单

#### 类型和配置层

| 文件 | 变更类型 | 关键改动 |
|------|----------|----------|
| `src/types/cultivation.ts` | 重构 | 新增 `ExplicitRealmStage`、`CultivationLabels`、`CultivationFeature` 类型 |
| `src/config/cultivation.ts` | 重写 | 九境→六境 + 异构阶段 + 功能开关 + 文案标签 |
| `src/types/services.ts` | 修改 | 突破结果类型按境界区分，ascension 条件化 |

#### 持久化和行为层

| 文件 | 变更类型 | 关键改动 |
|------|----------|----------|
| `src/models/User.ts` | 修改 | 默认境界→胎息/玄景，保留 `immortalStones`/`ascensions` 不改名 |
| `src/models/DivinationHistory.ts` | 修改 | 显示文案 `仙石`→`灵石` |
| `src/services/CultivationService.ts` | 重构 | 突破逻辑按境界分支，飞升功能默认关闭 |

#### 命令处理和文案层

| 文件 | 变更类型 | 关键改动 |
|------|----------|----------|
| `src/handlers/cultivationCommands.ts` | 修改 | 全部切换玄鉴口径，`/ascension` 返回"未启用" |
| `src/handlers/coreCommands.ts` | 修改 | 欢迎文案→六境，去除飞升终局 |
| `src/handlers/taskCommands.ts` | 修改 | 奖励文案：`仙石`→`灵石`，`灵力`→`修为` |

#### 迁移工具

| 文件 | 变更类型 | 关键改动 |
|------|----------|----------|
| `package.json` | 修改 | 添加 `migrate:cultivation:xuanjian` 脚本 |
| `scripts/migrate-cultivation-to-xuanjian.ts` | 新建 | dry-run 模式的境界重映射脚本 |

#### 测试

| 文件 | 变更类型 | 关键改动 |
|------|----------|----------|
| `tests/unit/config/cultivation.test.ts` | 重写 | 六境 + 胎息六轮 + 练气九层 + 筑基三层断言 |
| `tests/cultivation.test.ts` | 重写 | 服务层新行为断言 |
| `tests/unit/handlers/coreCommands.test.ts` | 修改 | 欢迎文案断言 |
| `tests/unit/handlers/cultivationCommands.test.ts` | 新建 | 命令文案断言 |

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
- 提供迁移脚本，根据 `spiritualPower` 重新计算境界和阶段归属
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

新增境界守卫逻辑：

```ts
async attemptBreakthrough(userId: number): Promise<BreakthroughResult> {
  // ... 获取用户和当前境界 ...

  if (currentRealm.name === '胎息') {
    throw new Error('胎息阶段按灵轮推进，无需使用 /breakthrough。\n六轮养满如月后方可入练气。');
  }

  if (currentRealm.name === '练气') {
    throw new Error('练气各层按修为自动推进，无需使用 /breakthrough。\n达到九层后需准备筑基丹和功法方可冲击仙基。');
  }

  // 筑基及以上的突破逻辑
  // ...
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
```

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

// 飞升关闭
await expect(cultivationService.ascend(testUserId))
  .rejects.toThrow('当前玄鉴体系默认未启用飞升玩法');

// 奖励文案不含旧关键词
const reward = await cultivationService.awardCultivation(testUserId, 25);
// 检查返回的文案字段
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
```

### 3.8 实施顺序

1. **类型 + 配置层**：重写 `cultivation.ts` 类型和配置，先写测试锁定目标行为
2. **模型 + 服务层**：更新 `User` 默认值、`CultivationService` 逻辑分支
3. **迁移脚本**：创建 `scripts/migrate-cultivation-to-xuanjian.ts`（含 dry-run）
4. **命令处理器 + 文案**：更新所有 handler 中的文案
5. **全量验证**：typecheck + 全部测试 + dry-run 迁移

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
