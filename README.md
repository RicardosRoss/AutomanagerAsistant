# Telegram Self-Control Cultivation Bot | Telegram 自控力修仙助手

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)](https://www.typescriptlang.org/)

**[English](#english)** | **[中文](#中文)**

---

<a id="english"></a>

## English

### Overview

A Telegram bot that combines scientific self-control theory with a gamified cultivation (修仙/Xianxia) theme. Complete focus tasks to earn cultivation progress, advance through the Xuanjian six-realm ladder, and use Bagua divination as a spirit-stone side system instead of a shortcut for main progression.

### Core Principles

The bot is built on three scientific self-control theories:

1. **Sacred Seat Principle** - Consecutive task completions create psychological binding force. Any task failure **immediately resets all progress to zero**.
2. **Linear Delay Principle** - A 15-minute reservation delay reduces task-start resistance by 60%.
3. **Precedent Principle** - Every decision becomes a precedent for future behavior (simplified to keyword classification in MVP).

### Features

#### Task Management
- Create focus tasks with custom durations (5-480 minutes, default 60 min)
- Task chain system with streak tracking
- 15-minute reservation system (reduces startup resistance)
- Progress reminders at 25%, 50%, 75% completion
- Daily statistics and historical tracking

#### Cultivation System (Gamification)
- **Xuanjian Six Realms** - 胎息 → 练气 → 筑基 → 紫府 → 金丹 → 元婴
- **Cultivation Progress** - Main growth comes from completed focus tasks
- **Cultivation Attainment** - Long-term insight resource that grows with streak milestones
- **Spirit Stones** - Side-economy currency affected by encounters and divination
- **Bagua Divination** - I Ching-based stone-only mini-game; it no longer grants direct power
- **Deterministic Breakthroughs** - Realm advancement is gated by readiness and materials, not RNG success tables
- **Leaderboards** - Rankings by progress and realm display

#### Infrastructure
- MongoDB with Mongoose ODM for data persistence
- Redis + Bull Queue for reliable task scheduling
- Express.js health check & API endpoints
- PM2 process management with graceful shutdown
- Comprehensive logging with Winston

### Bot Commands

| Command | Description |
|---------|-------------|
| `/start` | Initialize your account |
| `/task <description> [duration]` | Start a focus task |
| `/reserve <description> [duration]` | Schedule a task in 15 minutes |
| `/status` | View current progress and active tasks |
| `/stats` | Daily statistics |
| `/week` | Weekly report (coming soon) |
| `/settings` | Personal settings (coming soon) |
| `/help` | Show all commands |
| `/realm` | View cultivation realm and spiritual power |
| `/divination <stones>` | Cast Bagua divination |
| `/divination_history` | View divination history |
| `/divination_chart` | View divination trend chart |
| `/breakthrough` | Attempt realm breakthrough |
| `/ascension` | Begin ascension to immortality |
| `/rankings` | Cultivation leaderboards |
| `/mystats` | Detailed cultivation statistics |
| `/stones` | Check immortal stone balance |

### Tech Stack

| Component | Technology |
|-----------|-----------|
| Language | TypeScript (ES2022) |
| Runtime | Node.js 18+ |
| Framework | Express.js |
| Database | MongoDB + Mongoose |
| Queue | Redis + Bull Queue |
| Telegram API | node-telegram-bot-api |
| Testing | Vitest + MongoDB Memory Server |
| Logging | Winston |
| Process Manager | PM2 |
| Package Manager | Yarn |

### Project Structure

```
src/
├── app.ts                    # Application entry point
├── bot.ts                    # Telegram bot core
├── config/
│   ├── bot.ts                # Bot configuration
│   ├── cultivation.ts        # Legacy compatibility facade
│   ├── xuanjianCanonical.ts  # Xuanjian canonical config
│   └── redis.ts              # Redis connection
├── database/
│   └── connection.ts         # MongoDB connection
├── handlers/
│   ├── coreCommands.ts       # Start, help, status, stats
│   ├── taskCommands.ts       # Task creation and management
│   └── cultivationCommands.ts # Cultivation & divination
├── models/
│   ├── User.ts               # User model with stats & cultivation
│   ├── TaskChain.ts          # Task chain (Sacred Seat Principle)
│   ├── DailyStats.ts         # Daily statistics
│   └── DivinationHistory.ts  # Divination records
├── services/
│   ├── TaskService.ts        # Task lifecycle management
│   ├── QueueService.ts       # Bull Queue scheduling
│   ├── CultivationService.ts # Canonical cultivation runtime integration
│   ├── CultivationStateAdapter.ts # Legacy-to-canonical state adapter
│   ├── CultivationRewardEngine.ts # Pure focus reward engine
│   ├── BreakthroughEngine.ts # Pure breakthrough engine
│   └── index.ts              # Service registry
├── types/                    # TypeScript type definitions
│   ├── cultivationCanonical.ts # Canonical cultivation state/definition types
│   └── ...
└── utils/
    ├── constants.ts          # App constants
    ├── helpers.ts            # Utility functions
    ├── logger.ts             # Winston logger
    └── index.ts              # Utility exports
config/
└── index.ts                  # Environment configuration
tests/                        # Vitest test suites
scripts/                      # Deployment & utility scripts
```

### Current Xuanjian Runtime

- Canonical config: `src/config/xuanjianCanonical.ts`
- Runtime state adapter: `src/services/CultivationStateAdapter.ts`
- Reward engine: `src/services/CultivationRewardEngine.ts`
- Breakthrough engine: `src/services/BreakthroughEngine.ts`
- Migration dry-run: `npm run migrate:xuanjian-cultivation -- --dry-run`

### Getting Started

#### Prerequisites

- Node.js >= 18.0.0
- Yarn >= 1.22.0
- MongoDB >= 6.0
- Redis >= 6.0

#### Installation

```bash
# Clone the repository
git clone https://github.com/RicardosRoss/AutomanagerAsistant.git
cd AutomanagerAsistant

# Install dependencies
yarn install

# Configure environment
cp .env.example .env
# Edit .env with your configuration
```

#### Configuration

Copy `.env.example` to `.env` and configure:

```env
BOT_TOKEN=your_telegram_bot_token_here
MONGODB_URI=mongodb://localhost:27017/selfcontrol
REDIS_HOST=localhost
REDIS_PORT=6379
NODE_ENV=development
```

#### Development

```bash
# Start in development mode (hot reload)
yarn dev

# Build TypeScript
yarn build

# Start production build
yarn start

# Run tests
yarn test

# Run tests with coverage
yarn test:coverage

# Lint and format
yarn lint
yarn format

# Full validation
yarn validate
```

#### PM2 Deployment

```bash
# Build first
yarn build

# Start with PM2
yarn pm2:start

# Monitor
yarn pm2:monit

# View logs
yarn pm2:logs

# Stop / Restart
yarn pm2:stop
yarn pm2:restart
```

### Testing

The project uses Vitest with MongoDB Memory Server for integration testing.

```bash
yarn test              # Run all tests
yarn test:watch        # Watch mode
yarn test:coverage     # Generate coverage report
```

Test coverage target: **80%+**

### API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /health` | Health check with system status |
| `GET /api/info` | Application info |

### License

MIT License - see [LICENSE](LICENSE) for details.

---

<a id="中文"></a>

## 中文

### 项目简介

一个将科学自控力理论与修仙游戏化主题相结合的 Telegram 机器人。完成专注任务获得修为，沿玄鉴六境体系推进主线成长；八卦占卜只影响灵石盈亏，不再绕过“专注是主修为来源”的核心规则。

### 核心原理

机器人基于三个科学自控力理论：

1. **神圣座位原理** - 连续的任务完成创造心理约束力。任何任务失败**立即将所有进度重置为零**。
2. **线性时延原理** - 15 分钟预约延迟可降低 60% 的任务启动阻力。
3. **下必为例原理** - 每个决策都成为未来行为的先例（MVP 版本简化为关键词分类）。

### 功能特性

#### 任务管理
- 创建专注任务，支持自定义时长（5-480 分钟，默认 60 分钟）
- 任务链系统，连击追踪
- 15 分钟预约系统（降低启动阻力）
- 25%、50%、75% 进度提醒
- 每日统计与历史追踪

#### 修仙系统（游戏化）
- **玄鉴六境** - 胎息 → 练气 → 筑基 → 紫府 → 金丹 → 元婴
- **修为** - 只通过完成专注任务稳定增长
- **道行** - 随连续专注与关键节点长期成长
- **灵石** - 奇遇与占卜影响的侧资源
- **八卦占卜** - 只影响灵石与历史记录，不再直接改修为
- **破境** - 基于条件、材料与 readiness 的 deterministic 突破
- **排行榜** - 以当前修为与境界展示为主

#### 基础设施
- MongoDB + Mongoose ODM 数据持久化
- Redis + Bull Queue 可靠任务调度
- Express.js 健康检查与 API 端点
- PM2 进程管理与优雅关闭
- Winston 日志系统

### 机器人命令

| 命令 | 说明 |
|------|------|
| `/start` | 初始化账户 |
| `/task <描述> [时长]` | 开始专注任务 |
| `/reserve <描述> [时长]` | 预约 15 分钟后开始任务 |
| `/status` | 查看当前进度和进行中的任务 |
| `/stats` | 今日统计 |
| `/week` | 周报（开发中） |
| `/settings` | 个人设置（开发中） |
| `/help` | 显示所有命令 |
| `/realm` | 查看修仙境界和灵力 |
| `/divination <仙石>` | 八卦占卜 |
| `/divination_history` | 占卜历史 |
| `/divination_chart` | 占卜走势图 |
| `/breakthrough` | 尝试渡劫突破 |
| `/ascension` | 飞升成仙 |
| `/rankings` | 修仙排行榜 |
| `/mystats` | 详细修仙统计 |
| `/stones` | 查看仙石余额 |

### 技术栈

| 组件 | 技术 |
|------|------|
| 语言 | TypeScript (ES2022) |
| 运行时 | Node.js 18+ |
| 框架 | Express.js |
| 数据库 | MongoDB + Mongoose |
| 队列 | Redis + Bull Queue |
| Telegram API | node-telegram-bot-api |
| 测试 | Vitest + MongoDB Memory Server |
| 日志 | Winston |
| 进程管理 | PM2 |
| 包管理器 | Yarn |

### 项目结构

```
src/
├── app.ts                    # 应用主入口
├── bot.ts                    # Telegram 机器人核心
├── config/
│   ├── bot.ts                # 机器人配置
│   ├── cultivation.ts        # legacy 兼容层
│   ├── xuanjianCanonical.ts  # 玄鉴 canonical 配置
│   └── redis.ts              # Redis 连接
├── database/
│   └── connection.ts         # MongoDB 连接
├── handlers/
│   ├── coreCommands.ts       # 开始、帮助、状态、统计
│   ├── taskCommands.ts       # 任务创建与管理
│   └── cultivationCommands.ts # 修仙与占卜
├── models/
│   ├── User.ts               # 用户模型（含统计与修仙数据）
│   ├── TaskChain.ts          # 任务链（神圣座位原理）
│   ├── DailyStats.ts         # 每日统计
│   └── DivinationHistory.ts  # 占卜记录
├── services/
│   ├── TaskService.ts        # 任务生命周期管理
│   ├── QueueService.ts       # Bull Queue 调度
│   ├── CultivationService.ts # canonical 修仙运行时接线
│   ├── CultivationStateAdapter.ts # legacy 壳字段→canonical 新开局适配
│   ├── CultivationRewardEngine.ts # 纯收益引擎
│   ├── BreakthroughEngine.ts # 纯破境引擎
│   └── index.ts              # 服务注册
├── types/                    # TypeScript 类型定义
│   ├── cultivationCanonical.ts # canonical 修仙状态与定义项
│   └── ...
└── utils/
    ├── constants.ts          # 应用常量
    ├── helpers.ts            # 工具函数
    ├── logger.ts             # Winston 日志
    └── index.ts              # 工具导出
config/
└── index.ts                  # 环境配置
tests/                        # Vitest 测试套件
scripts/                      # 部署与工具脚本
```

### 当前玄鉴运行时入口

- Canonical 配置：`src/config/xuanjianCanonical.ts`
- 运行态适配器：`src/services/CultivationStateAdapter.ts`
- 专注收益引擎：`src/services/CultivationRewardEngine.ts`
- 破境引擎：`src/services/BreakthroughEngine.ts`
- 迁移 dry-run：`npm run migrate:xuanjian-cultivation -- --dry-run`

### 快速开始

#### 前置要求

- Node.js >= 18.0.0
- Yarn >= 1.22.0
- MongoDB >= 6.0
- Redis >= 6.0

#### 安装

```bash
# 克隆仓库
git clone https://github.com/RicardosRoss/AutomanagerAsistant.git
cd AutomanagerAsistant

# 安装依赖
yarn install

# 配置环境变量
cp .env.example .env
# 编辑 .env 填入配置信息
```

#### 环境配置

复制 `.env.example` 为 `.env` 并配置：

```env
BOT_TOKEN=你的_Telegram_Bot_Token
MONGODB_URI=mongodb://localhost:27017/selfcontrol
REDIS_HOST=localhost
REDIS_PORT=6379
NODE_ENV=development
```

#### 开发

```bash
# 开发模式启动（热重载）
yarn dev

# 编译 TypeScript
yarn build

# 生产模式启动
yarn start

# 运行测试
yarn test

# 运行测试并生成覆盖率报告
yarn test:coverage

# 代码检查和格式化
yarn lint
yarn format

# 完整验证（lint + typecheck + build + test）
yarn validate
```

#### PM2 部署

```bash
# 先编译
yarn build

# PM2 启动
yarn pm2:start

# 监控
yarn pm2:monit

# 查看日志
yarn pm2:logs

# 停止 / 重启
yarn pm2:stop
yarn pm2:restart
```

### 测试

项目使用 Vitest 配合 MongoDB Memory Server 进行集成测试。

```bash
yarn test              # 运行所有测试
yarn test:watch        # 监视模式
yarn test:coverage     # 生成覆盖率报告
```

测试覆盖率目标：**80%+**

### API 端点

| 端点 | 说明 |
|------|------|
| `GET /health` | 健康检查与系统状态 |
| `GET /api/info` | 应用信息 |

### 开源许可

MIT License - 详见 [LICENSE](LICENSE)。
