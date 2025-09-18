# MVP阶段开发档案 Week 3-4: 预约机制和提醒系统

## 开发目标
实现15分钟预约机制，使用Bull Queue管理定时任务，完善提醒系统。

## 新增依赖
```bash
npm install bull redis
npm install node-cron  # 备选方案
npm install @bull-board/express @bull-board/api  # 可视化队列管理
```

## 核心功能实现

### 1. Redis配置 (src/config/redis.js)
```javascript
const Redis = require('ioredis');

const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  maxRetriesPerRequest: 3,
  retryStrategy(times) {
    const delay = Math.min(times * 50, 2000);
    return delay;
  }
});

redis.on('connect', () => {
  console.log('Redis连接成功');
});

redis.on('error', (err) => {
  console.error('Redis连接错误:', err);
});

module.exports = redis;
```

### 2. 队列服务 (src/services/QueueService.js)
```javascript
const Queue = require('bull');
const redis = require('../config/redis');

class QueueService {
  constructor(bot) {
    this.bot = bot;
    
    // 创建不同类型的队列
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
    
    // 设置队列处理器
    this.setupProcessors();
  }
  
  setupProcessors() {
    // 处理提醒任务
    this.reminderQueue.process('task_reminder', async (job) => {
      const { userId, taskId, type, message } = job.data;
      
      try {
        if (type === 'progress') {
          await this.sendProgressReminder(userId, taskId, message);
        } else if (type === 'completion') {
          await this.sendCompletionReminder(userId, taskId);
        }
      } catch (error) {
        console.error('提醒发送失败:', error);
        throw error; // 让Bull重试
      }
    });
    
    // 处理预约任务
    this.reservationQueue.process('reservation_reminder', async (job) => {
      const { userId, reservationId, chainId } = job.data;
      
      try {
        await this.sendReservationReminder(userId, reservationId, chainId);
      } catch (error) {
        console.error('预约提醒失败:', error);
        throw error;
      }
    });
  }
  
  // 添加任务提醒
  async scheduleTaskReminders(userId, taskId, duration) {
    const progressPoints = [
      { percent: 25, delay: duration * 0.25 * 60 * 1000 },
      { percent: 50, delay: duration * 0.5 * 60 * 1000 },
      { percent: 75, delay: duration * 0.75 * 60 * 1000 }
    ];
    
    // 添加进度提醒
    for (const point of progressPoints) {
      await this.reminderQueue.add(
        'task_reminder',
        {
          userId,
          taskId,
          type: 'progress',
          message: `${point.percent}%`
        },
        {
          delay: point.delay,
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000
          }
        }
      );
    }
    
    // 添加完成提醒
    await this.reminderQueue.add(
      'task_reminder',
      {
        userId,
        taskId,
        type: 'completion'
      },
      {
        delay: duration * 60 * 1000,
        attempts: 3
      }
    );
  }
  
  // 添加预约提醒
  async scheduleReservation(userId, reservationId, chainId, delayMinutes = 15) {
    const job = await this.reservationQueue.add(
      'reservation_reminder',
      {
        userId,
        reservationId,
        chainId
      },
      {
        delay: delayMinutes * 60 * 1000,
        attempts: 3
      }
    );
    
    return job.id;
  }
  
  // 发送进度提醒
  async sendProgressReminder(userId, taskId, progress) {
    const progressBar = this.createProgressBar(parseInt(progress));
    
    await this.bot.sendMessage(
      userId,
      `📊 任务进度: ${progress}\n${progressBar}\n\n继续保持专注！💪`
    );
  }
  
  // 发送完成提醒
  async sendCompletionReminder(userId, taskId) {
    await this.bot.sendMessage(
      userId,
      `🔔 时间到！\n\n任务时间已结束，请确认完成情况：`,
      {
        reply_markup: {
          inline_keyboard: [[
            { text: '✅ 完成任务', callback_data: `complete_task_${taskId}` },
            { text: '❌ 任务失败', callback_data: `fail_task_${taskId}` },
            { text: '⏰ 延长10分钟', callback_data: `extend_task_${taskId}_10` }
          ]]
        }
      }
    );
  }
  
  // 发送预约提醒
  async sendReservationReminder(userId, reservationId, chainId) {
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
  }
  
  // 创建进度条
  createProgressBar(percent) {
    const filled = Math.round(percent / 10);
    const empty = 10 - filled;
    return '█'.repeat(filled) + '░'.repeat(empty);
  }
  
  // 取消任务的所有提醒
  async cancelTaskReminders(taskId) {
    const jobs = await this.reminderQueue.getJobs(['delayed', 'waiting']);
    
    for (const job of jobs) {
      if (job.data.taskId === taskId) {
        await job.remove();
      }
    }
  }
  
  // 获取队列统计
  async getQueueStats() {
    const reminderStats = await this.reminderQueue.getJobCounts();
    const reservationStats = await this.reservationQueue.getJobCounts();
    
    return {
      reminders: reminderStats,
      reservations: reservationStats
    };
  }
}

module.exports = QueueService;
```

### 3. 预约服务 (src/services/ReservationService.js)
```javascript
const TaskChain = require('../models/TaskChain');
const { generateId } = require('../utils/helpers');

class ReservationService {
  constructor(queueService) {
    this.queueService = queueService;
    this.activeReservations = new Map(); // 内存中存储活跃预约
  }
  
  async createReservation(userId, taskDescription = '专注任务', duration = 25) {
    const reservationId = generateId('res');
    
    // 查找或创建链
    let chain = await TaskChain.findOne({ 
      userId, 
      status: 'active' 
    });
    
    if (!chain) {
      chain = await TaskChain.create({
        userId,
        chainId: generateId('chain'),
        title: '任务链',
        tasks: [],
        status: 'active'
      });
    }
    
    // 创建预约任务（状态为pending）
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
    
    // 添加到队列
    const jobId = await this.queueService.scheduleReservation(
      userId,
      reservationId,
      chain.chainId,
      15 // 15分钟
    );
    
    // 存储预约信息
    this.activeReservations.set(reservationId, {
      userId,
      taskId: reservedTask.taskId,
      chainId: chain.chainId,
      jobId,
      createdAt: new Date(),
      executeAt: new Date(Date.now() + 15 * 60 * 1000)
    });
    
    return {
      reservationId,
      taskId: reservedTask.taskId,
      executeAt: new Date(Date.now() + 15 * 60 * 1000),
      chain
    };
  }
  
  async executeReservation(reservationId) {
    const reservation = this.activeReservations.get(reservationId);
    if (!reservation) {
      throw new Error('预约不存在');
    }
    
    const { userId, taskId, chainId } = reservation;
    
    // 更新任务状态
    const chain = await TaskChain.findOne({ chainId });
    const task = chain.tasks.find(t => t.taskId === taskId);
    
    if (!task) {
      throw new Error('任务不存在');
    }
    
    // 开始任务
    task.status = 'running';
    task.startTime = new Date();
    await chain.save();
    
    // 设置任务提醒
    await this.queueService.scheduleTaskReminders(
      userId,
      taskId,
      task.duration
    );
    
    // 清理预约信息
    this.activeReservations.delete(reservationId);
    
    return { task, chain };
  }
  
  async delayReservation(reservationId, delayMinutes = 5) {
    const reservation = this.activeReservations.get(reservationId);
    if (!reservation) {
      throw new Error('预约不存在');
    }
    
    // 重新安排预约
    const newJobId = await this.queueService.scheduleReservation(
      reservation.userId,
      reservationId,
      reservation.chainId,
      delayMinutes
    );
    
    // 更新预约信息
    reservation.jobId = newJobId;
    reservation.executeAt = new Date(Date.now() + delayMinutes * 60 * 1000);
    
    return reservation;
  }
  
  async cancelReservation(reservationId) {
    const reservation = this.activeReservations.get(reservationId);
    if (!reservation) {
      throw new Error('预约不存在');
    }
    
    const { chainId, taskId } = reservation;
    
    // 从链中移除任务
    const chain = await TaskChain.findOne({ chainId });
    chain.tasks = chain.tasks.filter(t => t.taskId !== taskId);
    await chain.save();
    
    // 清理预约信息
    this.activeReservations.delete(reservationId);
    
    return { success: true };
  }
  
  async getUserReservations(userId) {
    const reservations = [];
    
    for (const [id, reservation] of this.activeReservations) {
      if (reservation.userId === userId) {
        reservations.push({
          reservationId: id,
          ...reservation
        });
      }
    }
    
    return reservations.sort((a, b) => a.executeAt - b.executeAt);
  }
}

module.exports = ReservationService;
```

### 4. 更新的命令处理器（添加预约功能）
```javascript
// 在 CommandHandler 中添加新方法

async handleReserve(msg, match) {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  
  try {
    // 检查是否已有预约
    const existingReservations = await this.reservationService.getUserReservations(userId);
    
    if (existingReservations.length > 0) {
      const next = existingReservations[0];
      const timeRemaining = Math.round(
        (next.executeAt - Date.now()) / 60000
      );
      
      await this.bot.sendMessage(
        chatId,
        `⏰ 您已有预约\n\n` +
        `将在 ${timeRemaining} 分钟后提醒您开始任务\n` +
        `预约ID: ${next.reservationId}`
      );
      return;
    }
    
    // 解析参数
    const input = match[1] || '';
    const parts = input.split(' ');
    const lastPart = parts[parts.length - 1];
    const duration = parseInt(lastPart) || 25;
    const description = isNaN(parseInt(lastPart)) 
      ? input || '专注任务'
      : parts.slice(0, -1).join(' ') || '专注任务';
    
    // 创建预约
    const reservation = await this.reservationService.createReservation(
      userId,
      description,
      duration
    );
    
    await this.bot.sendMessage(
      chatId,
      `✅ 预约成功！\n\n` +
      `📋 任务：${description}\n` +
      `⏱ 时长：${duration}分钟\n` +
      `⏰ 提醒时间：${reservation.executeAt.toLocaleTimeString('zh-CN')}\n\n` +
      `💡 根据线性时延原理，15分钟后开始任务将大大降低启动阻力。\n` +
      `届时我会提醒您开始！`,
      {
        reply_markup: {
          inline_keyboard: [[
            { text: '📋 查看预约', callback_data: `view_reservation_${reservation.reservationId}` },
            { text: '❌ 取消预约', callback_data: `cancel_reservation_${reservation.reservationId}` }
          ]]
        }
      }
    );
  } catch (error) {
    await this.bot.sendMessage(
      chatId,
      `❌ 预约失败：${error.message}`
    );
  }
}

async handleReservationCallback(query) {
  const { data, message, from } = query;
  const chatId = message.chat.id;
  const userId = from.id;
  
  if (data.startsWith('start_reserved_')) {
    const reservationId = data.replace('start_reserved_', '');
    
    try {
      const { task, chain } = await this.reservationService.executeReservation(
        reservationId
      );
      
      const endTime = new Date(
        task.startTime.getTime() + task.duration * 60000
      );
      
      await this.bot.editMessageText(
        `🚀 任务已开始！\n\n` +
        `📋 任务：${task.description}\n` +
        `⏱ 时长：${task.duration}分钟\n` +
        `🕐 结束时间：${endTime.toLocaleTimeString('zh-CN')}\n\n` +
        `💪 保持专注，加油！`,
        {
          chat_id: chatId,
          message_id: message.message_id,
          reply_markup: {
            inline_keyboard: [[
              { text: '✅ 提前完成', callback_data: `complete_task_${task.taskId}` },
              { text: '❌ 放弃任务', callback_data: `fail_task_${task.taskId}` }
            ]]
          }
        }
      );
    } catch (error) {
      await this.bot.answerCallbackQuery(
        query.id,
        { text: `错误：${error.message}`, show_alert: true }
      );
    }
    
  } else if (data.startsWith('delay_reservation_')) {
    const parts = data.split('_');
    const reservationId = parts[2];
    const delayMinutes = parseInt(parts[3]) || 5;
    
    try {
      const reservation = await this.reservationService.delayReservation(
        reservationId,
        delayMinutes
      );
      
      await this.bot.editMessageText(
        `⏰ 预约已延迟\n\n` +
        `新的提醒时间：${reservation.executeAt.toLocaleTimeString('zh-CN')}\n` +
        `（${delayMinutes}分钟后）`,
        {
          chat_id: chatId,
          message_id: message.message_id
        }
      );
    } catch (error) {
      await this.bot.answerCallbackQuery(
        query.id,
        { text: `错误：${error.message}`, show_alert: true }
      );
    }
    
  } else if (data.startsWith('cancel_reservation_')) {
    const reservationId = data.replace('cancel_reservation_', '');
    
    try {
      await this.reservationService.cancelReservation(reservationId);
      
      await this.bot.editMessageText(
        `❌ 预约已取消\n\n` +
        `您可以随时使用 /reserve 创建新的预约`,
        {
          chat_id: chatId,
          message_id: message.message_id
        }
      );
    } catch (error) {
      await this.bot.answerCallbackQuery(
        query.id,
        { text: `错误：${error.message}`, show_alert: true }
      );
    }
  }
}
```

### 5. Bull Dashboard 可视化管理（可选）
```javascript
// src/dashboard.js
const { createBullBoard } = require('@bull-board/api');
const { BullAdapter } = require('@bull-board/api/bullAdapter');
const { ExpressAdapter } = require('@bull-board/express');

function setupBullDashboard(app, queues) {
  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath('/admin/queues');
  
  createBullBoard({
    queues: queues.map(q => new BullAdapter(q)),
    serverAdapter
  });
  
  app.use('/admin/queues', serverAdapter.getRouter());
  
  console.log('Bull Dashboard available at /admin/queues');
}

module.exports = setupBullDashboard;
```

### 6. 改进的任务提醒展示
```javascript
// 添加更友好的提醒消息格式

class NotificationFormatter {
  static formatTaskProgress(task, percent) {
    const remainingMinutes = Math.round(
      task.duration * (100 - percent) / 100
    );
    
    const motivationalMessages = {
      25: '🌱 良好的开始！继续保持专注',
      50: '⭐ 已过半程！你做得很好',
      75: '🔥 最后冲刺！马上就要完成了'
    };
    
    const progressBar = this.createVisualProgress(percent);
    
    return `
📊 任务进度更新

${progressBar}
${percent}% 完成

📋 ${task.description}
⏱ 剩余时间：${remainingMinutes}分钟

${motivationalMessages[percent] || '💪 继续加油！'}
    `;
  }
  
  static createVisualProgress(percent) {
    const total = 20;
    const filled = Math.round(total * percent / 100);
    const empty = total - filled;
    
    return `[${='█'.repeat(filled)}${'░'.repeat(empty)}]`;
  }
  
  static formatReservationReminder(reservation) {
    const tips = [
      '💡 深呼吸，准备进入专注状态',
      '💡 关闭不必要的应用和网页',
      '💡 准备好水和必要的物品',
      '💡 找一个安静的环境'
    ];
    
    const randomTip = tips[Math.floor(Math.random() * tips.length)];
    
    return `
⏰ 预约提醒

您预约的任务时间到了！

📋 任务：${reservation.description}
⏱ 计划时长：${reservation.duration}分钟

${randomTip}

准备好了吗？让我们开始吧！
    `;
  }
}
```

### 7. 测试用例更新
```javascript
// tests/reservation.test.js
const ReservationService = require('../src/services/ReservationService');
const QueueService = require('../src/services/QueueService');

describe('ReservationService', () => {
  let reservationService;
  let queueService;
  
  beforeAll(async () => {
    // Mock bot
    const mockBot = {
      sendMessage: jest.fn()
    };
    
    queueService = new QueueService(mockBot);
    reservationService = new ReservationService(queueService);
  });
  
  test('应该能创建预约', async () => {
    const reservation = await reservationService.createReservation(
      123,
      '测试任务',
      30
    );
    
    expect(reservation.reservationId).toBeDefined();
    expect(reservation.executeAt).toBeDefined();
    
    const futureTime = reservation.executeAt.getTime();
    const expectedTime = Date.now() + 15 * 60 * 1000;
    
    // 允许1秒的误差
    expect(Math.abs(futureTime - expectedTime)).toBeLessThan(1000);
  });
  
  test('应该能延迟预约', async () => {
    const reservation = await reservationService.createReservation(
      123,
      '测试任务',
      30
    );
    
    const originalTime = reservation.executeAt;
    
    const delayed = await reservationService.delayReservation(
      reservation.reservationId,
      5
    );
    
    const timeDiff = delayed.executeAt - originalTime;
    expect(timeDiff).toBeCloseTo(5 * 60 * 1000, -3);
  });
  
  test('应该能取消预约', async () => {
    const reservation = await reservationService.createReservation(
      123,
      '测试任务',
      30
    );
    
    const result = await reservationService.cancelReservation(
      reservation.reservationId
    );
    
    expect(result.success).toBe(true);
    
    // 验证预约已被删除
    const reservations = await reservationService.getUserReservations(123);
    expect(reservations.length).toBe(0);
  });
});
```

### 8. Docker Compose 更新（添加Redis）
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
    ports:
      - "6379:6379"  # 开发时可以直接访问

  # 可选：Redis Commander 用于调试
  redis-commander:
    image: rediscommander/redis-commander:latest
    environment:
      - REDIS_HOSTS=local:redis:6379
    ports:
      - "8081:8081"
    depends_on:
      - redis

volumes:
  mongo-data:
  redis-data:
```

### 本周交付物

#### 新增功能
- [x] Bull Queue集成
- [x] Redis配置
- [x] 15分钟预约机制
- [x] 自动提醒系统
- [x] 任务进度提醒(25%, 50%, 75%)
- [x] 预约延迟功能
- [x] 预约取消功能
- [x] 队列可视化管理（可选）

#### 改进功能
- [x] 更友好的提醒消息
- [x] 进度条可视化
- [x] 随机激励消息
- [x] 更精确的定时控制

#### 技术优化
- [x] 异步任务处理
- [x] 失败重试机制
- [x] 队列持久化
- [x] 内存管理优化

### 用户体验提升
- [x] 预约状态查询
- [x] 灵活的延迟选项
- [x] 清晰的时间显示
- [x] 友好的错误提示

### 下周计划
- 实现基础统计功能
- 添加周报生成
- 实现数据导出
- 优化用户引导

---

通过Bull Queue的引入，系统的可靠性和扩展性得到了大幅提升，预约机制的实现也完美体现了"线性时延原理"的核心思想。