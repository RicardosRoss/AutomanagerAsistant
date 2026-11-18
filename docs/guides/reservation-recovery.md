# 预约与队列恢复

功能唯一依据是根目录 `论自控力.md`。预约信号建立后，必须在原截止时间内启动；恢复过程不能重新给用户十五分钟。

MongoDB 的 `pendingReservation.deadlineAt` 保存承诺期限，Bull job 负责触发检查。启动时和每分钟由独立 Bull 恢复队列核对活跃预约，补回缺失、已失败或已完成但业务未处理的 job。已有 active/waiting/paused job 不被抢占。延期后的调度时间若与 MongoDB 不一致，以数据库为准重新调度。单条预约失败不会阻断其他用户的恢复。

用户请求取消或延期后，语义转为“必须先完成下必为例判定”。`pendingDecision` 挂起期间不再单独按原 deadline 生成另一条违约决定，也不能启动或覆盖预约；原截止时间仍保留，但不作为第二条独立到期 job 使用。延期分钟只是请求，未获永久允许判例之前不会自动延长时间。未回应判例会继续阻止启动，这是遵循原设计的约束，不是预约自动取消。用户可经 `/reserve_status` 找回判例按钮，系统不会超时替用户决定。

Phase10 中，预约启动先在 MongoDB 原子从 `pending` 进入 `starting`，记录启动 token、点击时间和五分钟租约。到期/取消请求不能同时认领同一预约。任务写入前和写入后都检查该启动凭证，避免旧 worker 在租约已回收后创建迟到任务。任务初始化完整时保存 `creationState=ready`；过期启动租约有完整任务时补主链节点/兑现记录，无任务时释放启动认领并按原截止时间判断。任务仍处于 `initializing` 时不提前兑现，也不能作为 token 幂等成功返回。

当前单实例进程用活动创建集合区分仍在执行与已经停止执行的初始化。租约过期且创建不再活动时，对半成品执行补偿清理：取消提醒，按用户 `startedTaskIds` 收据撤销启动计数，再删除任务。收据与减计数是同一 MongoDB 原子更新，清理失败后重复执行不会重复减计数；任务存在但计数增量响应丢失也能识别。清理成功后恢复原预约期限，允许重试或进入过期判例。清理仍失败会记录带任务 ID 的错误并保留记录等待重试，不自动擦除无法确认的历史。该活动集合依赖单实例前提，多进程部署不能直接复用这一判断。

任务 token 重试的并发安全依赖“每个用户只有一个 running 任务”的原子守卫和活跃链唯一约束。没有跨文档 token 全局唯一索引；未来放开同时运行多个任务前，必须重新设计该幂等合同。无事务的 MongoDB standalone 仍不能保证任意写入间进程 kill 或连续数据库故障都自动收敛。缺启动 token、点击时间或租约的异常 `starting` 记录只记录审计警告，保留数据，需人工审计，不能自动推断后清除。

已选定的判例保存 `chosenDecision`、稳定 `resolutionId` 和首次 `resolutionAt`，六十秒处理租约过期后由预约恢复任务继续原决定。结果先在数据库原子保存，再尽力同步可重建的队列；队列失败不会重新要求用户选择。允许延期的截止时间始终从首次决定时间起算。数据库提交但响应丢失时，以历史中的 `resolutionId` 读回，避免重复计数。公开取消/延期方法只能进入判例协议；未完成创建的内部回滚使用单独的 `rollbackReservationCreation`，不能撤销正在启动或已有判例的预约。

自动判例通知以 MongoDB 原子认领保护并发发送，租约五分钟。明确发送失败，一分钟后重试；发送成功但写回送达标记失败，保留十五分钟冷却，避免每分钟自动重发。Telegram 与 MongoDB 无共同事务，不能保证任意网络歧义下通知严格一次；冷却过后仍可能重复。用户主动 `/reserve_status` 可再次取回判例按钮，活动发送租约期间需稍后重试。

Phase11 将每次主链/辅助链待判例与独立的二十位十六进制 decisionToken 绑定。重复通知保留同一 token，决定完成后新判例使用新 token；旧链按钮和同预约的旧延期按钮不能决定新判例。Telegram 回调必须携带有效绑定，无 token 的旧格式只提示过期，不猜测当前对象。服务认领时同时比较用户、当前链、行为和 token，防止读取后对象被替换；旧 MongoDB 待判例按需补 token，不重算资产。已有主链待判例用 `/violation` 找回按钮，辅助链用 `/reserve_status`。

内部服务省略 expectedDecisionToken 的合同是“可信调用方认领当前待判例”，不是旧按钮兼容入口。内部旧记录先显式补 token 再认领；自动恢复已选辅助判例显式携带原记录 token。主链允许决定只清除判例，不回写旧节点快照，主链已断裂时不能被并发允许决定复活。

Phase12 为主链已选决定增加恢复路径。选择时保存原决定、关联任务 ID、任务链 ID 和六十秒处理租约；失败清除属于本处理者的租约，保留选项不允许反向选择。断链通过 TaskService 的失败结算处理，失败任务已 settled 时不重复统计；任务间隙断链仅清空当前链记录和连击，不虚构失败任务或扣历史资产。主链最终写入与清除待判例、decisionToken 完成收据在同一 MongoDB 原子更新中，响应丢失可读回；重放历史按钮明确提示“此前已处理”，不当作新操作。

Phase13 将 Telegram 按钮确认与业务分开。answerCallbackQuery 只关闭等待提示，确认网络错误或 query 超时不会消耗一个有效启动动作；确认请求有既有二十秒 SDK 超时且异常只记录日志。业务仍先校验 callback 来自本人私聊消息，再按 userId/token/期限原子认领。缺消息来源、群聊和 inline 来源不执行个人操作。未知业务错误会在私聊提示，不能仅依赖已经失效的弹窗。

预约认领失败时先按本人 userId 与 reservationId 查状态；没有归属就拒绝，不能用外来预约 ID 推进别人的到期判例。本人已兑现预约若对应任务和主链节点仍 running，则重试读回原任务、提示不会重新计时，不增加启动数或兑现记录。已结束任务的旧预约按钮不会复活任务或替换新任务。真正过期的本人预约仍必须进入辅助判例，query 确认超时不等于延期许可。

同 callback ID 去重和同动作三秒节流保持原语义；ACK 失败不会清除这些键。业务可能部分成功后才抛错，所以不盲目删除键重放副作用。新的 callback 过短时间仍可能显示处理中，可用 /status、/reserve_status 查看状态后重试；一小时 update TTL、单进程内存缓存降级、缓存 O(n) 剪枝及所有外部操作的长期幂等仍未完全收口。没有声称 fake Telegram 传输测试等于真实用户 E2E。

Phase14 统一了新任务输入的1000码点限制，孤立代理项在新输入中拒绝。草稿模型和命令校验一致，1000个增补字符如emoji可以保存；新建失败不会写任务/预约，既有准备不因过长自然文本被覆盖。模板按单次函数替换，描述中的美元替换符和占位符按原文显示。动态状态/任务/预约/判例保持纯文本；仍保留少量不含用户文本的静态Markdown提示和静态HTML帮助。

历史长任务与预约只截取状态页和启动通知的显示预览，不改MongoDB原文或已承诺内容。状态页提供当前running且已初始化任务的完成/未完成按钮；initializing只显示正在启动和刷新，服务结算同样拒绝尚未初始化任务。本人历史长任务可以从预览按钮结算。判例列表按4096 UTF-16保守上限分块，不切断增补字符；按当前active链ID标记现行/历史规则，未绑定旧规则不推断为当前适用。

预约操作现在要求CTDP服务可用；依赖缺失时只回未就绪，不制造“已兑现/已延期”或直接取消队列的假成功。`/task`的底层TaskService回退仍作为可信内部兼容保留，正式bot始终提供CTDP。草稿确认的描述/时长字符串重组仍是解析耦合，未来改命令语法前需同时验证；没有声称所有内部空白格式逐字保留。

索引初始化必须在接收Telegram操作之前完成。应用数据库连接阶段等待明确模型注册表的init，草稿模型也在注册表中；失败退出、诊断阶段不宣称ready。主链部分唯一索引显式命名active_mainchain_per_user，与原userId_1普通索引、chainId_1唯一索引共存，保证每用户一条active主链；首次主链创建也等待init。占卜历史删去冗余普通声明但保留gameId唯一声明，任务链去除重复相同声明但保留索引，不删除线上索引或变更游戏值。生产审计无重复活跃主链；如其他部署有重复数据，须先审计备份再处理，不能通过删除旧记录来强行建索引。

Phase15 中，Redis连接健康以主/发布/订阅三个node-redis客户端的isReady为准，不把connect事件或isOpen当作握手完成。重复connect共享一次初始化；部分连接失败或关闭失败仍尝试清理全部连接，停止中的迟到握手不能重新宣称ready。每个角色沿用SDK有限重连预算，关闭事件使用实际end事件，未就绪角色接口拒绝静默排队；disableOfflineQueue不是in-flight命令超时。

应用先connectRedis，再bot.queueService.initialize建立恢复计划并启动扫描，最后注册Redis ready监听。因此首次ready无需依赖尚未初始化的队列。以后全部连接重新ready时，监听器先补回可能丢失的Bull每分钟repeat，再按Mongo原期限对账；启动恢复、ready恢复和周期任务在同worker共享一轮在途扫描，不增加重复结算。临时bootstrap错误在仍ready且监听未退订时最多立即重试三次，无无限原生定时循环；计划保存成功后的DB错误由持久Bull任务继续重试。连续三次bootstrap失败需运维检查/显式重连或重启，不保证无限故障下自动收敛。bot.stop先退订再关队列。

主客户端单独ready时仍使用它做Redis去重，避免只丢发布连接就退回本地缓存；主连接未就绪时沿用单实例进程缓存，不能作为多实例分布式认领。PM2当前instances1/fork；cluster前必须重做断连去重和恢复锁合同。reconnectAttempts仍是最近触发策略的角色计数，不等于最坏角色；三角色ready状态独立可观测。HTTP健康端点同步读取就绪标记，不会等待异步healthCheck；后者及其它已发出的命令在网络黑洞下可能等待socket错误，尚未加入独立命令超时。

隔离Redis测试覆盖整服务停启、数据全丢后恢复唯一repeat与原预约deadline、发布单socket丢失、有限重连预算真实耗尽再显式connect；生产演练只按当前bot PID和selfcontrol角色名称CLIENT KILL其三条SDK连接，不停止共享Redis、不删除key、不触发生产用户任务。角色名字用于定向审计，不是认证凭据。

Phase16 将 User 的奖励资产与 taskId 完成收据合并为同一次版本化保存，包含修为、道行、连专、伤势、库存与奇遇状态。不再先发奖励再写完成收据。processing 收据有随机 processingToken 与六十秒租约；数据库认领用同一数组项匹配任务 ID、可回收状态和租约，新认领增加 User 版本号，旧 writer 的 save 不能覆盖新结果。失败清理只处理自己认领的 token，未认领调用不把他人收据标为失败。

User 的 optimisticConcurrency 也保护其他修仙命令的文档保存；并发旧占卜/突破等操作可能被版本冲突拒绝，界面提示账户状态变化、检查 /realm 后重试，不自动重放含随机和外部副作用的命令。奖励结算版本冲突提示稍后重新确认；已经 settled 的收据读回原奖励，不再增加资产。settled 同一保存中删除处理 token/租约字段，raw MongoDB 检查验证实际字段已移除。任务奖励阶段标记失败后可再次读取该完成收据，再继续 TaskChain 分阶段统计，不能把读回结果再当成新的奖励写入。

旧未完成收据没有新原子处理 token 时，系统不知道旧代码是否已先写资产，拒绝自动重发，要求只读审计；旧 settled 有奖励快照可读回，没有快照不能自动填补。发布顺序为备份源码、精准停止旧 bot、确认停机、审计未完成/无快照收据和终态 pending/processing/needs_retry 任务，再替换源/构建并启动。发现歧义数据先恢复旧进程、中止替换，不以推断补奖励。只读审计只对指定项目数据库和当时数据成立，不代替一致数据库备份或任意外部写入者排除。

隔离 MongoDB 子进程在 User.save 前和成功返回后被 SIGKILL，分别验证只有处理认领或资产与完成收据同时存在；过期回收/新实例读回都最终只保留一份奖励。这不证明任意 TaskChain/User 多文档中断已形成事务。账户版本冲突的全部后台/UI入口、收据保留上限和历史脏数据仍待审计；六十秒处理租约沿用既有设置，不是专注奖励的六十分钟门槛，不改变数值规则。

启动时与每分钟 Bull 对账同时恢复主链已选决定，逐用户失败隔离，未选择不自动决定。主动 `/violation` 只恢复当前用户；已选处理中显示状态不重发相反按钮。待判例时拒绝新建任务、成功确认和公开放弃旁路；报告与最终收尾增加主链版本号，陈旧节点保存遇到版本冲突时引导先处理判例，允许后再次确认可补节点而不重复奖励。任务刚转终态但结算仍为 pending 的状态也可进入原结算重试。

这些是有定向故障注入证明的恢复路径，不是 MongoDB 跨文档事务。任意请求持续超过租约后外部写入的竞争、成功结算与违规报告的全部交错、缺失关联任务或老版本无任务快照的已选决定仍需单独审计。首次快照绑定的任务不能推断成其他新任务；缺记录会保留决定并记录错误等待审计。完成收据数组目前没有长期压缩策略，longestStreak 的陈旧读值原子化也未在本阶段收口；不自动重算历史。

当前 PM2 为单实例 polling。改变为 cluster 或多个恢复进程前，需要分布式恢复锁和相应并发验证。每分钟扫描使用 MongoDB cursor，尚未按大用户规模验证性能或迁移复合索引。没有截止时间的旧预约记录仅记录日志，不自动推断日期；历史数据迁移需另行审计。

本地验证使用临时 MongoDB 7.0.14 和独立临时端口的真实 Redis/Bull 4.16.5，不使用生产数据。测试环境需安装 `redis-server`。核心回归见 `tests/integration/reservation-queue-recovery.test.ts`、`tests/integration/reservation-real-redis-recovery.test.ts`、`tests/integration/reservation-start-race.test.ts` 和 `tests/integration/auxiliary-resolution-recovery.test.ts`。

## Phase25: Core confirmation and optional rewards

Core Task/User/Main confirmation no longer calls or waits for cultivation. Successful User statistics and the ordered pendingFocusRewards intent commit in one atomic update. The next core task is allowed once core confirmation is settled, even while reward recovery is pending. The UI confirms focus first and provides the next reservation/status controls.

A separate focus-rewards Bull processor and one-minute repeat share the existing maintenance queue with core reconcile. Named Bull concurrency stacks, so duplicate reward wakeups return immediately while one payout batch is active. Core startup reconciliation does not await game recovery. Redis data-loss recovery restores exactly one repeat per kind.

Assets settle at the User intent head, with the existing versioned receipt and atomic User save. Paid Task reward projections use independent owner tokens and do not increase core TaskChain version. Paid projection repair can run out of order; it never changes core statistics or replays assets. Each unpaid head captures the legacy pre-core streak for seed normalization.

Game mutations check pending rewards both before and on the loaded User snapshot. Read-only realm status remains available and shows pending count. Existing encounter choices remain resolvable; an unresolved offer pauses later payouts and can be found again in /realm. Delayed payout notices only include controls for the currently matching offer.

Expired leases allow takeover even while an old worker is alive. User version fencing and Task reward owner filters reject late writes; lease expiry is not a latency bound or proof the old process died. A failed replacement can defer recovery until its lease expires and a later scan runs. SIGKILL after core-statistics/intent commit and after asset/receipt commit, live-owner takeover, and concurrent core appends have deterministic regression evidence. These tests do not claim arbitrary external writers or multiple polling workers are supported.

New protocol Tasks without either an intent or a paid receipt are audit errors, not permission to recreate rewards. A malformed head stops only that account's reward batch; other accounts and core tasks continue. Normal atomic payout already removes its intent; residual unmatched cleanup warns for audit. Historical Tasks without the new protocol are not automatically awarded. Lost optional Telegram notifications can be checked through /realm; no exactly-once delivery is claimed.

Official queue contract: https://github.com/OptimalBits/bull/blob/v4.16.5/REFERENCE.md#queueprocess
