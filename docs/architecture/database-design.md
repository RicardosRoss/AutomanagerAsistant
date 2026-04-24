# 数据库设计

## 概述

数据库设计基于MongoDB和Mongoose ODM，采用文档型数据库结构，适合存储用户数据、任务链、修仙状态等半结构化数据。

## 数据库结构

### 1. 用户集合 (users)

```typescript
interface UserDocument {
  userId: number;          // Telegram用户ID (唯一索引)
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
}
```

### 索引设计

```javascript
// 唯一索引：确保每个Telegram用户唯一
userSchema.index({ userId: 1 }, { unique: true });

// 境界索引：按境界查询优化
userSchema.index({ 'cultivation.realm': 1 });

// 统计数据索引：按连击数和专注时间排序
userSchema.index({ 'stats.currentStreak': -1 });
userSchema.index({ 'stats.totalMinutes': -1 });

// 成就索引：按成就名称查询
userSchema.index({ 'achievements': 1 });
```

## 2. 任务链集合 (taskChains)

```typescript
interface TaskChainDocument {
  userId: number;          // 用户ID
  chainId: string;         // 链ID (唯一索引)
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
}
```

### 任务结构 (ITask)

```typescript
interface ITask {
  taskId: string;         // 任务ID (唯一索引)
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

### 索引设计

```javascript
// 复合索引：按用户ID和状态查询
taskChainSchema.index({ userId: 1, status: 1 });

// 任务ID索引：快速查找任务
taskChainSchema.index({ 'tasks.taskId': 1 });

// 任务状态索引：按任务状态查询
taskChainSchema.index({ 'tasks.status': 1 });

// 链ID唯一索引
taskChainSchema.index({ chainId: 1 }, { unique: true });
```

## 3. 每日统计集合 (dailyStats)

```typescript
interface DailyStatsDocument {
  userId: number;         // 用户ID
  date: Date;            // 统计日期 (唯一索引)
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

### 索引设计

```javascript
// 唯一索引：确保每个用户每天只有一个统计记录
dailyStatsSchema.index({ userId: 1, date: 1 }, { unique: true });

// 成功率索引：按成功率排序
dailyStatsSchema.index({ 'stats.successRate': -1 });

// 专注时间索引：按专注时间排序
dailyStatsSchema.index({ 'stats.totalMinutes': -1 });
```

## 4. 占卜历史集合 (divinationHistory)

```typescript
interface DivinationHistoryDocument {
  userId: number;         // 用户ID
  gameId: string;         // 游戏ID (唯一索引)
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

### 索引设计

```javascript
// 用户ID索引：按用户查询
divinationHistorySchema.index({ userId: 1 });

// 创建时间索引：按时间排序
divinationHistorySchema.index({ createdAt: -1 });

// 境界变化索引：按是否变化排序
divinationHistorySchema.index({ 'realmChanged': 1 });

// 游戏ID唯一索引
divinationHistorySchema.index({ gameId: 1 }, { unique: true });
```

## 5. 辅助链集合 (auxChains)

```typescript
interface AuxChainDocument {
  userId: number;          // 用户ID
  chainId: string;         // 链ID (唯一索引)
  status: 'active';       // 链状态
  createdAt: Date;         // 创建时间
  updatedAt: Date;         // 更新时间

  // 待处理预约
  pendingReservation?: PendingReservation;

  // 预约历史
  reservationHistory: ReservationHistory[];
}
```

### 预约结构

```typescript
interface PendingReservation {
  reservationId: string;   // 预约ID (唯一索引)
  signal: string;         // 任务信号
  duration: number;       // 任务时长（分钟）
  createdAt: Date;        // 创建时间
  deadlineAt: Date;       // 截止时间
  status: 'pending';     // 状态
}

interface ReservationHistory {
  reservationId: string;  // 预约ID
  signal: string;         // 任务信号
  duration: number;       // 任务时长（分钟）
  createdAt: Date;        // 创建时间
  fulfilledAt?: Date;      // 完成时间
  delayedAt?: Date;       // 延迟时间
  delayMinutes?: number;  // 延迟分钟数
  status: 'pending' | 'fulfilled' | 'delayed' | 'cancelled' | 'expired'; // 状态
}
```

### 索引设计

```javascript
// 唯一索引：确保每个用户只有一个活跃的辅助链
auxChainSchema.index({ userId: 1 }, { unique: true });

// 预约ID索引：快速查找预约
auxChainSchema.index({ 'pendingReservation.reservationId': 1 }, { unique: true, sparse: true });

// 链ID唯一索引
auxChainSchema.index({ chainId: 1 }, { unique: true });
```

## 数据库关系

```
users
├── 1:N taskChains
│   ├── 1:N tasks
│   └── 1:1 dailyStats (每日)
└── 1:N divinationHistory
└── 1:1 auxChains
```

## 数据库设计原则

### 1. 数据一致性
- 使用Mongoose验证器确保数据完整性
- 实现适当的默认值
- 确保必填字段

### 2. 性能优化
- 合理的索引设计
- 避免深度嵌套文档
- 适当的文档大小

### 3. 可扩展性
- 支持水平扩展
- 易于添加新的数据字段
- 灵活的关系管理

### 4. 可维护性
- 清晰的文档结构
- 完善的注释
- 一致的命名规范

## 数据库操作优化

### 1. 查询优化
- 使用适当的索引
- 避免全表扫描
- 限制返回字段

### 2. 写操作优化
- 批量操作
- 适当的写入 concern
- 错误处理和重试机制

### 3. 连接管理
- 连接池配置
- 连接超时设置
- 自动重连机制

## 数据备份和恢复

### 1. 备份策略
- 定期全量备份
- 增量备份
- 异地备份

### 2. 恢复策略
- 快速恢复机制
- 数据一致性检查
- 回滚计划

## 监控和运维

### 1. 性能监控
- 查询性能监控
- 连接池状态
- 索引使用情况

### 2. 容量规划
- 数据增长预测
- 存储容量规划
- 分片策略

### 3. 故障处理
- 自动故障转移
- 数据修复机制
- 监控告警

## 安全考虑

### 1. 数据保护
- 敏感数据加密
- 访问控制
- 审计日志

### 2. 注入防护
- 输入验证
- 参数化查询
- 防止NoSQL注入

## 测试策略

### 1. 单元测试
- 模型验证测试
- 索引测试
- 性能测试

### 2. 集成测试
- 数据库连接测试
- 复杂查询测试
- 并发测试

### 3. 负载测试
- 高并发测试
- 大数据量测试
- 压力测试

## 数据库迁移

### 1. 版本控制
- 数据库版本管理
- 迁移脚本
- 回滚机制

### 2. 数据迁移
- 数据格式转换
- 数据验证
- 迁移监控

## 未来扩展

### 1. 分片策略
- 按用户ID分片
- 按数据类型分片
- 分片键选择

### 2. 缓存策略
- Redis缓存层
- 查询结果缓存
- 数据预热

### 3. 数据分析
- 聚合管道
- MapReduce
- 趋势分析

## 数据库文档

### 模型文档
- 详细的模型结构
- 字段说明
- 索引说明

### 操作文档
- 常用查询示例
- 复杂操作指南
- 性能优化建议

### 维护文档
- 备份和恢复指南
- 监控和告警
- 故障排除指南