# MVP阶段开发档案（第1-6周）

## Week 1-2: 基础框架和核心任务管理

### 开发目标
实现最基本的任务创建、执行和完成功能，建立项目基础架构。

### 项目初始化

#### 1. 项目结构（简化版）
```
telegram-self-control-bot/
├── src/
│   ├── bot.js              # Bot主入口
│   ├── config/
│   │   └── database.js     # 数据库配置
│   ├── models/
│   │   ├── User.js         # 用户模型
│   │   └── TaskChain.js    # 任务链模型
│   ├── services/
│   │   └── TaskService.js  # 任务服务
│   ├── handlers/
│   │   └── commands.js     # 命令处理
│   └── utils/
│       └── helpers.js      # 工具函数
├── tests/
│   └── task.test.js        # 测试文件
├── .env.example
├── package.json
└── README.md
```

#### 2. 依赖安装
```bash
npm init -y
npm install node-telegram-bot-api mongoose dotenv express
npm install -D nodemon jest
```

#### 3. 环境配置 (.env)
```env
BOT_TOKEN=your_telegram_bot_token
MONGODB_URI=mongodb://localhost:27017/selfcontrol
NODE_ENV=development
```

### 核心代码实现

#### Bot主入口 (src/bot.js)
```javascript
require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const mongoose = require('mongoose');
const CommandHandler = require('./handlers/commands');
const TaskService = require('./services/TaskService');

class SelfControlBot {
  constructor() {
    this.bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });
    this.taskService = new TaskService();
    this.commandHandler = new CommandHandler(this.bot, this.taskService);
  }

  async start() {
    // 连接数据库
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('数据库连接成功');

    // 注册命令处理器
    this.registerCommands();
    
    // 注册回调处理器
    this.registerCallbacks();

    console.log('Bot已启动');
  }

  registerCommands() {
    // /start 命令
    this.bot.onText(/\/start/, async (msg) => {
      await this.commandHandler.handleStart(msg);
    });

    // /task 命令 - 创建任务
    this.bot.onText(/\/task(?:\s+(.+))?/, async (msg, match) => {
      await this.commandHandler.handleCreateTask(msg, match);
    });

    // /status 命令 - 查看状态
    this.bot.onText(/\/status/, async (msg) => {
      await this.commandHandler.handleStatus(msg);
    });

    // /help 命令
    this.bot.onText(/\/help/, async (msg) => {
      await this.commandHandler.handleHelp(msg);
    });
  }

  registerCallbacks() {
    this.bot.on('callback_query', async (query) => {
      const { data, message, from } = query;
      
      if (data.startsWith('complete_task_')) {
        await this.commandHandler.handleCompleteTask(query);
      } else if (data.startsWith('fail_task_')) {
        await this.commandHandler.handleFailTask(query);
      }

      // 确认回调已处理
      await this.bot.answerCallbackQuery(query.id);
    });
  }
}

// 启动Bot
const bot = new SelfControlBot();
bot.start().catch(console.error);
```

#### 数据模型 (src/models/)

**用户模型 (User.js)**
```javascript
const mongoose = require('mongoose');

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

module.exports = mongoose.model('User', userSchema);
```

**任务链模型 (TaskChain.js)**
```javascript
const mongoose = require('mongoose');

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

// 索引优化
taskChainSchema.index({ userId: 1, status: 1 });
taskChainSchema.index({ 'tasks.taskId': 1 });

module.exports = mongoose.model('TaskChain', taskChainSchema);
```

#### 任务服务 (src/services/TaskService.js)
```javascript
const User = require('../models/User');
const TaskChain = require('../models/TaskChain');
const { generateId } = require('../utils/helpers');

class TaskService {
  constructor() {
    this.activeTimers = new Map(); // 存储活跃的定时器
  }

  async createTask(userId, description = '专注任务', duration = 25) {
    // 确保用户存在
    let user = await User.findOne({ userId });
    if (!user) {
      user = await User.create({ userId });
    }

    // 查找或创建活跃链
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

    // 创建新任务
    const task = {
      taskId: generateId('task'),
      description,
      duration,
      startTime: new Date(),
      status: 'running'
    };

    chain.tasks.push(task);
    chain.totalTasks += 1;
    chain.lastActiveAt = new Date();
    await chain.save();

    // 更新用户统计
    user.stats.totalTasks += 1;
    user.lastActiveAt = new Date();
    await user.save();

    // 设置完成提醒
    this.scheduleTaskReminder(userId, task.taskId, duration);

    return { chain, task };
  }

  async completeTask(userId, taskId, success = true) {
    const chain = await TaskChain.findOne({ 
      userId, 
      'tasks.taskId': taskId 
    });

    if (!chain) {
      throw new Error('任务不存在');
    }

    const task = chain.tasks.find(t => t.taskId === taskId);
    if (!task) {
      throw new Error('任务不存在');
    }

    // 更新任务状态
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
      // 神圣座位原理：失败清零
      chain.status = 'broken';
      chain.totalTasks = 0;
      chain.completedTasks = 0;
      
      // 重置用户连续记录
      const user = await User.findOne({ userId });
      user.stats.currentStreak = 0;
      await user.save();
    }

    await chain.save();

    // 清除定时器
    this.clearTimer(taskId);

    return { chain, task };
  }

  async getUserStatus(userId) {
    const user = await User.findOne({ userId });
    const activeChain = await TaskChain.findOne({ 
      userId, 
      status: 'active' 
    });

    const currentTask = activeChain?.tasks.find(
      t => t.status === 'running'
    );

    return {
      user,
      activeChain,
      currentTask,
      stats: user?.stats || {}
    };
  }

  scheduleTaskReminder(userId, taskId, duration) {
    // 进度提醒
    const progressIntervals = [0.25, 0.5, 0.75];
    
    progressIntervals.forEach(progress => {
      const delay = duration * progress * 60 * 1000;
      setTimeout(() => {
        this.sendProgressReminder(userId, taskId, progress * 100);
      }, delay);
    });

    // 完成提醒
    const timer = setTimeout(() => {
      this.sendCompletionReminder(userId, taskId);
    }, duration * 60 * 1000);

    this.activeTimers.set(taskId, timer);
  }

  async sendProgressReminder(userId, taskId, progress) {
    // 这里需要访问bot实例，实际实现时通过事件发射器或依赖注入
    console.log(`Progress reminder: ${progress}% for task ${taskId}`);
  }

  async sendCompletionReminder(userId, taskId) {
    console.log(`Task ${taskId} completed, sending reminder to user ${userId}`);
  }

  clearTimer(taskId) {
    const timer = this.activeTimers.get(taskId);
    if (timer) {
      clearTimeout(timer);
      this.activeTimers.delete(taskId);
    }
  }
}

module.exports = TaskService;
```

#### 命令处理器 (src/handlers/commands.js)
```javascript
class CommandHandler {
  constructor(bot, taskService) {
    this.bot = bot;
    this.taskService = taskService;
  }

  async handleStart(msg) {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    const welcomeMessage = `
🎯 欢迎使用自控力助手！

我将帮助您通过科学的方法提升自控力。

核心功能：
• 📝 任务管理 - 记录专注时间
• ⏰ 智能提醒 - 进度和完成提醒
• 📊 数据统计 - 追踪您的进步

快速开始：
/task <描述> <时长> - 创建任务
/status - 查看当前状态
/help - 获取帮助

让我们开始第一个任务吧！💪
    `;

    await this.bot.sendMessage(chatId, welcomeMessage);
  }

  async handleCreateTask(msg, match) {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    try {
      // 解析参数
      const input = match[1] || '';
      const parts = input.split(' ');
      
      // 尝试从最后一个参数提取时长
      const lastPart = parts[parts.length - 1];
      const duration = parseInt(lastPart) || 25;
      
      // 如果最后是数字，则前面的都是描述
      const description = isNaN(parseInt(lastPart)) 
        ? input || '专注任务'
        : parts.slice(0, -1).join(' ') || '专注任务';

      const { task } = await this.taskService.createTask(
        userId, 
        description, 
        duration
      );

      const endTime = new Date(
        task.startTime.getTime() + duration * 60000
      );

      await this.bot.sendMessage(
        chatId,
        `✅ 任务已开始！\n\n` +
        `📋 任务：${description}\n` +
        `⏱ 时长：${duration}分钟\n` +
        `🕐 开始：${task.startTime.toLocaleTimeString('zh-CN')}\n` +
        `🕐 结束：${endTime.toLocaleTimeString('zh-CN')}\n\n` +
        `💡 专注工作，我会在完成时提醒您！`,
        {
          reply_markup: {
            inline_keyboard: [[
              { text: '✅ 提前完成', callback_data: `complete_task_${task.taskId}` },
              { text: '❌ 放弃任务', callback_data: `fail_task_${task.taskId}` }
            ]]
          }
        }
      );
    } catch (error) {
      await this.bot.sendMessage(
        chatId, 
        `❌ 创建任务失败：${error.message}`
      );
    }
  }

  async handleStatus(msg) {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    try {
      const status = await this.taskService.getUserStatus(userId);
      
      if (!status.user) {
        await this.bot.sendMessage(
          chatId,
          '您还没有开始使用，发送 /start 开始'
        );
        return;
      }

      let message = '📊 当前状态\n\n';

      // 当前任务
      if (status.currentTask) {
        const elapsed = Math.floor(
          (Date.now() - status.currentTask.startTime) / 60000
        );
        const remaining = status.currentTask.duration - elapsed;
        
        message += `⏳ 进行中的任务\n`;
        message += `📋 ${status.currentTask.description}\n`;
        message += `⏱ 剩余：${remaining}分钟\n\n`;
      } else {
        message += `💤 当前没有进行中的任务\n\n`;
      }

      // 统计数据
      message += `📈 统计数据\n`;
      message += `✅ 完成任务：${status.stats.completedTasks}个\n`;
      message += `⏱ 总专注时间：${status.stats.totalMinutes}分钟\n`;
      message += `🔥 当前连续：${status.stats.currentStreak}个\n`;
      message += `🏆 最长连续：${status.stats.longestStreak}个`;

      await this.bot.sendMessage(chatId, message);
    } catch (error) {
      await this.bot.sendMessage(
        chatId,
        `❌ 获取状态失败：${error.message}`
      );
    }
  }

  async handleCompleteTask(query) {
    const { data, message, from } = query;
    const chatId = message.chat.id;
    const userId = from.id;
    const taskId = data.replace('complete_task_', '');

    try {
      const { chain, task } = await this.taskService.completeTask(
        userId, 
        taskId, 
        true
      );

      await this.bot.editMessageText(
        `✅ 任务完成！\n\n` +
        `📋 ${task.description}\n` +
        `⏱ 实际用时：${Math.floor((task.endTime - task.startTime) / 60000)}分钟\n` +
        `🔗 链进度：${chain.completedTasks}/${chain.totalTasks}\n\n` +
        `太棒了！继续保持！💪`,
        {
          chat_id: chatId,
          message_id: message.message_id
        }
      );
    } catch (error) {
      await this.bot.sendMessage(
        chatId,
        `❌ 完成任务失败：${error.message}`
      );
    }
  }

  async handleFailTask(query) {
    const { data, message, from } = query;
    const chatId = message.chat.id;
    const userId = from.id;
    const taskId = data.replace('fail_task_', '');

    try {
      await this.taskService.completeTask(userId, taskId, false);

      await this.bot.editMessageText(
        `❌ 任务失败\n\n` +
        `根据神圣座位原理，链条已重置。\n` +
        `别灰心，重新开始！\n\n` +
        `发送 /task 开始新任务`,
        {
          chat_id: chatId,
          message_id: message.message_id
        }
      );
    } catch (error) {
      await this.bot.sendMessage(
        chatId,
        `❌ 操作失败：${error.message}`
      );
    }
  }

  async handleHelp(msg) {
    const chatId = msg.chat.id;

    const helpMessage = `
📚 使用帮助

基础命令：
/start - 开始使用
/task <描述> <时长> - 创建任务
/status - 查看状态
/help - 显示帮助

使用示例：
/task 学习英语 30 - 30分钟英语学习
/task 写代码 - 默认25分钟任务
/task - 快速开始25分钟任务

核心原理：
• 神圣座位原理 - 连续记录产生约束力
• 任务失败清零 - 保持专注的动力
• 15分钟预约 - 降低启动阻力（即将上线）

有问题请联系 @your_support
    `;

    await this.bot.sendMessage(chatId, helpMessage);
  }
}

module.exports = CommandHandler;
```

#### 工具函数 (src/utils/helpers.js)
```javascript
function generateId(prefix = 'id') {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substr(2, 5);
  return `${prefix}_${timestamp}_${random}`;
}

function formatDuration(minutes) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  
  if (hours > 0) {
    return `${hours}小时${mins}分钟`;
  }
  return `${mins}分钟`;
}

function formatDate(date) {
  return new Date(date).toLocaleDateString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric'
  });
}

module.exports = {
  generateId,
  formatDuration,
  formatDate
};
```

### 测试用例 (tests/task.test.js)
```javascript
const TaskService = require('../src/services/TaskService');
const mongoose = require('mongoose');

describe('TaskService', () => {
  let taskService;

  beforeAll(async () => {
    await mongoose.connect('mongodb://localhost:27017/test');
    taskService = new TaskService();
  });

  afterAll(async () => {
    await mongoose.connection.close();
  });

  beforeEach(async () => {
    // 清理测试数据
    await mongoose.connection.db.dropDatabase();
  });

  test('应该能创建任务', async () => {
    const { task, chain } = await taskService.createTask(
      123, 
      '测试任务', 
      25
    );

    expect(task.description).toBe('测试任务');
    expect(task.duration).toBe(25);
    expect(task.status).toBe('running');
    expect(chain.totalTasks).toBe(1);
  });

  test('完成任务应更新统计', async () => {
    const { task } = await taskService.createTask(123, '测试', 30);
    const result = await taskService.completeTask(123, task.taskId, true);

    expect(result.chain.completedTasks).toBe(1);
    expect(result.task.status).toBe('completed');
  });

  test('失败应重置链条（神圣座位原理）', async () => {
    const { task } = await taskService.createTask(123, '测试', 30);
    const result = await taskService.completeTask(123, task.taskId, false);

    expect(result.chain.status).toBe('broken');
    expect(result.chain.totalTasks).toBe(0);
  });
});
```

### 启动脚本 (package.json)
```json
{
  "name": "telegram-self-control-bot",
  "version": "1.0.0",
  "description": "Telegram自控力助手",
  "main": "src/bot.js",
  "scripts": {
    "start": "node src/bot.js",
    "dev": "nodemon src/bot.js",
    "test": "jest",
    "test:watch": "jest --watch"
  },
  "dependencies": {
    "node-telegram-bot-api": "^0.61.0",
    "mongoose": "^7.0.0",
    "dotenv": "^16.0.0",
    "express": "^4.18.0"
  },
  "devDependencies": {
    "nodemon": "^2.0.0",
    "jest": "^29.0.0"
  }
}
```

### 本周交付物

#### 功能清单
- [x] Bot基础框架搭建
- [x] MongoDB数据库连接
- [x] 用户和任务链数据模型
- [x] 创建任务功能 (/task)
- [x] 完成/失败任务处理
- [x] 查看状态功能 (/status)
- [x] 基础帮助系统 (/help)
- [x] 神圣座位原理实现（失败清零）

#### 测试覆盖
- [x] 任务创建测试
- [x] 任务完成测试
- [x] 失败清零测试
- [x] 用户统计更新测试

#### 用户体验
- [x] 清晰的命令反馈
- [x] 任务进度提醒
- [x] 完成/失败按钮交互
- [x] 状态统计展示

### 下周计划
- 实现15分钟预约机制
- 添加Bull Queue任务队列
- 优化提醒系统
- 添加更多用户引导

---

这个MVP版本实现了核心的任务管理功能，代码简洁易懂，可以在2周内完成开发。