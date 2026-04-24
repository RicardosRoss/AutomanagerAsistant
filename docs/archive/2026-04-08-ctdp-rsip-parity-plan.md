# CTDP / RSIP 功能补齐实现计划

> **给执行代理的提示：** 必须使用 `superpowers:subagent-driven-development`（推荐）或 `superpowers:executing-plans` 技能逐任务执行。步骤使用复选框（`- [ ]`）追踪进度。

---

## 一、目标

让当前机器人从"任务计时器 + 修仙奖励"升级为与[论自控力.md](../论自控力.md)一致的完整 CTDP / RSIP 协议系统，补齐以下能力：

- 主链（神圣座位 + 失败清零）
- 辅助链（预约信号 + 兑现约束 + 延期处理）
- 下必为例判例系统
- RSIP 定式树（每日新增限制、堆栈式删除、稳态推进）

## 二、架构决策

**保留现有层：** `TaskService` / `QueueService` / 修仙系统作为底层执行层不动。

**新增协议层：**
- CTDP 域：主链 + 辅助链 + 判例规则 + 预约兑现
- RSIP 域：回溯定式树 + 每日新增限制 + 堆栈式删除 + 稳态推进

**职责边界：** Bot Handler 只做输入解析与展示，不承载业务判定。

**技术栈：** TypeScript、Node.js、Mongoose、Bull Queue、node-telegram-bot-api、Vitest

## 三、现状诊断

### 已实现

- 单条任务链（创建、完成、失败清零）
- Bull Queue 进度提醒
- 15 分钟预约提醒（仅发提示）
- 基础统计、修仙奖励

### 未实现

- 主链 / 辅助链双链结构
- 神圣座位标志物
- 下必为例判例持久化
- 预约兑现约束（点击后应建任务，当前只发文案）
- 预约延期处理
- 任务分层节点（`# / ## / ###`）
- RSIP 回溯定式、定式树
- 每日最多新增一个定式
- 堆栈式删除、稳态跃迁

### 已声明但未落地

`/patterns`、`/export`、真正可用的 `/week`、真正可用的 `/settings`

## 四、多人协作规则

### 分支策略

| 规则 | 约定 |
|------|------|
| 基线分支 | `feature/ctdp-rsip-parity` |
| 子任务分支 | `feature/ctdp-rsip-parity-taskN-<scope>` |
| 提交粒度 | 每个任务至少 1 次可回滚提交，禁止跨任务混提 |
| 提交前 | 必须执行该任务的最小验证命令 |

### 文件所有权

| 角色 | 负责目录 |
|------|----------|
| Worker A | `src/models/**`、`src/types/**`、`tests/unit/models/**` |
| Worker B | `src/services/**`、`tests/unit/services/**`、`tests/integration/**` |
| Worker C | `src/handlers/**`、`src/bot.ts`、`src/config/bot.ts`、`docs/**` |
| 集成专用 | `src/models/index.ts`、`src/services/index.ts`、`src/utils/constants.ts` |

### 合并纪律

1. 同一时刻只允许 1 个任务修改共用文件
2. 不得重写他人未合并分支中的同名导出；新增导出必须先在任务说明中锁定命名
3. 所有接口名、状态枚举、回调前缀必须先以测试或类型定义固化，再进入实现
4. 每个任务结束时在 PR 描述中写清：写入文件集合、验证命令、未覆盖风险

### 验收门槛

- 没有测试的协议规则 → 视为未完成
- 只写文案、不落持久化状态机 → 视为未完成
- 只加命令入口、不打通 Bull Queue / 数据模型 / 回调闭环 → 视为未完成

## 五、需求映射

### 来自《论自控力》的硬要求

| 协议 | 硬要求 |
|------|--------|
| CTDP 主链 | 神圣座位标志、专注任务节点、失败立即清零、节点编号递增 |
| CTDP 辅助链 | 预约信号、15 分钟内必须启动主链任务、未兑现也走下必为例 |
| 下必为例 | 违规时只能二选一："断链"或"永久允许该类行为" |
| CTDP 分层 | 支持 `#n / ##n / ###n` 不同尺度的链节点 |
| RSIP | 对"不可逃逸区"记录回溯点，沉淀为定式 |
| 定式树 | 每天最多新增 1 个定式；删除父定式必须级联删除所有子定式 |

### 当前代码可复用部分

- `TaskService.ts`：已有任务创建、完成、失败清零、进度提醒调度
- `TaskChain.ts`：已有任务数组、破链方法、索引和统计修正
- `QueueService.ts`：已有 Bull Queue 延迟任务基础设施
- 修仙系统：继续作为"任务成功后的奖励层"，不参与协议判定

## 六、文件结构

### 新增文件

```
src/models/MainChain.ts            # 主链模型
src/models/AuxChain.ts             # 辅助链模型
src/models/PrecedentRule.ts        # 判例规则模型
src/models/PatternTree.ts          # 定式树模型
src/services/CTDPService.ts        # CTDP 协议服务
src/services/PrecedentService.ts   # 判例服务
src/services/RSIPService.ts        # RSIP 定式服务
src/handlers/protocolCommands.ts   # 协议命令处理器
tests/unit/models/MainChain.test.ts
tests/unit/models/AuxChain.test.ts
tests/unit/services/CTDPService.test.ts
tests/unit/services/PrecedentService.test.ts
tests/unit/services/RSIPService.test.ts
tests/integration/ctdp-reservation-flow.test.ts
tests/integration/rsip-pattern-tree.test.ts
```

### 修改文件

```
src/models/index.ts          # 注册新模型
src/types/models.ts          # 新增类型定义
src/types/services.ts        # 新增服务类型
src/services/index.ts        # 导出新服务
src/services/TaskService.ts  # 适配 CTDP 调用
src/services/QueueService.ts # 增加延期与兑现 API
src/handlers/taskCommands.ts # 接入 CTDP 回调
src/handlers/coreCommands.ts # 状态展示升级
src/bot.ts                   # 注册新回调路由
src/config/bot.ts            # 注册新命令
src/utils/constants.ts       # 新增回调前缀
docs/COMMANDS_LIST.md        # 命令文档更新
README.md                    # 项目文档更新
```

---

## 七、任务分解

### 任务 1：用测试锁定 CTDP / RSIP 缺口

**目标：** 写失败测试，明确当前代码不满足哪些协议行为。

**涉及文件：**
- 新建：`tests/integration/ctdp-reservation-flow.test.ts`
- 新建：`tests/integration/rsip-pattern-tree.test.ts`
- 修改：`tests/unit/services/TaskService.test.ts`

- [ ] **步骤 1：写失败测试，明确当前不满足的协议行为**

```ts
test('预约到点后点击立即开始，应直接兑现为绑定 reservationId 的主链任务', async () => {
  const result = await ctdpService.startReservedTask(userId, reservationId);

  expect(result.mainTask.isReserved).toBe(true);
  expect(result.mainTask.reservationId).toBe(reservationId);
  expect(result.auxChain.pendingReservation).toBeNull();
});

test('出现新违规时，只允许 break 或 allow-precedent 两种决定', async () => {
  const violation = await precedentService.reportViolation({
    userId,
    chainId,
    behaviorKey: 'reply_message'
  });

  expect(violation.requiresDecision).toBe(true);
  expect(violation.options).toEqual(['break_chain', 'allow_forever']);
});

test('删除父定式时必须级联删除全部子定式', async () => {
  const summary = await rsipService.deletePatternStack(treeId, parentNodeId);
  expect(summary.removedNodeIds).toEqual([parentNodeId, child1Id, child2Id]);
});
```

- [ ] **步骤 2：运行新测试，确认当前代码失败**

```bash
yarn vitest run tests/integration/ctdp-reservation-flow.test.ts tests/integration/rsip-pattern-tree.test.ts
```

预期：失败——缺少 service / model / handler 导出

- [ ] **步骤 3：为现有 TaskService 增加"当前实现边界"测试**

```ts
test('当前 start_reserved 回调只发提示，不会创建任务', async () => {
  await handlers.handleStartReservedCallback(userId, `start_reserved_${reservationId}`);
  expect(taskService.createTask).not.toHaveBeenCalled();
});
```

- [ ] **步骤 4：提交测试基线**

```bash
git add tests/integration/ctdp-reservation-flow.test.ts tests/integration/rsip-pattern-tree.test.ts tests/unit/services/TaskService.test.ts
git commit -m "test: lock missing ctdp and rsip behaviors"
```

---

### 任务 2：建立 CTDP 持久化模型

**目标：** 实现 MainChain、AuxChain、PrecedentRule 三个 Mongoose 模型。

**涉及文件：**
- 新建：`src/models/MainChain.ts`、`src/models/AuxChain.ts`、`src/models/PrecedentRule.ts`
- 修改：`src/models/index.ts`、`src/types/models.ts`
- 测试：`tests/unit/models/MainChain.test.ts`、`tests/unit/models/AuxChain.test.ts`

- [ ] **步骤 1：写 MainChain / AuxChain / PrecedentRule 的模型测试**

```ts
expect(mainChain.sacredMarker.type).toBe('seat');
expect(mainChain.levelCounters.unit).toBe(0);
expect(auxChain.pendingReservation?.deadlineAt).toBeInstanceOf(Date);
expect(precedent.scope.behaviorKey).toBe('reply_message');
```

- [ ] **步骤 2：运行模型测试，确认失败**

```bash
yarn vitest run tests/unit/models/MainChain.test.ts tests/unit/models/AuxChain.test.ts
```

预期：失败——模型文件不存在

- [ ] **步骤 3：写 MainChain 最小模型实现**

```ts
const mainChainSchema = new Schema({
  userId: { type: Number, index: true, required: true },
  chainId: { type: String, unique: true, required: true },
  sacredMarker: {
    type: { type: String, enum: ['seat', 'object', 'message', 'custom'], required: true },
    label: { type: String, required: true }
  },
  levelCounters: {
    unit: { type: Number, default: 0 },
    group: { type: Number, default: 0 },
    cluster: { type: Number, default: 0 }
  },
  nodes: [{
    nodeNo: { type: Number, required: true },
    level: { type: String, enum: ['unit', 'group', 'cluster'], required: true },
    taskId: { type: String, required: true },
    status: { type: String, enum: ['running', 'completed', 'failed'], required: true }
  }],
  status: { type: String, enum: ['active', 'broken'], default: 'active' }
});
```

- [ ] **步骤 4：给 AuxChain 落预约状态**

```ts
pendingReservation: {
  reservationId: String,
  signal: String,
  createdAt: Date,
  deadlineAt: Date,
  status: { type: String, enum: ['pending', 'fulfilled', 'expired', 'cancelled'] }
}
```

- [ ] **步骤 5：给 PrecedentRule 落"永久允许"判例**

```ts
scope: {
  behaviorKey: { type: String, index: true, required: true },
  chainType: { type: String, enum: ['main', 'aux'], required: true }
},
decision: { type: String, enum: ['allow_forever'], required: true }
```

- [ ] **步骤 6：运行模型测试**

```bash
yarn vitest run tests/unit/models/MainChain.test.ts tests/unit/models/AuxChain.test.ts
```

预期：通过

- [ ] **步骤 7：提交**

```bash
git add src/models/MainChain.ts src/models/AuxChain.ts src/models/PrecedentRule.ts src/models/index.ts src/types/models.ts tests/unit/models/MainChain.test.ts tests/unit/models/AuxChain.test.ts
git commit -m "feat: add ctdp persistence models"
```

---

### 任务 3：实现主链与神圣座位执行闭环

**目标：** 实现 CTDPService，打通"创建主链任务 → 失败清零"的完整路径。

**涉及文件：**
- 新建：`src/services/CTDPService.ts`
- 修改：`src/services/TaskService.ts`、`src/types/services.ts`
- 测试：`tests/unit/services/CTDPService.test.ts`

- [ ] **步骤 1：先写失败测试，约束主链行为**

```ts
test('startMainTask 应基于 sacredMarker 创建 node #1', async () => {
  const result = await ctdpService.startMainTask(userId, {
    markerLabel: '书桌左侧椅',
    description: '学习数学',
    duration: 60
  });

  expect(result.mainChain.nodes[0]?.nodeNo).toBe(1);
  expect(result.task.description).toBe('学习数学');
});

test('failMainTask 应清空主链节点计数', async () => {
  const result = await ctdpService.failMainTask(userId, chainId, nodeId, 'manual_abort');
  expect(result.mainChain.status).toBe('broken');
  expect(result.mainChain.levelCounters.unit).toBe(0);
  expect(result.mainChain.nodes).toHaveLength(0);
});
```

- [ ] **步骤 2：运行测试，确认失败**

```bash
yarn vitest run tests/unit/services/CTDPService.test.ts
```

预期：失败——服务不存在

- [ ] **步骤 3：实现 CTDPService 主链最小版本**

```ts
async startMainTask(userId: number, input: StartMainTaskInput) {
  const mainChain = await this.mainChainRepo.findOrCreateActive(userId, input.markerLabel);
  const nextNodeNo = mainChain.levelCounters.unit + 1;

  const taskResult = await this.taskService.createTask(
    userId,
    input.description,
    input.duration,
    input.isReserved ?? false,
    input.reservationId ?? null
  );

  mainChain.nodes.push({
    nodeNo: nextNodeNo,
    level: 'unit',
    taskId: taskResult.task.taskId,
    status: 'running'
  });
  mainChain.levelCounters.unit = nextNodeNo;

  await mainChain.save();
  return { mainChain, task: taskResult.task };
}
```

- [ ] **步骤 4：在失败路径里同步 TaskService 与 MainChain**

```ts
async failMainTask(userId: number, chainId: string, nodeNo: number, reason: string) {
  const mainChain = await MainChain.findOne({ userId, chainId, status: 'active' });
  const node = mainChain?.nodes.find((entry) => entry.nodeNo === nodeNo);
  if (!mainChain || !node) throw new Error('主链节点不存在');

  await this.taskService.completeTask(userId, node.taskId, false, reason);
  mainChain.nodes = [];
  mainChain.levelCounters = { unit: 0, group: 0, cluster: 0 };
  mainChain.status = 'broken';
  await mainChain.save();
  return { mainChain };
}
```

- [ ] **步骤 5：运行测试**

```bash
yarn vitest run tests/unit/services/CTDPService.test.ts tests/unit/services/TaskService.test.ts
```

预期：通过

- [ ] **步骤 6：提交**

```bash
git add src/services/CTDPService.ts src/services/TaskService.ts src/types/services.ts tests/unit/services/CTDPService.test.ts tests/unit/services/TaskService.test.ts
git commit -m "feat: implement ctdp main chain flow"
```

---

### 任务 4：实现辅助链、预约兑现和延期

**目标：** 让预约到点后点击"立即开始"真正创建主链任务，并支持延期。

**涉及文件：**
- 修改：`src/services/QueueService.ts`、`src/handlers/taskCommands.ts`、`src/bot.ts`、`src/utils/constants.ts`
- 测试：`tests/integration/ctdp-reservation-flow.test.ts`

- [ ] **步骤 1：先写失败测试，锁定预约兑现**

```ts
test('点击 start_reserved 后应立即创建绑定 reservationId 的主链任务', async () => {
  await bot.handleCallbackQuery(callbackOf(`start_reserved_${reservationId}`));
  const task = await findTaskByReservation(reservationId);
  expect(task?.status).toBe('running');
});

test('点击 delay_reservation 后应更新 deadlineAt 并重排 Bull Job', async () => {
  const result = await ctdpService.delayReservation(userId, reservationId, 5);
  expect(result.deadlineAt.getTime()).toBeGreaterThan(previousDeadline.getTime());
});
```

- [ ] **步骤 2：运行集成测试，确认失败**

```bash
yarn vitest run tests/integration/ctdp-reservation-flow.test.ts
```

预期：失败——`delay_reservation_` 未处理，`start_reserved_` 不会建任务

- [ ] **步骤 3：给 QueueService 增加延期与兑现 API**

```ts
async rescheduleReservation(reservationId: string, delayMs: number) {
  const job = await this.getReservationQueue().getJob(reservationId);
  if (!job) throw new Error('预约不存在');
  await job.remove();
  return this.getReservationQueue().add('reservation', { ...job.data }, { delay: delayMs, jobId: reservationId });
}
```

- [ ] **步骤 4：在 task handler 中把 start_reserved 接到 CTDPService**

```ts
const reservationId = data.replace(CALLBACK_PREFIXES.START_RESERVED, '');
const result = await this.ctdpService.startReservedTask(userId, reservationId);
await this.bot.sendMessage(userId, `🚀 已开始预约任务：${result.task.description}`);
```

- [ ] **步骤 5：补上 delay_reservation 回调分支**

```ts
if (data.startsWith(CALLBACK_PREFIXES.DELAY_RESERVATION)) {
  await this.getTaskHandlers().handleDelayReservationCallback(userId, data);
}
```

- [ ] **步骤 6：运行集成测试**

```bash
yarn vitest run tests/integration/ctdp-reservation-flow.test.ts
```

预期：通过

- [ ] **步骤 7：提交**

```bash
git add src/services/QueueService.ts src/handlers/taskCommands.ts src/bot.ts src/utils/constants.ts tests/integration/ctdp-reservation-flow.test.ts
git commit -m "feat: enforce ctdp reservation fulfillment flow"
```

---

### 任务 5：实现"下必为例"判例系统

**目标：** 违规时只允许"断链"或"永久允许"两种决策，并持久化判例。

**涉及文件：**
- 新建：`src/services/PrecedentService.ts`
- 修改：`src/services/CTDPService.ts`、`src/handlers/taskCommands.ts`
- 测试：`tests/unit/services/PrecedentService.test.ts`

- [ ] **步骤 1：写失败测试，锁定两种唯一决策**

```ts
test('未知违规应返回 decision_required', async () => {
  const result = await precedentService.reportViolation({
    userId,
    chainType: 'main',
    chainId,
    behaviorKey: 'reply_message'
  });

  expect(result.requiresDecision).toBe(true);
  expect(result.options).toEqual(['break_chain', 'allow_forever']);
});

test('allow_forever 后，相同行为下次应直接放行', async () => {
  await precedentService.allowForever({ userId, chainType: 'main', behaviorKey: 'reply_message' });
  const result = await precedentService.reportViolation({ userId, chainType: 'main', chainId, behaviorKey: 'reply_message' });
  expect(result.requiresDecision).toBe(false);
  expect(result.decision).toBe('allow_forever');
});
```

- [ ] **步骤 2：运行测试，确认失败**

```bash
yarn vitest run tests/unit/services/PrecedentService.test.ts
```

预期：失败——服务不存在

- [ ] **步骤 3：实现判例服务**

```ts
async reportViolation(input: ViolationInput) {
  const precedent = await PrecedentRule.findOne({
    userId: input.userId,
    'scope.behaviorKey': input.behaviorKey,
    'scope.chainType': input.chainType
  });

  if (precedent) {
    return { requiresDecision: false, decision: precedent.decision };
  }

  return { requiresDecision: true, options: ['break_chain', 'allow_forever'] as const };
}
```

- [ ] **步骤 4：在 handler 中补交互按钮**

```ts
reply_markup: {
  inline_keyboard: [[
    { text: '💥 断链', callback_data: `precedent_break_${violationId}` },
    { text: '✅ 永久允许', callback_data: `precedent_allow_${violationId}` }
  ]]
}
```

- [ ] **步骤 5：运行测试**

```bash
yarn vitest run tests/unit/services/PrecedentService.test.ts
```

预期：通过

- [ ] **步骤 6：提交**

```bash
git add src/services/PrecedentService.ts src/services/CTDPService.ts src/handlers/taskCommands.ts tests/unit/services/PrecedentService.test.ts
git commit -m "feat: add precedent rule engine"
```

---

### 任务 6：实现 RSIP 定式树核心

**目标：** 实现定式树模型与服务，包括每日新增限制和堆栈式级联删除。

**涉及文件：**
- 新建：`src/models/PatternTree.ts`、`src/services/RSIPService.ts`
- 修改：`src/models/index.ts`、`src/types/models.ts`、`src/types/services.ts`
- 测试：`tests/unit/services/RSIPService.test.ts`、`tests/integration/rsip-pattern-tree.test.ts`

- [ ] **步骤 1：写失败测试，约束 RSIP 最小能力**

```ts
test('每天最多新增一个定式', async () => {
  await rsipService.addPattern(userId, { title: '不带手机上床' });
  await expect(
    rsipService.addPattern(userId, { title: '回家15分钟内洗澡' })
  ).rejects.toThrow('今日已添加过新定式');
});

test('删除父定式时按堆栈结构级联删除子定式', async () => {
  const result = await rsipService.deletePatternStack(treeId, rootNodeId);
  expect(result.removedNodeIds).toEqual([rootNodeId, childNodeId, grandChildNodeId]);
});
```

- [ ] **步骤 2：运行测试，确认失败**

```bash
yarn vitest run tests/unit/services/RSIPService.test.ts tests/integration/rsip-pattern-tree.test.ts
```

预期：失败——模型 / 服务不存在

- [ ] **步骤 3：实现 PatternTree 模型**

```ts
nodes: [{
  nodeId: { type: String, required: true },
  parentId: { type: String, default: null },
  title: { type: String, required: true },
  status: { type: String, enum: ['pending', 'active', 'failed', 'deleted'], default: 'pending' },
  createdOn: { type: String, required: true },
  children: [{ type: String }]
}],
limits: {
  maxNewPatternsPerDay: { type: Number, default: 1 }
}
```

- [ ] **步骤 4：实现 RSIPService 的新增与级联删除**

```ts
async addPattern(userId: number, input: AddPatternInput) {
  const today = dayjs().format('YYYY-MM-DD');
  const alreadyAdded = tree.nodes.some((node) => node.createdOn === today);
  if (alreadyAdded) throw new Error('今日已添加过新定式');
  // create node and attach to parent
}

async deletePatternStack(treeId: string, nodeId: string) {
  const removedNodeIds = collectDescendants(tree.nodes, nodeId);
  tree.nodes = tree.nodes.filter((node) => !removedNodeIds.includes(node.nodeId));
  await tree.save();
  return { removedNodeIds };
}
```

- [ ] **步骤 5：运行测试**

```bash
yarn vitest run tests/unit/services/RSIPService.test.ts tests/integration/rsip-pattern-tree.test.ts
```

预期：通过

- [ ] **步骤 6：提交**

```bash
git add src/models/PatternTree.ts src/services/RSIPService.ts src/models/index.ts src/types/models.ts src/types/services.ts tests/unit/services/RSIPService.test.ts tests/integration/rsip-pattern-tree.test.ts
git commit -m "feat: add rsip pattern tree core"
```

---

### 任务 7：接入命令、文档和状态展示

**目标：** 注册新命令、升级状态展示、同步文档。

**涉及文件：**
- 新建：`src/handlers/protocolCommands.ts`
- 修改：`src/config/bot.ts`、`src/bot.ts`、`src/handlers/coreCommands.ts`、`docs/COMMANDS_LIST.md`、`README.md`
- 测试：`tests/unit/bot.test.ts`

- [ ] **步骤 1：写失败测试，锁定新命令注册**

```ts
expect(commands.map((item) => item.command)).toContain('patterns');
expect(commands.map((item) => item.command)).toContain('precedents');
```

- [ ] **步骤 2：运行测试，确认失败**

```bash
yarn vitest run tests/unit/bot.test.ts
```

预期：失败——缺少命令 / 回调路由

- [ ] **步骤 3：注册协议命令**

```ts
{ command: 'patterns', description: '查看和管理 RSIP 定式树' },
{ command: 'precedents', description: '查看下必为例判例' },
{ command: 'reserve_status', description: '查看辅助链预约状态' }
```

- [ ] **步骤 4：把 `/week` 和 `/settings` 从"敬请期待"改为真实状态或明确标记为未完成能力**

```ts
statusMessage += `\n🧠 主链节点：${mainChain.nodes.length}`;
statusMessage += `\n⏰ 预约链状态：${auxChain.pendingReservation?.status ?? '无预约'}`;
statusMessage += `\n📚 判例数：${precedentCount}`;
statusMessage += `\n🌲 定式树节点：${patternCount}`;
```

- [ ] **步骤 5：更新 README 与命令清单，去掉未实现宣传或改成阶段性说明**

```md
- `/patterns`：查看 RSIP 定式树
- `/precedents`：查看已永久允许的行为规则
- `/reserve_status`：查看当前辅助链预约
```

- [ ] **步骤 6：运行测试**

```bash
yarn vitest run tests/unit/bot.test.ts tests/unit/handlers/coreCommands.test.ts
```

预期：通过

- [ ] **步骤 7：提交**

```bash
git add src/handlers/protocolCommands.ts src/config/bot.ts src/bot.ts src/handlers/coreCommands.ts docs/COMMANDS_LIST.md README.md tests/unit/bot.test.ts
git commit -m "feat: expose ctdp and rsip commands"
```

---

### 任务 8：端到端验证与收尾

**目标：** 确保所有协议测试通过、类型检查通过、现有功能无回归。

**涉及文件：**
- 修改：`tests/setup.ts`（仅当需要修复 MongoMemoryServer 超时时）
- 修改：`package.json`（仅当测试命令需要稳定参数时）
- 修改：`docs/superpowers/plans/2026-04-08-ctdp-rsip-parity-plan.md`（勾选已完成项）

- [ ] **步骤 1：运行协议相关最小测试集**

```bash
yarn vitest run tests/unit/models/MainChain.test.ts tests/unit/models/AuxChain.test.ts tests/unit/services/CTDPService.test.ts tests/unit/services/PrecedentService.test.ts tests/unit/services/RSIPService.test.ts tests/integration/ctdp-reservation-flow.test.ts tests/integration/rsip-pattern-tree.test.ts
```

预期：通过

- [ ] **步骤 2：运行现有核心回归**

```bash
yarn vitest run tests/unit/services/TaskService.test.ts tests/unit/bot.test.ts tests/system-validation.test.ts
```

预期：通过

- [ ] **步骤 3：运行类型检查**

```bash
yarn typecheck
```

预期：通过

- [ ] **步骤 4：运行完整测试**

```bash
yarn test
```

预期：通过

- [ ] **步骤 5：若 `mongodb-memory-server` 首次下载导致 hook 超时，修复测试基建后重跑**

```ts
beforeAll(async () => {
  mongod = await MongoMemoryServer.create({ binary: { version: '7.0.14' } });
}, 60_000);
```

- [ ] **步骤 6：生成验收记录并提交**

```bash
git add tests/setup.ts package.json docs/superpowers/plans/2026-04-08-ctdp-rsip-parity-plan.md
git commit -m "chore: verify ctdp rsip parity implementation"
```

---

## 八、自检清单

### 协议覆盖度

| 协议能力 | 覆盖任务 |
|----------|----------|
| CTDP 主链 | 任务 2、3、4 |
| 辅助链 | 任务 2、4 |
| 下必为例 | 任务 5 |
| 分层节点与神圣座位 | 任务 2、3 |
| RSIP 定式树 | 任务 6 |
| 命令与文档一致性 | 任务 7 |
| 验证闭环 | 任务 8 |

### 占位符扫描

- 无 `TODO` / `TBD` / "自行实现"
- 每个任务都给出文件、最小代码骨架、运行命令、期望结果、提交动作

### 类型一致性

- 模型命名：`MainChain` / `AuxChain` / `PrecedentRule` / `PatternTree`
- 决策值：`break_chain` / `allow_forever`
- 回调前缀：`start_reserved_` / `delay_reservation_`，新增时必须在 `src/utils/constants.ts` 中声明

## 九、执行顺序建议

1. 任务 1（锁定缺口测试）
2. 任务 2（CTDP 模型）与任务 6（RSIP 模型）可并行，但不能同时改 `src/models/index.ts`
3. 任务 3（主链闭环）
4. 任务 4（辅助链 + 预约兑现）
5. 任务 5（判例系统）
6. 任务 7（命令接入）
7. 任务 8（端到端验证）

## 十、风险提示

| 风险 | 影响 | 应对 |
|------|------|------|
| `TaskService` 创建新任务时自动取消旧运行任务 | 与"辅助链到主链自动兑现"接入后可能出现竞争条件 | 接入后重新检查并发路径 |
| `taskCommands.ts` 的 `handleStartReservedCallback` 只发提示不建任务 | 最显著的"文案代替功能"缺口 | 任务 4 优先修复 |
| 测试基建首次下载 MongoDB Binary 可能超时 | 多人协作会反复误判失败原因 | 任务 8 步骤 5 优先稳定 |

---

## 执行方式选择

**方式一：子代理驱动（推荐）** — 每个任务派发独立子代理，任务间人工审查，快速迭代

**方式二：内联执行** — 在当前会话中使用 `executing-plans` 技能批量执行，设检查点
