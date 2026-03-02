# Telegram Bot Commands for BotFather

直接复制以下内容到 BotFather 的 /setcommands 命令中：

```
start - 🧙‍♂️ 开始使用修仙助手
help - ❓ 显示帮助信息
task - 🎯 创建专注任务
reserve - ⏰ 预约15分钟后开始
status - 📊 查看当前状态
stats - 📈 查看统计数据
realm - ⚡ 查看境界和灵力
divination - 🔮 占卜天机
breakthrough - 🌩️ 尝试渡劫突破
rankings - 🏆 查看修仙排行榜
mystats - 📋 个人修仙统计
stones - 💎 查看仙石余额
divination_history - 📜 占卜历史记录
divination_chart - 📊 占卜走势图
ascension - ☁️ 飞升成仙
```

---

## 如何设置命令到 BotFather

1. 在 Telegram 中找到 [@BotFather](https://t.me/BotFather)
2. 发送 `/setcommands`
3. 选择你的 bot
4. 复制上面的命令列表（不包括代码块标记）并发送
5. BotFather 会确认命令已设置

---

## 完整命令分类

### 📚 基础功能
- `start` - 开始使用，查看欢迎信息
- `help` - 显示所有命令帮助

### 🎯 任务管理
- `task` - 创建专注任务（例：/task 学习 30）
- `reserve` - 预约任务（15分钟预约机制）
- `status` - 查看当前任务和链条状态
- `stats` - 查看今日和历史统计

### ⚡ 修仙系统
- `realm` - 查看境界、灵力、仙石
- `divination` - 占卜天机（例：/divination 50）
- `breakthrough` - 渡劫突破境界
- `ascension` - 飞升成仙（大乘期可用）
- `rankings` - 灵力榜、境界榜、飞升榜
- `mystats` - 个人修仙详细统计
- `stones` - 仙石余额和占卜盈亏

### 📊 占卜系统
- `divination_history` - 查看最近占卜记录
- `divination_chart` - 占卜走势图和统计

---

## 命令优先级建议

如果 Telegram 限制命令数量，建议按以下优先级设置：

### 必需命令（前8个）
1. start
2. help
3. task
4. status
5. realm
6. divination
7. breakthrough
8. rankings

### 次要命令
9. stats
10. mystats
11. stones
12. reserve

### 辅助命令
13. divination_history
14. divination_chart
15. ascension

---

## 注意事项

- Telegram 最多支持 100 个命令
- 当前已使用 15 个命令
- 命令描述建议不超过 256 字符
- 命令名称必须小写，可包含下划线
- 表情符号会在某些客户端显示

---

更新时间：2025-10-20
Bot 版本：1.0.0
