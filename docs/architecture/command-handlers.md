# 命令处理器

## 概述

命令处理器是项目的用户交互层，负责处理Telegram机器人的各种命令和用户输入。主要包括三个处理器：

1. **CoreCommandHandlers** - 核心命令处理
2. **TaskCommandHandlers** - 任务命令处理
3. **CultivationCommandHandlers** - 修仙命令处理

## 1. CoreCommandHandlers - 核心命令处理

### 功能职责
- 处理基础命令（/start, /help, /status等）
- 处理文本输入
- 管理用户状态
- 提供帮助和设置功能

### 主要方法

#### `handleStartCommand(userId, user)`
处理/start命令

**参数：**
- `userId`: 用户ID
- `user`: Telegram用户对象

**功能：**
- 欢迎消息
- 用户初始化
- 基本使用指南

#### `handleHelpCommand(userId)`
处理/help命令

**参数：**
- `userId`: 用户ID

**功能：**
- 显示帮助信息
- 命令列表
- 使用说明

#### `handleStatusCommand(userId)`
处理/status命令

**参数：**
- `userId`: 用户ID

**功能：**
- 显示当前任务状态
- 用户统计数据
- 修仙状态

#### `handleStatsCommand(userId)`
处理/stats命令

**参数：**
- `userId`: 用户ID

**功能：**
- 显示今日统计数据
- 任务完成情况
- 成功率统计

#### `handleWeekCommand(userId)`
处理/week命令

**参数：**
- `userId`: 用户ID

**功能：**
- 显示本周统计数据
- 趋势分析
- 成就展示

#### `handleSettingsCommand(userId)`
处理/settings命令

**参数：**
- `userId`: 用户ID

**功能：**
- 显示设置选项
- 允许用户修改设置
- 保存用户偏好

#### `handleTextInput(msg)`
处理文本输入

**参数：**
- `msg`: Telegram消息对象

**功能：**
- 解析非命令文本
- 智能建议
- 相关操作提示

### 核心逻辑

#### 命令路由
- 检查消息是否以/开头
- 解析命令名称和参数
- 路由到相应的处理方法

#### 用户状态管理
- 初始化新用户
- 获取用户数据
- 更新用户状态

#### 错误处理
- 捕获和处理错误
- 用户友好的错误提示
- 日志记录

## 2. TaskCommandHandlers - 任务命令处理

### 功能职责
- 处理任务相关命令（/task, /reserve等）
- 管理任务生命周期
- 处理任务回调

### 主要方法

#### `handleTaskCommand(userId, args)`
处理/task命令

**参数：**
- `userId`: 用户ID
- `args`: 命令参数

**功能：**
- 解析任务描述和时长
- 创建新任务
- 显示任务详情

#### `handleReserveCommand(userId, args)`
处理/reserve命令

**参数：**
- `userId`: 用户ID
- `args`: 命令参数

**功能：**
- 解析预约描述和时长
- 创建预约
- 显示预约状态

#### `handleCompleteTaskCallback(userId, data)`
处理任务完成回调

**参数：**
- `userId`: 用户ID
- `data`: 回调数据

**功能：**
- 验证回调数据
- 标记任务完成
- 处理结果

#### `handleFailTaskCallback(userId, data)`
处理任务失败回调

**参数：**
- `userId`: 用户ID
- `data`: 回调数据

**功能：**
- 验证回调数据
- 标记任务失败
- 触发神圣座位原理

#### `handleStartReservedCallback(userId, data)`
处理预约启动回调

**参数：**
- `userId`: 用户ID
- `data`: 回调数据

**功能：**
- 验证回调数据
- 启动预约任务
- 更新预约状态

#### `handleCancelReservationCallback(userId, data)`
处理预约取消回调

**参数：**
- `userId`: 用户ID
- `data`: 回调数据

**功能：**
- 验证回调数据
- 取消预约
- 更新状态

#### `handleDelayReservationCallback(userId, data)`
处理预约延迟回调

**参数：**
- `userId`: 用户ID
- `data`: 回调数据

**功能：**
- 验证回调数据
- 延迟预约
- 更新时间

#### `sendTaskPrompt(userId)`
发送任务提示

**参数：**
- `userId`: 用户ID

**功能：**
- 显示任务创建提示
- 快速任务创建选项

#### `sendReservePrompt(userId)`
发送预约提示

**参数：**
- `userId`: 用户ID

**功能：**
- 显示预约创建提示
- 快速预约选项

### 核心逻辑

#### 任务创建流程
1. 解析用户输入
2. 验证参数
3. 调用TaskService创建任务
4. 显示结果和进度

#### 预约系统
1. 创建预约
2. 设置15分钟延迟
3. 显示预约状态
4. 处理预约回调

#### 回调处理
1. 验证回调数据
2. 解析操作类型
3. 调用相应服务处理
4. 更新UI状态

## 3. CultivationCommandHandlers - 修仙命令处理

### 功能职责
- 处理修仙相关命令（/realm, /divination等）
- 管理修仙系统交互
- 处理修仙回调

### 主要方法

#### `sendRealmStatus(userId, chatId)`
发送境界状态

**参数：**
- `userId`: 用户ID
- `chatId`: 聊天ID

**功能：**
- 显示当前修仙状态
- 境界信息
- 灵力和仙石数量

#### `sendRankings(userId)`
发送排行榜

**参数：**
- `userId`: 用户ID

**功能：**
- 显示修仙排行榜
- 灵力排名
- 成就展示

#### `handleDivinationCommand(userId, args)`
处理/divination命令

**参数：**
- `userId`: 用户ID
- `args`: 命令参数

**功能：**
- 解析投注金额
- 执行占卜
- 显示结果

#### `handleBreakthroughCommand(userId)`
处理/breakthrough命令

**参数：**
- `userId`: 用户ID

**功能：**
- 检查突破条件
- 执行突破
- 显示结果

#### `handleAscensionCommand(userId)`
处理/ascension命令

**参数：**
- `userId`: 用户ID

**功能：**
- 检查飞升条件
- 执行飞升
- 显示结果

#### `handleDivinationHistoryCommand(userId)`
处理/divination_history命令

**参数：**
- `userId`: 用户ID

**功能：**
- 显示占卜历史
- 详细记录
- 统计信息

#### `handleDivinationChartCommand(userId)`
处理/divination_chart命令

**参数：**
- `userId`: 用户ID

**功能：**
- 显示占卜图表
- 数据可视化
- 趋势分析

### 核心逻辑

#### 修仙状态展示
- 获取用户修仙状态
- 格式化显示信息
- 包含境界、灵力、仙石等

#### 占卜系统
- 验证投注金额
- 执行占卜逻辑
- 显示卦象和结果

#### 境界突破
- 检查突破条件
- 随机成功率
- 处理结果和惩罚

#### 飞升系统
- 检查飞升条件
- 执行飞升
- 重置境界

## 处理器依赖关系

```
CoreCommandHandlers
├── 依赖 TaskService（任务管理）
├── 依赖 CultivationService（修仙管理）
└── 依赖 QueueService（队列管理）

TaskCommandHandlers
├── 依赖 TaskService（任务管理）
├── 依赖 CTDPService（CTDP协议）
└── 依赖 QueueService（队列管理）

CultivationCommandHandlers
├── 依赖 CultivationService（修仙管理）
└── 依赖 TaskService（任务关联）
```

## 设计特点

1. **单一职责**：每个处理器负责特定的命令类型
2. **依赖注入**：通过构造函数注入所需服务
3. **错误处理**：完善的错误处理和用户反馈
4. **回调管理**：处理各种回调查询
5. **状态管理**：维护用户交互状态

## 用户体验考虑

1. **即时反馈**：快速响应用户操作
2. **错误提示**：清晰的用户友好的错误信息
3. **进度显示**：显示操作进度和结果
4. **交互设计**：直观的命令和回调系统
5. **帮助系统**：完善的帮助和指南

## 扩展性

1. **新命令添加**：可以轻松添加新的命令处理方法
2. **参数解析**：支持复杂的参数解析
3. **回调扩展**：支持新的回调类型
4. **多语言支持**：可以轻松实现多语言支持

## 测试策略

1. **单元测试**：每个命令处理方法的单元测试
2. **集成测试**：处理器之间的集成测试
3. **回调测试**：回调处理的测试
4. **用户体验测试**：模拟用户交互测试

## 性能优化

1. **异步处理**：使用异步方法处理长时间操作
2. **缓存策略**：缓存频繁访问的数据
3. **批量操作**：支持批量操作优化
4. **响应时间**：优化响应时间提升用户体验

## 安全考虑

1. **输入验证**：验证用户输入防止注入攻击
2. **权限控制**：确保用户只能操作自己的数据
3. **数据保护**：保护用户敏感数据
4. **错误处理**：防止敏感信息泄露

## 文档和注释

1. **方法文档**：每个方法都有清晰的文档
2. **参数说明**：详细的参数说明
3. **返回值**：明确的返回值说明
4. **示例**：使用示例和最佳实践

## 维护和更新

1. **版本兼容**：确保向后兼容
2. **配置管理**：支持配置驱动的行为
3. **日志记录**：完善的日志记录
4. **监控**：监控处理器性能和错误率