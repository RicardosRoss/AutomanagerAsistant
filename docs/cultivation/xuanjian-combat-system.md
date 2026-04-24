# 玄鉴仙族 · 战斗系统设计

> 定位：奇遇战斗子系统设计文档，为后续实现提供依据
> 日期：2026-04-20
> 前置文档：`xuanjian-encounter-codex.md`（奇遇掉落图鉴）

---

## 一、设计动机

当前奇遇系统存在两个问题：

1. **概念混淆**：法宝法器给 `修为+N%` 加成，但武器不应加速修炼，应提升战斗力
2. **缺乏博弈**：完成专注即得宝物，没有风险-收益决策

本设计将 **修为**（修炼进度）和 **战力**（战斗能力）分离为两个独立维度，并在奇遇中加入战斗守护者环节。

### 设计决策

| 决策点 | 选择 | 理由 |
|--------|------|------|
| 战力复杂度 | 战力总值 + 道统克制修正 | 核心简单，策略层有深度 |
| 失败惩罚 | 可能受伤 | 增加紧迫感但不打击积极性 |
| 敌人来源 | 原著命名风格模版 + 动态生成 | 有代入感又灵活 |

---

## 二、战力计算体系（四属性系统）

### 2.1 四大子属性

战力不再是单一数值，而是由四个子属性组成：

| 子属性 | 缩写 | 含义 | 影响范围 |
|--------|------|------|---------|
| 攻击 | 攻 | 杀伐、破坏、法术威力 | 战斗伤害 |
| 防御 | 防 | 护体、法盾、抗打击 | 战斗生存 |
| 神识 | 识 | 感知、探查、识破隐匿 | 先手判定、发现敌人 |
| 遁速 | 速 | 身法、飞行、逃脱 | 追击/逃跑成功率 |

### 2.2 战力组成

```
总战力 = 攻 + 防 + 识 + 速
有效战力 = 总战力 × 克制修正 × 同道统修正
```

战斗结算仍使用**总战力**（四个子属性之和），但子属性影响具体战斗细节：
- **识差**决定先手（识高者先攻）
- **攻 vs 防**决定伤害程度
- **速差**决定逃跑成功率

### 2.3 基础属性（由境界决定）

```typescript
const BASE_ATTRIBUTES: Record<string, { atk: number; def: number; per: number; spd: number }> = {
  '胎息': { atk: 3,  def: 3,  per: 2,  spd: 2  },  // 总=10
  '练气': { atk: 15, def: 15, per: 10, spd: 10 },   // 总=50
  '筑基': { atk: 60, def: 60, per: 40, spd: 40 },   // 总=200
  '紫府': { atk: 300, def: 300, per: 200, spd: 200 }, // 总=1000
  '金丹': { atk: 1500, def: 1500, per: 1000, spd: 1000 }, // 总=5000
};
```

| 境界 | 攻 | 防 | 识 | 速 | 总战力 |
|------|-----|-----|-----|-----|--------|
| 胎息 | 3 | 3 | 2 | 2 | 10 |
| 练气 | 15 | 15 | 10 | 10 | 50 |
| 筑基 | 60 | 60 | 40 | 40 | 200 |
| 紫府 | 300 | 300 | 200 | 200 | 1000 |
| 金丹 | 1500 | 1500 | 1000 | 1000 | 5000 |

### 2.4 装备属性贡献

法宝按类型将战力分配到不同子属性：

| 类型 | 攻 | 防 | 识 | 速 | 典型物品 |
|------|-----|-----|-----|-----|---------|
| 攻击类 | 70% | 10% | 10% | 10% | 剑、枪、弓、锏 |
| 防御类 | 10% | 70% | 10% | 10% | 盾、软甲、屏 |
| 探测类 | 10% | 10% | 60% | 20% | 镜、符 |
| 遁走类 | 10% | 10% | 20% | 60% | 飞梭、莲花座 |
| 辅助类 | 15% | 15% | 35% | 35% | 丹炉、符箓 |

```typescript
type ItemType = '攻击' | '防御' | '探测' | '遁走' | '辅助';

const ITEM_TYPE_DISTRIBUTION: Record<ItemType, { atk: number; def: number; per: number; spd: number }> = {
  '攻击': { atk: 0.7, def: 0.1, per: 0.1, spd: 0.1 },
  '防御': { atk: 0.1, def: 0.7, per: 0.1, spd: 0.1 },
  '探测': { atk: 0.1, def: 0.1, per: 0.6, spd: 0.2 },
  '遁走': { atk: 0.1, def: 0.1, per: 0.2, spd: 0.6 },
  '辅助': { atk: 0.15, def: 0.15, per: 0.35, spd: 0.35 },
};

function itemToAttributes(totalPower: number, type: ItemType): Attributes {
  const dist = ITEM_TYPE_DISTRIBUTION[type];
  return {
    atk: Math.floor(totalPower * dist.atk),
    def: Math.floor(totalPower * dist.def),
    per: Math.floor(totalPower * dist.per),
    spd: Math.floor(totalPower * dist.spd),
  };
}
```

**品阶总战力范围**（不变）：

| 品阶 | 总战力 | 说明 |
|------|--------|------|
| 凡阶 | +3 ~ +5 | 基础兵刃、储物袋等 |
| 黄阶 | +10 ~ +20 | 练气上品法器 |
| 玄阶 | +40 ~ +80 | 筑基极品 |
| 地阶 | +150 ~ +300 | 紫府重宝 |

### 2.5 主修功法属性贡献

> **核心修正**：功法是“平台层”，不是“主动技能层”。

在《玄鉴仙族》的战斗关系里，主修功法主要决定：

1. 修炼倍率与法力质量
2. 道统偏向与四维分布
3. 可承载的战斗法门数量
4. 紫府后的神通承载上限
5. 突破时的道基/仙基方向

V1 建议把功法的战斗贡献写成以下字段：

| 字段 | 作用 |
|------|------|
| `cultivationMultiplier` | 完成专注后的长期修炼倍率 |
| `combatBias` | 对 `攻/防/识/速` 的偏向分布 |
| `artSlots` | 可装备的战斗法门槽位上限 |
| `divinePowerSlots` | 可装备的神通槽位上限 |
| `foundationBind` | 突破时主导的道基/仙基 |
| `requiredAura` | 对应功法所需灵气/同源外物 |

**功法基准表（平台层）**：

| 品级 | 修炼倍率 | 基础战力 | 法门承载 |
|------|----------|----------|----------|
| 一品 | 1.00 | +5 | 1 |
| 二品 | 1.10 | +10 | 1 |
| 三品 | 1.25 | +15 | 2 |
| 四品 | 1.45 | +20 | 2 |
| 五品 | 1.75 | +30 | 3 |
| 六品 | 2.10 | +50 | 3 |
| 古法 | 原品级 × 1.10 ~ 1.20 | 取同品高档 | 同品 +1 |
| 秘法 | 原品级 × 0.85 ~ 0.95 | 取同品低档 | 同品 -1 |

说明：

1. 功法仍提供少量基础战力，但那是“法力底盘”，不是具体招式。
2. 战斗风格真正由后续装备的战斗法门/神通决定。
3. 高品功法的优势不只在倍率，也在可承载更多高阶法门和神通。

功法的四维分布仍由道统决定：
- 攻伐型道统（金、火、雷）: 攻60% 防10% 识15% 速15%
- 防御型道统（土、宝土）: 攻10% 防60% 识15% 速15%
- 感知型道统（太阴、水）: 攻15% 防15% 识50% 速20%
- 灵动型道统（风、霞光）: 攻15% 防15% 识20% 速50%

### 2.6 战斗法门与神通贡献

> **NotebookLM 校订（2026-04-20）**：原文战斗体系中，确实存在独立于主修功法之外的 `术法 / 兵术 / 身法 / 遁法 / 辅助秘法 / 神通` 层；“法门”一词本身是宽口径词，既可指战斗法门，也可指破境法门，因此游戏文档必须拆层。

**战斗法门分类**：

| 类别 | 作用 | 四维偏向 | 示例 |
|------|------|----------|------|
| 攻击术法/兵术 | 日常主要输出手段 | 攻主导 | `金光术`、`三分月流光`、`天乌并火` |
| 身法/遁法 | 抢先手、拉扯、脱战、追击 | 速/识主导 | `越河湍流步`、`云中金落`、`玄狡行走法` |
| 辅助/防御/疗伤法门 | 勘破、护体、破阵、恢复 | 防/识主导 | `清目灵瞳`、`心鼎消厄`、`玄闳术` |
| 准神通级法门 | 仍属法门，但表现已接近神通或规则技 | 攻/防/规则混合 | `上曜伏光`、`帝岐光`、`南帝玄擭法` |
| 神通 | 紫府后的独立高阶技能层 | 按神通类别单独处理 | `谒天门`、`君蹈危`、`昭澈心`、`大离书` |

**境界解锁建议**：

| 境界 | 战斗法门槽 | 神通槽 | 说明 |
|------|------------|--------|------|
| 胎息 | 0 ~ 1 | 0 | 仅基础小术或兵刃技 |
| 练气 | 2 | 0 | 主战法门 + 身法/辅助 |
| 筑基 | 3 | 0 | 可形成完整斗法构筑 |
| 紫府 | 3 | 1 | 第一神通入场 |
| 金丹 | 3 ~ 4 | 2 | 神通开始成为主构筑层 |

**神通分类**：

| 类别 | 含义 | 示例 |
|------|------|------|
| 术神通 | 以术法、镇压、轰杀、规则压制见长 | `谒天门`、`赤断镞`、`帝观元`、`长明阶`、`大离书` |
| 身神通 | 以搏杀、位移、近身、状态侵入见长 | `君蹈危`、`南惆水`、`千百身` |
| 命神通 | 以命数、因果、洞照、压制见长 | `昭澈心`、`不紫衣`、`请两忘`、`位从罗`、`顺平征` |
| 兼类神通 | 少数神通同时具备两类标签 | `洞泉声`（身 / 命兼具） |

补充约束：

1. 已在原文中明确定类的神通，才能进入玩家正式神通池。
2. `候神殊`、`长云暗`、`广准圣` 一类“具名但未明分类”的神通，应暂留在 NPC/BOSS 或资料态，不强行硬编码进玩家构筑。
3. 命神通不应简单建模为“另一种伤害技能”，更适合作为命数压制、领域光环、支配/剥夺类机制。

**道行放大原则**：

| 影响对象 | 原文体现 | 建模原则 |
|------|------|------|
| 战斗法门 | 高道行者学习复杂术法更快，古法类法门的发挥空间更依赖道行 | `schoolInsight` 负责同道统熟练度，`mainDaoLevel` 负责高阶法门与古法的最终倍率 |
| 主修功法 | 高阶古法与残卷组合需要足够道行才能理解与串联 | 道行不足时仅能获得功法底盘；达标后才解锁隐藏联动和额外法门槽 |
| 神通 | 入紫府后神通发挥越来越脱离主修功法，更多取决于个人道行 | 神通伤害/规则效果主要吃 `mainDaoLevel`，功法只保留道统匹配与承载上限作用 |

### 2.7 道基属性贡献

| 类型 | 战力加成 | 属性偏向 |
|------|---------|---------|
| 筑基道基 | +50 ~ +100 | 由道基类型决定 |
| 紫府仙基 | +200 ~ +500 | 由仙基属性决定 |

### 2.8 战斗中的子属性作用

```typescript
interface CombatDetails {
  // 先手判定
  firstStrike: 'player' | 'enemy';  // 识高者先手

  // 伤害计算
  damageRatio: number;  // 攻/防 比值决定伤害程度

  // 逃跑判定
  escapeSuccess: boolean;  // 速差决定逃跑成功率（基础95%，被克制时降低）
}

function resolveCombatDetails(player: Attributes, enemy: Attributes): CombatDetails {
  return {
    firstStrike: player.per >= enemy.per ? 'player' : 'enemy',
    damageRatio: player.atk / Math.max(enemy.def, 1),
    escapeSuccess: Math.random() < (0.95 + (player.spd - enemy.spd) * 0.01),
  };
}
```

> 注：核心战斗结算仍使用总战力对比（见第五节），子属性仅影响细节展示和特殊判定。

---

## 三、装备系统

### 3.1 装备槽位

```typescript
interface CombatProfile {
  mainTechnique?: string;    // 主修功法 — 平台层
  battleArts?: string[];     // 战斗法门列表（主动技能）
  movementArt?: string;      // 身法/遁法
  supportArt?: string;       // 辅助/防御/疗伤法门
  divinePowers?: string[];   // 神通列表（紫府后解锁）
  weapon?: string;           // 武器 — 1 槽位（攻击类法宝）
  armor?: string;            // 防具 — 1 槽位（防御类法宝）
  accessory?: string;        // 饰品 — 1 槽位（辅助类：飞梭/丹炉/符箓）
  element?: Element;         // 主属性（由功法或道基决定）
  foundation?: string;       // 道基/仙基
  mainDaoLevel?: number;     // 全局主道行
  schoolInsight?: number;    // 主修道统理解
}
```

**规则**：
- 最多同时装备 **1 部主修功法** + **3 件法宝** + 对应境界允许数量的战斗法门/神通
- 主修功法决定主属性（`element`），也决定突破时凝结的道基类型与技能承载上限
- 战斗法门负责常规斗法，神通负责紫府以上的高阶压制
- `schoolInsight` 对同道统法门和神通提供额外发挥加成
- `mainDaoLevel` 对高阶战斗法门和神通提供独立放大，紫府后其权重应逐步高于主修功法本身
- 同道统法宝与主修功法/战斗法门匹配时获得额外加成
- 已装备的宝物仍显示在背包中，标记为"已装备"

### 3.2 战斗技能分类

| 类型 | 说明 | 示例 |
|------|------|------|
| 主战法门 | 直接输出或压制敌方 | `金光术`、`三分月流光`、`天乌并火` |
| 身法/遁法 | 位移、拉扯、逃脱、追击 | `越河湍流步`、`云中金落`、`玄狡行走法` |
| 辅助秘法 | 勘破、护体、疗伤、破阵 | `清目灵瞳`、`心鼎消厄`、`玄闳术` |
| 神通 | 紫府后独立槽位技能 | `谒天门`、`君蹈危`、`昭澈心`、`洞泉声` |
| 破境法门 | 不进入战斗槽，用于突破流程 | `接引法`、`紫府化神通秘法`、`五行求金法` |

### 3.3 法宝分类

| 类型 | 说明 | 示例 |
|------|------|------|
| 攻击类 | 兵刃、法剑、弓、枪 | 青锋剑、蛟盘楹、杜若枪、月阙剑 |
| 防御类 | 护盾、软甲、阵盘 | 龟盾、元峨(白金软甲)、碧画天屏 |
| 辅助类 | 飞梭、丹炉、符箓、镜子 | 飞梭、宝象炉、问流光、授玄琉符 |

---

## 四、道统克制系统

### 4.1 属性类型

```typescript
type Element =
  // 五行
  | '水' | '火' | '土' | '金' | '木'
  // 特殊道统
  | '雷' | '太阴' | '明阳' | '寒炁' | '霞光' | '风' | '毒';
```

### 4.2 五行克制

```
        水
      ↗   ↘
  土         火
    ↑       ↓
  木         金
      ↘   ↗
```

```typescript
// 克制关系：key beats value
const FIVE_ELEMENT_BEATS: Record<string, string> = {
  '水': '火',
  '火': '金',
  '金': '木',
  '木': '土',
  '土': '水',
};

// 克制：+20% | 被克制：-20% | 无关系：±0%
function getAffinityModifier(attacker: Element, defender: Element): number {
  if (FIVE_ELEMENT_BEATS[attacker] === defender) return 1.2;  // 克制
  if (FIVE_ELEMENT_BEATS[defender] === attacker) return 0.8;  // 被克制
  return 1.0;  // 无关系
}
```

### 4.3 特殊道统克制

| 特殊道统 | 克制 | 被克制 |
|---------|------|--------|
| 雷 | 水 | 土 |
| 太阴 | 风 | 明阳 |
| 明阳 | 毒 | 太阴 |
| 寒炁 | 火（反向灭火） | 明阳 |
| 霞光 | 毒 | 寒炁 |
| 风 | 雷 | 太阴 |
| 毒 | 木 | 明阳 |

### 4.4 同道统加成

- 功法与法宝同道统 → **+10%** 有效战力
- 道基与功法同道统 → **+10%** 有效战力
- 同道统加成可叠加，最高 +20%

```typescript
function getSameElementBonus(profile: CombatProfile): number {
  let bonus = 1.0;
  if (profile.mainTechnique && profile.weapon && sameElement(profile.mainTechnique, profile.weapon)) {
    bonus += 0.1;
  }
  if (profile.foundation && profile.mainTechnique && sameElement(profile.foundation, profile.mainTechnique)) {
    bonus += 0.1;
  }
  return Math.min(bonus, 1.2); // 上限 +20%
}
```

---

## 五、战斗奇遇流程

### 5.1 总流程

```
专注任务完成
  ↓
奇遇判定（现有概率表不变）
  ↓ 获得（非一无所获）
随机生成宝物
  ↓
守护者判定（按宝物品阶）
  ├─ 无守护者 → 直接获得宝物
  └─ 有守护者 ↓
      生成敌人（根据品阶）
        ↓
      展示敌人信息
      「⚠️ 奇遇守护者出现！」
      「[敌人名称] · [境界] · [道统]」
      「估计战力: [范围]」
      「你的战力: [数值]」
        ↓
      玩家选择
      ├─ ⚔️ 战斗 → 战力对比结算
      └─ 🏃 逃跑 → 安全退出
```

### 5.2 守护者出现概率

| 宝物品阶 | 守护者概率 | 说明 |
|---------|-----------|------|
| 凡阶 | 30% | 常见宝物，守护者少 |
| 黄阶 | 50% | 较少宝物，半数有守护 |
| 玄阶 | 70% | 稀有宝物，多数有守护 |
| 地阶 | 90% | 极稀有宝物，几乎必有守护 |

### 5.3 战斗结算

```typescript
interface CombatResult {
  outcome: '大胜' | '险胜' | '惜败' | '大败';
  itemKept: boolean;         // 是否获得宝物
  bonusItem?: EncounterItem; // 大胜额外小奖
  injury?: InjuryLevel;      // 受伤等级
  powerDiff: number;         // 战力差（正=玩家强）
}

function resolveCombat(playerPower: number, enemyPower: number): CombatResult {
  const diff = (playerPower - enemyPower) / enemyPower; // 归一化差值

  if (diff > 0.3) return { outcome: '大胜', itemKept: true, bonusItem: rollLowTierItem() };
  if (diff > 0)   return { outcome: '险胜', itemKept: true };
  if (diff > -0.1) return { outcome: '惜败', itemKept: false, injury: '轻伤' };
  return { outcome: '大败', itemKept: false, injury: diff < -0.3 ? '重伤' : '中伤' };
}
```

| 战力差(vs敌人) | 结果 | 宝物 | 受伤 |
|---------------|------|------|------|
| > +30% | 大胜 | 获得 + 额外凡阶小奖 | 无 |
| 0% ~ +30% | 险胜 | 获得 | 无 |
| -10% ~ 0% | 惜败 | 无 | 轻伤 |
| < -10% | 大败 | 无 | 中伤 或 重伤 |
| < -30% | 惨败 | 无 | 重伤 |

### 5.4 逃跑

- **安全逃跑**：放弃宝物，不受伤
- **1% 概率被追上**：逃跑失败，受轻伤
- 逃跑不计入胜负统计

---

## 六、敌人生成系统

### 6.1 敌人类型权重

```typescript
const ENEMY_TYPE_WEIGHTS: Record<Tier, Record<EnemyType, number>> = {
  凡: { 妖兽: 0.60, 散修: 0.30, 邪修: 0.10 },
  黄: { 妖兽: 0.40, 散修: 0.40, 魔修: 0.20 },
  玄: { 妖兽: 0.30, 散修: 0.30, 魔修: 0.40 },
  地: { 妖兽: 0.20, 散修: 0.20, 魔修: 0.60 },
};
```

> 设计意图：低品阶主要是妖兽（修仙界底层威胁），高品阶越来越是魔修/邪修（修仙界真正危险的存在）。

### 6.2 敌人战力范围

```typescript
const ENEMY_POWER_RANGE: Record<Tier, [number, number]> = {
  凡: [5, 15],       // 胎息级妖兽/散修
  黄: [30, 80],      // 练气级
  玄: [120, 350],    // 筑基级
  地: [600, 2000],   // 紫府级
};
```

战力在范围内均匀随机，但**偏向玩家当前战力的 80%~120%**（保证有来有回，不出现碾压或必败）：

```typescript
function generateEnemyPower(tier: Tier, playerPower: number): number {
  const [min, max] = ENEMY_POWER_RANGE[tier];
  // 基准：玩家战力的 80%~120%
  const softMin = Math.max(min, Math.floor(playerPower * 0.8));
  const softMax = Math.min(max, Math.floor(playerPower * 1.2));
  return randomInRange(softMin, softMax);
}
```

### 6.3 妖兽命名模版

**原著风格分析**：

原著中的妖兽命名遵循 `[属性/颜色] + [动物]` 的简洁风格：
- 白猿、水猿、纹虎、狐妖、蛇蛟、雉
- 寒蟒、火鸦、雷鹰（推演风格）

**命名组件**：

| 组件类型 | 可选值 |
|---------|--------|
| 颜色前缀 | 白、黑、赤、青、碧、紫、金、银、苍、墨 |
| 属性前缀 | 寒、炎、幽、雷、毒、风、土、石、冰 |
| 动物 | 猿、虎、蛇、蛟、蟒、鹤、鹰、雕、狼、狐、雉、蜈、蝎、龟、蟾、豹、熊、蝠、蜂、蛛、鳄、犀、獒 |
| 后缀(可选) | _(无)、妖、兽、精、王 |

**生成规则**：

```typescript
// 模式1: [属性/颜色] + [动物] — 最常见
// 例: 白猿、寒蟒、紫蝎、金狼
function generateBeastName_v1(): string {
  return pickRandom([...COLOR_PREFIXES, ...ELEMENT_PREFIXES]) + pickRandom(ANIMALS);
}

// 模式2: [动物] + [后缀] — 低阶
// 例: 蛇蛟妖、蟒兽、狐精
function generateBeastName_v2(): string {
  return pickRandom(ANIMALS) + pickRandom(['妖', '兽', '精']);
}

// 模式3: [颜色] + [动物] + 王 — 高阶Boss
// 例: 白猿王、金狼王、紫蟒王
function generateBeastName_v3(): string {
  return pickRandom(COLOR_PREFIXES) + pickRandom(ANIMALS) + '王';
}
```

**各品阶使用模版**：

| 品阶 | 模版偏好 | 示例 |
|------|---------|------|
| 凡 | 模式2 为主 | 蛇妖、蟒兽、狐精 |
| 黄 | 模式1 为主 | 白猿、寒蟒、金狼 |
| 玄 | 模式1 + 偶尔模式3 | 紫蝎、雷鹰、碧蟾 |
| 地 | 模式3 为主 | 苍猿王、墨蛟王、赤虎王 |

### 6.4 散修命名模版

**原著风格分析**：

原著中散修命名多为 `[姓氏] + [名字]` 或 `[称号/描述] + [头衔]`：
- 丁威锃、夏绶鱼、管龚霄
- 灰衣修士、芒花子、青衣散人

**命名组件**：

| 组件类型 | 可选值 |
|---------|--------|
| 姓氏 | 陈、林、张、刘、赵、孙、周、吴、韩、方、谢、邵、潘、许、蒋、沈、杨、朱、秦、何、吕、孔、曹、严、华、魏、陶、姜、邹、岳、陆、范 |
| 名字(单字) | 元、清、长、风、紫、阳、明、远、静、虚、玄、真、太、初、峰、岩、云、天、海、山、月、星、辰、灵、浩、渊 |
| 名字(双字) | 元清、长风、紫阳、明远、静虚、玄真、太初、清风、碧落、青岩、苍海、孤峰、寒潭、明澈、玄光 |
| 描述 | 灰衣、青衣、白衣、赤脚、独臂、白发、盲眼、铁面 |
| 头衔 | 散人、道人、真人、子、居士 |

**生成规则**：

```typescript
// 模式1: [姓氏] + [名字] — 最常见
// 例: 陈元清、林长风、杨紫阳
function generateCultivatorName_v1(): string {
  return pickRandom(SURNAMES) + pickRandom(GIVEN_NAMES);
}

// 模式2: [描述] + [头衔] — 有特征的散修
// 例: 灰衣散人、白发道人、赤脚真人
function generateCultivatorName_v2(): string {
  return pickRandom(DESCRIPTIONS) + pickRandom(TITLES);
}

// 模式3: [姓氏] + [头衔] — 老辈散修
// 例: 谢子、方散人、韩真人
function generateCultivatorName_v3(): string {
  return pickRandom(SURNAMES) + pickRandom(TITLES);
}
```

### 6.5 魔修命名模版

**原著风格分析**：

原著中魔修命名带有黑暗/邪恶意味：
- 温遗（单名含遗恨之意）
- 血摩法书（功法名含血字）

**命名组件**：

| 组件类型 | 可选值 |
|---------|--------|
| 黑暗前缀 | 血、骨、阴、幽、煞、毒、冥、厉、怨、噬、厄、煞、瘴 |
| 黑暗名字 | 遗、灭、噬、噬、蚀、怨、殇、厄、烬、魇、谪 |
| 头衔 | 散人、魔修、道人、鬼修、妖修、邪师 |

**生成规则**：

```typescript
// 模式1: [姓氏] + [黑暗名字] — 魔道修士本名
// 例: 温遗、邹灭、沈噬
function generateDemonicName_v1(): string {
  return pickRandom(SURNAMES) + pickRandom(DARK_NAMES);
}

// 模式2: [黑暗前缀] + [头衔] — 江湖诨号
// 例: 血骨散人、阴煞道人、幽冥鬼修
function generateDemonicName_v2(): string {
  return pickRandom(DARK_PREFIXES) + pickRandom(TITLES);
}

// 模式3: [黑暗前缀] + [黑暗前缀] + [头衔] — 高阶魔修
// 例: 血煞冥道人、阴毒厉魔修
function generateDemonicName_v3(): string {
  return pickRandom(DARK_PREFIXES) + pickRandom(DARK_PREFIXES) + pickRandom(TITLES);
}
```

### 6.6 邪修命名模版

邪修介于散修和魔修之间，非正统但不完全邪恶：

```typescript
// 模式: [属性前缀] + [头衔] 或 [描述] + 修士
// 例: 火行邪修、蛇道人、毒雾散人
function generateHereticName(): string {
  return pickRandom(ELEMENT_PREFIXES) + pickRandom(['道人', '散人', '修士']);
}
```

### 6.7 敌人完整数据结构

```typescript
interface Enemy {
  name: string;           // 动态生成的名称
  type: EnemyType;        // 妖兽 | 散修 | 魔修 | 邪修
  realm: string;          // 境界（根据品阶决定）
  element: Element;       // 道统属性（随机）
  combatPower: number;    // 战力（在范围内随机，偏向玩家战力附近）
  description: string;    // 简短描述（模版化生成）
}

type EnemyType = '妖兽' | '散修' | '魔修' | '邪修';

// 品阶 → 敌人境界映射
const TIER_TO_ENEMY_REALM: Record<Tier, string[]> = {
  凡: ['胎息'],
  黄: ['练气'],
  玄: ['筑基'],
  地: ['紫府'],
};
```

### 6.8 敌人描述模版

```typescript
const ENEMY_DESCRIPTION_TEMPLATES = {
  妖兽: [
    '一头{size}的{color}{animal}，{behavior}',
    '{animal}{suffix}，{element}之气环绕周身，{threat}',
  ],
  散修: [
    '一名{appearance}的{realm}散修，{weapon}',
    '{title}{name}，{element}修士，{attitude}',
  ],
  魔修: [
    '浑身{darkFeature}的{realm}魔修，{threat}',
    '{title}{name}，{element}魔气外泄，{threat}',
  ],
  邪修: [
    '面容{faceFeature}的{realm}邪修，{behavior}',
    '{title}{name}，{element}邪法，{attitude}',
  ],
};

// 示例输出：
// "一头庞大的白色巨蟒，寒冰之气环绕周身，正向你嘶嘶吐信"
// "灰衣散人，练气修士，手持一柄锈迹斑斑的法剑"
// "浑身血气的筑基魔修，目露凶光直冲你而来"
```

---

## 七、受伤与恢复系统

### 7.1 受伤等级

```typescript
type InjuryLevel = '轻伤' | '中伤' | '重伤';

interface InjuryState {
  level: InjuryLevel;
  turnsRemaining: number;   // 还需要几次专注完成才能恢复
  appliedAt: Date;           // 受伤时间
}

const INJURY_EFFECTS: Record<InjuryLevel, {
  cultivationMalus: number;    // 修为获取减少比例
  encounterMalus: number;      // 奇遇概率减少比例
  recoveryTurns: number;       // 恢复所需专注完成次数
}> = {
  轻伤: { cultivationMalus: 0.3, encounterMalus: 0,    recoveryTurns: 1 },
  中伤: { cultivationMalus: 0.5, encounterMalus: 0.25, recoveryTurns: 2 },
  重伤: { cultivationMalus: 0.8, encounterMalus: 0.50, recoveryTurns: 3 },
};
```

| 受伤等级 | 修为获取 | 奇遇概率 | 恢复专注次数 | 触发条件 |
|---------|---------|---------|------------|---------|
| 轻伤 | -30% | 不变 | 1 次 | 惜败（战力差 -10%~0%） |
| 中伤 | -50% | -25% | 2 次 | 大败（战力差 -10%~-30%） |
| 重伤 | -80% | -50% | 3 次 | 惨败（战力差 < -30%） |

### 7.2 受伤叠加规则

- **不叠加**：已有伤势时再次受伤，只保留更严重的等级
- 已有中伤 + 新受轻伤 = 保持中伤
- 已有轻伤 + 新受中伤 = 升级为中伤（重置恢复计数）
- 已有中伤 + 新受重伤 = 升级为重伤（重置恢复计数）

### 7.3 恢复方式

**自然恢复**：
- 每完成一次专注任务，`turnsRemaining` 减 1
- 减至 0 时自动痊愈

**丹药治疗**：

```typescript
const HEALING_ITEMS: Record<string, InjuryLevel> = {
  // 凡阶丹药 → 治疗轻伤
  '蛇元丹': '轻伤',
  '明心丹': '轻伤',
  // 黄阶丹药 → 治疗中伤
  '续救灵丹二解': '中伤',
  '三全破境丹': '轻伤',  // 也能治轻伤
  // 玄阶及以上 → 治疗重伤
  '梦泽草': '重伤',       // 灵材
  '三枝湫心叶': '重伤',   // 地阶灵材
};
```

使用治疗丹药：
- 必须拥有对应丹药
- 消耗丹药（从背包移除）
- 立即痊愈，清除所有伤势

### 7.4 受伤对战力的影响

受伤**不降低战力**，但：
- 轻伤：不影响战斗能力
- 中伤：战力 -10%（带伤上阵）
- 重伤：战力 -20%（强撑作战）

```typescript
function applyInjuryToCombatPower(basePower: number, injury?: InjuryState): number {
  if (!injury) return basePower;
  const malus = { '轻伤': 1.0, '中伤': 0.9, '重伤': 0.8 };
  return Math.floor(basePower * (malus[injury.level] ?? 1.0));
}
```

> 设计意图：受伤主要影响修为获取（惩罚不够谨慎的玩家），对战斗能力影响较小（避免雪球效应）。

---

## 八、战斗构筑与效果字段

> **核心修正**：
> 1. 把 `功法 / 战斗法门 / 神通 / 法器 / 破境法门` 五层职责拆开
> 2. 功法回到平台层，法门与神通回到主动技能层
> 3. 道行通过全局道行与道统理解两层，影响技能发挥

### 8.1 效果类型总表

| 效果 | 字段名 | 适用类别 | 说明 |
|------|--------|---------|------|
| 基础修为倍率 | `cultivationMultiplier` | 主修功法 | 完成专注后结算的长期修炼倍率 |
| 战力+N | `combatPower` | 功法、法门、法器、神通 | 装备或配置后提升总战力 |
| 功法偏向 | `combatBias` | 主修功法 | 决定四维分布倾向 |
| 法门类别 | `artCategory` | 战斗法门 | 攻击 / 身法 / 遁法 / 辅助 |
| 神通类别 | `divinePowerType` | 神通 | 术神通 / 身神通 / 命神通 |
| 道行缩放 | `daoInsightScaling` | 法门、神通 | 受 `mainDaoLevel` 与 `schoolInsight` 放大 |
| 突破+N% | `breakthroughBonus` | 丹药、灵材、破境法门 | 作为额外准备物提升突破稳定性 |
| 治疗 | `healingPower` | 丹药、灵材、辅助法门 | 治愈对应等级伤势 |
| 特效 | `specialEffect` | 法门、神通、法器 | 战斗中的特殊机制 |
| 道统决定 | `foundationBind` | 主修功法 | 突破时决定凝结的道基/仙基 |
| 灵气要求 | `requiredAura` | 功法、破境法门 | 所需灵气/同源外物 |
| 破境标记 | `isBreakthroughMethod` | 破境法门 | 明确不进入战斗槽位 |

### 8.2 各类别职责分布

| 类别 | 核心职责 | 典型字段 |
|------|----------|----------|
| 丹药灵药 | 资粮、治疗、突破辅助 | `cultivationXP`、`healingPower`、`breakthroughBonus` |
| 灵材 | 资粮、突破引材、炼制材料 | `cultivationXP`、`requiredAura`、`craftingMaterial` |
| 法宝法器 | 放大战斗四维与特效 | `combatPower`、`specialEffect` |
| 主修功法 | 修炼倍率、道统、承载上限 | `cultivationMultiplier`、`combatBias`、`artSlots`、`divinePowerSlots` |
| 战斗法门 | 常规主动技能构筑 | `artCategory`、`combatPower`、`daoInsightScaling` |
| 神通 | 紫府后的独立主动技能层 | `divinePowerType`、`combatPower`、`daoInsightScaling` |
| 破境法门 | 突破准备层 | `breakthroughBonus`、`requiredAura`、`isBreakthroughMethod` |

### 8.3 主修功法的战斗字段

主修功法在战斗文档里只保留平台层职责：

| 品级 | `cultivationMultiplier` | `combatPower` | `artSlots` | `divinePowerSlots` |
|------|-------------------------|---------------|------------|--------------------|
| 一品 | 1.00 | +5 | 1 | 0 |
| 二品 | 1.10 | +10 | 1 | 0 |
| 三品 | 1.25 | +15 | 2 | 0 |
| 四品 | 1.45 | +20 | 2 | 0 |
| 五品 | 1.75 | +30 | 3 | 1 |
| 六品 | 2.10 | +50 | 3 | 1 |
| 古法 | 原品级 × 1.10 ~ 1.20 | 同品高档 | +1 | 同品 +1 |
| 秘法 | 原品级 × 0.85 ~ 0.95 | 同品低档 | -1 | 不额外提供 |

### 8.4 战斗法门的战力表达

战斗法门不再并进功法条目中，而是作为独立技能池处理：

| 类别 | 主要作用 | 建议四维偏向 | 代表性条目 |
|------|----------|--------------|------------|
| 攻击术法/兵术 | 正面输出、破防、轰杀 | 攻60% 识20% 速20% | `金光术`、`三分月流光`、`天乌并火` |
| 身法/遁法 | 追击、脱战、抢先手 | 速60% 识25% 攻15% | `越河湍流步`、`云中金落`、`玄狡行走法` |
| 辅助秘法 | 勘破、护体、疗伤、破阵 | 识45% 防35% 速20% | `清目灵瞳`、`心鼎消厄`、`玄闳术` |
| 准神通级法门 | 规则压制、极限破法、替伤锁血 | 攻/防/规则混合 | `上曜伏光`、`帝岐光`、`分神异体` |

### 8.5 神通的战力表达

神通只在紫府及以上出现，且不与普通法门共享定位：

| 神通类别 | 作用 | 代表性条目 |
|----------|------|------------|
| 术神通 | 规则压制、镇杀、场域干预 | `谒天门`、`赤断镞`、`帝观元`、`大离书` |
| 身神通 | 近身搏杀、突进、位移侵袭 | `君蹈危`、`南惆水`、`千百身` |
| 命神通 | 命数洞照、因果锁定、压制探查 | `昭澈心`、`请两忘`、`位从罗`、`顺平征` |
| 兼类神通 | 同时占据两类标签 | `洞泉声` |

未明分类的具名神通，如 `候神殊`、`长云暗`、`广准圣`，不建议直接进入玩家可配装神通池。

### 8.6 道行联动

战斗法门与神通都应显式受道行影响：

1. `mainDaoLevel`
   影响通用战斗发挥、法门熟练度、突破稳定性，且紫府后应成为神通的主缩放轴。

2. `schoolInsight`
   仅放大同主修道统的法门与神通效果，并决定复杂机制与高阶古法是否解锁完全形态。

V1 建议：

| 来源 | 建议乘区 |
|------|----------|
| `mainDaoLevel` | 每阶段 +3% ~ +6% |
| `schoolInsight` | 每阶段 +4% ~ +8% |
| 总上限 | 控制在 1.35 ~ 1.50 |

---

## 九、更新后的数据结构

### 9.1 子属性

```typescript
interface Attributes {
  atk: number;  // 攻击
  def: number;  // 防御
  per: number;  // 神识
  spd: number;  // 遁速
}

// 总战力 = 攻 + 防 + 识 + 速
function totalPower(attr: Attributes): number {
  return attr.atk + attr.def + attr.per + attr.spd;
}
```

### 9.2 物品效果

```typescript
interface EncounterItemEffect {
  cultivationXP?: number;       // 固定修为值（资粮型丹药/灵材）
  cultivationMultiplier?: number; // 主修功法的长期修炼倍率
  breakthroughBonus?: number;   // 突破成功率加成（百分比）
  combatPower?: number;         // 总战力加成（法门/神通/法宝/功法）
  combatBias?: Partial<Attributes>; // 功法提供的四维偏向
  itemType?: ItemType;          // 法宝类型（决定子属性分布）
  artCategory?: '攻击术法' | '兵术' | '身法' | '遁法' | '辅助秘法';
  divinePowerType?: '术神通' | '身神通' | '命神通';
  daoInsightScaling?: number;   // 道行对该技能的加成系数
  artSlots?: number;            // 功法可承载的战斗法门槽位
  divinePowerSlots?: number;    // 功法可承载的神通槽位
  specialEffect?: string;       // 战斗特效描述
  streakProtection?: boolean;   // 链条保护
  durationBonus?: number;       // 专注时长加成
  healingPower?: InjuryLevel;   // 治疗能力（丹药/灵材）
  craftingMaterial?: boolean;   // 可用于炼制
  foundationBind?: string;      // 道基绑定（功法）
  requiredAura?: string | string[]; // 所需灵气/同源外物
  isBreakthroughMethod?: boolean;   // 是否属于破境法门
}

type ItemType = '攻击' | '防御' | '探测' | '遁走' | '辅助';
```

### 9.3 战斗档案

```typescript
interface CombatProfile {
  mainTechnique?: string;       // 主修功法名称
  battleArts?: string[];        // 已装配的战斗法门
  movementArt?: string;         // 身法/遁法
  supportArt?: string;          // 辅助法门
  divinePowers?: string[];      // 已装配的神通
  weapon?: string;              // 装备武器名称
  armor?: string;               // 装备防具名称
  accessory?: string;           // 装备饰品名称
  element?: Element;            // 主属性
  foundation?: string;          // 道基/仙基名称
  mainDaoLevel?: number;        // 全局主道行
  schoolInsight?: number;       // 主修道统理解
}

interface InjuryState {
  level: InjuryLevel;
  turnsRemaining: number;
  appliedAt: Date;
}

type InjuryLevel = '轻伤' | '中伤' | '重伤';
type EnemyType = '妖兽' | '散修' | '魔修' | '邪修';
```

### 9.4 战斗结果

```typescript
interface CombatResult {
  outcome: '大胜' | '险胜' | '惜败' | '大败';
  itemKept: boolean;
  bonusItem?: EncounterItem;
  injury?: InjuryLevel;
  powerDiff: number;
  enemy: Enemy;
  details: CombatDetails;       // 子属性细节
}

interface CombatDetails {
  firstStrike: 'player' | 'enemy';  // 识高者先手
  damageRatio: number;               // 攻/防比值
  escapeChance: number;              // 逃跑成功率
  activeEffects: string[];           // 生效的特效列表
}

interface EncounterWithCombatResult {
  item: EncounterItem;
  guardian?: Enemy;
  combatResult?: CombatResult;
  playerEscaped?: boolean;
}
```

### 9.5 敌人

```typescript
interface Enemy {
  name: string;
  type: EnemyType;
  realm: string;
  element: Element;
  combatPower: number;
  attributes: Attributes;       // 敌人也有子属性
  description: string;
}
```

---

## 十、与现有系统的集成点

### 10.1 奇遇流程集成

```
现有流程:
  专注完成 → rollEncounter() → EncounterItem | null

新流程:
  专注完成 → rollEncounter() → EncounterWithCombatResult
    1. 判定是否获得宝物（现有概率表）
    2. 判定是否有守护者（守护者概率表）
    3. 如有守护者 → 生成敌人 → 等待玩家操作（战斗/逃跑）
    4. 战斗 → 结算 → 返回完整结果
```

### 10.2 专注奖励集成

```
现有流程:
  专注完成 → awardCultivation(duration) → CultivationReward

新流程:
  专注完成 → 计算修为（含受伤减成）
         → 奇遇判定（含受伤减成）
         → 奇遇战斗（如触发）
         → 受伤恢复计数 -1
         → 返回综合结果
```

### 10.3 Telegram Bot 交互流程

```
用户完成专注任务
  ↓
Bot 发送:
「✅ 专注完成！获得修为 +XX」
「🎉 恭喜发现 [宝物名称]！([品阶]阶 [类别])」
  ↓ (如有守护者)
「⚠️ 突然，[敌人名称] 拦住去路！」
「   [敌人描述]」
「   估计战力: XX | 你的战力: XX」
「」
「⚔️ /fight — 战斗夺宝」
「🏃 /flee  — 放弃逃跑」
  ↓
用户选择后 → Bot 发送战斗结果
```

---

## 附录：命名组件完整列表

### A.1 妖兽命名组件

```
颜色前缀: 白 黑 赤 青 碧 紫 金 银 苍 墨
属性前缀: 寒 炎 幽 雷 毒 风 土 石 冰 雾
动物名:   猿 虎 蛇 蛟 蟒 鹤 鹰 雕 狼 狐 雉
          蜈 蝎 龟 蟾 豹 熊 蝠 蜂 蛛 鳄 犀 獒
后缀:     妖 兽 精 王
```

### A.2 散修命名组件

```
姓氏:   陈 林 张 刘 赵 孙 周 吴 韩 方 谢 邵 潘 许
        蒋 沈 杨 朱 秦 何 吕 孔 曹 严 华 魏 陶 姜
        邹 岳 陆 范 苏 章 鲁 马 丁 邓 萧 袁 叶
名字1:  元 清 长 风 紫 阳 明 远 静 虚 玄 真 太 初
        峰 岩 云 天 海 山 月 星 辰 灵 浩 渊 霖 柏 松
名字2:  元清 长风 紫阳 明远 静虚 玄真 太初 清风
        碧落 青岩 苍海 孤峰 寒潭 明澈 玄光 白云
描述:   灰衣 青衣 白衣 赤脚 独臂 白发 盲眼 铁面
        破衫 蓬头 瘦骨 满面红光
头衔:   散人 道人 真人 子 居士
```

### A.3 魔修命名组件

```
黑暗前缀: 血 骨 阴 幽 煞 毒 冥 厉 怨 噬 厄 瘴
黑暗名字: 遗 灭 噬 蚀 怨 殇 厄 烬 魇 谪 噬 渊
头衔:     散人 魔修 道人 鬼修 妖修 邪师
```

### A.4 邪修命名组件

```
属性前缀: 火 水 土 冰 风 雾 蛇 毒 蛊 蛰
描述:     半面 独眼 驼背 枯瘦
头衔:     道人 散人 修士 妖人
```
