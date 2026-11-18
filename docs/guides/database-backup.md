# 数据库备份与隔离恢复

## 当前适用边界

生产数据库为 VPS 本机 MongoDB 8.0.4 standalone，项目数据库为 `selfcontrol`。它与其他项目共享 mongod，不能为本项目暂停整个数据库、全局锁写或直接拷贝运行中的数据目录。

本流程在维护窗口只暂停 `telegram-self-control-bot`。操作期间管理员不得启动其他本项目 writer。脚本拒绝其他 MongoDB 客户端连接，也拒绝非空 TTL 集合：即使应用停止，TTL monitor 仍会修改数据库。此策略偏保守，共享数据库的其他客户端也会令备份失败；不要为了绕过检查停止其他项目。

启用鉴权时，全用户连接检查要求 `inprog` 权限；权限不足会抛错并中止备份，不退化为只看自己的连接。已用带鉴权临时 MongoDB 验证权限不足返回 code 13，以及管理员身份确实能发现另一个客户端。

连接检查使用兼容 MongoDB Driver 4.17/5.x 的 admin aggregate 命令，不读取版本特定的 `Db.client` 属性。结果分批时拒绝不完整的首批审计，而非忽略后续连接。回归测试包含真正的命令行子进程，避免只验证 Mongoose 使用的另一个驱动版本。

正常应用停止、已知单 writer、TTL 集合为空、导出前后完整清单一致共同构成此次静止备份的一致性前提。前后哈希不能证明任意第三方 writer 曾经写入后又撤销；没有使用全局锁或数据库事务阻止管理员在窗口中启动新 writer。需要不暂停应用的快照时，另行设计副本集备份，不能把本脚本当作热备份。

## 工具与凭据

- VPS 工具为官方 Database Tools 100.19.1，路径 `/root/automanager-tools/100.19.1/bin`，下载包 SHA-256 为 `8312f251c360ddfbcdd430c64758bee58b7050e1041e8c9df2906761098acd49`。
- 本地集成测试使用 Database Tools 100.16.0 与临时 MongoDB 7.0.14。运行测试前需安装 `mongodump` 和 `mongorestore`，不会静默跳过恢复测试。
- 脚本从项目 `.env` 或环境读取 URI，不把 URI 或密码写入工具命令行。临时配置为 0600；目录为 0700；日志、清单和数据库备份为私有文件。工具日志可能含敏感信息，不上传公共报告。
- 备份仅包含 `selfcontrol` 文档、集合选项和索引，不包含 admin 用户/角色、其他项目数据库、Redis、`.env` 或应用源码。MongoDB 与 Redis 并无跨系统一致快照；预约以 MongoDB 原期限为准，Redis 丢失后由现有对账流程恢复。

## 执行

```bash
export PATH=/root/automanager-tools/100.19.1/bin:/root/.nvm/versions/node/v23.1.0/bin:$PATH
cd /home/telegramBots/telegramAutomanager
bash scripts/backup-database.sh
# 使用上一条输出的 database-... 目录
bash scripts/verify-database-backup.sh /root/automanager-backups/database-...
```

备份脚本持有独占 flock，要求原服务 online，仅在需要恢复原服务时 restart。导出有 90 秒上限，失败、INT、TERM、HUP 会走恢复路径；SIGKILL、断电或 PM2 本身失效无法靠进程退出处理保证重启，必须现场检查服务。失败目录保留调查材料，不写 `COMPLETE`。

重启后的健康探测覆盖最多 60 秒，外层 65 秒 hard timeout，避免 Telegram polling 首轮等待导致十次探测过早失败。导出已完成但健康检查失败时，仍不写成功标记；管理员独立核对 online、健康、清单和校验和后才能将该份导出作为恢复演练输入。

`TASK_BACKUP_DIRECTORY` 只能指定专用备份目录，脚本会设置其权限为 0700。当前健康端点固定为本 VPS 的 `127.0.0.1:3000/health`；更改项目端口时必须同步调整脚本。

`COMPLETE` 表示静止导出与应用恢复成功，尚不代表恢复演练通过。有效演练应同时具有：

1. `SHA256SUMS` 校验通过。
2. `before.json`、`after.json` 完全匹配，覆盖所有文档原始 BSON、集合选项与索引；清单不存用户文档内容。
3. `verify-.../restored.json` 与 `before.json` 匹配，以及 `RESTORE_VERIFIED`。
4. 验证脚本退出 0，独立 mongod 已退出，生产 `/health` healthy、PM2 online。

恢复脚本自行创建私有空目录和独立随机端口，仅绑定 `127.0.0.1`；使用同机 mongod 二进制启动独立实例，不导入应用代码、不运行 bot、不读生产 URI作为恢复目标、不使用 `--drop`。故障留下的验证目录不作为有效演练。服务数据与日志保留于该目录供复核。

随机端口探测到启动之间存在竞争，绑定失败时安全中止并可重试。隔离实例 TERM 后十秒未退出会只对该私有实例发送 SIGKILL，写入 `shutdown-failed.log`、移除成功标记，并返回非零；不把强制退出算作成功演练。

## 运行后

备份与生产同盘，只解决误修改后的恢复材料，不能抵御 VPS 或磁盘丢失。当前未增加自动备份计划、加密异地副本或保留/清理策略。不要把首次手动备份称为完整灾备，也不要自动清除旧备份。

官方依据：

- https://www.mongodb.com/docs/database-tools/mongodump/ ：没有 oplog 且导出中发生写入时，不能形成一个时点的数据；standalone 不支持此副本集 oplog 方案；`--config` 推荐用于敏感连接信息。
- https://www.mongodb.com/docs/database-tools/mongorestore/ ：归档恢复和索引恢复，以及 `--stopOnError`。
- https://www.mongodb.com/docs/database-tools/installation/installation-linux/ ：官方 Linux 发行包安装方式。
- https://www.mongodb.com/docs/manual/reference/operator/aggregation/currentOp/ ：启用鉴权时 `allUsers: true` 要求 `inprog`，`idleConnections: true` 包含空闲连接。
