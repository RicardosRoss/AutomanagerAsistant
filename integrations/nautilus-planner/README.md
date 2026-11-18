# Nautilus 到 bot

`bot-sync.cjs` 是计划同步器；`install.cjs` 为现有 `naut.js` 安装一个幂等的 post-write hook。先备份 skill，再执行：

```bash
node integrations/nautilus-planner/install.cjs "$HOME/.agents/skills/nautilus-planner/scripts"
```

在 skill 的 `scripts/bot-sync.json` 填写 vault、时区、SSH alias、远程项目和 Node 路径。VPS 的 `.env` 需有 `NAUTILUS_SYNC_TOKEN`（至少 32 字符）和 `NAUTILUS_SYNC_USER_ID`；本地不保存密钥。先部署 bot，再把本地 `enabled` 设为 true。

```bash
node "$HOME/.agents/skills/nautilus-planner/scripts/bot-sync.cjs" sync --date tomorrow --dry-run
node "$HOME/.agents/skills/nautilus-planner/scripts/bot-sync.cjs" sync --date tomorrow
```

`add/remove/move/complete/window` 成功后自动同步已绑定 vault，`show/init/history` 不投递。固定/pinned 时间和 flex 开始时间都取同源引擎的分钟值，保留跨午夜偏移，不依赖 `HH:MM` 显示字段。

空快照取消当天待提醒项目。格式损坏或固定冲突拒绝同步；超出容量的弹性任务列在 `overflow`。网络失败不回滚笔记，输出 `botSync.status=failed`；只重试同步，不重复编辑。

本部署绑定一个 Telegram 用户，不开放公共导入 API。同一天的弹性任务标题须唯一（如“读书·上午”“读书·晚上”），相同标题和时间的固定项也须区分。歧义项拒绝整次同步，服务器保留上次成功快照。

`synced` 表示服务器保存并排入队列；`saved-awaiting-queue` 表示服务器已保存但当前队列尚未就绪，应重试同步并检查健康，不能称为“提醒已排好”。同步只读取日记中的第一个 Nautilus 计划区，不上传其他日记内容。

提醒是计划快照；直接手工编辑 Obsidian Markdown 后需显式同步。电脑关闭不影响已排入 VPS 的提醒。bot 支持 `/schedule`、`/schedule tomorrow`、`/schedule YYYY-MM-DD`，显示投递状态和当前可操作项。

Telegram 和 MongoDB 无跨系统事务：明确限流会有限重试，超时和进程崩溃等未知状态不自动重复发。服务短暂停机只补发 15 分钟内且尚未结束的日程，过期项不补发。
