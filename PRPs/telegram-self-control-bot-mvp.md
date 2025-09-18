# Telegram自控力助手 MVP实现PRP

## 项目概述

开发一个基于《论自控力》科学理论的Telegram机器人，实现任务管理、15分钟预约机制和习惯养成功能。本PRP专注于6周内完成MVP版本的核心功能实现。

## 理论基础

### 核心原理（必须理解并正确实现）

1. **神圣座位原理**：连续的任务完成创造心理约束力，失败立即清零所有记录
2. **线性时延原理**：15分钟延迟可降低60%的任务启动阻力
3. **下必为例原理**：每个决策都成为未来行为的先例（MVP简化为关键词分类）

### 数学模型
```
价值函数：I = ∫₀^∞ V(τ)W(τ)dτ
其中：V(τ) = 未来价值函数，W(τ) = 权重贴现函数
```

## 技术架构

### 技术栈
- **后端**: Node.js 18+ 配合 Express
- **数据库**: MongoDB (使用Mongoose ODM)
- **任务队列**: Redis + Bull Queue
- **Bot框架**: node-telegram-bot-api
- **部署**: Docker + PM2

### 项目结构
```
telegram-self-control-bot/
├── src/
│   ├── bot.js              # Bot主入口
│   ├── config/
│   │   ├── database.js     # MongoDB配置
│   │   └── redis.js        # Redis配置
│   ├── models/
│   │   ├── User.js         # 用户模型
│   │   ├── TaskChain.js    # 任务链模型
│   │   ├── Pattern.js      # 简单定式模型
│   │   └── DailyStats.js   # 每日统计模型
│   ├── services/
│   │   ├── TaskService.js        # 任务管理服务
│   │   ├── QueueService.js       # 队列管理服务
│   │   ├── ReservationService.js # 预约服务
│   │   └── StatsService.js       # 统计服务
│   ├── handlers/
│   │   └── commands.js     # 命令处理器
│   └── utils/
│       └── helpers.js      # 工具函数
├── tests/
│   ├── unit/              # 单元测试
│   └── integration/       # 集成测试
├── docker-compose.yml
├── .env.example
├── package.json
└── README.md
```

## 数据模型设计

### 1. 用户模型 (User.js)
```javascript
const userSchema = new mongoose.Schema({
  userId: { type: Number, required: true, unique: true },
  username: String,
  settings: {
    defaultDuration: { type: Number, default: 25 },
    reminderEnabled: { type: Boolean, default: true }
  },
  stats: {
    totalTasks: { type: Number, default: 0 },
    completedTasks: { type: Number, default: 0 },
    totalMinutes: { type: Number, default: 0 },
    currentStreak: { type: Number, default: 0 },
    longestStreak: { type: Number, default: 0 }
  },
  createdAt: { type: Date, default: Date.now },
  lastActiveAt: { type: Date, default: Date.now }
});

// 重要索引
userSchema.index({ userId: 1 });
```

### 2. 任务链模型 (TaskChain.js)
```javascript
const taskSchema = new mongoose.Schema({
  taskId: { type: String, required: true },
  description: String,
  duration: Number,
  startTime: Date,
  endTime: Date,
  status: { 
    type: String, 
    enum: ['pending', 'running', 'completed', 'failed'],
    default: 'pending'
  },
  isReserved: { type: Boolean, default: false },
  reservedAt: Date
});

const taskChainSchema = new mongoose.Schema({
  userId: { type: Number, required: true },
  chainId: { type: String, required: true },
  title: String,
  tasks: [taskSchema],
  totalTasks: { type: Number, default: 0 },
  completedTasks: { type: Number, default: 0 },
  status: { 
    type: String, 
    enum: ['active', 'broken'],
    default: 'active'
  },
  createdAt: { type: Date, default: Date.now },
  lastActiveAt: { type: Date, default: Date.now }
});

// 关键索引（性能必需）
taskChainSchema.index({ userId: 1, status: 1 });
taskChainSchema.index({ 'tasks.taskId': 1 });
```

## 核心功能实现

### Week 1-2: 基础框架和核心任务管理

#### 任务1：项目初始化
```bash
# 创建项目
mkdir telegram-self-control-bot
cd telegram-self-control-bot
npm init -y

# 安装依赖
npm install node-telegram-bot-api mongoose dotenv express
npm install bull redis ioredis
npm install -D nodemon jest
```

#### 任务2：环境配置 (.env)
```env
BOT_TOKEN=your_telegram_bot_token
MONGODB_URI=mongodb://localhost:27017/selfcontrol
REDIS_HOST=localhost
REDIS_PORT=6379
NODE_ENV=development
```

#### 任务3：Bot主入口实现 (src/bot.js)
```javascript
require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const mongoose = require('mongoose');
const CommandHandler = require('./handlers/commands');
const TaskService = require('./services/TaskService');
const QueueService = require('./services/QueueService');

class SelfControlBot {
  constructor() {
    this.bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });
    this.taskService = new TaskService();
    this.queueService = new QueueService(this.bot);
    this.commandHandler = new CommandHandler(this.bot, this.taskService, this.queueService);
  }

  async start() {
    // 连接数据库
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('数据库连接成功');

    // 注册命令
    this.registerCommands();
    
    // 注册回调
    this.registerCallbacks();

    console.log('Bot已启动');
  }

  registerCommands() {
    this.bot.onText(/\/start/, (msg) => this.commandHandler.handleStart(msg));
    this.bot.onText(/\/task(?:\s+(.+))?/, (msg, match) => this.commandHandler.handleCreateTask(msg, match));
    this.bot.onText(/\/reserve(?:\s+(.+))?/, (msg, match) => this.commandHandler.handleReserve(msg, match));
    this.bot.onText(/\/status/, (msg) => this.commandHandler.handleStatus(msg));
    this.bot.onText(/\/help/, (msg) => this.commandHandler.handleHelp(msg));
  }

  registerCallbacks() {
    this.bot.on('callback_query', async (query) => {
      const { data } = query;
      
      if (data.startsWith('complete_task_')) {
        await this.commandHandler.handleCompleteTask(query);
      } else if (data.startsWith('fail_task_')) {
        await this.commandHandler.handleFailTask(query);
      } else if (data.startsWith('start_reserved_')) {
        await this.commandHandler.handleReservationCallback(query);
      }

      await this.bot.answerCallbackQuery(query.id);
    });
  }
}

// 启动
const bot = new SelfControlBot();
bot.start().catch(console.error);
```

#### 任务4：核心服务实现

**TaskService.js - 神圣座位原理核心实现**
```javascript
class TaskService {
  async createTask(userId, description = '专注任务', duration = 25) {
    // 确保用户存在
    let user = await User.findOne({ userId });
    if (!user) {
      user = await User.create({ userId });
    }

    // 查找或创建活跃链
    let chain = await TaskChain.findOne({ userId, status: 'active' });
    if (!chain) {
      chain = await TaskChain.create({
        userId,
        chainId: generateId('chain'),
        title: '任务链',
        tasks: [],
        status: 'active'
      });
    }

    // 创建任务
    const task = {
      taskId: generateId('task'),
      description,
      duration,
      startTime: new Date(),
      status: 'running'
    };

    chain.tasks.push(task);
    chain.totalTasks += 1;
    await chain.save();

    // 更新用户统计
    user.stats.totalTasks += 1;
    await user.save();

    return { chain, task };
  }

  async completeTask(userId, taskId, success = true) {
    const chain = await TaskChain.findOne({ userId, 'tasks.taskId': taskId });
    if (!chain) throw new Error('任务不存在');

    const task = chain.tasks.find(t => t.taskId === taskId);
    task.status = success ? 'completed' : 'failed';
    task.endTime = new Date();

    if (success) {
      chain.completedTasks += 1;
      
      // 更新用户统计
      const user = await User.findOne({ userId });
      user.stats.completedTasks += 1;
      user.stats.totalMinutes += task.duration;
      user.stats.currentStreak += 1;
      user.stats.longestStreak = Math.max(
        user.stats.longestStreak, 
        user.stats.currentStreak
      );
      await user.save();
    } else {
      // 🔴 神圣座位原理：失败清零
      chain.status = 'broken';
      chain.totalTasks = 0;
      chain.completedTasks = 0;
      
      // 重置用户连续记录
      const user = await User.findOne({ userId });
      user.stats.currentStreak = 0;
      await user.save();
    }

    await chain.save();
    return { chain, task };
  }
}
```

### Week 3-4: 预约机制和提醒系统

#### 任务5：Bull Queue集成 (QueueService.js)
```javascript
const Queue = require('bull');

class QueueService {
  constructor(bot) {
    this.bot = bot;
    
    // 创建队列
    this.reminderQueue = new Queue('reminders', {
      redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: process.env.REDIS_PORT || 6379
      }
    });
    
    this.reservationQueue = new Queue('reservations', {
      redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: process.env.REDIS_PORT || 6379
      }
    });
    
    this.setupProcessors();
  }
  
  setupProcessors() {
    // 处理任务提醒
    this.reminderQueue.process('task_reminder', async (job) => {
      const { userId, taskId, type, message } = job.data;
      
      if (type === 'progress') {
        await this.sendProgressReminder(userId, taskId, message);
      } else if (type === 'completion') {
        await this.sendCompletionReminder(userId, taskId);
      }
    });
    
    // 处理预约提醒 - 线性时延原理实现
    this.reservationQueue.process('reservation_reminder', async (job) => {
      const { userId, reservationId, chainId } = job.data;
      
      await this.bot.sendMessage(
        userId,
        `⏰ 预约时间到！\n\n` +
        `根据线性时延原理，现在是开始任务的最佳时机。\n` +
        `15分钟的延迟已经大大降低了启动阻力。\n\n` +
        `准备好开始了吗？`,
        {
          reply_markup: {
            inline_keyboard: [[
              { text: '🚀 立即开始', callback_data: `start_reserved_${reservationId}` },
              { text: '⏰ 延迟5分钟', callback_data: `delay_reservation_${reservationId}_5` },
              { text: '❌ 取消', callback_data: `cancel_reservation_${reservationId}` }
            ]]
          }
        }
      );
    });
  }
  
  // 添加15分钟预约
  async scheduleReservation(userId, reservationId, chainId) {
    const job = await this.reservationQueue.add(
      'reservation_reminder',
      { userId, reservationId, chainId },
      { delay: 15 * 60 * 1000 } // 15分钟
    );
    return job.id;
  }
}
```

#### 任务6：预约服务实现 (ReservationService.js)
```javascript
class ReservationService {
  constructor(queueService) {
    this.queueService = queueService;
    this.activeReservations = new Map(); // 内存存储活跃预约
  }
  
  async createReservation(userId, taskDescription = '专注任务', duration = 25) {
    const reservationId = generateId('res');
    
    // 查找或创建链
    let chain = await TaskChain.findOne({ userId, status: 'active' });
    if (!chain) {
      chain = await TaskChain.create({
        userId,
        chainId: generateId('chain'),
        title: '任务链',
        tasks: [],
        status: 'active'
      });
    }
    
    // 创建预约任务
    const reservedTask = {
      taskId: generateId('task'),
      description: taskDescription,
      duration,
      status: 'pending',
      isReserved: true,
      reservedAt: new Date()
    };
    
    chain.tasks.push(reservedTask);
    await chain.save();
    
    // 添加到队列 - 实现线性时延原理
    const jobId = await this.queueService.scheduleReservation(
      userId,
      reservationId,
      chain.chainId
    );
    
    // 存储预约信息
    this.activeReservations.set(reservationId, {
      userId,
      taskId: reservedTask.taskId,
      chainId: chain.chainId,
      jobId,
      executeAt: new Date(Date.now() + 15 * 60 * 1000)
    });
    
    return {
      reservationId,
      taskId: reservedTask.taskId,
      executeAt: new Date(Date.now() + 15 * 60 * 1000),
      chain
    };
  }
}
```

### Week 5-6: 统计和用户体验

#### 任务7：统计服务 (StatsService.js)
```javascript
class StatsService {
  async getDailyStats(userId, date = new Date()) {
    const startOfDay = new Date(date.setHours(0, 0, 0, 0));
    const endOfDay = new Date(date.setHours(23, 59, 59, 999));
    
    let stats = await DailyStats.findOne({
      userId,
      date: { $gte: startOfDay, $lte: endOfDay }
    });
    
    if (!stats) {
      const chains = await TaskChain.find({
        userId,
        'tasks.startTime': { $gte: startOfDay, $lte: endOfDay }
      });
      
      stats = this.calculateDailyStats(chains);
      
      // 缓存结果
      await DailyStats.create({
        userId,
        date: startOfDay,
        ...stats
      });
    }
    
    return stats;
  }
  
  async generateWeeklyReport(userId) {
    const reports = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      const dailyStats = await this.getDailyStats(userId, date);
      reports.push(dailyStats);
    }
    
    return {
      totalTasks: reports.reduce((sum, r) => sum + r.tasks.completed, 0),
      totalMinutes: reports.reduce((sum, r) => sum + r.totalMinutes, 0),
      averageSuccessRate: reports.reduce((sum, r) => sum + r.successRate, 0) / 7,
      bestDay: reports.sort((a, b) => b.tasks.completed - a.tasks.completed)[0]
    };
  }
}
```

## 关键实现细节（必须严格遵守）

### 1. 定时器管理
```javascript
// ❌ 错误：不要使用原生setTimeout
setTimeout(() => { /* ... */ }, delay);

// ✅ 正确：使用Bull Queue
await queue.add('task', data, { delay });
```

### 2. 神圣座位重置逻辑
```javascript
// 任务失败时必须完全重置
if (!success) {
  chain.status = 'broken';
  chain.totalTasks = 0;  // 完全重置
  chain.completedTasks = 0;
  user.stats.currentStreak = 0;
}
```

### 3. 数据库索引
```javascript
// 必须创建的索引
taskChainSchema.index({ userId: 1, status: 1 });
taskChainSchema.index({ 'tasks.taskId': 1 });
userSchema.index({ userId: 1 });
```

### 4. 错误处理模式
```javascript
async handleCommand(msg) {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  
  try {
    // 业务逻辑
    const result = await this.service.doSomething(userId);
    await this.bot.sendMessage(chatId, '✅ 操作成功');
  } catch (error) {
    // 用户友好的中文错误提示
    await this.bot.sendMessage(chatId, `❌ 操作失败：${error.message}`);
    
    // 详细日志记录
    console.error('Command error:', error);
  }
}
```

## Docker部署配置

### docker-compose.yml
```yaml
version: '3.8'

services:
  bot:
    build: .
    environment:
      - BOT_TOKEN=${BOT_TOKEN}
      - MONGODB_URI=mongodb://mongo:27017/selfcontrol
      - REDIS_HOST=redis
      - REDIS_PORT=6379
    depends_on:
      - mongo
      - redis
    restart: unless-stopped
    volumes:
      - ./logs:/app/logs

  mongo:
    image: mongo:6
    volumes:
      - mongo-data:/data/db
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    command: redis-server --appendonly yes
    volumes:
      - redis-data:/data
    restart: unless-stopped

volumes:
  mongo-data:
  redis-data:
```

### Dockerfile
```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

CMD ["node", "src/bot.js"]
```

## 测试策略

### 核心测试用例
```javascript
// tests/unit/taskService.test.js
describe('TaskService', () => {
  test('任务失败应重置链条（神圣座位原理）', async () => {
    const service = new TaskService();
    
    // 创建并完成一些任务
    await service.createTask(123, '任务1', 30);
    await service.completeTask(123, 'task_1', true);
    await service.createTask(123, '任务2', 30);
    await service.completeTask(123, 'task_2', true);
    
    // 第三个任务失败
    await service.createTask(123, '任务3', 30);
    const result = await service.completeTask(123, 'task_3', false);
    
    // 验证完全重置
    expect(result.chain.status).toBe('broken');
    expect(result.chain.totalTasks).toBe(0);
    expect(result.chain.completedTasks).toBe(0);
  });
  
  test('15分钟预约机制', async () => {
    const reservation = await reservationService.createReservation(123, '测试任务', 30);
    
    expect(reservation.executeAt.getTime() - Date.now()).toBeCloseTo(15 * 60 * 1000, -3);
  });
});
```

## 验证门（必须通过）

```bash
# 1. 语法检查
npm run lint

# 2. 单元测试
npm test

# 3. 集成测试
npm run test:integration

# 4. Docker构建测试
docker-compose build

# 5. 本地运行测试
docker-compose up
```

## 实施任务清单（按顺序完成）

### 第一阶段：基础设施（Day 1-2）
- [ ] 1. 初始化Node.js项目
- [ ] 2. 配置环境变量
- [ ] 3. 设置MongoDB连接
- [ ] 4. 设置Redis连接
- [ ] 5. 创建数据模型
- [ ] 6. 创建数据库索引

### 第二阶段：核心功能（Day 3-7）
- [ ] 7. 实现Bot主入口
- [ ] 8. 实现TaskService（神圣座位原理）
- [ ] 9. 实现命令处理器
- [ ] 10. 实现基础命令 (/start, /task, /status, /help)
- [ ] 11. 测试任务创建和完成流程
- [ ] 12. 验证失败重置逻辑

### 第三阶段：预约机制（Day 8-10）
- [ ] 13. 集成Bull Queue
- [ ] 14. 实现QueueService
- [ ] 15. 实现ReservationService（线性时延原理）
- [ ] 16. 实现预约命令 (/reserve)
- [ ] 17. 测试15分钟预约流程
- [ ] 18. 实现任务进度提醒

### 第四阶段：统计和优化（Day 11-12）
- [ ] 19. 实现StatsService
- [ ] 20. 实现每日统计
- [ ] 21. 实现周报生成
- [ ] 22. 优化用户交互体验
- [ ] 23. 添加错误处理

### 第五阶段：测试和部署（Day 13-14）
- [ ] 24. 编写单元测试
- [ ] 25. 编写集成测试
- [ ] 26. 创建Docker配置
- [ ] 27. 本地Docker测试
- [ ] 28. 编写部署文档

## 常见问题和解决方案

### 问题1：定时器不准确
**解决方案**：使用Bull Queue替代setTimeout，确保持久化和重试

### 问题2：数据库查询慢
**解决方案**：确保创建了所有必需的索引

### 问题3：任务失败处理不当
**解决方案**：严格实现神圣座位原理，失败必须完全重置

### 问题4：预约提醒失败
**解决方案**：检查Redis连接，确保Bull Queue正常工作

## 外部资源

### 必读文档
1. **Telegram Bot API**: https://core.telegram.org/bots/api
2. **node-telegram-bot-api示例**: https://github.com/yagop/node-telegram-bot-api/tree/master/examples
3. **Bull Queue最佳实践**: https://docs.bullmq.io/guide/best-practices
4. **Mongoose查询优化**: https://mongoosejs.com/docs/queries.html#query-performance

### 参考实现
1. **Bot命令处理示例**: https://github.com/yagop/node-telegram-bot-api/blob/master/examples/webhook.js
2. **Bull Queue延迟任务**: https://github.com/OptimalBits/bull/blob/develop/PATTERNS.md#delayed-jobs
3. **MongoDB索引策略**: https://www.mongodb.com/docs/manual/indexes/

## 质量评分

**置信度评分：8/10**

### 评分理由
- ✅ 完整的技术实现细节
- ✅ 清晰的任务执行顺序
- ✅ 包含所有必要的代码示例
- ✅ 明确的验证门
- ✅ 常见问题解决方案
- ⚠️ 需要开发者理解理论基础
- ⚠️ 首次配置环境可能遇到问题

### 成功保障
1. 严格按照任务清单顺序执行
2. 每完成一个阶段进行测试验证
3. 特别注意神圣座位原理的实现
4. 使用Bull Queue而非原生定时器
5. 确保所有数据库索引创建

---

**注意**：本PRP包含了MVP阶段（6周内）的所有核心功能实现指南。后续的RSIP协议、复杂定式树等功能将在MVP成功后再迭代添加。