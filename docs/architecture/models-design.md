# 模型层设计

## 概述

模型层是项目的数据持久化层，使用Mongoose ODM与MongoDB进行交互。主要包括以下模型：

1. **User** - 用户模型
2. **TaskChain** - 任务链模型
3. **DailyStats** - 每日统计模型
4. **DivinationHistory** - 占卜历史模型

## 1. User - 用户模型

### 模型结构

```typescript
interface UserDocument {
  userId: number;          // Telegram用户ID
  createdAt: Date;         // 创建时间
  updatedAt: Date;         // 更新时间

  // 用户设置
  settings: {
    defaultDuration: number; // 默认任务时长（分钟）
  };

  // 修仙状态
  cultivation: {
    spiritualPower: number;  // 灵力值
    realm: string;          // 当前境界
    realmStage: string;     // 境界阶段
    immortalStones: number; // 仙石数量
    ascensions: number;     // 飞升次数
    immortalMarks: number;  // 仙位印记
    fortuneEventsTriggered: number; // 触发仙缘事件次数
    breakthroughSuccesses: number; // 突破成功次数
    breakthroughFailures: number;  // 突破失败次数
  };

  // 统计数据
  stats: {
    currentStreak: number;   // 当前连击数
    longestStreak: number;   // 最长连击数
    totalTasks: number;      // 总任务数
    completedTasks: number;  // 完成任务数
    failedTasks: number;     // 失败任务数
    totalMinutes: number;    // 总专注分钟数
    lastTaskDate: Date;      // 最后任务日期
  };

  // 成就系统
  achievements: string[];    // 获得的成就列表

  // 方法
  updateStreak(success: boolean): void;      // 更新连击数
  addSpiritualPower(amount: number): void;   // 增加灵力
  addImmortalStones(amount: number): void;   // 增加仙石
  updateRealm(realm: Realm): void;          // 更新境界
  updateRealmStage(stage: string): void;    // 更新境界阶段
  recordBreakthrough(success: boolean): void; // 记录突破
  addAchievement(name: string): void;       // 添加成就
  ascend(): void;                         // 飞升
}
```

### 数据库索引

```javascript
userSchema.index({ userId: 1 }, { unique: true });
userSchema.index({ 'cultivation.realm': 1 });
userSchema.index({ 'stats.currentStreak': -1 });
userSchema.index({ 'stats.totalMinutes': -1 });
```

### 核心方法

#### `updateStreak(success: boolean)`
更新用户连击数

**逻辑：**
- 成功时：currentStreak + 1，如果大于longestStreak则更新
- 失败时：currentStreak = 0

#### `addSpiritualPower(amount: number)`
增加灵力值

**逻辑：**
- 灵力值不能为负数
- 自动处理境界变化

#### `addImmortalStones(amount: number)`
增加仙石数量

**逻辑：**
- 简单的数值增加

#### `updateRealm(realm: Realm)`
更新用户境界

**逻辑：**
- 设置新的境界
- 记录境界变化

#### `updateRealmStage(stage: string)`
更新境界阶段

**逻辑：**
- 设置新的境界阶段

#### `recordBreakthrough(success: boolean)`
记录突破结果

**逻辑：**
- 成功时：增加breakthroughSuccesses
- 失败时：增加breakthroughFailures

#### `addAchievement(name: string)`
添加成就

**逻辑：**
- 检查是否已获得该成就
- 如果未获得则添加到achievements数组

#### `ascend()`
执行飞升

**逻辑：**
- 增加ascensions计数
- 增加immortalMarks
- 重置灵力和境界

## 2. TaskChain - 任务链模型

### 模型结构

```typescript
interface TaskChainDocument {
  userId: number;          // 用户ID
  chainId: string;         // 链ID
  title: string;          // 链标题
  status: 'active' | 'broken'; // 链状态
  createdAt: Date;         // 创建时间
  updatedAt: Date;         // 更新时间

  // 任务列表
  tasks: ITask[];         // 任务数组

  // 统计数据
  totalTasks: number;      // 总任务数
  completedTasks: number;  // 完成任务数
  failedTasks: number;     // 失败任务数
  totalMinutes: number;    // 总专注分钟数
  lastTaskCompletedAt: Date; // 最后任务完成时间

  // 方法
  breakChain(reason: string, failedTaskId: string): void; // 破坏链条
}
```

### 任务结构 (ITask)

```typescript
interface ITask {
  taskId: string;         // 任务ID
  description: string;    // 任务描述
  duration: number;       // 任务时长（分钟）
  startTime: Date;        // 开始时间
  endTime?: Date;         // 结束时间
  actualDuration?: number; // 实际时长（分钟）
  status: 'running' | 'completed' | 'failed' | 'cancelled'; // 任务状态
  isReserved: boolean;    // 是否为预约任务
  reservationId?: string; // 预约ID
  metadata: {
    progressReminders: any[]; // 进度提醒记录
    interruptions: any[];    // 中断记录
    notes: string;          // 备注
  };
}
```

### 数据库索引

```javascript
taskChainSchema.index({ userId: 1, status: 1 });
taskChainSchema.index({ 'tasks.taskId': 1 });
taskChainSchema.index({ 'tasks.status': 1 });
```

### 核心方法

#### `breakChain(reason: string, failedTaskId: string)`
破坏任务链（神圣座位原理）

**逻辑：**
- 设置status为'broken'
- 清空所有任务
- 重置统计数据
- 记录破坏原因和失败任务ID

## 3. DailyStats - 每日统计模型

### 模型结构

```typescript
interface DailyStatsDocument {
  userId: number;         // 用户ID
  date: Date;            // 统计日期
  createdAt: Date;        // 创建时间
  updatedAt: Date;        // 更新时间

  // 统计数据
  stats: {
    tasksStarted: number;  // 开始任务数
    tasksCompleted: number; // 完成任务数
    tasksFailed: number;   // 失败任务数
    totalMinutes: number;  // 总专注分钟数
    successRate: number;   // 成功率
  };

  // 元数据
  metadata: {
    lastTaskAt: Date;     // 最后任务时间
  };
}
```

### 数据库索引

```javascript
dailyStatsSchema.index({ userId: 1, date: 1 }, { unique: true });
dailyStatsSchema.index({ 'stats.successRate': -1 });
dailyStatsSchema.index({ 'stats.totalMinutes': -1 });
```

### 核心逻辑

#### 自动统计计算
- 每次任务完成时更新统计数据
- 计算成功率：tasksCompleted / tasksStarted * 100
- 确保日期重置（每天重置统计数据）

## 4. DivinationHistory - 占卜历史模型

### 模型结构

```typescript
interface DivinationHistoryDocument {
  userId: number;         // 用户ID
  gameId: string;         // 游戏ID
  betAmount: number;      // 投注金额
  diceRoll: number;       // 骰子点数
  guaName: string;        // 卦名
  guaEmoji: string;       // 卦符号
  meaning: string;        // 卦意
  multiplier: number;     // 倍率
  result: number;         // 结果
  stonesAfter: number;    // 操作后仙石数
  powerBefore: number;    // 操作前灵力
  powerAfter: number;     // 操作后灵力
  realmBefore: string;    // 操作前境界
  realmAfter: string;     // 操作后境界
  realmChanged: boolean;  // 境界是否变化
  createdAt: Date;        // 创建时间
}
```

### 数据库索引

```javascript
divinationHistorySchema.index({ userId: 1 });
divinationHistorySchema.index({ createdAt: -1 });
divinationHistorySchema.index({ 'realmChanged': 1 });
```

### 核心方法

#### 静态方法
- `getUserHistory(userId, limit)` - 获取用户占卜历史
- `getUserStats(userId)` - 获取用户占卜统计

## 模型关系

```
User
├── 多个 TaskChain
│   ├── 多个 Task
│   └── DailyStats（每日）
└── DivinationHistory（占卜历史）
```

## 设计原则

1. **数据一致性**：确保数据模型的完整性和一致性
2. **性能优化**：合理的数据库索引设计
3. **可扩展性**：易于添加新的数据字段和模型
4. **类型安全**：使用TypeScript进行类型检查
5. **文档化**：完善的模型文档和注释

## 数据库设计考虑

1. **分片策略**：考虑用户数据的分片
2. **备份策略**：定期备份数据
3. **数据清理**：定期清理过期数据
4. **监控**：监控数据库性能和健康状况

## 模型验证

1. **数据验证**：使用Mongoose验证器确保数据完整性
2. **默认值**：提供合理的默认值
3. **必填字段**：标记必填字段
4. **数据格式**：确保数据格式正确

## 扩展性

1. **新模型添加**：可以轻松添加新的数据模型
2. **字段扩展**：支持动态添加新的数据字段
3. **关系管理**：灵活的关系管理
4. **查询优化**：支持复杂的查询需求

## 测试策略

1. **单元测试**：每个模型的单元测试
2. **集成测试**：模型之间的集成测试
3. **数据验证测试**：验证数据完整性和一致性
4. **性能测试**：测试大数据量下的性能表现