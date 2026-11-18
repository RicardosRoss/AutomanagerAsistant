# 历史任务与判例索引兼容

## 业务依据

根目录 `论自控力.md` 的“下必为例”仅在当前任务链的生命周期生效。断链后重新从 #1 开始，新链可以重新判断相同行为。因此旧判例不能自动适用于新链，也不能以跨链唯一索引阻止新链形成自己的判例。

## 只读审计与任务结算

2026-10-09 的生产审计见 `reports/phase18-legacy-audit-2026-10-09.json`。14 条任务链共有 322 条历史任务，322 条都没有新版 `settlementStatus`；其中 305 条已终态。另有 1 条 running 任务残留在已经断裂的链中。该任务不属于当前活跃链。

不把缺失字段理解成“尚未发奖”。没有可靠凭证证明旧资产、统计和奖励是否已写入时，不自动补结算、不重放随机奖励、不追溯修改资产。

当前保护：

- `settlementStatus` 不再有 schema 默认值；读取并保存历史数组不会凭空填充 pending。
- running 任务只有在所属 TaskChain 仍 active 时可以第一次确认完成/失败；原子状态更新同时验证 active、链文档 ID 和 running，增加版本以拒绝陈旧写入。
- 新版已明确保存为 pending/processing/needs_retry 的终态任务继续保留原恢复路径，包括已断链的失败结算；不以 inactive 拒绝所有合法恢复。
- 旧终态任务没有新版结算状态时，旧按钮拒绝，不改文档。断链孤儿保留原始状态供审计，不自动判定用户曾经完成或失败。
- 新判例的新增、查询和违规判断必须传入非空链 ID。旧无链 ID 的判例保留为历史记录，不推断绑定当前链。

这不是全面历史迁移。旧统计与资产只保留指纹，没有足够来源支撑重新计算；若需要修复原始任务状态，先制定明确的逐条规则与迁移凭证。

结算中的 `chain.save()` 依赖 Mongoose dirty-path 保存，以及第一次 running 转终态时的 `__v` fence；它不是全局串行化，也不覆盖所有不增加版本的直接 update 写者。回归验证独立的并发备注更新不会被覆盖，不能据此证明全部任务数组并发交错。初始化回滚在链已 broken 时如何清理孤儿 running 任务仍属待修复事项，当前仅封住旧按钮重新结算入口。

## 旧索引的定向迁移

旧索引：`userId_1_scope.behaviorKey_1_scope.chainType_1`，唯一键不含链 ID。

新索引：`precedent_per_chain`，唯一键为 `userId + scope.behaviorKey + scope.chainType + scope.chainId`。

`scripts/migrate-precedent-index.mjs` 默认只读 dry-run。它要求新索引完整定义正确并已存在；旧索引名称对应的键、unique 和其他关键选项必须完全符合已审计定义。只删除该旧索引，其他索引不变，也不修改或删除判例文档。未知定义、安全检查失败或备份与当前判例不一致时中止。

```bash
export PATH=/root/.nvm/versions/node/v23.1.0/bin:$PATH
cd /home/telegramBots/telegramAutomanager
node scripts/migrate-precedent-index.mjs
```

apply 还要求：精确 PM2 worker 已 stopped/pid0，无其他 MongoDB 客户端连接，非空 TTL 集合检查通过，指定备份具有 COMPLETE、SHA256SUMS 和隔离恢复标记，当前判例完整文档指纹和索引清单仍与该备份一致。

```bash
TASK_PRECEDENT_BACKUP=/root/automanager-backups/database-20261009-031527-Qfpt0C \
TASK_PRECEDENT_AUDIT=/root/automanager-backups/phase18-precedent-index-audit.json \
node scripts/migrate-precedent-index.mjs --apply
```

以上命令需要配合外层维护操作：记录原服务状态、停止本项目、失败或普通信号时恢复服务，执行后恢复并验证健康。脚本不会自行停止/启动 PM2，也不自动操作其他项目。输出审计路径应是新的私有文件。重复 apply 允许当前清单仅差已删除的旧索引，文档或其他索引变化仍拒绝。

当前存在的旧无链 ID 规则不参与新链判断，迁移不删它们。同链重复写仍由新唯一索引拒绝/幂等读回，不因删除旧索引失去约束。CLI 测试使用真实临时 MongoDB，仅用测试 PM2 状态与备份标记 fixture 检查维护门禁；完整真实备份恢复已有 Phase17 的独立证据。

官方参考：

- https://mongoosejs.com/docs/7.x/docs/defaults.html ：缺失值会应用默认值，历史字段不能用 default 制造业务完成凭证。
- https://www.mongodb.com/docs/manual/reference/method/db.collection.dropIndex/ ：按精确索引名称删除，只操作指定集合索引。

仍需验证：真实 Telegram 本人完整流程、所有成功结算与判例交错、任意跨文档进程中断，以及其他后台账户版本冲突入口。

## Phase19 启动补偿状态

所有新任务先持久化为 initializing，完成启动统计与提醒安排后，以 CAS 转 ready。失败时只对有 initializing/ready 凭证且没有已发布 MainChain 节点的任务认领 rolling_back。认领与完成转换互斥，未知旧任务没有该凭证不会被自动删除。回滚持有新状态后先按用户 startedTaskIds 收据撤销一次启动计数，再修复不包含该任务的每日快照，最后删除任务。active链同时减少totalTasks，broken链已清零则仅移除未建成任务，不能减出负计数。

中途失败保留rolling_back直到全部补偿成功；重复调用收据守卫与条件pull防止双减。后台原有Bull维护任务继续rolling_back和超过五分钟的initializing；当前进程仍在创建的任务不会被抢占。ready任务不进入无请求的自动补偿；已发布主链节点时拒绝删除并留下审计错误。草稿submitting遇到正在初始化/回滚任务时保留准备，清理后恢复ready再让用户确认。

当前部署仍是单worker；活动创建的内存集合不是多进程锁。未把MainChain与TaskChain写入改为跨文档事务，也没有证明旧worker长IO与多个新worker混跑的完整一致性。提醒取消失败仍按既有行为尽力清理，没有在此阶段声明全部已入队通知都已撤回。

主链启动的预期 mainChainId 与底层任务一并写入，creator在ready之后、主链节点发布前退出时，后台维护任务按原ID补回节点，不建立新生命周期，也不重复启动计数。发布与补偿共享按taskId的当前worker Promise锁，发布前重新读取running/非清理任务；若补偿先赢，不能发布不存在任务的节点；若发布先赢，补偿看到节点后拒绝删除。重复启动排队到第一次发布完成后读回同一节点。

MainChain与TaskChain之间仍没有跨文档事务：同一worker的关键区间串行有回归证据，任意外部writer、多worker及迟到的数据库命令不属于该Promise锁保证。DailyStats全量快照写入可能被并发陈旧快照覆盖，目前即时报告从TaskChain重算；该快照并发一致性仍需要单独修复，不把启动补偿测试当作全部统计并发证明。

Phase19 最终边界：带mainChainId的ready任务在原节点发布前不能完成/失败结算，submitting草稿也不会误报已开始。断链选择仅冻结已发布或无新绑定意图的真实running任务，不把initializing/rolling_back/未发布启动ID变成永久待处理引用。已断裂且从未发布的已知启动可补偿，原链保持broken，随后新链从#1开始；未知旧任务依旧不自动清理。

回滚带原主链ID时，先按“尚无此taskId节点”的条件提升该主链版本；迟到的原Mongoose.save写者因此不能在任务删除后提交悬空节点。若节点已经保存，该条件更新失败且回滚中止。该保护与单worker发布/补偿锁共同覆盖本阶段复现的交错，不等于允许任意跨进程绕过版本字段的写者。

兼容语义：没有mainChainId意图的ready或旧running任务代表旧任务层或可信内部直接启动，不据缺字段推断“尚未启动”。若它仍在该用户唯一active TaskChain中，用户明确选择当前主链断链时，按既有规则结算失败一次；不撤销真实启动、不发送奖励。该选择不适用于已经broken链的旧孤儿，后台也不会主动替用户作该决定。正式bot的新任务统一经过CTDP并保存mainChainId，因此新流程采用“发布前不结算”的保护。

后续具名事项：DailyStats快照并发CAS/longestStreak原子更新；active提醒发送前验证任务存在和初始化状态；长期未决判例导致发布恢复失败的日志/退避策略；正常Main完成与版本栅栏交错的完整证据。当前维护恢复每分钟一次，pendingViolation需要用户明确选择，不自动允许或断链；缺少原链保留供审计。

## Phase20 统计并发与提醒

每日快照在读取TaskChain报告前先保存随机refreshToken与refreshPending，写回必须仍持有同一token。新刷新已认领时，旧刷新只读回当前记录，不覆盖stats也不清除新token。较新刷新中途失败留下pending；Bull维护任务扫描pending重新认领并重算，不能把“旧刷新跳过”当作“新刷新必定成功”。每次刷新保存日期使用的refreshTimezone，账户修改时区后仍按原日界恢复该份快照，不把旧日期换成新时区日期。原始即时日报/周报仍由TaskChain重算。

User成功结算通过MongoDB更新管道，在同一次原子更新中追加settledTaskIds、增加完成数/分钟/当前连击，并以库内当前连击计算longestStreak，不再读input.user的陈旧连击。失败仍按收据只计一次，统计更新提升User版本，旧账户save因此拒绝覆盖。没有重算历史最长连击，也没有修改任何奖励数值。

提醒发送前检查本人active TaskChain、running、非initializing/rolling_back；带Main意图还要求原active Main节点存在。过期active任务提醒对不存在/已结束/清理任务不发新按钮。检查与Telegram网络发送之间仍有小竞争窗口，已送出的消息无法用数据库事务撤回；旧按钮的结算CAS依旧负责保护数据。不把发送前检查称作跨系统exactly-once通知。

本阶段快照保护覆盖TaskService的刷新写入；旧DailyStats模型的直接增量方法、外部脚本若绕过token仍需独立验证。refreshPending不改变任务业务状态，后台恢复失败逐行记录并在现有每分钟计划重试。

Phase20 复核修正：跨午夜先claim全部日期再读快照，首日读取失败会留下两天pending；只依赖单日pending不能推导另一天。lastTaskAt的$max移到claim阶段，避免拥有更晚活动时间的刷新被较早刷新取代而丢失时间。没有调用方的findOrCreateDaily/getUserPeriodStats/generateWeeklyReport/getPlatformStats及其类型声明已移除，周报始终经StatsService按用户时区读取TaskChain。

并发成功与失败的连击以User单文档更新的实际提交顺序线性化：失败后提交则归零，成功在其后提交则从零加一；不把失败归零改成可绕过的条件跳过。业务仍按单running任务协议，新旧终态恢复的完整跨文档先后关系不是这条管道独自解决的。幂等数组保留为权威收据，不盲目TTL或截断，长期归档策略仍待单独设计。

官方更新管道依据 https://www.mongodb.com/docs/manual/tutorial/update-documents-with-aggregation-pipeline/ ：$set支持按库内当前字段计算，动态taskId数组用$literal避免被当作表达式。当前Mongoose7.8.7、实际VPS Mongo8.0.4；本地真实集成Mongo7.0.14。

## Phase21 纯文本消息边界

所有运行时sendMessage出口经sendTelegramMessage处理。4096 UTF-16以内保持原调用参数，纯文本超长逐码点分段、正文连接完全一致，操作键盘仅最后一段，返回最后一条Telegram消息ID供已有判例通知凭证使用。HTML/Markdown与显式entities消息保持原样，现行这些格式化出口是有界静态帮助，不切断格式实体。helper本次调用发送中途失败即抛错，不自行重发已发送段；不承诺用户重试或Bull重试时整组消息跨进程exactly-once。

User VersionError原对象或服务包装后的原始错误转中文查看状态/重试提示，不向用户展示文档ID或modifiedPaths。既有业务规则错误保留。生产322个历史任务callback引用均不超64字节，RSIP无冒号nodeId；新ID由应用生成短标识，未知手工超长ID仍是审计边界，不据此声称任意损坏数据库可直接操作。官方依据 https://core.telegram.org/bots/api#sendmessage 与 https://core.telegram.org/bots/api#inlinekeyboardbutton 。

## Phase22 占卜历史同步

旧cast先History.create后User.save，账户版本冲突可留下未结算历史。新cast把账户变化与pendingDivinationHistories快照放在同一次User OCC保存中；UUID gameId、一次骰子/余额/效果不变。提交响应丢失时只按该gameId的持久pending或历史读回已提交事实，不根据内存余额推断。随后History只做gameId幂等插入、逐字段深度核对，成功后pull待同步记录并提升User版本。后台和历史读路径只同步快照，不重掷、不重放资产。冲突历史保留与待同步快照供审计，不自动覆盖或删除旧记录。

pending子schema覆盖userId/gameId/timestamp字段去除普通/唯一索引，并显式excludeIndexes防止未来继承；实际Mongo回归验证User没有pending子字段索引。字段默认undefined，旧用户读取/启动不生成该字段，不改已有五条历史。

历史同步失败时，已有历史和统计仍可读取，并标注pendingSyncCount及同步未完整提示；后台恢复继续抛错供维护重试。记录写成功但清理失败时，pending并不等于缺失历史，提示不声称这N条必定没计入。等待消息在成功/失败路径均尽力删除；删除失败不影响业务，结果通知失败给“已结算、不要重复下注”的提示。

真实SIGKILL在账户提交后/历史同步前中断，独立运行时恢复一条历史，余额60/次数1不再改变。并发两个cast使一个账户版本提交、另一干净失败且没有幽灵历史；不同用户同步异常互不阻断。新流程不追溯认定旧历史对错；同一Telegram请求长期重放的全局幂等/未知网络结果对账仍依赖既有传输合同，不能把同步日志等同于支付系统事务。

## Phase24 任务结算认领与断链交错

结算认领新增随机settlementToken，同数组项匹配taskId/原结果/processing/token，认领提升TaskChain版本。Task阶段标记/最终settled/失败清理只写当前token，丢失认领的旧处理者不能重开新结果或覆盖奖励快照。chain.save仍是Mongoose dirty-path + optimisticConcurrency；新claim及Main断链都提升版本，陈旧chain统计保存被拒绝，不声称所有绕开版本的外部writer受保护。

奖励资产仍以Phase16的User.focusRewardReceipts为权威，TaskStage标志不是发奖权威；两层租约一起过期时，新Usertoken/OCC保证一份资产。DailyStats是TaskChain全量重算+refreshToken CAS，不是增量累加，重复刷新不会双计。提醒取消是同taskId的Bull清理，不能取消其他任务；在途消息发送仍有既有边界。保留60秒租约，过期仅允许新认领，不凭时间取消仍持有token的处理者。

新任务创建前后检查所有本用户明确pending/processing/needs_retry终态，原子push也拒绝当前链未结算结果；失败补偿只撤销初始化，不增加虚假启动。/status可找回broken链中的待结算原结果，显示待保存总数、只提供原选项重试；有主链判例时先查看判例，不能靠相反结果按钮绕过。多条旧链待结算时逐项保存、直到全局pending为0才允许新启动。

报告主链判例与Task首次确认的短DB临界区共享当前worker的用户键锁，结算/发奖/统计/网络不在该锁内。锁不跨worker，既有部署仍stop准确旧worker后启动一个fork实例，不用reload重叠发布/cluster。原确认已落库而用户选择break时，不把completed反转failed：先按同一确认收尾，再清零当前Main/Task链进度及当前连击。该内部恢复入口必须绑定实际chosen break、decisionToken、processingToken及捕获taskId，未选/其他用户/错误token均拒绝。

Main选择快照包括当前running任务、主链running节点对应的明确终态结果、兼容无Main意图的明确未结算结果；不把旧无状态终态或尚未完整启动的记录变成待发奖任务。broken链成功历史重试只补累计完成/分钟，不延伸当前连击或链计数。一次原结果只能有一份User统计收据。

实证包含真实User奖励+Dailystats，在账户保存前、奖励返回后、链统计保存前三处暂停旧worker并接管，验证power1/focusStreak1/完成1/分钟60/日快照1次/Tasksettled不重开。两层claim过期的账户旧writer和过期Task旧writer均被fence；没有把mock奖励调用次数当作资产幂等证明。

Phase24复评确认：生产唯一awardCultivation调用点为TaskService，并始终传taskId；不带ID的低层兼容入口没有生产调用方。取消提醒的重复及两个服务并发调用用独立真实Redis/Bull验证，只清目标taskId、其他任务保留；不是把方法调用次数当作一次副作用。源码97文件649用例完整通过后补该真实队列验证，最终完整结果另记。
