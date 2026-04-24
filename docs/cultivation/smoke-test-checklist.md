# 真实 Telegram 冒烟测试 Checklist

> staging smoke test，验证修仙系统在真实 TG 环境中的端到端流程。
> 不替代本地自动化测试，作为上线前的最终确认。

---

## 0. 环境准备

### 0.1 独立测试环境

```bash
# 用测试 bot token 启动，避免污染正式数据
BOT_TOKEN=<测试bot_token> \
MONGODB_URI=mongodb://127.0.0.1:27017/automanager-smoke \
REDIS_HOST=127.0.0.1 \
REDIS_PORT=6379 \
NODE_ENV=development \
yarn dev
```

### 0.2 前置检查

| # | 检查项 | 预期 | 结果 |
|---|--------|------|------|
| 0.1 | Mongo 连接正常 | 日志无连接错误 | ☐ |
| 0.2 | Redis 连接正常 | 日志无连接错误 | ☐ |
| 0.3 | Bot polling 启动 | 日志显示 "polling" 或类似 | ☐ |
| 0.4 | 无 409 Conflict | 只启动一个实例 | ☐ |

### 0.3 清理测试数据（每次冒烟前执行）

```bash
# 连接 smoke 数据库
mongosh mongodb://127.0.0.1:27017/automanager-smoke

# 删除测试用户（用你自己的 TG ID 替换）
db.users.deleteOne({ userId: <你的TG_USER_ID> })

# 确认已删除
db.users.countDocuments({ userId: <你的TG_USER_ID> })
# 预期: 0
```

---

## 1. /start — 用户初始化

### 操作
私聊测试 bot，发送 `/start`

### 预期 TG 回复
- 显示欢迎消息
- 用户被创建并初始化

### DB 核对

```javascript
// mongosh 查询
const u = db.users.findOne({ userId: <TG_USER_ID> })

// 关键字段 & 预期值
check = {
  // legacy shell
  "cultivation.realm": "炼气期",          // legacy 默认
  "cultivation.realmId": 1,               // legacy 默认
  "cultivation.spiritualPower": 0,
  "cultivation.immortalStones": 0,

  // canonical state
  "cultivation.canonical.schemaVersion": 1,
  "cultivation.canonical.state.realmId": "realm.taixi",    // 胎息
  "cultivation.canonical.state.currentPower": 0,
  "cultivation.canonical.state.cultivationAttainment": 0,
  "cultivation.canonical.state.mainMethodId": "method.starter_tuna",  // 玄门吐纳法
  "cultivation.canonical.state.mainDaoTrack": "universal",
  "cultivation.canonical.state.foundationId": "foundation.unshaped",
  "cultivation.canonical.state.focusStreak": 0,

  // known arts
  "cultivation.canonical.state.knownBattleArtIds": ["art.basic_guarding_hand", "art.cloud_step"],
  "cultivation.canonical.state.equippedBattleArtIds": ["art.basic_guarding_hand", "art.cloud_step"],

  // empty collections
  "cultivation.canonical.state.knownDivinePowerIds": [],
  "cultivation.canonical.state.equippedDivinePowerIds": [],
  "cultivation.canonical.inventory": [],

  // stats
  "cultivation.ascensions": 0,
  "cultivation.breakthroughSuccesses": 0,
  "cultivation.breakthroughFailures": 0,
  "cultivation.divinationCount": 0,
}
```

| # | 字段 | 预期 | 实际 | Pass |
|---|------|------|------|------|
| 1.1 | `cultivation.canonical.state.realmId` | `"realm.taixi"` | | ☐ |
| 1.2 | `cultivation.canonical.state.currentPower` | `0` | | ☐ |
| 1.3 | `cultivation.canonical.state.cultivationAttainment` | `0` | | ☐ |
| 1.4 | `cultivation.canonical.state.mainMethodId` | `"method.starter_tuna"` | | ☐ |
| 1.5 | `cultivation.canonical.state.knownBattleArtIds` | `["art.basic_guarding_hand", "art.cloud_step"]` | | ☐ |
| 1.6 | `cultivation.canonical.inventory` | `[]` | | ☐ |
| 1.7 | `cultivation.immortalStones` | `0` | | ☐ |

---

## 2. /realm — 查看修仙状态

### 操作
发送 `/realm`

### 预期 TG 回复
- 显示当前境界（胎息）、修为（0）、道行（0）、主修功法（玄门吐纳法）、灵石（0）
- **关键确认**：新用户显示为「胎息」起点，而非旧九境残留状态

| # | 检查项 | 预期 | 实际 | Pass |
|---|--------|------|------|------|
| 2.1 | 回复消息正常 | 无报错 | | ☐ |
| 2.2 | 境界显示 | 胎息 | | ☐ |
| 2.3 | 修为显示 | 0 | | ☐ |
| 2.4 | 道统显示 | `☯️ 当前道统：通用` | | ☐ |
| 2.5 | 功法显示 | 玄门吐纳法 | | ☐ |
| 2.6 | 灵石显示 | 0 | | ☐ |
| 2.7 | 无旧九境残留 | 不显示 炼气期/筑基期 等 | | ☐ |

### 2.1 道统状态补充检查

| # | 检查项 | 预期 | 实际 | Pass |
|---|--------|------|------|------|
| 2.A | 练气前道统状态 | `☯️ 当前道统：通用` | | ☐ |
| 2.B | 筑基后道统状态 | `☯️ 当前主道统：明阳 / 离火 / 兑金 / 牝水 / 正木` | | ☐ |
| 2.C | 匹配主道统内容 | 专注修为或战斗 bias 出现专项加成 | | ☐ |
| 2.D | 未匹配主道统内容 | 不出现专项加成 | | ☐ |

---

## 3. /divination 10 — 占卜测试

### 前置：给测试用户加灵石

```javascript
// mongosh: 给测试用户 100 灵石
db.users.updateOne(
  { userId: <TG_USER_ID> },
  { $set: { "cultivation.immortalStones": 100 } }
)

// 确认
db.users.findOne({ userId: <TG_USER_ID> }, { "cultivation.immortalStones": 1 })
// 预期: 100
```

### 操作
发送 `/divination 10`

### 预期 TG 回复
1. 先出现「占卜中」临时消息，随后被删除
2. 最终消息显示占卜结果（卦象 + 灵石变化）
3. 消息明确写「本次不影响境界与修为」

### DB 核对

```javascript
const u = db.users.findOne({ userId: <TG_USER_ID> })

// 灵石变化（±40 范围内，取决于卦象）
// 10 × [-4, -3, -2, -1, +1, +2, +3, +4] = [-40, -30, -20, -10, +10, +20, +30, +40]
// 净值 = 100 + result
"cultivation.immortalStones"  // 应为 60~140 之间

// 修为不变
"cultivation.canonical.state.currentPower"  // 应仍为 0

// 占卜计数 +1
"cultivation.divinationCount"  // 应为 1

// 占卜结果记录
"cultivation.divinationWins" 或 "cultivation.divinationLosses"  // 其中之一 +1
```

| # | 检查项 | 预期 | 实际 | Pass |
|---|--------|------|------|------|
| 3.1 | 临时消息出现并删除 | 有「占卜中」→ 被删除 | | ☐ |
| 3.2 | 最终消息含结果 | 有卦象和灵石变化 | | ☐ |
| 3.3 | 消息含免责声明 | 含「本次不影响境界与修为」 | | ☐ |
| 3.4 | `immortalStones` 变化 | 60~140 | | ☐ |
| 3.5 | `currentPower` 不变 | `0` | | ☐ |
| 3.6 | `divinationCount` | `1` | | ☐ |
| 3.7 | `realmId` 不变 | `"realm.taixi"` | | ☐ |

### 3.1 边界：余额不足占卜

```javascript
// 重置灵石为 5
db.users.updateOne(
  { userId: <TG_USER_ID> },
  { $set: { "cultivation.immortalStones": 5 } }
)
```

发送 `/divination 10`

| # | 检查项 | 预期 | 实际 | Pass |
|---|--------|------|------|------|
| 3.8 | 余额不足提示 | 提示灵石不足 | | ☐ |
| 3.9 | 灵石未被扣除 | 仍为 5 | | ☐ |

---

## 4. /breakthrough — 破境测试

### 前置：种种子数据到可破境状态

```javascript
// 种子条件：胎息 → 练气
// 需要: currentPower >= 120, attainment >= 0, 无材料要求
db.users.updateOne(
  { userId: <TG_USER_ID> },
  {
    $set: {
      "cultivation.immortalStones": 100,
      "cultivation.canonical.state.currentPower": 120,
      "cultivation.canonical.state.cultivationAttainment": 0,
      // 确保没有已使用的突破材料
    }
  }
)

// 确认种子数据
db.users.findOne(
  { userId: <TG_USER_ID> },
  {
    "cultivation.canonical.state.realmId": 1,
    "cultivation.canonical.state.currentPower": 1,
    "cultivation.canonical.state.cultivationAttainment": 1,
    "cultivation.immortalStones": 1,
  }
)
// 预期: realmId="realm.taixi", currentPower=120, attainment=0, stones=100
```

### 操作
发送 `/breakthrough`

### 预期 TG 回复
1. 出现「天劫降临」临时消息
2. 最终回复「成功突破至 练气」
3. 再发 `/realm`，显示境界已变成练气

### DB 核对

```javascript
const u = db.users.findOne({ userId: <TG_USER_ID> })

// 境界已更新
"cultivation.canonical.state.realmId"              // 预期: "realm.lianqi"
"cultivation.canonical.state.cultivationAttainment" // 应已更新（根据配置）

// legacy shell 同步
"cultivation.realm"     // 预期: "炼气期"
"cultivation.realmId"   // 预期: 1

// 统计
"cultivation.breakthroughSuccesses"  // 预期: 1
```

| # | 检查项 | 预期 | 实际 | Pass |
|---|--------|------|------|------|
| 4.1 | 临时消息「天劫降临」 | 出现 | | ☐ |
| 4.2 | 最终消息含「成功突破」 | 含「成功突破至 练气」 | | ☐ |
| 4.3 | `canonical.state.realmId` | `"realm.lianqi"` | | ☐ |
| 4.4 | `cultivation.realm` (legacy) | `"炼气期"` | | ☐ |
| 4.5 | `breakthroughSuccesses` | `1` | | ☐ |
| 4.6 | 再发 `/realm` 显示练气 | 练气 | | ☐ |

### 4.1 边界：条件不足破境

```javascript
// 重置到条件不足的状态
db.users.updateOne(
  { userId: <TG_USER_ID> },
  {
    $set: {
      "cultivation.canonical.state.realmId": "realm.lianqi",
      "cultivation.canonical.state.currentPower": 100,  // 不足 420
      "cultivation.canonical.state.cultivationAttainment": 0,  // 不足 10
    }
  }
)
```

发送 `/breakthrough`

| # | 检查项 | 预期 | 实际 | Pass |
|---|--------|------|------|------|
| 4.7 | 提示条件不足 | 显示缺少的修为/道行/材料 | | ☐ |
| 4.8 | 境界未被改变 | 仍为 `"realm.lianqi"` | | ☐ |

### 4.2 边界：带材料破境（筑基）

```javascript
// 种子条件：练气 → 筑基
// 需要: currentPower >= 420, attainment >= 10, 1× yellow_breakthrough_token
db.users.updateOne(
  { userId: <TG_USER_ID> },
  {
    $set: {
      "cultivation.canonical.state.realmId": "realm.lianqi",
      "cultivation.canonical.state.currentPower": 420,
      "cultivation.canonical.state.cultivationAttainment": 10,
    },
    $push: {
      "cultivation.canonical.inventory": {
        instanceId: "test-yellow-token-001",
        definitionId: "material.yellow_breakthrough_token",
        obtainedAt: new Date(),
        sourceType: "admin",
        bound: false,
        used: false,
        stackCount: 1,
        instanceMeta: {},
      }
    }
  }
)

// 确认
db.users.findOne(
  { userId: <TG_USER_ID> },
  {
    "cultivation.canonical.state.realmId": 1,
    "cultivation.canonical.state.currentPower": 1,
    "cultivation.canonical.inventory": 1,
  }
)
```

发送 `/breakthrough`

| # | 检查项 | 预期 | 实际 | Pass |
|---|--------|------|------|------|
| 4.9 | 突破成功 | 含「成功突破至 筑基」 | | ☐ |
| 4.10 | `realmId` 更新 | `"realm.zhuji"` | | ☐ |
| 4.11 | 材料已消耗 | inventory 中 token 的 `used: true` | | ☐ |
| 4.12 | `breakthroughSuccesses` | `2` | | ☐ |

---

## 5. /mystats — 综合统计

### 操作
发送 `/mystats`

| # | 检查项 | 预期 | 实际 | Pass |
|---|--------|------|------|------|
| 5.1 | 回复消息正常 | 无报错 | | ☐ |
| 5.2 | 包含境界信息 | 显示筑基 | | ☐ |
| 5.3 | 包含突破次数 | 2 次成功 | | ☐ |
| 5.4 | 包含占卜统计 | 1 次占卜 | | ☐ |

---

## 6. /stones — 灵石查询

### 操作
发送 `/stones`

| # | 检查项 | 预期 | 实际 | Pass |
|---|--------|------|------|------|
| 6.1 | 显示灵石余额 | 与 DB 一致 | | ☐ |
| 6.2 | 显示占卜统计 | 胜率等信息 | | ☐ |

---

## 7. /rankings — 排行榜

### 操作
发送 `/rankings`

| # | 检查项 | 预期 | 实际 | Pass |
|---|--------|------|------|------|
| 7.1 | 回复消息正常 | 无报错 | | ☐ |
| 7.2 | 显示排名列表 | 至少显示自己 | | ☐ |

---

## 8. 错误恢复 & 边界

### 8.1 未知命令

发送 `/foobar`

| # | 检查项 | 预期 | 实际 | Pass |
|---|--------|------|------|------|
| 8.1 | 无崩溃 | 不报错 | | ☐ |
| 8.2 | 合理提示 | 提示命令不存在或忽略 | | ☐ |

### 8.2 连续快速操作

快速连续发送 3 次 `/realm`

| # | 检查项 | 预期 | 实际 | Pass |
|---|--------|------|------|------|
| 8.3 | 无 429 错误 | bot 不崩 | | ☐ |
| 8.4 | 均正常回复 | 3 条回复都正常 | | ☐ |

---

## 9. 最终 DB 全量核对

```javascript
// mongosh: 全量检查最终状态
const u = db.users.findOne({ userId: <TG_USER_ID> })

const finalCheck = {
  // canonical state
  "realmId": u.cultivation.canonical.state.realmId,           // 预期: "realm.zhuji"
  "currentPower": u.cultivation.canonical.state.currentPower,  // 预期: 420
  "attainment": u.cultivation.canonical.state.cultivationAttainment,  // 预期: >= 10

  // legacy sync
  "legacyRealm": u.cultivation.realm,       // 预期: "筑基期"
  "legacyRealmId": u.cultivation.realmId,   // 预期: 2

  // stats
  "breakthroughSuccesses": u.cultivation.breakthroughSuccesses,  // 预期: 2
  "divinationCount": u.cultivation.divinationCount,              // 预期: 1

  // inventory (one used token)
  "inventoryCount": u.cultivation.canonical.inventory.length,    // 预期: 1
  "tokenUsed": u.cultivation.canonical.inventory[0]?.used,      // 预期: true
}

printjson(finalCheck)
```

| # | 字段 | 预期 | 实际 | Pass |
|---|------|------|------|------|
| 9.1 | `canonical.state.realmId` | `"realm.zhuji"` | | ☐ |
| 9.2 | `cultivation.realm` (legacy) | `"筑基期"` | | ☐ |
| 9.3 | `cultivation.realmId` (legacy) | `2` | | ☐ |
| 9.4 | `breakthroughSuccesses` | `2` | | ☐ |
| 9.5 | `divinationCount` | `1` | | ☐ |
| 9.6 | inventory token `used` | `true` | | ☐ |

---

## 10. 清理

```bash
# 冒烟测试完成后，可选清理
db.users.deleteOne({ userId: <TG_USER_ID> })
```

---

## 结果汇总

| 测试步骤 | 总项 | Pass | Fail | 备注 |
|----------|------|------|------|------|
| 0. 环境准备 | 4 | | | |
| 1. /start | 7 | | | |
| 2. /realm | 6 | | | |
| 3. /divination | 9 | | | |
| 4. /breakthrough | 12 | | | |
| 5. /mystats | 4 | | | |
| 6. /stones | 2 | | | |
| 7. /rankings | 2 | | | |
| 8. 边界测试 | 4 | | | |
| 9. 最终核对 | 6 | | | |
| **合计** | **56** | | | |

---

## V2 Phase A Compatibility Checks

> 验证 V2 字段已持久化但不影响 V1 主循环

| # | Check | Expected |
|---|-------|----------|
| A.1 | `realmSubStageId` present | `realmSubStage.taixi.xuanjing` |
| A.2 | `battleLoadout` present | starter defaults only |
| A.3 | Focus reward loop | unchanged from V1 |
| A.4 | `/realm` output | no forced V2 combat wording yet |

测试人: ____________
日期: ____________
Bot 版本/commit: ____________

### B. V2 Phase B 小阶运行时验收

> 验证小阶已进入成长与状态运行时，但未提前启用主动战斗

| # | Check | Expected |
|---|-------|----------|
| B.1 | `/realm` shows sub-stage display | `胎息·玄景` |
| B.2 | focus reward advances sub-stage | same realm, later sub-stage |
| B.3 | breakthrough lands on first sub-stage of next realm | `练气·一层` |
| B.4 | ascension resets to `胎息·玄景` | pass |

测试人: ____________
日期: ____________
Bot 版本/commit: ____________

### C. V2 Phase C 主动战斗运行时验收

> 验证统一奇遇框架已经接入专注完成链路，并能在状态页、完成消息和 callback 交互中正确工作

| # | Check | Expected |
|---|-------|----------|
| C.1 | `rollFocusEncounter()` can return `combat` | `type = combat` |
| C.2 | same seed, same combat result | reproducible |
| C.3 | combat result persists to `combatHistorySummary` | pass |
| C.4 | `/realm` shows injury + latest combat summary | pass |
| C.5 | task completion message shows short combat report | pass |

测试人: ____________
日期: ____________
Bot 版本/commit: ____________

### C.1 Dev Smoke Hook 验收

> 验证开发环境下可用的奇遇脚本命令，确保真实 TG 可确定性复现奇遇类别

| # | Check | Expected |
|---|-------|----------|
| C1.1 | `/dev_encounter_set combat 2` | 设置成功，显示类别与次数 |
| C1.2 | 第一次完成任务 | 进入 `combat` 类别，消息含斗法短战报 |

### C1.4 构筑与战报差异矩阵

| Case | Setup | Expected |
|------|-------|----------|
| 主战法门切换 | `/dev_grant_art art.golden_light_art,art.surging_river_step` 后分别 `/equip_art art.golden_light_art` 与 `/equip_art art.surging_river_step` | 两次战报都能完成战斗，但正式短战报措辞不应完全一致 |
| 辅助法门生效 | `/dev_grant_art art.spirit_gathering_chant` + `/equip_support art.spirit_gathering_chant` | `/loadout` 显示辅助法门已装备；若当前小阶未开辅助槽，则应收到拒绝提示 |
| 神通槽门槛 | 练气/筑基角色执行 `/equip_power power.spirit_flash` | 返回 `当前境界尚未开启神通槽` |
| 神通授予与配装 | 紫府角色执行 `/dev_grant_power power.clear_heart` 后 `/equip_power power.clear_heart` | `/loadout` 显示已配神通：昭澈心 |
| 详细战报开关 | `/dev_combat_detail on` 后完成一次 `combat` 专注，再执行 `/dev_combat_detail off` 重复一次 | 开启时消息追加 `🧪 详细战报` 回合日志，关闭时只保留正式短战报 |
| 不同敌人模板 | 连续两次使用 `/dev_encounter_set combat 2`，并完成两次专注 | `combatSummary.enemyName` 或 `encounterId` 应至少出现两种不同值，不再总是 `拦路青狼` |
| C1.3 | `/dev_encounter_status` | 剩余次数递减为 `1` |
| C1.4 | 第二次完成任务 | 仍进入 `combat` 类别 |
| C1.5 | 再次 `/dev_encounter_status` | 当前未设置开发奇遇脚本 |
| C1.6 | `/dev_encounter_set item 2` | 后续两次只会进入 `item` 类别 |
| C1.7 | `/dev_encounter_set stones 2` | 后续两次只会进入 `stones` 类别 |
| C1.8 | `/dev_encounter_set none 2` | 后续两次无奇遇 |
| C1.9 | `/dev_encounter_clear` | 清除成功 |
| C1.10 | `/dev_encounter_set offer 1` | 后续一次专注进入守宝奇遇，完成任务消息显示 `离开 / 争抢` 按钮 |
| C1.11 | 点击 `离开` | 宝物直接消失，无伤、无灵石扣减，不写入 `combatHistorySummary` |
| C1.12 | `/dev_encounter_set offer 1` 后再次完成任务并点击 `争抢` | 进入斗法结算，写入 `combatHistorySummary` |
| C1.13 | 争抢高阶传承成功 | 入包 `manual.*`，不写入 `knownBattleArtIds / knownDivinePowerIds` |

测试人: ____________
日期: ____________
Bot 版本/commit: ____________
