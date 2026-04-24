# 队列系统

## 概述

队列系统基于Redis和Bull Queue实现，负责处理异步任务，包括任务提醒、预约调度、占卜等。该系统确保任务的可靠性和持久性。

## 技术栈

- **Redis**：消息队列存储
- **Bull Queue**：Node.js队列库
- **Node-Telegram-Bot-Api**：Telegram消息发送

## 队列架构

```
QueueService
├── 任务提醒队列 (progress, completion)
├── 预约队列 (reservation)
├── 占卜队列 (divination)
├── 系统队列 (system)
└── 监控和管理
    ├── 队列状态监控
    ├── 任务重试机制
    └── 错误处理
```

## 1. 队列类型

### 进度提醒队列 (progress)
- 任务进度提醒（25%, 50%, 75%）
- 任务完成提醒

### 预约队列 (reservation)
- 15分钟预约提醒
- 预约过期处理

### 占卜队列 (divination)
- 占卜结果处理
- 奖励计算

### 系统队列 (system)
- 系统维护任务
- 数据清理任务

## 2. 核心类设计

### QueueService - 队列服务

```typescript
class QueueService {
  private bullQueues: Map<string, BullQueue>;

  constructor(botInstance?: TelegramBot);

  initialize(): Promise<void>;
  setBotInstance(bot: TelegramBot): void;

  // 队列管理
  getQueue(name: string): BullQueue;
  addJob(name: string, data: any, options?: JobOptions): Promise<Job>;
  getJob(jobId: string, queueName?: string): Promise<Job | null>;
  getJobs(queueName: string, start: number, end: number, asc: boolean): Promise<Job[]>;
  clean(queue: string, grace: number, limit: number): Promise<number>;
  drain(queue: string): Promise<void>;
  empty(queue: string): Promise<void>;
  remove(queue: string, jobId: string): Promise<void>;

  // 特定队列操作
  addReminder(type: string, data: any, delay: number): Promise<Job>;
  addReservation(reservationId: string, data: any, delay: number): Promise<Job>;
  addDivination(jobId: string, data: any): Promise<Job>;

  // 队列监控
  getQueueStatus(queueName: string): Promise<QueueStatus>;
  getQueueList(): Promise<string[]>;
  getJobCounts(): Promise<Record<string, number>>;

  // 任务管理
  cancelTaskReminders(taskId: string): Promise<void>;
  cancelReservation(reservationId: string): Promise<boolean>;
  rescheduleReservation(reservationId: string, delayMs: number): Promise<string | number | undefined>;

  // 系统操作
  close(): Promise<void>;
  gracefulShutdown(): void;
}
```

### JobData - 任务数据结构

```typescript
interface JobData {
  userId: number;         // 用户ID
  taskId?: string;        // 任务ID（用于提醒）
  reservationId?: string; // 预约ID（用于预约）
  type: string;          // 任务类型
  data: any;             // 任务特定数据
  createdAt: Date;       // 创建时间
  scheduledAt: Date;     // 计划执行时间
}
```

## 3. 队列配置

### Redis配置

```typescript
const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  db: parseInt(process.env.REDIS_DB || '0'),
  retryDelayOnFail: 1000,
  maxRetries: 3,
  enableReadyCheck: true,
};
```

### Bull Queue配置

```typescript
const bullConfig = {
  redis: redisConfig,
  limiter: {
    max: 1000,
    duration: 1000,
  },
  defaultJobOptions: {
    removeOnComplete: true,
    removeOnFail: false,
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
  },
};
```

## 4. 队列实现

### 进度提醒队列

```typescript
// 添加进度提醒
async addProgressReminder(userId: number, taskId: string, progress: number, message: string, delay: number) {
  return this.getQueue('progress').add('progress_reminder', {
    userId,
    taskId,
    progress,
    message,
    type: 'progress'
  }, {
    delay,
    jobId: `progress:${userId}:${taskId}:${progress}`
  });
}

// 添加完成提醒
async addCompletionReminder(userId: number, taskId: string, message: string, delay: number) {
  return this.getQueue('progress').add('completion_reminder', {
    userId,
    taskId,
    message,
    type: 'completion'
  }, {
    delay,
    jobId: `completion:${userId}:${taskId}`
  });
}
```

### 预约队列

```typescript
// 添加预约
async addReservation(reservationId: string, data: any, delay: number) {
  return this.getQueue('reservation').add('reservation', {
    reservationId,
    data,
    type: 'reservation'
  }, {
    delay,
    jobId: `reservation:${reservationId}`
  });
}

// 延迟预约
async rescheduleReservation(reservationId: string, delayMs: number) {
  const job = await this.getQueue('reservation').getJob(`reservation:${reservationId}`);
  if (job) {
    return job.delay(delayMs);
  }
  return null;
}

// 取消预约
async cancelReservation(reservationId: string) {
  const job = await this.getQueue('reservation').getJob(`reservation:${reservationId}`);
  if (job) {
    await job.remove();
    return true;
  }
  return false;
}
```

### 占卜队列

```typescript
// 添加占卜任务
async addDivination(jobId: string, data: any) {
  return this.getQueue('divination').add('divination', {
    jobId,
    data,
    type: 'divination'
  }, {
    jobId: `divination:${jobId}`
  });
}
```

## 5. 事件处理

### 进度提醒处理器

```typescript
// 进度提醒处理器
progressQueue.process('progress_reminder', async (job) => {
  const { userId, taskId, progress, message } = job.data;
  await sendProgressReminder(userId, taskId, progress, message);
});

// 完成提醒处理器
progressQueue.process('completion_reminder', async (job) => {
  const { userId, taskId, message } = job.data;
  await sendCompletionReminder(userId, taskId, message);
});
```

### 预约处理器

```typescript
// 预约处理器
reservationQueue.process('reservation', async (job) => {
  const { reservationId, data } = job.data;
  await handleReservationTimeout(reservationId, data);
});
```

### 占卜处理器

```typescript
// 占卜处理器
divinationQueue.process('divination', async (job) => {
  const { jobId, data } = job.data;
  await processDivinationResult(jobId, data);
});
```

## 6. 错误处理和重试

### 错误处理机制

```typescript
// 全局错误处理器
bullQueues.forEach((queue) => {
  queue.on('failed', async (job, error) => {
    logger.error(`Job failed: ${job.id}`, { error: error.message, queue: queue.name });

    // 重试逻辑
    if (job.attemptsMade < job.opts.attempts) {
      logger.info(`Retrying job ${job.id} (${job.attemptsMade + 1}/${job.opts.attempts})`);
      await job.retry();
    } else {
      logger.warn(`Job ${job.id} exceeded max retries, marking as failed`);
      await job.remove();
    }
  });
});
```

### 重试策略

```typescript
const retryConfig = {
  type: 'exponential',
  delay: 1000, // 初始延迟1秒
  factor: 2,   // 每次重试延迟倍增
  maxDelay: 30000, // 最大延迟30秒
};
```

## 7. 队列监控

### 状态监控

```typescript
// 获取队列状态
async getQueueStatus(queueName: string): Promise<QueueStatus> {
  const queue = this.getQueue(queueName);
  const [active, waiting, completed, failed] = await Promise.all([
    queue.getJobs('active', 0, 100, true),
    queue.getJobs('waiting', 0, 100, true),
    queue.getJobs('completed', 0, 100, true),
    queue.getJobs('failed', 0, 100, true),
  ]);

  return {
    name: queueName,
    active: active.length,
    waiting: waiting.length,
    completed: completed.length,
    failed: failed.length,
    isPaused: await queue.isPaused(),
  };
}
```

### 健康检查

```typescript
// 队列健康检查
async checkQueueHealth(): Promise<QueueHealth> {
  const statuses = await Promise.all([
    this.getQueueStatus('progress'),
    this.getQueueStatus('reservation'),
    this.getQueueStatus('divination'),
    this.getQueueStatus('system'),
  ]);

  const allQueues = statuses.every(q => q.active === 0 && q.waiting === 0);
  const hasErrors = statuses.some(q => q.failed > 0);

  return {
    healthy: allQueues && !hasErrors,
    queues: statuses,
    timestamp: new Date(),
  };
}
```

## 8. 性能优化

### 批量操作

```typescript
// 批量添加提醒
async addBatchReminders(reminders: Reminder[]): Promise<Job[]> {
  const jobs = reminders.map(reminder => ({
    name: 'progress_reminder',
    data: reminder,
    opts: {
      delay: reminder.delay,
      jobId: `progress:${reminder.userId}:${reminder.taskId}:${reminder.progress}`
    }
  }));

  return this.getQueue('progress').addBulk(jobs);
}
```

### 连接池管理

```typescript
// Redis连接池配置
const redisPoolConfig = {
  max: 10, // 最大连接数
  min: 2,  // 最小连接数
  acquireTimeout: 10000, // 获取连接超时
  evict: {
    idle: 30000, // 空闲30秒后释放
    strategy: 'LRU', // 最少最近使用策略
  },
};
```

## 9. 安全考虑

### 任务验证

```typescript
// 任务数据验证
function validateJobData(data: any): boolean {
  if (!data || typeof data !== 'object') return false;
  if (!data.userId || typeof data.userId !== 'number') return false;
  if (data.taskId && typeof data.taskId !== 'string') return false;
  if (data.reservationId && typeof data.reservationId !== 'string') return false;
  return true;
}
```

### 敏感数据处理

```typescript
// 敏感数据脱敏
function sanitizeJobData(data: any): any {
  const sanitized = { ...data };
  if (sanitized.userId) {
    sanitized.userId = `user:${sanitized.userId}`;
  }
  return sanitized;
}
```

## 10. 扩展性

### 插件架构

```typescript
// 队列插件接口
interface QueuePlugin {
  name: string;
  initialize(queue: BullQueue): Promise<void>;
  process(job: Job): Promise<void>;
  onFailed?(job: Job, error: Error): Promise<void>;
}
```

### 动态队列注册

```typescript
// 动态注册队列
async registerQueue(name: string, plugin?: QueuePlugin) {
  const queue = new BullQueue(name, bullConfig);
  this.bullQueues.set(name, queue);

  if (plugin) {
    await plugin.initialize(queue);
    queue.process(plugin.name, plugin.process.bind(plugin));
    if (plugin.onFailed) {
      queue.on('failed', plugin.onFailed.bind(plugin));
    }
  }

  return queue;
}
```

## 11. 监控和告警

### 指标收集

```typescript
// 收集队列指标
async collectQueueMetrics() {
  const metrics = {};

  for (const [name, queue] of this.bullQueues) {
    const status = await queue.getJobCounts();
    metrics[name] = status;
  }

  return metrics;
}
```

### 告警规则

```typescript
// 告警规则
const alertRules = {
  progressQueue: {
    waiting: { threshold: 100, severity: 'warning' },
    failed: { threshold: 10, severity: 'error' },
  },
  reservationQueue: {
    waiting: { threshold: 50, severity: 'warning' },
    failed: { threshold: 5, severity: 'error' },
  },
};
```

## 12. 测试策略

### 单元测试

```typescript
// 队列服务单元测试
describe('QueueService', () => {
  let queueService: QueueService;
  let mockBot: TelegramBot;

  beforeEach(() => {
    mockBot = {} as TelegramBot;
    queueService = new QueueService(mockBot);
  });

  test('should add progress reminder', async () => {
    const job = await queueService.addProgressReminder(123, 'task1', 50, '50% done', 1000);
    expect(job).toBeDefined();
    expect(job.data.type).toBe('progress');
  });
});
```

### 集成测试

```typescript
// 队列集成测试
describe('QueueIntegration', () => {
  let queueService: QueueService;
  let redisClient: Redis;

  beforeEach(async () => {
    redisClient = createRedisClient();
    queueService = new QueueService();
    await queueService.initialize();
  });

  test('should process progress reminder', async () => {
    const job = await queueService.addProgressReminder(123, 'task1', 50, '50% done', 100);
    await new Promise(resolve => setTimeout(resolve, 200));
    const completedJob = await queueService.getQueue('progress').getJob(job.id);
    expect(completedJob).toBeNull();
  });
});
```

## 13. 部署考虑

### 容器化部署

```dockerfile
# Redis容器
version: '3.8'
services:
  redis:
    image: "redis:6.2-alpine"
    ports:
      - "6379:6379"
    volumes:
      - redis-data:/data

  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - REDIS_HOST=redis
      - REDIS_PORT=6379
    depends_on:
      - redis

volumes:
  redis-data:
```

### 扩展策略

```typescript
// 水平扩展配置
const scaleConfig = {
  minWorkers: 2,
  maxWorkers: 10,
  scaleUpThreshold: 0.8,  // CPU使用率80%时扩展
  scaleDownThreshold: 0.3, // CPU使用率30%时缩减
  checkInterval: 60000,   // 每分钟检查一次
};
```

## 14. 文档和维护

### 操作指南

- 队列创建和配置
- 任务添加和管理
- 错误处理和调试
- 监控和告警设置

### 维护指南

- 定期清理旧任务
- 监控队列健康状态
- 备份和恢复策略
- 性能优化建议

## 15. 未来规划

### 1. 智能调度
- 基于用户行为的动态调度
- 优先级队列
- 负载均衡

### 2. 监控增强
- 实时队列监控
- 性能指标仪表板
- 自动扩展

### 3. 安全增强
- 任务加密
- 访问控制
- 审计日志

### 4. 新功能支持
- 推送通知队列
- 文件处理队列
- 第三方集成队列

## 总结

队列系统是项目的关键组件，确保异步任务的可靠执行。通过合理的队列设计、错误处理和监控机制，系统能够处理高并发任务，提供稳定的服务。未来的扩展将进一步提升系统的智能化和可维护性。