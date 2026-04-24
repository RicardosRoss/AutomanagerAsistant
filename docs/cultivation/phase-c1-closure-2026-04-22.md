# 玄鉴 Phase C.1 收口记录

**日期**: 2026-04-22  
**范围**: `V2 phase C` 主动战斗运行时上线后的真实 Telegram 冒烟收口  
**分支**: `features/xuanjian-cultivation`

---

## 1. 当前结论

`Phase C` 的代码实现与自动化验证已经完成，`Phase C.1` 现已通过一个仅开发环境可用的奇遇脚本入口完成收口：

- `自动化层`: 已完成
- `真实 TG 可执行冒烟`: 已完成
- `真实 TG 确定性闭环`: 已完成

关键补充能力：

- `/dev_encounter_set <type> <count>`
- `/dev_encounter_status`
- `/dev_encounter_clear`

这些命令只在 `NODE_ENV !== 'production'` 时注册与生效，用于 smoke/QA 强制接下来 `N` 次专注奇遇进入指定类别。

---

## 2. 已完成的自动化收口

以下验证已经完成：

- `yarn vitest` phase C 定向回归通过
- `yarn test` 全量通过
- `yarn typecheck` 通过
- `yarn build` 通过
- `git diff --check` 通过

对应的 phase C 实现已覆盖：

- starter 奇遇战配置
- `CombatStateAdapter`
- `CombatResolver`
- `CombatRewardBridge`
- `CombatService`
- 专注完成链路中的 `combat` 奇遇接线
- `TaskCommandHandlers` 里的斗法短战报
- `/realm` 中的伤势与最近斗法摘要

---

## 3. 已补齐的 dev-only smoke hook

### 3.1 命令能力

支持类别：

- `none`
- `stones`
- `item`
- `combat`

支持行为：

- 为当前用户设置接下来 `N` 次专注奇遇类别脚本
- 每次专注结算后自动消耗 `1` 次
- 用尽后自动清除
- 可随时查看当前脚本
- 可随时手动清除

### 3.2 运行时接入点

- 脚本存储：`cultivation.canonical.state.combatFlags.devEncounterScript`
- 读取与消耗：`CultivationService.awardCultivation()`
- 类别级 override：`rollFocusEncounter()`

这意味着真实 TG 侧已经可以**确定性**验证：

- 完成任务消息中的斗法短战报
- `/realm` 中的当前伤势与最近斗法摘要

---

## 4. 现在就能执行的真实 TG 冒烟

### 4.1 启动 smoke 环境

```bash
BOT_TOKEN=<测试bot_token> \
MONGODB_URI=mongodb://127.0.0.1:27017/automanager-smoke \
REDIS_HOST=127.0.0.1 \
REDIS_PORT=6379 \
NODE_ENV=development \
yarn dev
```

### 4.2 `/realm` 伤势与最近斗法摘要冒烟

可以直接种库，也可以通过正常命令链路跑出。

若只验证展示层，仍可直接种一条 starter 斗法失败后的状态：

```javascript
db.users.updateOne(
  { userId: <TG_USER_ID> },
  {
    $set: {
      "cultivation.immortalStones": 8,
      "cultivation.canonical.state.realmId": "realm.taixi",
      "cultivation.canonical.state.currentPower": 60,
      "cultivation.canonical.state.injuryState": {
        level: "light",
        modifiers: ["combat_loss"]
      },
      "cultivation.canonical.state.combatHistorySummary": [
        {
          encounterId: "combatEncounter.taixi.roadside_wolf",
          result: "loss",
          happenedAt: new Date("2026-04-22T10:00:00.000Z"),
          summary: "你被拦路青狼逼退。",
          enemyName: "拦路青狼"
        }
      ]
    }
  }
)
```

然后在 Telegram 私聊 bot：

```text
/realm
```

预期应看到：

- `📊 当前境界：胎息·青元`
- `🩹 当前伤势：轻伤`
- `⚔️ 最近斗法：你被拦路青狼逼退。`

### 4.3 DB 回看

```javascript
db.users.findOne(
  { userId: <TG_USER_ID> },
  {
    "cultivation.canonical.state.injuryState": 1,
    "cultivation.canonical.state.combatHistorySummary": 1
  }
)
```

预期：

- `injuryState.level === "light"`
- `combatHistorySummary.length >= 1`

---

### 4.4 完成任务消息中的斗法短战报冒烟

先在 Telegram 中设置接下来 2 次强制进入 `combat` 类别：

```text
/dev_encounter_set combat 2
```

预期应看到：

- `🧪 开发奇遇脚本已设置`
- `类别：combat`
- `次数：2 次`

然后连续完成两次 60 分钟专注任务。

每次完成任务后，预期消息中都能看到：

- `⚔️ 斗法结果：...`
- `🐺 对手：拦路青狼`
- `📝 ...短战报...`

再发送：

```text
/dev_encounter_status
```

预期：

- 第一次完成后剩余 `1`
- 第二次完成后脚本已清空，提示当前未设置

---

## 5. 之前的阻塞项已关闭

原先 `Phase C.1` 的唯一阻塞是“没有确定性强制 `combat` 的入口”，现已由 dev-only smoke hook 解决。

---

## 6. 建议的下一步

`Phase C.1` 已完成，后续可以继续推进：

1. 把这组 dev-only 命令纳入真实 TG smoke 流程
2. 再进入 `Phase D` 的 `registry / projection + loadout` 工作

---

## 7. 收口状态

当前 `Phase C.1` 建议记录为：

- `代码实现`: 完成
- `自动化验证`: 完成
- `真实 TG 可测项`: 完成
- `真实 TG 完整闭环`: 完成
- `收口方式`: dev-only smoke hook + 真实 TG 冒烟
