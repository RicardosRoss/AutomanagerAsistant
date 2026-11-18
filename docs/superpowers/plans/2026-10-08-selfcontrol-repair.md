# 自控力助手修复计划与验收记录

**当前验收：** 2026-10-10 UTC，原计划八项具名修复与真人主流程验证通过；详见 `reports/repair-acceptance-2026-10-10.md`。后面的阶段记录保留当时状态。

**目标：** 逐项修复 2026-10-08 审查问题，优先支持任务启动；功能判定唯一依据为项目根目录的 `论自控力.md`。

**执行方式：** 当前会话顺序实施，先失败回归测试再实现。开发副本来自 vps 的 Git 仓库并叠加当前未提交源码/部署修改；原始差异保存在 `.git/remote-baseline.patch`。生产数据不用于测试，不自动追溯扣除历史资产。

## 原文约束与设计

- 主链：触发明确标志后开始明确任务；成功追加节点；失败断链；例外只能断链或成为当前链生命周期内的永久判例。
- 辅助链：信号发出后 **15 分钟内** 启动主任务，可提前启动；按时兑现累积辅助记录；未兑现进入判例决策，不能随意延期、取消、静默忘记。
- 降低启动阻力：默认优先预约；按钮收集任务内容/时长，保存草稿再确认承诺；草稿退出不构成违约，预约成立后才有约束。避免把游戏奖励变成启动机制。
- RSIP：每天最多增加一个定式；失败或删除某节点，同时移除全部后代；可重新探索分支，记录用户时区下的新增日期且删除不能绕过每日上限。
- 修仙为已有附加功能：不擅自修改 60 分钟门槛和历史资产；降低主要界面的游戏信息密度，短任务的任务链反馈必须清晰。
- 队列持久化所有业务定时；所有用户交互中文；不能以进程存活代替就绪。

## 任务顺序

- [x] 1. 修复工具链：Vitest 执行 TS 测试、实际 TypeScript 构建/检查、移除完成迁移的同名旧 JS（先备份）；保证测试使用独立临时数据库。
- [x] 2. 启动流程：外部请求有明确超时、菜单同步不阻塞；健康端点先开放且报告真实就绪；启动失败清理队列；真实构建启动验证。
- [x] 3. 低阻力入口：草稿、短token、默认值、越界拒绝、私聊/文本/callback边界和准备内容保留已部署；真实预约→启动→60分钟完成通过。实际1h输入阻力修复，29项单位回归和编译Mongo8演练通过。
- [x] 4. CTDP：直接与预约启动统一主链；运行任务不能无惩罚替换；辅助链及时兑现/到期决策、判例按链作用域、失败清理任务和提醒；主链违规已有入口。
- [x] 5. 可信计时与结算：可信分钟封顶、阶段结算、taskId 原子奖励收据、租约恢复与节点补偿完成；奖励保存前后和ready后发布前真实SIGKILL通过，全部跨文档交错证明仍未完成。
- [x] 6. 日常数据：默认时长/时区/提醒设置；真实周报；启动数按启动事件记录，取消/失败口径明确、跨日统计可信。
- [x] 7. RSIP 操作：增加/执行/失败回溯/删除流程，所有权校验、每日限额和可理解导航。
- [x] 8. 文档/审查/交付：Phase29源码/构建、修订文档、审查、数据库演练和真人验收全部具证；264产物匹配，114文档52索引发布一致。旧索引迁移完成，未知旧资产保留审计。单worker和任意外部写者等运行边界见最终验收记录。

## 测试矩阵

| 范围 | 正常 | 边界/失败 | 证据 |
| --- | --- | --- | --- |
| 工具链 | 现有 TS 测试执行、真实 dist | 不允许同名旧 JS 被运行/覆盖 | 命令结果和构建文件 |
| 启动 | bot 与依赖就绪 | Telegram 超时、菜单失败、数据库断连、启动半途失败 | 模拟外网 + HTTP 集成 |
| 创建入口 | 草稿→预约/启动 | 长中文、冒号、Markdown、无效时长、旧按钮/他人按钮 | 入口测试与数据库结果 |
| 主链 | 直接/预约共同追加 | 重复/并发、换任务、失败清零 | 临时 MongoDB 集成 |
| 辅助链 | 截止内兑现 | 逾期、延期/取消判例、重启、通知失败 | 队列与状态集成 |
| 判例 | 相同行为一致允许 | 链断后不泄漏、用户隔离 | 数据库断言 |
| 结算 | 一次奖励和统计 | 迟确认、重复/并发、各步骤故障重试 | 回归与故障测试 |
| 设置/周报 | 用户时区和偏好 | 跨午夜、无数据、非法时区 | 真实模型和输出 |
| RSIP | 每日新增、执行 | 删除后重加、失败级联、跨用户 | 数据库集成 |

## 本轮记录

- 已读取原文，撤回“靠增加短任务修仙奖励降低启动阻力”的建议；保留现有游戏数值，优先 CTDP 预约和规则可操作性。
- 服务器现有源码未发生新的外部变更；已建立本地隔离开发副本。
- 工具链、启动/健康、自律草稿、主链入口一致性、原子单运行任务、辅助链期限与判例、可信计时、设置/周报、RSIP、阶段性结算恢复及主链判例入口已实施。
- 开发副本：`/Users/qingcongyu/tools/automanager-repair`，分支 `fix/selfcontrol-start-support`。没有创建提交、推送或修改生产文件。
- 旧同名 JS 备份在 `.git/legacy-js-backup/`；远程原始差异在 `.git/remote-baseline.patch`。生产部署前要再次核对远程差异，保留配置和日志。
- 依赖版本：Vitest 3.2.7、TypeScript 5.9.3、Yarn 4.13.0；Mongoose 7、Bull 4、node-telegram-bot-api 0.61。请求选项从已安装库 `src/telegram.js` 的说明及请求合并代码核对，外部参考为 https://github.com/yagop/node-telegram-bot-api/tree/v0.61.0 和 https://vitest.dev/guide/ 。
- 全量验证使用 `yarn test --maxWorkers=2`，真实临时 MongoDB 7.0.14/wiredTiger。原测试假定删除后能重加、延期取消无判例、跨链共用判例的部分，已按原文修订。没有降低业务断言。
- Claude 对抗审查超时，无审查意见；报告在 `reports/claude-start-review/selfcontrol-start-phase1/`。不能当作审查通过。已补做并发辅助链决定的失败/通过回归测试。
- 2026-10-08 10:28 UTC 已将当前副本部署到 `vps:/home/telegramBots/telegramAutomanager`，备份为 `/root/automanager-backups/20261008-102537/project.tar.gz`，迁移前同名 JS 备份位于该目录的 `legacy-js/`；未备份 `.env`，未写入 MongoDB。
- 部署验证：PM2 `telegram-self-control-bot` online，当前 pid `1397696`，`start.sh` 使用 `node dist/src/app.js`；`*:3000` 正在监听；`GET /health` 返回 HTTP 200，`status=healthy`、`bot=running`、`database=connected`、`redis=connected`；Redis `PONG`；MongoDB ping `1`；Telegram 网络与 token 的 `getMe` 在部署前已返回 `@AutomanageMyselfBot`。
- 2026-10-08 11:15 UTC 已部署结算恢复与主链判例入口，备份为 `/root/automanager-backups/20261008-111358/project.tar.gz`；启动日志显示命令数量由 15 增至 16，PM2 当前 pid `1398733`，`/health` 200，Redis `PONG`，MongoDB ping `1`。
- 2026-10-08 11:39 UTC 已部署 taskId 奖励收据与结算租约恢复，备份为 `/root/automanager-backups/20261008-113827/project.tar.gz`；PM2 当前 pid `1399295`，`/health` 200，Redis `PONG`，MongoDB ping `1`。
- 2026-10-08 12:06 UTC 已部署奖励收据过期租约恢复，备份为 `/root/automanager-backups/20261008-120522/project.tar.gz`；PM2 当前 pid `1399856`，`/health` 200，Redis `PONG`，MongoDB ping `1`。
- 2026-10-08 12:33 UTC 已部署 Redis 有界重连、项目概述和帮助文案修订，备份为 `/root/automanager-backups/20261008-123247/project.tar.gz`；PM2 当前 pid `1400428`，`/health` 200，Redis `PONG`，MongoDB ping `1`。
- 最终全量验证：`64` 个测试文件、`421` 个测试通过；`yarn lint`、`yarn typecheck`、`yarn build`、`git diff --check` 通过。

## 下一轮必须完成的工作

最新Phase18-20：旧任务状态不默认水合pending、旧断链孤儿不能结算；已迁移旧跨链unique索引并核对全库111文档不变。启动持久rolling_back/原Main意图恢复/单worker发布互斥与版本栅栏，ready后发布前SIGKILL证明同任务恢复。日报tokenCAS/跨日全预claim/持久pending恢复、Userlongest原子化、提醒发送前状态检查已上线。最新92文件613tests/build通过；真实Mongo8隔离新dist预演与线上健康证据见2026-10-09进展。本人完整Telegram流程、所有文本出口/VersionError入口与跨文档结算判例交错仍未完成。后面的旧阶段待办为历史记录，以该进展中的最新证据判定。

Phase21-22：全部运行时sendMessage经纯文本分段helper，末段按钮/末messageId、VersionError中文脱敏；占卜余额与待同步快照同次User原子保存，后台只补历史，真实commit后SIGKILL/并发cast/读历史降级已验证。95文件630tests/build通过，独立Mongo8预演和停worker全库111文档52索引不变后部署。现有322按钮ID符合长度，未知手工病态ID仍需防护；本人完整Telegram流程与更广Task/Main交错、网络与收据保留边界尚未完成。

Phase23修正既有余额归零在快照之后的问题，生成历史前应用同一原下限，亏损/收益/pending恢复余额一致。95文件633用例/build通过，三文件部署前后历史文档与索引不变。

Phase24结算Task owner token+版本fence，旧actor不能覆盖新结果；全局未结算启动门禁与/status原确认重试及多链计数，Main判例优先。断链选择与已确认结果交错可收尾、清零并从新链#1开始，旧broken历史重试不恢复当前连击。真实资产/日报双层lease接管与真实Redis重复清理通过；97文件650用例/build、Mongo8隔离演练、线上全库111文档52索引不变已验证。本人完整Telegram流程和剩余部署边界仍未完成。

Phase16修复奖励先save资产后单写receipt的崩溃重发窗口，改singleUserOCC atomicsettled+asset；claim/reclaim owner/lease同数组项，未认领不清他人token，旧无原子凭证未完成收据拒绝自动重发。UserOCC版本冲突友好提示、rawunset/TaskrewardApplied失败恢复、真实commit前后SIGKILL均证明一份奖励。78文件/551tests及构建通过。生产审计User1/noReceipt0，实际发布先停旧worker后审计奖励收据+terminal任务再替换，歧义就abort/restartold。后台全部VersionError/多文档kill/legacy资产审计/一致DB备份/liveTelegramE2E仍未完成。

Phase15修复Redisconnect/open误报就绪、并发连接/部分清理/断开后恢复；真实isolatedRedis停启/丢数据恢复repeat和原预约deadline/单role掉线/预算耗尽显式connect全部测试。ready监听有限bootstrapretry与周期扫描同worker合并，startup顺序源码核对。77文件/542tests及构建通过；上线三role当前PID定向CLIENTKILL实测503→200、308ms恢复，PID不变、repeat1/failed0，原始证据见phase15-vps-socket-fault-2026-10-09.json。生产全服务中断/任意blackhole、多实例去重/恢复锁、一致DB备份和liveTelegramE2E仍未完成。

Phase14统一新任务1000码点与schema校验、模板literal替换、历史长描述只做预览、状态按钮ready/ended守卫、判例现行/历史分块；预约缺依赖假成功回退移除。索引等待揭露同名冲突，主链部分唯一显式命名并补应用全部模型就绪门禁，无drop/历史改写。75文件/529tests与构建通过，主链重复active0、底层任务链唯一索引已存在，上线新主链索引需listIndexes证据。所有文本出口/病态旧字段、真实TelegramE2E、生产Redis故障、一致DB备份仍待完成，见2026-10-09进展。

Phase13已拆分callback确认与业务，ACK失败不阻止有效启动；callback要求完整本人私聊来源，外来预约ID失败不能调用全局到期；本人fulfilled且running的预约新callback可读回原任务而不重复计时。73文件/508tests及构建通过。全输入安全、真实TelegramE2E、完整外部副作用重试、TTL/多实例断连去重和任意跨文档kill仍未完成，见2026-10-09进展。

Phase12已增加主链已选决定后台/本用户恢复、任务失败结算与收据化最终收尾、pending状态结算重试、判例存在时启动/成功/放弃入口保护；主链VersionError中文提示和允许后补节点有交错测试。跨午夜每日快照补起止日期。72文件/497tests及构建通过，生产待判例/已选/缺快照或token计数均0；具体发布看2026-10-09进展。任意跨文档kill、全并发交错证明、真实TelegramE2E、Redis中断、长连击原子化和收据保留策略仍未完成。

Phase11已完成主辅判例decisionToken按钮绑定、legacy按钮拒绝/待判例按需补token、同预约多次判例与跨链隔离、主辅snapshot→CAS替换保护和主链允许收尾不覆盖进度。71文件/484tests与构建通过；/violation可找回当前主链判例。主链sticky选择跨进程恢复、传输TTL/所有callback重试、真实TelegramE2E、旧数据审计仍未完成；详见2026-10-09修复进展。

Phase10（2026-10-09）已补预约starting原子认领、启动凭证写前/写后检查、迟到worker拒绝、任务/node/辅助兑现补偿、chosenDecision自动续做与稳定resolutionId读回；停止活动的initializing任务有收据化计数回滚和补偿出口。公开延期/取消旁路已移除，/reserve_status显示处理状态。70文件/473tests与构建通过，具体上线状态以`reports/repair-progress-2026-10-09.md`为准。任意写间kill全证明、多进程恢复、旧按钮隔离、旧数据审计仍未完成。

Phase7 更新：已补草稿提交租约和 submitting 防覆盖、submissionToken 精确恢复、提交成功但通知失败不重建、部分任务创建故障补偿、CTDP 节点保存响应丢失读回、延期入队失败恢复原 Bull job。随后在服务层增加 token 查重、结束 token 拒绝复活、MainChain/TaskChain optimisticConcurrency，并修复完成节点重试时等级计数重复累加。最终 `yarn validate` 66 文件/438 测试通过，build/diff-check 通过；已部署并完成远程健康检查。上述属于抛错和用户触发恢复验证，未证明任意进程 kill 窗口可自动恢复。预约 DB 写成功而队列 add/回滚双失败仍可能遗留无 job 预约；已验证 Redis 恢复后取消判例出口，自动对账待做。Claude 复评报告见 `reports/claude-start-review/selfcontrol-idempotency-phase7-final/debate.html`。

1. 可恢复结算：阶段状态、失败重试、taskId 奖励收据和租约恢复已完成；主链节点补偿和真实故障注入仍待验证。MongoDB standalone 风险仍未用事务处理。
2. 主链判例入口：`/violation 内容` → 断链/当前链永久允许已接入并部署；仍需真实 Telegram 流程、旧链按钮失效验证和历史全局判例索引迁移方案。
3. Phase9 增加启动/每分钟预约对账，补回丢失或失败的到期job；真实Redis验证重启repeat唯一和过期期限恢复，通知用原子认领/送达标记/冷却重试。68文件/456tests全量通过，详情见 reservation-recovery.md。启动/到期并发、chosenDecision崩溃补偿、旧索引/缺日期记录迁移仍待完成。`cancelReservation` 内部回滚与公共边界仍需收口。
4. 草稿成功建任务但通知失败时不能重建预约；submitting 租约与进程重启恢复、重复确认的幂等结果仍需补齐。
5. Phase8 已统一命令解析与修仙分发、精确后缀匹配、大小写、私聊/群聊/转发按钮边界，并完成 Redis 模糊认领 fail-closed；66 文件/446 tests 全量通过。可恢复 callback 错误、所有用户文本格式安全和真实 Telegram 用户流程仍待完成。
6. Redis 有界 SDK 重连和 ready 状态已实现；仍需在真实 Redis 断开/恢复环境做故障注入验证。
7. AGENTS/CLAUDE/README/项目概述/命令帮助中的旧预约与“开发中”表述已修订；archive 文档保留历史记录，不当作当前帮助。
8. 部署：服务器没有 mongodump 命令；需要安全的一致数据备份方案（不能无脑热拷贝 MongoDB 文件）；Node 在 `/root/.nvm/versions/node/v23.1.0/bin`，PM2 同路径，corepack 存在、yarn 不在 PATH。不要运行现有 deploy 全局 pgrep 误伤其他服务；精准重启这个 bot。

## Phase25：核心收尾与附加奖励解耦已部署

核心成功先保存Task/User/Main，奖励意图与User核心统计同次原子追加；独立reward processor按FIFO支付资产，Task投影不能重放奖励或挡住下一任务。保留游戏数值、60分钟门槛、buff/连专顺序，未选奇遇不被覆盖。真实Redis挂起奖励、两种repeat/data-loss恢复、User提交后与asset提交后SIGKILL、两层租约接管和并发写回归通过。最终101文件677tests全量绿，build/diff-check通过；独立Mongo8.0.4原BSON/索引保留演练与生产停机前后111文档52索引一致。已部署PID1433193，health/Mongo/Redis和两个定时恢复job现场执行已确认，具体证据见2026-10-09进展和phase25相关JSON。

## 已完成：按钮边界与准备导航

Phase26完成手工异常ID的callback传输输入/输出保护，Phase27完成状态页继续准备、内容保留和live提交导航保护。两轮的测试、演练、发布与健康证据见下列记录。

Phase26已部署callback输入/输出1-64UTF8字节边界，保留异常旧记录正文/有效操作，HTML/entities临界正文与可选提示失败有回归；102files691tests/build绿。production111文档52索引不变，PID1434997healthy和两类恢复任务已执行；真实入口2773已点status/reserve保存description草稿，未正式预约/启动/完成，目标仍active。

Phase27已部署准备导航：status继续/退出原准备，重复同mode和跨mode内容/时长/expiry保留，cancel0不误报未承诺，live慢提交不被2minlease恢复重置；activeMain优先和optionalpatterncounter降级。103files713tests/build绿，Mongo8隔离rawdraft/原记录索引保留，production111documents52indexes不变，PID1436399健康，两种恢复任务完成。真实private完整预约/启动/完成仍pending。

## 历史未验收项（Phase28，已由最终真人验收关闭）

真实Telegram草稿→预约→启动→完成尚未形成完整本人记录，实际日志仅确认status/reserve/status和退出准备，不能用模拟update补成liveE2E。使用现有bot私聊，不重复发送邀请，不替用户建立承诺。

既有单worker、standalone与有限恢复协议的具名故障点有测试证据；任意跨文档中断/外部写者或多worker保证未被证明，不能把这些边界称为全面完成。未知旧资产缺依据保留审计，不自动重算。最新逐项验收记录为 `reports/repair-acceptance-2026-10-09.md`。

## 最终验收

2026-10-10UTC确认本人真实填表任务：预约4.716秒后兑现，可信60分钟，主链#1completed、辅助履约1次、User启动/完成/奖励收据各1。基线统计+1启动/+1完成/+60分钟，连击7→8，修为12→13、灵石不变；322旧任务和109其他BSON行不变。1h输入和错误文档已修正；104files742tests/typecheck/lint/build/diffcheck通过。两次精准停机发布均114文档52索引不变；全部264源码/JS/map/declaration匹配，PID1449830healthy，MongoRedis和两repeat/failed0实证。原计划验收通过，无commit/push。无限故障、多worker/外部writer、未知旧资产重算和异地备份未列入功能承诺。
