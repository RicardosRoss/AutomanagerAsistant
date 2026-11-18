# CLAUDE.md

本文件为 Claude Code (claude.ai/code) 在此代码仓库中工作时提供指导。

## 项目概述

这是一个 **Telegram 自控力助手** 项目 - 基于科学自控力理论的 Telegram 机器人，重点是降低任务启动阻力、维护主链/辅助链并通过 RSIP 培养定式。当前运行入口为 TypeScript 编译产物。

## 架构与理论

### 核心原理（必须理解）

机器人实现三个科学原理：

1. **神圣座位原理**：连续的任务完成创造心理约束力。**关键**：任务失败清空当前主链节点和当前连击，保留历史统计与已获得资产。

2. **线性时延原理**：发出预约信号后，在 15 分钟内启动主任务；先预约是为了降低立即切换阻力。

3. **下必为例原理**：每个决策都成为未来行为的先例（MVP 版本简化为关键词分类）。

### 技术栈

- **后端**：Node.js 18+ 配合 Express
- **数据库**：MongoDB 配合 Mongoose ODM
- **队列系统**：Redis + Bull Queue（定时精度的关键）
- **机器人框架**：node-telegram-bot-api
- **部署**：Docker + PM2

### 项目结构（待实现）

```
src/
├── bot.ts              # Bot主入口
├── config/
│   ├── database.ts     # MongoDB配置
│   └── redis.ts        # Redis配置
├── models/
│   ├── User.ts         # 用户模型
│   ├── TaskChain.ts    # 任务链模型（实现神圣座位原理）
│   ├── Pattern.js      # 简单定式模型
│   └── DailyStats.ts   # 每日统计模型
├── services/
│   ├── TaskService.ts        # 任务管理（核心逻辑）
│   ├── QueueService.ts       # 队列管理
│   ├── CTDPService.ts # 15分钟预约系统
│   └── StatsService.js       # 统计服务
├── handlers/
│   └── taskCommands.ts     # 命令处理器
└── utils/
    └── helpers.js      # 工具函数
```

## 开发命令

当前 TypeScript 入口先编译为 dist；使用 Yarn 执行开发和验证：

```bash
# 开发
yarn dev             # 使用 tsx watch 启动
yarn build && yarn start # 编译并运行生产入口
yarn test            # 运行 TypeScript 测试
yarn test:watch      # 监视模式测试

# Docker 部署
docker-compose build
docker-compose up -d
docker-compose logs -f bot
```

## 核心实现要求

### 关键规则（必须遵守）

1. **定时系统**：绝不使用 `setTimeout()` - 始终使用 Bull Queue 确保持久性和可靠性
2. **失败重置逻辑**：任务失败必须重置 `chain.totalTasks = 0` 和 `chain.completedTasks = 0`
3. **数据库索引**：必须创建以下性能索引：
   ```javascript
   taskChainSchema.index({ userId: 1, status: 1 });
   taskChainSchema.index({ "tasks.taskId": 1 });
   userSchema.index({ userId: 1 });
   ```
4. **技术栈**:基于 es 语法实现和使用 yarn 包管理器

### 数据模型（关键结构）

**任务链模型**：实现神圣座位原理

- `status`：'active' | 'broken'
- `totalTasks`：任何失败时重置为 0
- `tasks[]`：单个任务数组
- 任何任务失败都会破坏整个链条

**用户模型**：追踪统计数据

- `stats.currentStreak`：主链失败时重置为 0
- `stats.longestStreak`：历史记录
- `settings.defaultDuration`：默认 60 分钟，可由用户设置

## 机器人命令

### 基础命令

- `/start` - 初始化用户
- `/task <描述> [时长]` - 创建任务（默认 60 分钟）
- `/reserve` - 建立预约承诺，并在 15 分钟内启动
- `/status` - 显示当前进度
- `/help` - 显示帮助

### 统计功能

- `/stats` - 今日统计
- `/week` - 最近 7 天周报
- `/settings` - 默认时长、时区、过程提醒
- `/violation <行为>` - 主链下必为例判定
- `/patterns ...` - RSIP 定式管理

## 测试策略

需要实现的关键测试用例：

- 任务失败必须重置链条（神圣座位原理）
- 15 分钟预约定时精度
- 统计计算正确性
- 队列系统可靠性

## 开发阶段

项目遵循 12 周计划：

- **第 1-6 周**：MVP（核心任务管理）
- **第 7-10 周**：高级功能（定式、导出）
- **第 11-12 周**：优化和部署

## 环境变量

```env
BOT_TOKEN=your_telegram_bot_token
MONGODB_URI=mongodb://localhost:27017/selfcontrol
REDIS_HOST=localhost
REDIS_PORT=6379
NODE_ENV=development
```

## 重要说明

- 所有用户交互均使用中文
- 错误信息必须用户友好的中文提示
- 神圣座位原理是核心功能 - 实现时需极其谨慎
- 绝不使用原生定时器 - 始终使用 Bull Queue 进行任务调度
- 性能至关重要 - 确保正确的数据库索引
- 对于每个阶段的开发任务,在 test/文件夹内生成对应的阶段测试来证明当前阶段任务已经完成
