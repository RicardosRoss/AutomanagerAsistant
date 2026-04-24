# feature/ctdp-rsip-parity 分支修复任务

> 来源：基于当前分支代码的严格 code review。
> 目的：把已发现的高风险行为缺陷拆成可独立实现、测试、审查的修复任务。

---

## 一、修复目标

让当前分支已经引入的 CTDP / RSIP 能力从“模型与局部测试已存在”推进到“真实 Telegram 用户路径闭环可用”，重点修复以下问题：

- 预约任务完成/失败后，CTDP 主链状态不更新
- 预约兑现时丢失原始任务描述与时长
- 取消预约后，辅助链状态未同步清理
- 延期预约回调解析错误，当前路径不可用
- `/reserve` 先入队后落库，失败时会留下孤儿预约任务
- 辅助链和定式树的创建约束缺少原子性保障

---

## 二、优先级总览

| 优先级 | Story | 目标 |
|------|------|------|
| P0 | Story 1 | 打通预约任务完成/失败到 CTDP 主链的状态闭环 |
| P0 | Story 2 | 保留预约原始 payload，修正预约兑现结果 |
| P0 | Story 3 | 修复预约取消/延期链路，确保辅助链与队列一致 |
| P1 | Story 4 | 消除 `/reserve` 孤儿任务和并发创建竞态 |
| P1 | Story 5 | 补齐回归测试与 lint 门槛，防止问题回归 |

---

## 三、修复 Stories

### - [x] Story 1：预约任务完成/失败必须驱动 CTDP 主链闭环

**Goal**

让通过预约兑现创建的任务，在“完成任务 / 放弃任务”时不仅更新 `TaskChain`，也同步更新 `MainChain.nodes`、`levelCounters` 和主链状态。

**In Scope**

- 在 callback handler 中识别“预约兑现任务”与普通任务的不同完成路径
- 为预约任务接入 `CTDPService.completeMainTask()` / `CTDPService.failMainTask()`
- 建立从 `taskId` 回溯主链节点的稳定查询方式
- 修正 `/status` 展示中的 CTDP 状态失真问题

**Out Of Scope**

- CTDP 分层节点升级规则重构
- 新增新的用户命令

**Dependencies**

- 依赖 Story 2 对预约 payload 和 reservation 关联信息的补齐

**Target Files / Modules**

- `src/handlers/taskCommands.ts`
- `src/services/CTDPService.ts`
- `src/services/TaskService.ts`
- `src/handlers/coreCommands.ts`
- `tests/integration/ctdp-reservation-flow.test.ts`
- `tests/unit/services/CTDPService.test.ts`

**Acceptance Criteria**

- 预约任务点击“完成任务”后，对应主链节点从 `running` 变为 `completed`
- 预约任务点击“放弃任务”后，对应主链按神圣座位原理进入 `broken`
- `/status` 中 CTDP 节点数、主链状态与真实任务执行结果一致
- 普通任务路径行为不回归

**Tests**

- 增加 handler -> CTDP -> TaskService 的集成测试
- 增加“预约任务完成后主链计数递增”的测试
- 增加“预约任务失败后主链清零”的测试

**Notes For Implementer**

- 不要让 handler 同时维护两套状态；状态机判定应收敛到服务层
- 若需要根据 `taskId` 查询节点，优先在 `CTDPService` 增加明确接口，而不是把查询逻辑散落到 handler

### - [x] Story 2：预约兑现必须使用用户原始描述和时长

**Goal**

确保 `/reserve 任务描述 时长` 到点后点击“立即开始”，创建出的就是同一条预约任务，而不是默认的 `预约任务 25`。

**In Scope**

- 在 `AuxChain.pendingReservation` 中持久化 `description/signal` 与 `duration`
- 修正 `startReservedTask()` 默认值覆盖真实预约信息的问题
- 明确 reservation notification 与 callback 之间的数据契约

**Out Of Scope**

- 调整预约提醒文案
- 变更默认预约时长策略

**Dependencies**

- 无前置依赖，可与 Story 1 并行设计，但实现时优先落地

**Target Files / Modules**

- `src/models/AuxChain.ts`
- `src/types/models.ts`
- `src/services/CTDPService.ts`
- `src/services/QueueService.ts`
- `src/handlers/taskCommands.ts`
- `tests/integration/ctdp-reservation-flow.test.ts`

**Acceptance Criteria**

- 创建预约时，辅助链中保存完整预约 payload
- 点击“立即开始”后，新建任务的 `description` 和 `duration` 与原预约一致
- `reservationId` 与任务绑定关系保持不变

**Tests**

- 增加“预约 60 分钟任务兑现后仍为 60 分钟”的集成测试
- 增加 `AuxChain` 模型/类型字段测试

**Notes For Implementer**

- 优先从持久化状态读取预约 payload，不要依赖 callback data 携带全部业务字段

### - [x] Story 3：修复预约取消/延期链路的一致性

**Goal**

让“取消预约”“延迟5分钟”在队列和辅助链上都表现一致，避免 UI 提示成功但状态未真正变化。

**In Scope**

- 修复 `delay_reservation_*` callback data 的编码/解码协议
- 为取消预约增加 `AuxChain` 状态同步更新
- 为延期预约同步更新 `pendingReservation.deadlineAt`
- 确保 `/status` 和 `/reserve_status` 读取到的是最新状态

**Out Of Scope**

- 引入任意时长自定义延期
- 重新设计 inline keyboard 布局

**Dependencies**

- 建议在 Story 2 之后执行，避免 reservation 数据结构重复调整

**Target Files / Modules**

- `src/handlers/taskCommands.ts`
- `src/services/CTDPService.ts`
- `src/services/QueueService.ts`
- `src/bot.ts`
- `tests/integration/ctdp-reservation-flow.test.ts`

**Acceptance Criteria**

- 点击“取消预约”后，队列任务被取消，`pendingReservation` 被清空或转入 history
- 点击“延迟5分钟”后，系统使用正确的 `reservationId`，不会把 `res` 解析成完整 id
- `/status` 与 `/reserve_status` 不再展示已取消的预约
- 取消后用户可以重新创建新预约

**Tests**

- 增加“取消预约后可重新预约”的集成测试
- 增加“延迟回调可正确解析 reservationId 和 delayMinutes”的单元测试
- 增加“辅助链 history 正确记录 cancelled / delayed 后状态”的测试

**Notes For Implementer**

- callback data 协议必须可逆；如果继续用字符串拼接，分隔符设计必须避开当前 `reservationId` 格式
- 更稳妥的方案是改成固定前缀 + 明确序列化结构

### - [x] Story 4：消除 `/reserve` 孤儿任务与并发竞态

**Goal**

让预约创建流程具备最基本的一致性：要么“辅助链状态 + 队列任务”都创建成功，要么都失败；并阻止并发下出现多个活跃预约。

**In Scope**

- 调整 `/reserve` 的落库与入队顺序，或增加失败补偿逻辑
- 为 `AuxChain` 增加单用户单活跃链/单活跃预约的原子约束
- 审查 `PatternTree.findOrCreateForUser()` 的同类竞态，并决定是否一并收口

**Out Of Scope**

- 引入分布式事务
- 全面重构 `QueueService`

**Dependencies**

- 建议在 Story 2、3 之后执行，避免重复迁移 `AuxChain` 结构

**Target Files / Modules**

- `src/handlers/taskCommands.ts`
- `src/services/CTDPService.ts`
- `src/models/AuxChain.ts`
- `src/models/PatternTree.ts`
- `src/services/RSIPService.ts`
- `tests/integration/ctdp-reservation-flow.test.ts`
- `tests/unit/models/AuxChain.test.ts`
- `tests/unit/services/RSIPService.test.ts`

**Acceptance Criteria**

- `createReservation()` 失败时，不会留下稍后触发的孤儿预约通知
- 并发两次 `/reserve` 时，最多只有一个活跃预约成功
- `PatternTree.findOrCreateForUser()` 在并发下不会创建重复树

**Tests**

- 增加 reservation 创建失败后的补偿测试
- 增加并发预约创建测试
- 增加定式树并发创建测试

**Notes For Implementer**

- 如果使用唯一索引，错误处理必须把重复键异常翻译成稳定的业务错误
- 这里优先追求“状态一致”，不是“代码最少”

### - [x] Story 5：补齐回归测试与分支质量门槛

**Goal**

把这轮 review 暴露的问题固化成自动化检查，避免再次出现“服务层测试通过，但 Telegram 真实路径仍然损坏”。

**In Scope**

- 为 Story 1-4 增加最小闭环集成测试
- 清理当前分支新增的 lint error
- 明确本分支合并前必须通过的验证命令

**Out Of Scope**

- 清理仓库全部历史 `console` warning
- 全量重构测试基建

**Dependencies**

- 依赖 Story 1-4 完成主体实现

**Target Files / Modules**

- `tests/integration/ctdp-reservation-flow.test.ts`
- `tests/unit/services/CTDPService.test.ts`
- `tests/unit/handlers/coreCommands.test.ts`
- `tests/unit/services/TaskService.test.ts`
- `src/models/AuxChain.ts`
- `src/models/PrecedentRule.ts`
- 其他本分支新增 lint error 所在文件

**Acceptance Criteria**

- 本分支新增缺陷都有对应自动化测试
- `npm run typecheck` 通过
- `npm test` 通过
- `npm run lint` 至少不再因本分支新增代码报 error

**Tests**

- 运行 `npm run typecheck`
- 运行 `npm test`
- 运行 `npm run lint`

**Notes For Implementer**

- 这不是“最后再补”的收尾任务；每个 story 完成时就要同步补测试

---

## 四、推荐执行顺序

1. Story 2：先修正预约 payload 丢失问题，稳定 reservation 数据结构
2. Story 3：修复延期/取消协议，让预约链路可操作
3. Story 1：把预约任务完成/失败真正接到 CTDP 主链状态机
4. Story 4：补原子性与补偿，收敛并发风险
5. Story 5：统一补回归验证并清理分支新增 lint error

---

## 五、执行结果

### Story 1

- 已完成。预约兑现生成的任务在“完成任务 / 放弃任务”时会优先走 `CTDPService.completeTrackedTask()` / `failTrackedTask()`，由服务层统一决定是否回写主链。
- `/status` 的 CTDP 展示改为读取用户最近一次主链，避免 `broken` 主链被 `status: active` 过滤掉后出现状态失真。
- 已补集成测试覆盖“预约任务完成后主链节点 completed、计数递增”和“预约任务失败后主链 broken”。

### Story 2

- 已完成。`AuxChain.pendingReservation` 和 reservation history 现在都会持久化 `duration`，预约兑现默认从持久化状态回读原始 `signal` 与 `duration`。
- “立即开始”不再退回到通用 `预约任务 / 25 分钟` 默认值。
- 已补模型字段测试和预约兑现集成测试。

### Story 3

- 已完成。延期回调协议改为 `delay_reservation_5:<reservationId>`，并兼容旧格式解析；取消预约现在会同步清理 `AuxChain.pendingReservation` 并写入 history。
- 延期预约会同时更新 `pendingReservation.deadlineAt` 并记录 `delayed` 历史事件。
- 已补“取消后可重新预约”和“延期回调正确解析 reservationId / delayMinutes”的测试。

### Story 4

- 已完成。`/reserve` 先创建辅助链状态，再调度队列；若入队失败，会立即执行状态回滚，避免孤儿预约任务。
- `AuxChain` 增加单用户单活跃链的部分唯一索引，`createReservation()` 改为原子 `findOneAndUpdate + upsert`；`PatternTree.findOrCreateForUser()` 也收敛为原子实现。
- 已补“创建失败不入队”“入队失败触发回滚”“并发预约只成功一次”“并发定式树不重复创建”等测试。

### Story 5

- 已完成。本轮缺陷对应的 handler / service / integration 回归测试均已落地。
- 本分支新增 lint error 已清零；全量 lint 当前为 `0 errors / 101 warnings`，剩余为仓库既有 warning。
- 全量验证结果：
  - `rtk npm test` 通过，`27` 个测试文件、`169` 个测试通过
  - `rtk npm run typecheck` 通过
  - `rtk npm run lint` 通过，`0 errors / 101 warnings`

---

## 六、合并前检查

- [x] 预约创建、兑现、延期、取消、完成、失败 6 条路径都有自动化覆盖
- [x] `/status` 与 `/reserve_status` 对同一预约状态展示一致
- [x] 不再存在“队列成功、辅助链失败”或“辅助链成功、队列失败”的悬空状态
- [x] 分支新增代码不再引入新的 lint error
