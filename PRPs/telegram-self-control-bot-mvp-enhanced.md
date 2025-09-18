# Telegram 自控力助手 MVP 实现 PRP (增强版)

## 项目概述

基于《论自控力》科学理论的 Telegram 机器人，实现任务管理、15分钟预约机制和习惯养成功能。本 PRP 专注于采用现代工具链完成 MVP 版本的核心功能实现。

## 核心理论基础（关键实现约束）

### 必须理解并严格实现的三大原理

1. **神圣座位原理**：连续任务完成创造心理约束力。**核心约束**：任何任务失败立即将所有进度清零
2. **线性时延原理**：15分钟预约延迟可降低60%的任务启动阻力
3. **下必为例原理**：每个决策都成为未来行为的先例（MVP 版本简化为关键词分类）

### 数学模型理论依据
```
价值函数：I = ∫₀^∞ V(τ)W(τ)dτ
其中：V(τ) = 未来价值函数，W(τ) = 权重贴现函数
```

## 技术架构和现代工具链

### 技术栈规范
- **运行时**: Node.js 18+ (支持 ES2022)
- **包管理器**: yarn (项目明确要求)
- **后端框架**: Express.js
- **数据库**: MongoDB + Mongoose ODM 7.x
- **任务队列**: Redis + Bull Queue (关键：定时精度保证)
- **机器人框架**: node-telegram-bot-api
- **语法标准**: ES Module + async/await
- **测试框架**: Jest + Supertest
- **代码规范**: ESLint + Prettier
- **部署**: Docker + PM2

### 项目结构（严格遵循）
```
telegram-self-control-bot/
├── src/                     # 源代码 (ES Module)
│   ├── app.js              # 应用主入口
│   ├── bot.js              # Bot 实例和启动
│   ├── config/             # 配置管理
│   │   ├── index.js        # 配置聚合
│   │   ├── database.js     # MongoDB 连接配置
│   │   ├── redis.js        # Redis 连接配置
│   │   └── bot.js          # Bot 配置
│   ├── models/             # Mongoose 数据模型
│   │   ├── User.js         # 用户模型
│   │   ├── TaskChain.js    # 任务链模型（神圣座位原理核心）
│   │   ├── Pattern.js      # 定式模型
│   │   ├── DailyStats.js   # 每日统计模型
│   │   └── index.js        # 模型导出聚合
│   ├── services/           # 业务逻辑服务
│   │   ├── TaskService.js        # 任务管理（核心业务逻辑）
│   │   ├── QueueService.js       # 队列管理服务
│   │   ├── ReservationService.js # 预约服务（15分钟延迟）
│   │   ├── StatsService.js       # 统计分析服务
│   │   └── index.js             # 服务导出聚合
│   ├── handlers/           # 命令和事件处理
│   │   ├── commands/       # 命令处理器
│   │   │   ├── basic.js    # 基础命令 (/start, /help)
│   │   │   ├── task.js     # 任务相关命令
│   │   │   ├── stats.js    # 统计相关命令
│   │   │   └── index.js    # 命令聚合
│   │   ├── callbacks/      # 回调处理器
│   │   │   ├── task.js     # 任务操作回调
│   │   │   └── index.js    # 回调聚合
│   │   └── index.js        # 处理器主入口
│   ├── middleware/         # 中间件
│   │   ├── error.js        # 错误处理中间件
│   │   ├── validation.js   # 输入验证中间件
│   │   └── index.js        # 中间件聚合
│   ├── utils/              # 工具函数
│   │   ├── helpers.js      # 通用帮助函数
│   │   ├── constants.js    # 常量定义
│   │   ├── logger.js       # 日志工具
│   │   └── index.js        # 工具聚合
│   └── database/           # 数据库相关
│       ├── connection.js   # 数据库连接管理
│       └── indexes.js      # 索引创建脚本
├── tests/                  # 测试文件
│   ├── unit/              # 单元测试
│   │   ├── services/      # 服务层测试
│   │   ├── models/        # 模型测试
│   │   └── utils/         # 工具函数测试
│   ├── integration/       # 集成测试
│   │   ├── api/          # API 集成测试
│   │   └── database/     # 数据库集成测试
│   ├── e2e/              # 端到端测试
│   ├── fixtures/         # 测试数据固件
│   ├── helpers/          # 测试辅助函数
│   └── setup.js          # 测试环境设置
├── config/                # 环境配置
│   ├── development.js     # 开发环境配置
│   ├── test.js           # 测试环境配置
│   ├── production.js     # 生产环境配置
│   └── index.js          # 配置加载器
├── scripts/              # 脚本文件
│   ├── setup.js          # 项目初始化脚本
│   ├── migrate.js        # 数据迁移脚本
│   └── seed.js           # 数据种子脚本
├── docker/               # Docker 配置
│   ├── Dockerfile        # 应用镜像
│   ├── docker-compose.yml # 本地开发环境
│   └── docker-compose.prod.yml # 生产环境
├── docs/                 # 项目文档
│   ├── api.md           # API 文档
│   ├── deployment.md    # 部署说明
│   └── development.md   # 开发指南
├── .env.example         # 环境变量示例
├── .env.test           # 测试环境变量
├── .eslintrc.js        # ESLint 配置
├── .prettierrc         # Prettier 配置
├── jest.config.js      # Jest 测试配置
├── package.json        # 项目配置和依赖
└── yarn.lock           # 锁定版本文件
```

## 关键技术实现约束

### 绝对禁止的技术实践
```javascript
// ❌ 禁止：使用原生定时器（导致重启后丢失）
setTimeout(() => { /* ... */ }, delay);
setInterval(() => { /* ... */ }, delay);

// ❌ 禁止：CommonJS 语法（项目要求 ES Module）
const express = require('express');
module.exports = something;

// ❌ 禁止：Promise 链式调用（使用 async/await）
someAsyncFunction().then().catch();
```

### 必须遵循的技术实践
```javascript
// ✅ 必须：使用 Bull Queue 进行定时任务
import Queue from 'bull';
await queue.add('task', data, { delay });

// ✅ 必须：ES Module 语法
import express from 'express';
export default something;

// ✅ 必须：现代 async/await 语法
try {
  const result = await someAsyncFunction();
} catch (error) {
  // 错误处理
}

// ✅ 必须：神圣座位原理严格实现
if (!success) {
  chain.status = 'broken';
  chain.totalTasks = 0;      // 完全重置
  chain.completedTasks = 0;  // 完全重置
  user.stats.currentStreak = 0; // 重置连击
}
```

## 数据模型设计（关键结构）

### 用户模型 (src/models/User.js)
```javascript
import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  userId: {
    type: Number,
    required: true,
    unique: true,
    index: true  // 性能关键索引
  },
  username: String,
  firstName: String,
  lastName: String,
  settings: {
    defaultDuration: { type: Number, default: 25 }, // 默认专注时长（分钟）
    reminderEnabled: { type: Boolean, default: true },
    timezone: { type: String, default: 'UTC' },
    language: { type: String, default: 'zh-CN' }
  },
  stats: {
    totalTasks: { type: Number, default: 0 },
    completedTasks: { type: Number, default: 0 },
    failedTasks: { type: Number, default: 0 },
    totalMinutes: { type: Number, default: 0 },
    currentStreak: { type: Number, default: 0 },     // 当前连击数
    longestStreak: { type: Number, default: 0 },     // 历史最长连击
    todayCompletedTasks: { type: Number, default: 0 },
    lastTaskDate: Date
  },
  preferences: {
    notificationSound: { type: Boolean, default: true },
    progressReminders: { type: Boolean, default: true },
    weeklyReport: { type: Boolean, default: true }
  }
}, {
  timestamps: true,  // 自动添加 createdAt 和 updatedAt
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// 虚拟字段：成功率
userSchema.virtual('successRate').get(function() {
  if (this.stats.totalTasks === 0) return 0;
  return (this.stats.completedTasks / this.stats.totalTasks * 100).toFixed(1);
});

// 性能关键索引
userSchema.index({ userId: 1 });
userSchema.index({ 'stats.currentStreak': -1 }); // 排行榜查询
userSchema.index({ updatedAt: -1 }); // 活跃用户查询

export default mongoose.model('User', userSchema);
```

### 任务链模型 (src/models/TaskChain.js) - 神圣座位原理核心
```javascript
import mongoose from 'mongoose';

// 子任务模式
const taskSchema = new mongoose.Schema({
  taskId: { type: String, required: true, unique: true },
  description: { type: String, required: true },
  duration: { type: Number, required: true }, // 分钟
  startTime: { type: Date, required: true },
  endTime: Date,
  status: {
    type: String,
    enum: ['pending', 'running', 'completed', 'failed', 'cancelled'],
    default: 'pending'
  },
  actualDuration: Number, // 实际完成时长
  isReserved: { type: Boolean, default: false },
  reservedAt: Date,
  reservationId: String,
  metadata: {
    progressReminders: [{ time: Date, sent: Boolean }],
    interruptions: [{ time: Date, reason: String }],
    notes: String
  }
}, {
  _id: false  // 不为子文档创建单独的 _id
});

// 任务链模式 - 实现神圣座位原理
const taskChainSchema = new mongoose.Schema({
  userId: { type: Number, required: true, index: true },
  chainId: { type: String, required: true, unique: true },
  title: { type: String, default: '专注任务链' },
  description: String,
  tasks: [taskSchema],

  // 神圣座位原理核心字段
  totalTasks: { type: Number, default: 0 },        // 链中总任务数
  completedTasks: { type: Number, default: 0 },    // 已完成任务数
  failedTasks: { type: Number, default: 0 },       // 失败任务数
  status: {
    type: String,
    enum: ['active', 'broken', 'completed', 'paused'],
    default: 'active'
  },

  // 统计字段
  totalMinutes: { type: Number, default: 0 },      // 总专注时长
  averageTaskDuration: { type: Number, default: 0 },
  lastTaskCompletedAt: Date,

  // 破链信息（神圣座位原理）
  brokenAt: Date,           // 破链时间
  brokenReason: String,     // 破链原因
  brokenTaskId: String,     // 导致破链的任务ID

  // 链恢复信息
  restoredAt: Date,         // 恢复时间
  restorationCount: { type: Number, default: 0 }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// 虚拟字段：当前活跃任务
taskChainSchema.virtual('currentTask').get(function() {
  return this.tasks.find(task => task.status === 'running');
});

// 虚拟字段：成功率
taskChainSchema.virtual('successRate').get(function() {
  if (this.totalTasks === 0) return 100;
  return (this.completedTasks / this.totalTasks * 100).toFixed(1);
});

// 神圣座位原理核心方法
taskChainSchema.methods.breakChain = function(reason = '任务失败', taskId = null) {
  this.status = 'broken';
  this.totalTasks = 0;           // 核心：完全重置
  this.completedTasks = 0;       // 核心：完全重置
  this.failedTasks = 0;          // 重置失败计数
  this.brokenAt = new Date();
  this.brokenReason = reason;
  this.brokenTaskId = taskId;
  return this;
};

// 链恢复方法
taskChainSchema.methods.restoreChain = function() {
  this.status = 'active';
  this.restoredAt = new Date();
  this.restorationCount += 1;
  this.brokenAt = null;
  this.brokenReason = null;
  this.brokenTaskId = null;
  return this;
};

// 性能关键索引（基于CLAUDE.md要求）
taskChainSchema.index({ userId: 1, status: 1 });
taskChainSchema.index({ 'tasks.taskId': 1 });
taskChainSchema.index({ userId: 1, updatedAt: -1 });
taskChainSchema.index({ status: 1, updatedAt: -1 });

export default mongoose.model('TaskChain', taskChainSchema);
```

### 每日统计模型 (src/models/DailyStats.js)
```javascript
import mongoose from 'mongoose';

const dailyStatsSchema = new mongoose.Schema({
  userId: { type: Number, required: true, index: true },
  date: { type: Date, required: true }, // 统计日期（日期开始）
  stats: {
    tasksStarted: { type: Number, default: 0 },
    tasksCompleted: { type: Number, default: 0 },
    tasksFailed: { type: Number, default: 0 },
    totalMinutes: { type: Number, default: 0 },
    averageTaskDuration: { type: Number, default: 0 },
    longestTask: { type: Number, default: 0 },
    shortestTask: { type: Number, default: Number.MAX_VALUE },
    successRate: { type: Number, default: 0 },
    chainsCreated: { type: Number, default: 0 },
    chainsBroken: { type: Number, default: 0 },
    longestChain: { type: Number, default: 0 }
  },
  patterns: [{ // 执行的定式ID列表
    patternId: String,
    executedAt: Date,
    success: Boolean
  }],
  metadata: {
    firstTaskAt: Date,
    lastTaskAt: Date,
    mostProductiveHour: Number, // 0-23
    interruptions: Number
  }
}, {
  timestamps: true
});

// 复合索引：用户+日期唯一
dailyStatsSchema.index({ userId: 1, date: 1 }, { unique: true });
dailyStatsSchema.index({ date: 1 }); // 全平台统计查询
dailyStatsSchema.index({ 'stats.successRate': -1 }); // 排行榜

export default mongoose.model('DailyStats', dailyStatsSchema);
```

## 核心服务实现

### TaskService.js - 神圣座位原理核心逻辑
```javascript
import { TaskChain, User, DailyStats } from '../models/index.js';
import { generateId, logger } from '../utils/index.js';
import QueueService from './QueueService.js';

class TaskService {
  constructor() {
    this.queueService = new QueueService();
  }

  /**
   * 创建新任务 - 遵循神圣座位原理
   * @param {number} userId - 用户ID
   * @param {string} description - 任务描述
   * @param {number} duration - 任务时长（分钟）
   * @param {boolean} isReserved - 是否为预约任务
   * @param {string} reservationId - 预约ID（如果适用）
   */
  async createTask(userId, description = '专注任务', duration = 25, isReserved = false, reservationId = null) {
    try {
      // 1. 确保用户存在
      let user = await User.findOne({ userId });
      if (!user) {
        user = await User.create({
          userId,
          settings: { defaultDuration: duration }
        });
        logger.info(`新用户创建: ${userId}`);
      }

      // 2. 查找或创建活跃任务链
      let chain = await TaskChain.findOne({
        userId,
        status: 'active'
      });

      if (!chain) {
        chain = await TaskChain.create({
          userId,
          chainId: generateId('chain'),
          title: '专注任务链',
          status: 'active'
        });
        logger.info(`新任务链创建: ${chain.chainId} for user ${userId}`);
      }

      // 3. 检查是否有正在进行的任务
      const runningTask = chain.tasks.find(task => task.status === 'running');
      if (runningTask) {
        throw new Error('当前已有任务正在进行中，请先完成或停止当前任务');
      }

      // 4. 创建新任务
      const task = {
        taskId: generateId('task'),
        description,
        duration,
        startTime: new Date(),
        status: 'running',
        isReserved,
        reservationId,
        metadata: {
          progressReminders: [],
          interruptions: [],
          notes: ''
        }
      };

      // 5. 更新任务链
      chain.tasks.push(task);
      chain.totalTasks += 1;
      await chain.save();

      // 6. 更新用户统计
      user.stats.totalTasks += 1;
      await user.save();

      // 7. 安排进度提醒
      await this.scheduleProgressReminders(userId, task.taskId, duration);

      // 8. 记录日志
      logger.info(`任务创建成功: ${task.taskId} for user ${userId}, duration: ${duration}min`);

      return { chain, task, user };

    } catch (error) {
      logger.error(`创建任务失败: ${error.message}`, { userId, description, duration });
      throw new Error(`创建任务失败: ${error.message}`);
    }
  }

  /**
   * 完成任务 - 神圣座位原理核心实现
   * @param {number} userId - 用户ID
   * @param {string} taskId - 任务ID
   * @param {boolean} success - 是否成功完成
   * @param {string} failureReason - 失败原因（如果适用）
   */
  async completeTask(userId, taskId, success = true, failureReason = null) {
    try {
      // 1. 查找任务链
      const chain = await TaskChain.findOne({
        userId,
        'tasks.taskId': taskId
      });

      if (!chain) {
        throw new Error('任务不存在或已被删除');
      }

      // 2. 查找具体任务
      const task = chain.tasks.find(t => t.taskId === taskId);
      if (!task) {
        throw new Error('指定的任务不存在');
      }

      if (task.status !== 'running') {
        throw new Error('任务未在运行状态，无法完成');
      }

      // 3. 更新任务状态
      const endTime = new Date();
      task.status = success ? 'completed' : 'failed';
      task.endTime = endTime;
      task.actualDuration = Math.floor((endTime - task.startTime) / 60000); // 实际时长（分钟）

      // 4. 获取用户信息
      const user = await User.findOne({ userId });
      if (!user) {
        throw new Error('用户不存在');
      }

      if (success) {
        // 成功完成任务
        chain.completedTasks += 1;
        chain.totalMinutes += task.actualDuration;
        chain.lastTaskCompletedAt = endTime;

        // 更新用户统计
        user.stats.completedTasks += 1;
        user.stats.totalMinutes += task.actualDuration;
        user.stats.currentStreak += 1;
        user.stats.longestStreak = Math.max(
          user.stats.longestStreak,
          user.stats.currentStreak
        );
        user.stats.lastTaskDate = endTime;

        logger.info(`任务完成成功: ${taskId}, 用户连击数: ${user.stats.currentStreak}`);

      } else {
        // 🔴 神圣座位原理：任务失败 - 完全重置
        chain.failedTasks += 1;

        // 破坏任务链 - 核心逻辑
        chain.breakChain(failureReason || '任务未能完成', taskId);

        // 重置用户连击记录
        user.stats.failedTasks += 1;
        user.stats.currentStreak = 0; // 连击清零

        logger.warn(`任务失败，链条重置: ${taskId}, 原因: ${failureReason}`, {
          userId,
          chainId: chain.chainId,
          previousTotal: chain.totalTasks,
          previousCompleted: chain.completedTasks
        });
      }

      // 5. 保存更新
      await Promise.all([
        chain.save(),
        user.save()
      ]);

      // 6. 取消相关的定时任务
      await this.cancelTaskReminders(taskId);

      // 7. 更新每日统计
      await this.updateDailyStats(userId, task, success);

      return {
        chain,
        task,
        user,
        wasChainBroken: !success
      };

    } catch (error) {
      logger.error(`完成任务失败: ${error.message}`, { userId, taskId, success });
      throw new Error(`完成任务失败: ${error.message}`);
    }
  }

  /**
   * 获取用户当前状态
   */
  async getUserStatus(userId) {
    try {
      const [user, activeChain, todayStats] = await Promise.all([
        User.findOne({ userId }),
        TaskChain.findOne({ userId, status: 'active' }),
        this.getDailyStats(userId, new Date())
      ]);

      const currentTask = activeChain?.currentTask;

      return {
        user,
        activeChain,
        currentTask,
        todayStats,
        isActive: !!currentTask,
        stats: user?.stats || {}
      };

    } catch (error) {
      logger.error(`获取用户状态失败: ${error.message}`, { userId });
      throw new Error(`获取用户状态失败: ${error.message}`);
    }
  }

  /**
   * 安排进度提醒
   */
  async scheduleProgressReminders(userId, taskId, duration) {
    const progressIntervals = [0.25, 0.5, 0.75]; // 25%, 50%, 75%

    for (const progress of progressIntervals) {
      const delay = duration * progress * 60 * 1000; // 毫秒
      await this.queueService.addReminder('progress', {
        userId,
        taskId,
        progress: progress * 100,
        message: `📊 任务进度: ${progress * 100}% 完成`
      }, delay);
    }

    // 完成提醒
    const completionDelay = duration * 60 * 1000;
    await this.queueService.addReminder('completion', {
      userId,
      taskId,
      message: '⏰ 专注时间结束！'
    }, completionDelay);
  }

  /**
   * 取消任务相关提醒
   */
  async cancelTaskReminders(taskId) {
    await this.queueService.cancelTaskReminders(taskId);
  }

  /**
   * 更新每日统计
   */
  async updateDailyStats(userId, task, success) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const stats = await DailyStats.findOneAndUpdate(
      { userId, date: today },
      {
        $inc: {
          'stats.tasksStarted': 1,
          'stats.tasksCompleted': success ? 1 : 0,
          'stats.tasksFailed': success ? 0 : 1,
          'stats.totalMinutes': success ? task.actualDuration : 0
        },
        $set: {
          'metadata.lastTaskAt': task.endTime
        }
      },
      { upsert: true, new: true }
    );

    // 更新成功率
    if (stats.stats.tasksStarted > 0) {
      stats.stats.successRate = (stats.stats.tasksCompleted / stats.stats.tasksStarted * 100);
      await stats.save();
    }

    return stats;
  }

  /**
   * 获取每日统计
   */
  async getDailyStats(userId, date = new Date()) {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);

    let stats = await DailyStats.findOne({
      userId,
      date: startOfDay
    });

    if (!stats) {
      stats = await DailyStats.create({
        userId,
        date: startOfDay,
        stats: {
          tasksStarted: 0,
          tasksCompleted: 0,
          tasksFailed: 0,
          totalMinutes: 0,
          successRate: 0
        }
      });
    }

    return stats;
  }
}

export default TaskService;
```

### QueueService.js - 定时任务管理
```javascript
import Queue from 'bull';
import { logger } from '../utils/index.js';

class QueueService {
  constructor() {
    // 创建队列实例
    this.reminderQueue = new Queue('任务提醒队列', {
      redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: process.env.REDIS_PORT || 6379,
        password: process.env.REDIS_PASSWORD || undefined
      },
      defaultJobOptions: {
        removeOnComplete: 10,
        removeOnFail: 5,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000
        }
      }
    });

    this.reservationQueue = new Queue('预约提醒队列', {
      redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: process.env.REDIS_PORT || 6379,
        password: process.env.REDIS_PASSWORD || undefined
      },
      defaultJobOptions: {
        removeOnComplete: 10,
        removeOnFail: 5,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000
        }
      }
    });

    this.setupProcessors();
    this.setupEventListeners();
  }

  /**
   * 设置队列处理器
   */
  setupProcessors() {
    // 任务进度提醒处理器
    this.reminderQueue.process('progress', async (job) => {
      const { userId, taskId, progress, message } = job.data;

      try {
        await this.sendProgressNotification(userId, message, progress);
        logger.info(`进度提醒发送成功: ${taskId} - ${progress}%`);
      } catch (error) {
        logger.error(`进度提醒发送失败: ${error.message}`, { userId, taskId, progress });
        throw error;
      }
    });

    // 任务完成提醒处理器
    this.reminderQueue.process('completion', async (job) => {
      const { userId, taskId, message } = job.data;

      try {
        await this.sendCompletionNotification(userId, message, taskId);
        logger.info(`完成提醒发送成功: ${taskId}`);
      } catch (error) {
        logger.error(`完成提醒发送失败: ${error.message}`, { userId, taskId });
        throw error;
      }
    });

    // 预约提醒处理器 - 线性时延原理实现
    this.reservationQueue.process('reservation', async (job) => {
      const { userId, reservationId, taskDescription, duration } = job.data;

      try {
        await this.sendReservationNotification(userId, reservationId, taskDescription, duration);
        logger.info(`预约提醒发送成功: ${reservationId} for user ${userId}`);
      } catch (error) {
        logger.error(`预约提醒发送失败: ${error.message}`, { userId, reservationId });
        throw error;
      }
    });
  }

  /**
   * 设置队列事件监听器
   */
  setupEventListeners() {
    this.reminderQueue.on('completed', (job, result) => {
      logger.info(`任务提醒队列任务完成: ${job.id}`);
    });

    this.reminderQueue.on('failed', (job, err) => {
      logger.error(`任务提醒队列任务失败: ${job.id}`, { error: err.message });
    });

    this.reservationQueue.on('completed', (job, result) => {
      logger.info(`预约提醒队列任务完成: ${job.id}`);
    });

    this.reservationQueue.on('failed', (job, err) => {
      logger.error(`预约提醒队列任务失败: ${job.id}`, { error: err.message });
    });
  }

  /**
   * 添加提醒任务
   * @param {string} type - 提醒类型 ('progress', 'completion')
   * @param {object} data - 任务数据
   * @param {number} delay - 延迟时间（毫秒）
   */
  async addReminder(type, data, delay) {
    try {
      const job = await this.reminderQueue.add(type, data, {
        delay,
        jobId: `${type}_${data.taskId}_${Date.now()}` // 唯一ID避免重复
      });

      logger.info(`${type} 提醒已安排: ${job.id}, 延迟: ${delay}ms`);
      return job.id;
    } catch (error) {
      logger.error(`添加提醒任务失败: ${error.message}`, { type, data, delay });
      throw error;
    }
  }

  /**
   * 添加15分钟预约 - 线性时延原理核心实现
   * @param {number} userId - 用户ID
   * @param {string} reservationId - 预约ID
   * @param {string} taskDescription - 任务描述
   * @param {number} duration - 任务时长
   */
  async scheduleReservation(userId, reservationId, taskDescription, duration = 25) {
    try {
      const delay = 15 * 60 * 1000; // 15分钟延迟

      const job = await this.reservationQueue.add('reservation', {
        userId,
        reservationId,
        taskDescription,
        duration,
        scheduledFor: new Date(Date.now() + delay)
      }, {
        delay,
        jobId: reservationId  // 使用预约ID作为Job ID
      });

      logger.info(`15分钟预约已安排: ${reservationId} for user ${userId}`);
      return job.id;
    } catch (error) {
      logger.error(`安排预约失败: ${error.message}`, { userId, reservationId });
      throw error;
    }
  }

  /**
   * 取消任务相关的所有提醒
   * @param {string} taskId - 任务ID
   */
  async cancelTaskReminders(taskId) {
    try {
      // 获取所有等待中的任务
      const waitingJobs = await this.reminderQueue.getWaiting();
      const delayedJobs = await this.reminderQueue.getDelayed();

      const allJobs = [...waitingJobs, ...delayedJobs];

      // 找到与此任务相关的提醒任务并取消
      const jobsToCancel = allJobs.filter(job =>
        job.data.taskId === taskId
      );

      for (const job of jobsToCancel) {
        await job.remove();
        logger.info(`已取消任务提醒: ${job.id} for task ${taskId}`);
      }

      return jobsToCancel.length;
    } catch (error) {
      logger.error(`取消任务提醒失败: ${error.message}`, { taskId });
      throw error;
    }
  }

  /**
   * 取消预约
   * @param {string} reservationId - 预约ID
   */
  async cancelReservation(reservationId) {
    try {
      // 通过Job ID取消特定预约
      const job = await this.reservationQueue.getJob(reservationId);
      if (job) {
        await job.remove();
        logger.info(`预约已取消: ${reservationId}`);
        return true;
      }
      return false;
    } catch (error) {
      logger.error(`取消预约失败: ${error.message}`, { reservationId });
      throw error;
    }
  }

  /**
   * 发送进度通知（需要Bot实例注入）
   */
  async sendProgressNotification(userId, message, progress) {
    // 这个方法需要Bot实例，实际实现时通过依赖注入
    if (this.botInstance) {
      await this.botInstance.sendMessage(userId, message);
    }
  }

  /**
   * 发送完成通知
   */
  async sendCompletionNotification(userId, message, taskId) {
    if (this.botInstance) {
      await this.botInstance.sendMessage(userId,
        `${message}\n\n` +
        `请确认任务完成状态：`,
        {
          reply_markup: {
            inline_keyboard: [[
              { text: '✅ 成功完成', callback_data: `complete_task_${taskId}` },
              { text: '❌ 未能完成', callback_data: `fail_task_${taskId}` }
            ]]
          }
        }
      );
    }
  }

  /**
   * 发送预约通知 - 线性时延原理实现
   */
  async sendReservationNotification(userId, reservationId, taskDescription, duration) {
    if (this.botInstance) {
      await this.botInstance.sendMessage(userId,
        `⏰ 预约时间到！\n\n` +
        `根据线性时延原理，现在是开始任务的最佳时机。\n` +
        `15分钟的延迟已经大大降低了启动阻力。\n\n` +
        `📋 任务：${taskDescription}\n` +
        `⏱ 时长：${duration}分钟\n\n` +
        `准备好开始了吗？`,
        {
          reply_markup: {
            inline_keyboard: [[
              { text: '🚀 立即开始', callback_data: `start_reserved_${reservationId}` },
              { text: '⏰ 延迟5分钟', callback_data: `delay_reservation_${reservationId}_5` },
              { text: '❌ 取消预约', callback_data: `cancel_reservation_${reservationId}` }
            ]]
          }
        }
      );
    }
  }

  /**
   * 注入Bot实例（用于发送消息）
   */
  setBotInstance(botInstance) {
    this.botInstance = botInstance;
  }

  /**
   * 获取队列统计信息
   */
  async getQueueStats() {
    try {
      const [reminderStats, reservationStats] = await Promise.all([
        {
          waiting: await this.reminderQueue.getWaiting(),
          active: await this.reminderQueue.getActive(),
          completed: await this.reminderQueue.getCompleted(),
          failed: await this.reminderQueue.getFailed()
        },
        {
          waiting: await this.reservationQueue.getWaiting(),
          active: await this.reservationQueue.getActive(),
          completed: await this.reservationQueue.getCompleted(),
          failed: await this.reservationQueue.getFailed()
        }
      ]);

      return {
        reminders: {
          waiting: reminderStats.waiting.length,
          active: reminderStats.active.length,
          completed: reminderStats.completed.length,
          failed: reminderStats.failed.length
        },
        reservations: {
          waiting: reservationStats.waiting.length,
          active: reservationStats.active.length,
          completed: reservationStats.completed.length,
          failed: reservationStats.failed.length
        }
      };
    } catch (error) {
      logger.error(`获取队列统计失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 清理过期任务
   */
  async cleanup() {
    try {
      await Promise.all([
        this.reminderQueue.clean(24 * 60 * 60 * 1000, 'completed'), // 清理1天前的已完成任务
        this.reminderQueue.clean(24 * 60 * 60 * 1000, 'failed'),    // 清理1天前的失败任务
        this.reservationQueue.clean(24 * 60 * 60 * 1000, 'completed'),
        this.reservationQueue.clean(24 * 60 * 60 * 1000, 'failed')
      ]);

      logger.info('队列清理完成');
    } catch (error) {
      logger.error(`队列清理失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 关闭队列连接
   */
  async close() {
    await Promise.all([
      this.reminderQueue.close(),
      this.reservationQueue.close()
    ]);
    logger.info('队列服务已关闭');
  }
}

export default QueueService;
```

## 现代化验证门（可执行）

### package.json 配置
```json
{
  "name": "telegram-self-control-bot",
  "version": "1.0.0",
  "type": "module",
  "description": "基于自控力理论的Telegram机器人",
  "main": "src/app.js",
  "engines": {
    "node": ">=18.0.0",
    "yarn": ">=1.22.0"
  },
  "scripts": {
    "start": "node src/app.js",
    "dev": "nodemon --experimental-modules src/app.js",
    "build": "echo 'No build step required for Node.js'",
    "test": "NODE_ENV=test jest",
    "test:watch": "NODE_ENV=test jest --watch",
    "test:coverage": "NODE_ENV=test jest --coverage",
    "test:integration": "NODE_ENV=test jest tests/integration --runInBand",
    "test:e2e": "NODE_ENV=test jest tests/e2e --runInBand",
    "lint": "eslint src tests --ext .js",
    "lint:fix": "eslint src tests --ext .js --fix",
    "format": "prettier --write 'src/**/*.js' 'tests/**/*.js'",
    "format:check": "prettier --check 'src/**/*.js' 'tests/**/*.js'",
    "setup": "node scripts/setup.js",
    "migrate": "node scripts/migrate.js",
    "seed": "node scripts/seed.js",
    "docker:build": "docker build -t telegram-self-control-bot .",
    "docker:dev": "docker-compose up -d",
    "docker:prod": "docker-compose -f docker/docker-compose.prod.yml up -d",
    "docker:stop": "docker-compose down",
    "validate": "yarn lint && yarn format:check && yarn test",
    "pre-commit": "yarn lint:fix && yarn format && yarn test"
  },
  "dependencies": {
    "node-telegram-bot-api": "^0.61.0",
    "mongoose": "^7.5.0",
    "bull": "^4.11.3",
    "redis": "^4.6.7",
    "express": "^4.18.2",
    "dotenv": "^16.3.1",
    "winston": "^3.10.0",
    "joi": "^17.9.2",
    "lodash": "^4.17.21",
    "moment-timezone": "^0.5.43"
  },
  "devDependencies": {
    "nodemon": "^3.0.1",
    "jest": "^29.6.2",
    "supertest": "^6.3.3",
    "@types/jest": "^29.5.3",
    "eslint": "^8.45.0",
    "eslint-config-airbnb-base": "^15.0.0",
    "eslint-plugin-import": "^2.27.5",
    "prettier": "^3.0.0",
    "mongodb-memory-server": "^8.15.1"
  }
}
```

### 验证门命令（必须全部通过）
```bash
# 1. 代码质量检查
yarn lint                    # ESLint 检查
yarn format:check           # Prettier 格式检查

# 2. 测试验证
yarn test                   # 单元测试
yarn test:integration      # 集成测试
yarn test:coverage         # 测试覆盖率（需要 >= 80%）

# 3. 构建验证
yarn docker:build         # Docker 镜像构建
yarn docker:dev           # 本地开发环境启动

# 4. 端到端验证
yarn test:e2e             # 端到端测试

# 5. 完整验证流程
yarn validate             # 运行所有验证步骤
```

## 实施任务清单（严格按序执行）

### 第一阶段：项目初始化（Day 1）
- [ ] 1. 使用 yarn 创建 Node.js 项目
- [ ] 2. 配置 package.json（ES Module + 现代工具链）
- [ ] 3. 设置 ESLint + Prettier + Jest 配置
- [ ] 4. 创建基本项目结构
- [ ] 5. 配置环境变量管理
- [ ] 6. 编写项目初始化脚本

### 第二阶段：数据层实现（Day 2）
- [ ] 7. 实现 MongoDB 连接管理
- [ ] 8. 创建 User 数据模型
- [ ] 9. 创建 TaskChain 数据模型（神圣座位原理核心）
- [ ] 10. 创建 DailyStats 数据模型
- [ ] 11. 创建数据库索引脚本
- [ ] 12. 编写数据模型单元测试

### 第三阶段：核心服务层（Day 3-4）
- [ ] 13. 实现 Redis 连接管理
- [ ] 14. 实现 QueueService（Bull Queue集成）
- [ ] 15. 实现 TaskService 核心业务逻辑
- [ ] 16. 实现神圣座位原理重置逻辑
- [ ] 17. 编写服务层单元测试
- [ ] 18. 验证定时任务功能

### 第四阶段：Bot 框架（Day 5）
- [ ] 19. 实现 Bot 主入口和配置
- [ ] 20. 实现基础命令处理器
- [ ] 21. 实现回调查询处理器
- [ ] 22. 集成服务层到 Bot 框架
- [ ] 23. 实现错误处理中间件
- [ ] 24. 编写 Bot 集成测试

### 第五阶段：预约机制（Day 6）
- [ ] 25. 实现 ReservationService
- [ ] 26. 实现15分钟预约命令处理
- [ ] 27. 实现预约提醒系统
- [ ] 28. 实现预约取消功能
- [ ] 29. 测试线性时延原理实现
- [ ] 30. 编写预约功能测试

### 第六阶段：统计功能（Day 7）
- [ ] 31. 实现 StatsService
- [ ] 32. 实现每日统计自动更新
- [ ] 33. 实现统计查询命令
- [ ] 34. 实现用户排行榜功能
- [ ] 35. 编写统计功能测试

### 第七阶段：用户体验优化（Day 8）
- [ ] 36. 优化命令交互界面
- [ ] 37. 实现多语言支持基础
- [ ] 38. 实现用户设置管理
- [ ] 39. 优化错误提示信息
- [ ] 40. 实现帮助系统

### 第八阶段：测试和质量保证（Day 9-10）
- [ ] 41. 完善单元测试覆盖率（目标80%+）
- [ ] 42. 编写集成测试
- [ ] 43. 编写端到端测试
- [ ] 44. 性能测试和优化
- [ ] 45. 安全测试和加固
- [ ] 46. 文档更新和完善

### 第九阶段：部署准备（Day 11-12）
- [ ] 47. 创建 Docker 配置
- [ ] 48. 创建 docker-compose 开发环境
- [ ] 49. 创建生产部署配置
- [ ] 50. 实现健康检查端点
- [ ] 51. 配置日志收集
- [ ] 52. 编写部署脚本

### 第十阶段：最终验证（Day 13-14）
- [ ] 53. 完整功能测试验证
- [ ] 54. 性能压力测试
- [ ] 55. 安全漏洞扫描
- [ ] 56. 文档审核和更新
- [ ] 57. 部署到测试环境
- [ ] 58. 用户接受度测试

## 关键技术难点和解决方案

### 难点1：定时任务持久化
**问题**：原生 setTimeout 在服务重启后失效
**解决方案**：
```javascript
// ❌ 错误做法
setTimeout(() => {
  sendReminder(userId, taskId);
}, 15 * 60 * 1000);

// ✅ 正确做法 - 使用 Bull Queue
await reminderQueue.add('task_reminder', {
  userId, taskId, type: 'completion'
}, { delay: 15 * 60 * 1000 });
```

### 难点2：神圣座位原理精确实现
**问题**：确保任何失败都完全重置进度
**解决方案**：
```javascript
// 核心重置逻辑 - 必须原子性操作
const session = await mongoose.startSession();
try {
  await session.withTransaction(async () => {
    // 重置任务链
    chain.status = 'broken';
    chain.totalTasks = 0;
    chain.completedTasks = 0;
    await chain.save({ session });

    // 重置用户连击
    user.stats.currentStreak = 0;
    await user.save({ session });
  });
} finally {
  await session.endSession();
}
```

### 难点3：高并发下的数据一致性
**问题**：多个任务同时操作可能导致数据不一致
**解决方案**：
```javascript
// 使用乐观锁和重试机制
const maxRetries = 3;
for (let i = 0; i < maxRetries; i++) {
  try {
    const chain = await TaskChain.findOne({ userId, status: 'active' });
    // 业务逻辑...
    await chain.save();
    break; // 成功退出
  } catch (error) {
    if (error.name === 'VersionError' && i < maxRetries - 1) {
      await new Promise(resolve => setTimeout(resolve, 100 * (i + 1)));
      continue; // 重试
    }
    throw error;
  }
}
```

### 难点4：Redis 连接管理
**问题**：Redis 连接中断影响定时任务
**解决方案**：
```javascript
// 连接池和自动重连
const queueOptions = {
  redis: {
    host: process.env.REDIS_HOST,
    port: process.env.REDIS_PORT,
    maxRetriesPerRequest: 3,
    retryDelayOnFailover: 100,
    enableReadyCheck: false,
    maxRetriesPerRequest: null,
    lazyConnect: true
  },
  settings: {
    stalledInterval: 30 * 1000,    // 30秒
    maxStalledCount: 1
  }
};
```

## 外部资源和文档

### 必读文档（包含具体URL）
1. **Telegram Bot API 官方文档**: https://core.telegram.org/bots/api
   - 重点章节：发送消息、内联键盘、回调查询
2. **node-telegram-bot-api 文档**: https://github.com/yagop/node-telegram-bot-api
   - 示例代码：https://github.com/yagop/node-telegram-bot-api/tree/master/examples
3. **Bull Queue 官方指南**: https://docs.bullmq.io/
   - 最佳实践：https://docs.bullmq.io/guide/best-practices
   - 延迟任务：https://docs.bullmq.io/guide/jobs#delayed-jobs
4. **Mongoose ODM 文档**: https://mongoosejs.com/docs/
   - 索引优化：https://mongoosejs.com/docs/guide.html#indexes
   - 查询性能：https://mongoosejs.com/docs/queries.html#query-performance

### 参考实现和示例
1. **Bot 命令处理模式**:
   ```
   https://github.com/yagop/node-telegram-bot-api/blob/master/examples/webhook.js
   ```
2. **Bull Queue 延迟任务示例**:
   ```
   https://github.com/OptimalBits/bull/blob/develop/PATTERNS.md#delayed-jobs
   ```
3. **MongoDB 索引策略**:
   ```
   https://www.mongodb.com/docs/manual/core/index-compound/
   ```
4. **Express.js ES Module 配置**:
   ```
   https://github.com/expressjs/express/tree/master/examples/mvc
   ```

### 工具和库的最佳实践
1. **Jest 测试配置**:
   ```
   https://jestjs.io/docs/configuration#testenvironment-string
   ```
2. **ESLint Airbnb 配置**:
   ```
   https://github.com/airbnb/javascript/tree/master/packages/eslint-config-airbnb-base
   ```
3. **Docker Node.js 最佳实践**:
   ```
   https://nodejs.org/en/docs/guides/nodejs-docker-webapp/
   ```

## 测试策略

### 单元测试覆盖范围（目标80%+）
```javascript
// tests/unit/services/TaskService.test.js
describe('TaskService', () => {
  describe('神圣座位原理测试', () => {
    test('任务失败应完全重置链条', async () => {
      // 创建测试链条
      const service = new TaskService();
      await service.createTask(123, '任务1', 30);
      await service.completeTask(123, 'task1', true);
      await service.createTask(123, '任务2', 30);

      // 第二个任务失败
      const result = await service.completeTask(123, 'task2', false);

      // 验证完全重置
      expect(result.chain.status).toBe('broken');
      expect(result.chain.totalTasks).toBe(0);
      expect(result.chain.completedTasks).toBe(0);
      expect(result.wasChainBroken).toBe(true);
    });

    test('连续成功应增加连击数', async () => {
      const service = new TaskService();

      // 连续完成3个任务
      for (let i = 1; i <= 3; i++) {
        await service.createTask(456, `任务${i}`, 25);
        await service.completeTask(456, `task${i}`, true);
      }

      const status = await service.getUserStatus(456);
      expect(status.user.stats.currentStreak).toBe(3);
      expect(status.user.stats.longestStreak).toBe(3);
    });
  });

  describe('15分钟预约机制测试', () => {
    test('预约应在15分钟后触发', async () => {
      const queueService = new QueueService();
      const reservationId = 'res_123';

      const jobId = await queueService.scheduleReservation(
        789, reservationId, '测试任务', 30
      );

      // 验证任务已添加到队列
      const job = await queueService.reservationQueue.getJob(reservationId);
      expect(job).toBeDefined();
      expect(job.opts.delay).toBe(15 * 60 * 1000);
    });
  });
});
```

### 集成测试示例
```javascript
// tests/integration/api/bot.test.js
describe('Bot API 集成测试', () => {
  let bot, mockTelegram;

  beforeEach(async () => {
    mockTelegram = new MockTelegramAPI();
    bot = new SelfControlBot({ telegramAPI: mockTelegram });
    await bot.start();
  });

  test('完整任务流程', async () => {
    const userId = 12345;

    // 1. 用户发送 /start
    await mockTelegram.simulateMessage(userId, '/start');
    expect(mockTelegram.lastMessage).toContain('欢迎使用自控力助手');

    // 2. 创建任务
    await mockTelegram.simulateMessage(userId, '/task 学习编程 30');
    expect(mockTelegram.lastMessage).toContain('任务已开始');

    // 3. 模拟30分钟后的完成
    jest.advanceTimersByTime(30 * 60 * 1000);
    expect(mockTelegram.lastMessage).toContain('专注时间结束');

    // 4. 用户点击完成按钮
    await mockTelegram.simulateCallback(userId, 'complete_task_xxx');
    expect(mockTelegram.lastMessage).toContain('任务完成');
  });
});
```

### 端到端测试示例
```javascript
// tests/e2e/user-journey.test.js
describe('用户旅程测试', () => {
  test('新用户完整体验流程', async () => {
    const testUser = await createTestUser();

    // 模拟一周的使用场景
    for (let day = 1; day <= 7; day++) {
      // 每天完成2-3个任务
      const tasksPerDay = Math.floor(Math.random() * 2) + 2;

      for (let task = 1; task <= tasksPerDay; task++) {
        await testUser.createTask(`第${day}天任务${task}`, 25);
        await testUser.completeTask(true);
      }

      // 验证统计数据
      const stats = await testUser.getStats();
      expect(stats.completedTasks).toBe(day * tasksPerDay);
      expect(stats.currentStreak).toBe(day * tasksPerDay);
    }

    // 验证周报生成
    const weeklyReport = await testUser.getWeeklyReport();
    expect(weeklyReport.totalTasks).toBeGreaterThan(0);
    expect(weeklyReport.successRate).toBe(100);
  });
});
```

## 质量评分和置信度

### 置信度评分：9/10

#### 评分理由

**优势 (9分)**：
- ✅ **完整的现代技术栈**：ES Module + yarn + 现代工具链
- ✅ **详细的实现细节**：包含完整的代码示例和架构
- ✅ **严格的技术约束**：神圣座位原理的精确实现指导
- ✅ **可执行的验证门**：所有命令都可以直接运行验证
- ✅ **全面的测试策略**：单元测试+集成测试+E2E测试
- ✅ **外部资源链接**：提供具体可用的文档URL
- ✅ **错误处理策略**：详细的异常处理和恢复机制
- ✅ **性能优化指导**：数据库索引和查询优化
- ✅ **部署就绪配置**：Docker化和生产环境支持

**风险 (-1分)**：
- ⚠️ **复杂度较高**：神圣座位原理需要精确理解和实现
- ⚠️ **依赖服务较多**：MongoDB + Redis + Bull Queue 需要正确配置

### 成功实施保障

1. **严格按照任务清单顺序执行**
2. **每个阶段完成后运行对应验证门**
3. **特别关注神圣座位原理的实现细节**
4. **使用现代 ES Module 语法而非 CommonJS**
5. **确保所有定时任务使用 Bull Queue**
6. **维护80%以上的测试覆盖率**

### 预期交付成果

#### MVP 版本功能清单
- [x] **用户管理**：注册、设置、统计追踪
- [x] **任务管理**：创建、执行、完成/失败处理
- [x] **神圣座位原理**：失败完全重置机制
- [x] **15分钟预约**：线性时延原理实现
- [x] **进度提醒**：25%、50%、75%、100%提醒
- [x] **统计分析**：每日统计、成功率、连击记录
- [x] **用户界面**：Telegram命令和按钮交互

#### 技术质量指标
- **代码覆盖率**: ≥80%
- **性能指标**: 响应时间<1秒，支持100并发用户
- **可靠性**: 99%可用性，定时任务准确率>99%
- **可维护性**: ESLint通过率100%，代码重复率<5%

---

**注意**: 本PRP基于现有项目文档和CLAUDE.md文件要求制作，确保所有实现细节都符合项目的理论基础和技术规范。实施时请严格遵循神圣座位原理和现代JavaScript最佳实践。