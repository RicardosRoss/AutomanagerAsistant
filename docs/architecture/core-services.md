# 核心服务模块

## 概述

核心服务模块是项目的业务逻辑层，负责处理具体的业务功能。主要包括三个核心服务：

1. **TaskService** - 任务管理服务
2. **CTDPService** - CTDP协议实现服务
3. **CultivationService** - 修仙系统服务

## 1. TaskService - 任务管理服务

### 功能职责
- 创建和管理专注任务
- 处理任务完成和失败逻辑
- 管理任务进度提醒
- 更新用户统计数据

### 主要方法

#### `createTask(userId, description, duration, isReserved, reservationId)`
创建新的专注任务

**参数：**
- `userId`: 用户ID
- `description`: 任务描述
- `duration`: 任务时长（分钟）
- `isReserved`: 是否为预约任务
- `reservationId`: 预约ID（可选）

**返回：** `{ chain, task, user }`

#### `completeTask(userId, taskId, success, failureReason)`
完成任务处理

**参数：**
- `userId`: 用户ID
- `taskId`: 任务ID
- `success`: 是否成功完成
- `failureReason`: 失败原因（可选）

**返回：** `{ chain, task, user, wasChainBroken, cultivationReward }`

#### `getUserStatus(userId, options)`
获取用户当前状态

**参数：**
- `userId`: 用户ID
- `options`: 配置选项

**返回：** `{ user, activeChain, currentTask, todayStats, isActive, stats }`

#### `scheduleProgressReminders(userId, taskId, duration)`
安排任务进度提醒

**参数：**
- `userId`: 用户ID
- `taskId`: 任务ID
- `duration`: 任务时长（分钟）

#### `updateDailyStats(userId, task, success)`
更新每日统计数据

**参数：**
- `userId`: 用户ID
- `task`: 任务对象
- `success`: 是否成功

**返回：** `DailyStatsDocument`

### 核心逻辑

#### 任务创建流程
1. 查找或创建用户记录
2. 查找或创建活跃的任务链
3. 检查是否有正在运行的任务，如有则停止
4. 创建新任务并添加到任务链
5. 更新用户统计数据
6. 安排进度提醒

#### 任务完成流程
1. 验证任务状态和时长
2. 原子性更新任务状态
3. 成功时：
   - 增加完成计数
   - 更新总时长
   - 触发修仙奖励
   - 更新用户连击数
4. 失败时：
   - 增加失败计数
   - 重置任务链（神圣座位原理）
   - 重置用户连击数

## 2. CTDPService - CTDP协议实现服务

### 功能职责
- 实现神圣座位原理
- 管理主链和辅助链
- 处理预约系统
- 任务链状态管理

### 主要方法

#### `startMainTask(userId, input)`
启动主链任务

**参数：**
- `userId`: 用户ID
- `input`: 任务输入参数

**返回：** `{ mainChain, task }`

#### `completeMainTask(userId, chainId, nodeNo, taskId)`
完成主链任务

**参数：**
- `userId`: 用户ID
- `chainId`: 主链ID
- `nodeNo`: 节点编号
- `taskId`: 任务ID

**返回：** `{ mainChain, task, user, wasChainBroken, cultivationReward }`

#### `failMainTask(userId, chainId, nodeNo, reason)`
失败主链任务（触发神圣座位原理）

**参数：**
- `userId`: 用户ID
- `chainId`: 主链ID
- `nodeNo`: 节点编号
- `reason`: 失败原因

**返回：** `{ mainChain, task, user, wasChainBroken }`

#### `createReservation(userId, description, duration, reservationId)`
创建预约

**参数：**
- `userId`: 用户ID
- `description`: 任务描述
- `duration`: 任务时长（分钟）
- `reservationId`: 预约ID

**返回：** `AuxChainDocument`

#### `startReservedTask(userId, reservationId, description, duration)`
启动预约任务

**参数：**
- `userId`: 用户ID
- `reservationId`: 预约ID
- `description`: 任务描述（可选）
- `duration`: 任务时长（可选）

**返回：** `{ mainChain, task, auxChain }`

#### `delayReservation(userId, reservationId, delayMinutes)`
延迟预约

**参数：**
- `userId`: 用户ID
- `reservationId`: 预约ID
- `delayMinutes`: 延迟分钟数

**返回：** `{ auxChain, newJobId }`

#### `cancelReservation(userId, reservationId)`
取消预约

**参数：**
- `userId`: 用户ID
- `reservationId`: 预约ID

**返回：** `{ auxChain, queueCancelled, cancelled }`

### 核心逻辑

#### 主链管理
- 每个用户有一个主链，包含多个任务节点
- 节点按顺序编号，代表任务完成顺序
- 节点有不同级别（unit, group, cluster）
- 任何任务失败都会重置整个主链

#### 辅助链管理
- 处理预约系统
- 维护待处理的预约
- 记录预约历史
- 支持预约的延迟和取消

#### 神圣座位原理实现
- 任务失败时，主链状态设置为'broken'
- 清空所有节点
- 重置所有级别计数器
- 用户任务进度重置为零

## 3. CultivationService - 修仙系统服务

### 功能职责
- 管理用户的修仙状态
- 处理灵力修炼和奖励
- 实现占卜系统
- 处理境界突破和飞升

### 主要方法

#### `getCultivationStatus(userId)`
获取修仙状态

**参数：**
- `userId`: 用户ID

**返回：** `{ user, ...display, immortalStones, ascensions, ... }`

#### `awardCultivation(userId, duration)`
奖励修炼

**参数：**
- `userId`: 用户ID
- `duration`: 任务时长（分钟）

**返回：** `{ spiritualPower, immortalStones, bonus, fortuneEvent, ... }`

#### `castDivination(userId, betAmount)`
进行占卜

**参数：**
- `userId`: 用户ID
- `betAmount`: 投注仙石数量

**返回：** `{ roll, gua, betAmount, result, powerChange, ... }`

#### `attemptBreakthrough(userId)`
尝试突破

**参数：**
- `userId`: 用户ID

**返回：** `{ success, message, oldRealm, newRealm, ... }`

#### `ascend(userId)`
飞升

**参数：**
- `userId`: 用户ID

**返回：** `{ success, ascensionCount, immortalMarks, message }`

#### `getDivinationHistory(userId, limit)`
获取占卜历史

**参数：**
- `userId`: 用户ID
- `limit`: 记录数量限制

#### `getDivinationStats(userId)`
获取占卜统计

**参数：**
- `userId`: 用户ID

#### `getLeaderboard(type, limit)`
获取排行榜

**参数：**
- `type`: 排行榜类型
- `limit`: 记录数量限制

### 核心逻辑

#### 灵力修炼
- 根据任务时长和当前境界计算灵力奖励
- 随机触发仙缘事件获得额外奖励
- 境界提升时更新用户状态

#### 占卜系统
- 使用八卦占卜机制
- 投注仙石获得奖励
- 可能导致境界变化

#### 境界突破
- 检查是否达到突破条件
- 随机成功率决定突破结果
- 失败时有灵力惩罚和境界跌落风险

#### 飞升系统
- 大乘期修士可以飞升
- 需要足够的灵力
- 飞升后重置境界，获得仙位印记

## 服务依赖关系

```
TaskService
├── 依赖 QueueService（任务提醒）
└── 依赖 CultivationService（修仙奖励）

CTDPService
├── 依赖 TaskService（任务创建和管理）
└── 依赖 QueueService（预约管理）

CultivationService
└── 无直接依赖（独立服务）
```

## 设计特点

1. **单一职责原则**：每个服务只负责特定的业务功能
2. **依赖注入**：通过构造函数注入依赖服务
3. **错误处理**：完善的错误处理和日志记录
4. **类型安全**：使用TypeScript进行类型检查
5. **可测试性**：易于进行单元测试和集成测试

## 性能考虑

1. **数据库优化**：使用适当的索引和查询优化
2. **缓存策略**：合理使用Redis缓存
3. **异步处理**：使用Promise进行异步操作
4. **批量操作**：支持批量数据处理

## 扩展性

1. **插件架构**：可以轻松添加新的服务模块
2. **配置驱动**：通过配置文件调整服务行为
3. **模块化设计**：各服务之间松耦合
4. **接口标准化**：统一的接口设计模式