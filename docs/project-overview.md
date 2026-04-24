# Telegram自控力助手项目概述

## 项目简介

Telegram自控力助手是一个基于科学自控力理论的专注任务管理系统，帮助用户通过Telegram机器人管理任务、追踪专注时间和培养习惯。

## 核心原理

### 1. 神圣座位原理 (Sacred Seat Principle)
- 连续的任务完成创造心理约束力
- 任何任务失败立即将所有进度重置为零
- 实现方式：CTDP协议中的MainChain和神圣座位重置机制

### 2. 线性时延原理 (Linear Time Delay Principle)
- 15分钟预约延迟可降低60%的任务启动阻力
- 实现方式：AuxChain预约系统和15分钟延迟机制

### 3. 下必为例原理 (Precedent Rule Principle)
- 每个决策都成为未来行为的先例
- 实现方式：RSIP定式树和判例规则系统

## 技术栈

- **后端**：Node.js 18+ 配合 Express
- **数据库**：MongoDB 配合 Mongoose ODM
- **队列系统**：Redis + Bull Queue
- **机器人框架**：node-telegram-bot-api
- **部署**：Docker + PM2

## 项目结构

```
src/
├── app.ts              # 应用主入口
├── bot.ts              # Telegram Bot核心
├── config/             # 配置文件
│   ├── bot.ts          # Bot配置
│   ├── cultivation.ts  # 修仙系统配置
│   └── redis.ts       # Redis配置
├── database/           # 数据库连接
│   └── connection.ts   # MongoDB连接
├── handlers/           # 命令处理器
│   ├── cultivationCommands.ts  # 修仙命令处理
│   ├── coreCommands.ts        # 核心命令处理
│   └── taskCommands.ts        # 任务命令处理
├── models/             # 数据模型
│   ├── DailyStats.ts   # 每日统计模型
│   ├── DivinationHistory.ts   # 占卜历史模型
│   ├── TaskChain.ts    # 任务链模型
│   └── User.ts        # 用户模型
├── services/           # 核心服务
│   ├── CTDPService.ts  # CTDP协议实现
│   ├── CultivationService.ts  # 修仙服务
│   ├── QueueService.ts        # 队列服务
│   └── TaskService.ts         # 任务服务
├── utils/              # 工具函数
│   ├── constants.ts    # 常量定义
│   ├── helpers.ts      # 辅助函数
│   └── logger.ts       # 日志工具
└── types/              # 类型定义
    ├── config.ts       # 配置类型
    ├── cultivation.ts  # 修仙类型
    └── index.ts        # 主类型
```

## 核心功能模块

### 1. 任务管理系统
- 创建专注任务
- 任务进度追踪
- 任务完成/失败处理
- 15分钟预约系统

### 2. CTDP协议实现
- 主链管理 (MainChain)
- 辅助链管理 (AuxChain)
- 神圣座位原理
- 任务链重置机制

### 3. 修仙系统
- 灵力修炼
- 境界突破
- 占卜系统
- 飞升机制

### 4. 统计分析
- 每日任务统计
- 周报分析
- 排行榜系统

## 开发阶段

- **第1-6周**：MVP（核心任务管理）
- **第7-10周**：高级功能（定式、导出）
- **第11-12周**：优化和部署

## 环境变量

```env
BOT_TOKEN=your_telegram_bot_token
MONGODB_URI=mongodb://localhost:27017/selfcontrol
REDIS_HOST=localhost
REDIS_PORT=6379
NODE_ENV=development
```

## 机器人命令

### 基础命令
- `/start` - 初始化用户
- `/task <描述> [时长]` - 创建任务
- `/reserve` - 15分钟后安排任务
- `/status` - 显示当前进度
- `/help` - 显示帮助

### 统计功能
- `/stats` - 今日统计
- `/week` - 周报
- `/export [格式]` - 导出数据

### 修仙功能
- `/realm` - 查看修仙境界
- `/divination` - 进行占卜
- `/breakthrough` - 尝试突破
- `/ascension` - 飞升

## 重要特性

- **定时系统**：使用Bull Queue确保任务调度的持久性和可靠性
- **失败重置逻辑**：任务失败立即重置整个任务链
- **数据库索引**：优化查询性能
- **错误处理**：完善的错误处理和用户友好的错误提示
- **多语言支持**：所有用户交互使用中文

## 项目目标

通过科学的方法帮助用户培养专注力和自控力，实现个人成长和目标管理。