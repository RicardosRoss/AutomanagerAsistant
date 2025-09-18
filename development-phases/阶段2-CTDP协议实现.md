# 阶段2: CTDP协议实现开发档案

**时间周期**: 第3-5周  
**开发重点**: 链式时延协议(CTDP)核心功能实现  
**开发人员**: 1人  
**依赖**: 阶段1基础架构完成  
**预期完成度**: 100%

## 开发目标

实现完整的CTDP(Chained Time-Delay Protocol)协议，包括主链管理、辅助链预约机制、任务计时系统、以及基于"神圣座位原理"、"下必为例原理"和"线性时延原理"的自控逻辑。

## 理论基础回顾

### 核心原理
1. **神圣座位原理**: 通过连续记录产生约束力
2. **下必为例原理**: 判例法式的规则管理
3. **线性时延原理**: 通过时间延迟降低启动阻力
4. **非线性价值压缩**: 将未来价值压缩到当前决策点

### 数学模型
- **行为倾向积分**: I = ∫₀^∞ V(τ)W(τ)dτ
- **自控增益**: G = [I'(理性)/I'(冲动)] / [I(理性)/I(冲动)]

## 详细任务清单

### Week 3: 主链(Main Chain)核心功能

#### Day 15-16: 主链服务层实现
- [ ] **主链服务 (services/MainChainService.js)**
  ```javascript
  class MainChainService {
    constructor(logService) {
      this.logService = logService;
    }
    
    async createMainChain(userId, title, description) {
      const chainId = this.generateChainId('main');
      const mainChain = new MainChain({
        userId,
        chainId,
        title,
        description,
        nodes: [],
        totalNodes: 0,
        status: 'active',
        createdAt: new Date(),
        lastActiveAt: new Date()
      });
      
      await mainChain.save();
      await this.logService.log(userId, 'main_chain', 'create', chainId);
      return mainChain;
    }
    
    async startTask(chainId, duration, taskDescription) {
      const chain = await MainChain.findOne({ chainId, status: 'active' });
      if (!chain) throw new Error('链不存在或已失效');
      
      const nodeId = chain.totalNodes + 1;
      const startTime = new Date();
      
      // 创建新的任务节点（状态为进行中）
      const newNode = {
        nodeId,
        startTime,
        duration,
        taskDescription,
        status: 'in_progress', // 新增状态
        violationRules: []
      };
      
      // 更新链状态
      chain.nodes.push(newNode);
      chain.lastActiveAt = new Date();
      await chain.save();
      
      return { chain, nodeId, startTime, duration };
    }
    
    async completeTask(chainId, nodeId, success = true) {
      const chain = await MainChain.findOne({ chainId });
      const node = chain.nodes.find(n => n.nodeId === nodeId);
      
      if (!node) throw new Error('任务节点不存在');
      
      node.endTime = new Date();
      node.status = success ? 'completed' : 'failed';
      
      if (success) {
        chain.totalNodes = Math.max(chain.totalNodes, nodeId);
      } else {
        // 根据"神圣座位原理"，失败时清空所有记录
        chain.nodes = [];
        chain.totalNodes = 0;
        chain.status = 'broken';
      }
      
      await chain.save();
      return chain;
    }
  }
  ```

#### Day 17-18: 任务计时器系统
- [ ] **定时器管理服务 (services/TimerService.js)**
  ```javascript
  const cron = require('node-cron');
  
  class TimerService {
    constructor(bot) {
      this.bot = bot;
      this.activeTimers = new Map(); // chainId -> timer info
    }
    
    startTaskTimer(userId, chainId, nodeId, duration) {
      const timerKey = `${chainId}_${nodeId}`;
      const endTime = new Date(Date.now() + duration * 60000);
      
      // 25%, 50%, 75% 进度提醒
      const quarter = Math.floor(duration / 4);
      const half = Math.floor(duration / 2);
      const threeQuarter = Math.floor(duration * 3 / 4);
      
      // 设置进度提醒
      setTimeout(() => {
        this.sendProgressReminder(userId, chainId, nodeId, '25%');
      }, quarter * 60000);
      
      setTimeout(() => {
        this.sendProgressReminder(userId, chainId, nodeId, '50%');
      }, half * 60000);
      
      setTimeout(() => {
        this.sendProgressReminder(userId, chainId, nodeId, '75%');
      }, threeQuarter * 60000);
      
      // 任务完成提醒
      const completionTimer = setTimeout(() => {
        this.sendTaskCompletionNotification(userId, chainId, nodeId);
      }, duration * 60000);
      
      // 存储定时器信息
      this.activeTimers.set(timerKey, {
        userId,
        chainId,
        nodeId,
        endTime,
        completionTimer,
        status: 'running'
      });
      
      return timerKey;
    }
    
    async sendTaskCompletionNotification(userId, chainId, nodeId) {
      const keyboard = {
        reply_markup: {
          inline_keyboard: [[
            { text: '✅ 完成任务', callback_data: `complete_task_${chainId}_${nodeId}` },
            { text: '❌ 任务失败', callback_data: `fail_task_${chainId}_${nodeId}` },
            { text: '⏰ 延长10分钟', callback_data: `extend_task_${chainId}_${nodeId}_10` }
          ]]
        }
      };
      
      await this.bot.sendMessage(
        userId,
        `🔔 任务时间到！\n链: ${chainId}\n节点: #${nodeId}\n\n请确认任务完成状态:`,
        keyboard
      );
    }
    
    cancelTimer(timerKey) {
      const timer = this.activeTimers.get(timerKey);
      if (timer) {
        clearTimeout(timer.completionTimer);
        this.activeTimers.delete(timerKey);
      }
    }
  }
  ```

#### Day 19-21: 下必为例原理实现
- [ ] **违规处理服务 (services/ViolationService.js)**
  ```javascript
  class ViolationService {
    async reportViolation(chainId, nodeId, behaviorDescription) {
      const chain = await MainChain.findOne({ chainId });
      const node = chain.nodes.find(n => n.nodeId === nodeId);
      
      if (!node) throw new Error('任务节点不存在');
      
      // 检查是否已有此类违规的判例
      const existingRule = node.violationRules.find(rule => 
        this.isSimilarBehavior(rule, behaviorDescription)
      );
      
      if (existingRule) {
        // 已有判例，直接允许
        return {
          action: 'allowed',
          message: '根据已有判例，此行为被允许',
          precedent: existingRule
        };
      }
      
      // 新违规，需要用户选择
      return {
        action: 'decision_required',
        message: '检测到新的行为，请选择处理方式',
        options: [
          {
            text: '🚫 立即终止链条',
            action: 'terminate_chain',
            consequence: '所有记录清零，从#1重新开始'
          },
          {
            text: '✅ 永久允许此行为',
            action: 'allow_permanently',
            consequence: '此行为在未来将被永久允许'
          }
        ]
      };
    }
    
    async handleViolationDecision(chainId, nodeId, behaviorDescription, decision) {
      const chain = await MainChain.findOne({ chainId });
      const node = chain.nodes.find(n => n.nodeId === nodeId);
      
      if (decision === 'terminate_chain') {
        // 清空所有记录
        chain.nodes = [];
        chain.totalNodes = 0;
        chain.status = 'broken';
        await chain.save();
        
        return {
          result: 'chain_terminated',
          message: '链条已终止，所有记录已清零'
        };
      } else if (decision === 'allow_permanently') {
        // 添加永久规则
        node.violationRules.push(behaviorDescription);
        await chain.save();
        
        return {
          result: 'rule_added',
          message: '规则已添加，此行为将被永久允许'
        };
      }
    }
    
    isSimilarBehavior(existingRule, newBehavior) {
      // 简单的相似性检测，可以后续优化为更智能的算法
      const keywords1 = existingRule.toLowerCase().split(' ');
      const keywords2 = newBehavior.toLowerCase().split(' ');
      
      const commonWords = keywords1.filter(word => keywords2.includes(word));
      return commonWords.length >= Math.min(keywords1.length, keywords2.length) * 0.6;
    }
  }
  ```

### Week 4: 辅助链(Auxiliary Chain)功能实现

#### Day 22-23: 辅助链服务层
- [ ] **辅助链服务 (services/AuxiliaryChainService.js)**
  ```javascript
  class AuxiliaryChainService {
    constructor(timerService, logService) {
      this.timerService = timerService;
      this.logService = logService;
    }
    
    async createAuxiliaryChain(userId, title) {
      const chainId = this.generateChainId('aux');
      const auxChain = new AuxiliaryChain({
        userId,
        chainId,
        title,
        nodes: [],
        totalNodes: 0,
        status: 'active',
        createdAt: new Date()
      });
      
      await auxChain.save();
      await this.logService.log(userId, 'auxiliary_chain', 'create', chainId);
      return auxChain;
    }
    
    async makeReservation(chainId, linkedMainChainId = null) {
      const chain = await AuxiliaryChain.findOne({ chainId, status: 'active' });
      if (!chain) throw new Error('辅助链不存在或已失效');
      
      const nodeId = chain.totalNodes + 1;
      const reservationTime = new Date();
      const executeTime = new Date(Date.now() + 15 * 60000); // 15分钟后
      
      const newNode = {
        nodeId,
        reservationTime,
        executeTime,
        status: 'pending',
        linkedMainTask: linkedMainChainId
      };
      
      chain.nodes.push(newNode);
      chain.totalNodes = nodeId;
      await chain.save();
      
      // 设置15分钟后的提醒
      this.scheduleReservationReminder(chain.userId, chainId, nodeId, executeTime);
      
      return { chain, nodeId, executeTime };
    }
    
    scheduleReservationReminder(userId, chainId, nodeId, executeTime) {
      const delay = executeTime.getTime() - Date.now();
      
      setTimeout(async () => {
        const keyboard = {
          reply_markup: {
            inline_keyboard: [[
              { text: '🚀 立即开始主任务', callback_data: `execute_reservation_${chainId}_${nodeId}` },
              { text: '⏰ 延期5分钟', callback_data: `delay_reservation_${chainId}_${nodeId}_5` },
              { text: '❌ 取消预约', callback_data: `cancel_reservation_${chainId}_${nodeId}` }
            ]]
          }
        };
        
        await this.timerService.bot.sendMessage(
          userId,
          `🔔 预约时间到！\n\n根据线性时延原理，现在开始任务的阻力最小。\n\n辅助链: ${chainId}\n节点: #${nodeId}`,
          keyboard
        );
      }, delay);
    }
    
    async executeReservation(chainId, nodeId) {
      const chain = await AuxiliaryChain.findOne({ chainId });
      const node = chain.nodes.find(n => n.nodeId === nodeId);
      
      if (!node || node.status !== 'pending') {
        throw new Error('预约不存在或已执行');
      }
      
      node.status = 'executed';
      chain.totalNodes = Math.max(chain.totalNodes, nodeId);
      await chain.save();
      
      return node;
    }
    
    async failReservation(chainId, nodeId, reason = 'user_cancellation') {
      const chain = await AuxiliaryChain.findOne({ chainId });
      const node = chain.nodes.find(n => n.nodeId === nodeId);
      
      if (!node) throw new Error('预约不存在');
      
      node.status = 'failed';
      
      // 根据下必为例原理，需要处理失败
      if (reason === 'timeout' || reason === 'user_cancellation') {
        // 清空辅助链记录
        chain.nodes = [];
        chain.totalNodes = 0;
        chain.status = 'broken';
      }
      
      await chain.save();
      return chain;
    }
  }
  ```

#### Day 24-25: 主辅链协同机制
- [ ] **链协同服务 (services/ChainCoordinationService.js)**
  ```javascript
  class ChainCoordinationService {
    constructor(mainChainService, auxChainService, timerService) {
      this.mainChainService = mainChainService;
      this.auxChainService = auxChainService;
      this.timerService = timerService;
    }
    
    async executeReservationToMainTask(auxChainId, auxNodeId, mainChainId, duration, taskDescription) {
      try {
        // 1. 标记辅助链预约为已执行
        await this.auxChainService.executeReservation(auxChainId, auxNodeId);
        
        // 2. 启动主链任务
        const taskResult = await this.mainChainService.startTask(
          mainChainId, 
          duration, 
          taskDescription
        );
        
        // 3. 启动任务计时器
        const timerKey = this.timerService.startTaskTimer(
          taskResult.chain.userId,
          mainChainId,
          taskResult.nodeId,
          duration
        );
        
        // 4. 记录协同执行日志
        await this.logService.log(
          taskResult.chain.userId,
          'chain_coordination',
          'aux_to_main_execution',
          { auxChainId, auxNodeId, mainChainId, mainNodeId: taskResult.nodeId }
        );
        
        return {
          success: true,
          auxChain: auxChainId,
          auxNode: auxNodeId,
          mainChain: mainChainId,
          mainNode: taskResult.nodeId,
          timerKey,
          startTime: taskResult.startTime,
          endTime: new Date(taskResult.startTime.getTime() + duration * 60000)
        };
        
      } catch (error) {
        // 如果主链启动失败，回滚辅助链状态
        await this.auxChainService.failReservation(auxChainId, auxNodeId, 'main_task_start_failed');
        throw error;
      }
    }
    
    async getOptimalExecutionTime(userId) {
      // 根据用户历史数据分析最佳执行时间
      const userHistory = await ActivityLog.find({
        userId,
        type: 'main_task',
        action: 'complete'
      }).sort({ timestamp: -1 }).limit(50);
      
      if (userHistory.length === 0) {
        return { recommendedDelay: 15, confidence: 0.5 }; // 默认15分钟
      }
      
      // 分析成功执行的时间模式
      const hourlySuccess = new Array(24).fill(0);
      const hourlyTotal = new Array(24).fill(0);
      
      userHistory.forEach(log => {
        const hour = log.timestamp.getHours();
        hourlyTotal[hour]++;
        if (log.details && log.details.success) {
          hourlySuccess[hour]++;
        }
      });
      
      const currentHour = new Date().getHours();
      const currentSuccessRate = hourlyTotal[currentHour] > 0 
        ? hourlySuccess[currentHour] / hourlyTotal[currentHour] 
        : 0.5;
      
      // 根据成功率调整推荐延时
      let recommendedDelay = 15;
      if (currentSuccessRate > 0.8) {
        recommendedDelay = 10; // 高成功率，缩短延时
      } else if (currentSuccessRate < 0.4) {
        recommendedDelay = 25; // 低成功率，延长延时
      }
      
      return {
        recommendedDelay,
        confidence: Math.min(userHistory.length / 20, 1.0),
        currentSuccessRate
      };
    }
  }
  ```

### Week 5: 用户交互和命令系统

#### Day 26-28: CTDP命令实现
- [ ] **CTDP命令控制器 (controllers/CTDPController.js)**
  ```javascript
  class CTDPController {
    constructor(bot, mainChainService, auxChainService, coordinationService) {
      this.bot = bot;
      this.mainChainService = mainChainService;
      this.auxChainService = auxChainService;
      this.coordinationService = coordinationService;
      
      this.registerCommands();
    }
    
    registerCommands() {
      this.bot.onText(/\/create_main (.+)/, this.handleCreateMainChain.bind(this));
      this.bot.onText(/\/create_aux (.+)/, this.handleCreateAuxChain.bind(this));
      this.bot.onText(/\/start_task (\w+) (\d+) (.+)/, this.handleStartTask.bind(this));
      this.bot.onText(/\/reserve (\w+)/, this.handleMakeReservation.bind(this));
      this.bot.onText(/\/chains/, this.handleListChains.bind(this));
      this.bot.onText(/\/status (\w+)/, this.handleChainStatus.bind(this));
    }
    
    async handleCreateMainChain(msg, match) {
      const chatId = msg.chat.id;
      const userId = msg.from.id;
      const [, title] = match;
      
      try {
        const chain = await this.mainChainService.createMainChain(
          userId,
          title,
          '通过CTDP协议管理的任务链'
        );
        
        await this.bot.sendMessage(
          chatId,
          `✅ 主链创建成功！\n\n` +
          `🔗 链ID: \`${chain.chainId}\`\n` +
          `📋 标题: ${title}\n` +
          `📅 创建时间: ${chain.createdAt.toLocaleString('zh-CN')}\n\n` +
          `使用 \`/start_task ${chain.chainId} <时长分钟> <任务描述>\` 开始第一个任务`,
          { parse_mode: 'Markdown' }
        );
      } catch (error) {
        await this.bot.sendMessage(chatId, `❌ 创建失败: ${error.message}`);
      }
    }
    
    async handleCreateAuxChain(msg, match) {
      const chatId = msg.chat.id;
      const userId = msg.from.id;
      const [, title] = match;
      
      try {
        const chain = await this.auxChainService.createAuxiliaryChain(userId, title);
        
        await this.bot.sendMessage(
          chatId,
          `✅ 辅助链创建成功！\n\n` +
          `🔗 链ID: \`${chain.chainId}\`\n` +
          `📋 标题: ${title}\n\n` +
          `使用 \`/reserve ${chain.chainId}\` 进行15分钟预约`,
          { parse_mode: 'Markdown' }
        );
      } catch (error) {
        await this.bot.sendMessage(chatId, `❌ 创建失败: ${error.message}`);
      }
    }
    
    async handleStartTask(msg, match) {
      const chatId = msg.chat.id;
      const userId = msg.from.id;
      const [, chainId, duration, taskDescription] = match;
      
      try {
        const result = await this.mainChainService.startTask(
          chainId,
          parseInt(duration),
          taskDescription
        );
        
        // 启动计时器
        const timerKey = this.timerService.startTaskTimer(
          userId,
          chainId,
          result.nodeId,
          parseInt(duration)
        );
        
        const endTime = new Date(Date.now() + parseInt(duration) * 60000);
        
        await this.bot.sendMessage(
          chatId,
          `🚀 任务开始！\n\n` +
          `🔗 链: ${chainId}\n` +
          `🎯 节点: #${result.nodeId}\n` +
          `⏱ 时长: ${duration}分钟\n` +
          `📋 描述: ${taskDescription}\n` +
          `🕐 开始时间: ${result.startTime.toLocaleString('zh-CN')}\n` +
          `🕐 结束时间: ${endTime.toLocaleString('zh-CN')}\n\n` +
          `⚡ 根据神圣座位原理，请保持最佳状态直到任务完成！`,
          {
            reply_markup: {
              inline_keyboard: [[
                { text: '❌ 报告违规', callback_data: `report_violation_${chainId}_${result.nodeId}` },
                { text: '🏃‍♂️ 提前完成', callback_data: `early_complete_${chainId}_${result.nodeId}` }
              ]]
            }
          }
        );
      } catch (error) {
        await this.bot.sendMessage(chatId, `❌ 启动失败: ${error.message}`);
      }
    }
    
    async handleMakeReservation(msg, match) {
      const chatId = msg.chat.id;
      const userId = msg.from.id;
      const [, chainId] = match;
      
      try {
        const result = await this.auxChainService.makeReservation(chainId);
        
        await this.bot.sendMessage(
          chatId,
          `⏰ 预约成功！\n\n` +
          `🔗 辅助链: ${chainId}\n` +
          `🎯 节点: #${result.nodeId}\n` +
          `📅 预约时间: ${result.executeTime.toLocaleString('zh-CN')}\n\n` +
          `💡 根据线性时延原理，15分钟后开始任务将大大降低启动阻力！\n` +
          `届时系统将自动提醒您开始主链任务。`,
          {
            reply_markup: {
              inline_keyboard: [[
                { text: '📋 选择主链', callback_data: `select_main_chain_${chainId}_${result.nodeId}` },
                { text: '❌ 取消预约', callback_data: `cancel_reservation_${chainId}_${result.nodeId}` }
              ]]
            }
          }
        );
      } catch (error) {
        await this.bot.sendMessage(chatId, `❌ 预约失败: ${error.message}`);
      }
    }
  }
  ```

#### Day 29-30: 回调处理和状态管理
- [ ] **回调处理器 (controllers/CallbackHandler.js)**
  ```javascript
  class CallbackHandler {
    constructor(bot, services) {
      this.bot = bot;
      this.services = services;
      
      this.registerCallbacks();
    }
    
    registerCallbacks() {
      this.bot.on('callback_query', this.handleCallback.bind(this));
    }
    
    async handleCallback(query) {
      const { data, message, from } = query;
      const chatId = message.chat.id;
      const userId = from.id;
      
      try {
        if (data.startsWith('complete_task_')) {
          await this.handleTaskCompletion(chatId, userId, data);
        } else if (data.startsWith('fail_task_')) {
          await this.handleTaskFailure(chatId, userId, data);
        } else if (data.startsWith('execute_reservation_')) {
          await this.handleReservationExecution(chatId, userId, data);
        } else if (data.startsWith('report_violation_')) {
          await this.handleViolationReport(chatId, userId, data);
        } else if (data.startsWith('violation_decision_')) {
          await this.handleViolationDecision(chatId, userId, data);
        }
        
        // 确认回调处理
        await this.bot.answerCallbackQuery(query.id);
        
      } catch (error) {
        console.error('回调处理错误:', error);
        await this.bot.answerCallbackQuery(query.id, {
          text: `处理失败: ${error.message}`,
          show_alert: true
        });
      }
    }
    
    async handleTaskCompletion(chatId, userId, data) {
      const [, , chainId, nodeId] = data.split('_');
      
      const result = await this.services.mainChain.completeTask(
        chainId, 
        parseInt(nodeId), 
        true
      );
      
      // 取消相关定时器
      const timerKey = `${chainId}_${nodeId}`;
      this.services.timer.cancelTimer(timerKey);
      
      await this.bot.editMessageText(
        `🎉 任务完成！\n\n` +
        `✅ 链: ${chainId} 节点 #${nodeId} 已成功完成\n` +
        `🏆 当前链状态: ${result.totalNodes} 个节点\n` +
        `📈 根据神圣座位原理，您的约束力正在增强！\n\n` +
        `继续使用 \`/start_task ${chainId} <时长> <描述>\` 开始下一个任务`,
        {
          chat_id: chatId,
          message_id: message.message_id,
          parse_mode: 'Markdown'
        }
      );
    }
    
    async handleReservationExecution(chatId, userId, data) {
      const [, , auxChainId, nodeId] = data.split('_');
      
      // 获取用户的主链列表
      const mainChains = await MainChain.find({ 
        userId, 
        status: 'active' 
      }).select('chainId title totalNodes');
      
      if (mainChains.length === 0) {
        await this.bot.editMessageText(
          `❌ 未找到可用的主链\n\n请先创建主链: \`/create_main <标题>\``,
          {
            chat_id: chatId,
            message_id: message.message_id,
            parse_mode: 'Markdown'
          }
        );
        return;
      }
      
      // 生成主链选择键盘
      const keyboard = mainChains.map(chain => [{
        text: `${chain.title} (${chain.totalNodes}节点)`,
        callback_data: `select_main_for_reservation_${auxChainId}_${nodeId}_${chain.chainId}`
      }]);
      
      await this.bot.editMessageText(
        `🚀 预约执行 - 选择主链\n\n` +
        `辅助链: ${auxChainId} 节点 #${nodeId}\n\n` +
        `请选择要启动的主链:`,
        {
          chat_id: chatId,
          message_id: message.message_id,
          reply_markup: { inline_keyboard: keyboard }
        }
      );
    }
  }
  ```

## 测试策略

### 单元测试
```javascript
// tests/unit/MainChainService.test.js
describe('MainChainService', () => {
  describe('神圣座位原理测试', () => {
    test('成功完成任务应增加节点计数', async () => {
      const service = new MainChainService();
      const chain = await service.createMainChain(123, 'Test Chain', 'Description');
      
      await service.startTask(chain.chainId, 60, 'Test Task');
      const result = await service.completeTask(chain.chainId, 1, true);
      
      expect(result.totalNodes).toBe(1);
      expect(result.status).toBe('active');
    });
    
    test('任务失败应清零所有记录', async () => {
      const service = new MainChainService();
      const chain = await service.createMainChain(123, 'Test Chain', 'Description');
      
      // 完成几个任务
      await service.startTask(chain.chainId, 60, 'Task 1');
      await service.completeTask(chain.chainId, 1, true);
      await service.startTask(chain.chainId, 60, 'Task 2');
      await service.completeTask(chain.chainId, 2, true);
      
      // 第三个任务失败
      await service.startTask(chain.chainId, 60, 'Task 3');
      const result = await service.completeTask(chain.chainId, 3, false);
      
      expect(result.totalNodes).toBe(0);
      expect(result.nodes.length).toBe(0);
      expect(result.status).toBe('broken');
    });
  });
  
  describe('下必为例原理测试', () => {
    test('新违规应要求用户决策', async () => {
      const violationService = new ViolationService();
      const result = await violationService.reportViolation(
        'chain_123', 
        1, 
        '查看手机消息'
      );
      
      expect(result.action).toBe('decision_required');
      expect(result.options).toHaveLength(2);
    });
    
    test('已有判例应自动允许', async () => {
      const violationService = new ViolationService();
      
      // 先建立判例
      await violationService.handleViolationDecision(
        'chain_123', 
        1, 
        '查看手机消息', 
        'allow_permanently'
      );
      
      // 再次报告相似违规
      const result = await violationService.reportViolation(
        'chain_123', 
        2, 
        '查看手机短信'
      );
      
      expect(result.action).toBe('allowed');
    });
  });
});
```

### 集成测试
```javascript
// tests/integration/ctdp-flow.test.js
describe('CTDP完整流程测试', () => {
  test('预约到任务执行的完整流程', async () => {
    // 1. 创建辅助链和主链
    const auxChain = await auxService.createAuxiliaryChain(123, 'Test Aux');
    const mainChain = await mainService.createMainChain(123, 'Test Main', 'Desc');
    
    // 2. 创建预约
    const reservation = await auxService.makeReservation(auxChain.chainId);
    expect(reservation.nodeId).toBe(1);
    
    // 3. 执行预约启动主任务
    const execution = await coordinationService.executeReservationToMainTask(
      auxChain.chainId,
      1,
      mainChain.chainId,
      60,
      'Test Task'
    );
    
    expect(execution.success).toBe(true);
    expect(execution.timerKey).toBeDefined();
    
    // 4. 验证主链状态
    const updatedChain = await MainChain.findOne({ chainId: mainChain.chainId });
    expect(updatedChain.nodes).toHaveLength(1);
    expect(updatedChain.nodes[0].status).toBe('in_progress');
  });
});
```

## 性能指标

### 响应时间要求
- 任务启动: < 200ms
- 预约创建: < 150ms
- 状态查询: < 100ms
- 定时器触发: < 50ms

### 并发处理能力
- 同时支持100个活跃任务
- 定时器精度误差 < 5秒
- 数据库并发写入支持

## 风险管控

### 定时器风险
1. **内存泄漏**: 未正确清理的定时器
   - 解决方案: 实现定时器生命周期管理
2. **时间漂移**: 长时间运行的定时器精度降低
   - 解决方案: 定期校准机制

### 数据一致性风险
1. **并发修改**: 同一链的并发操作
   - 解决方案: 数据库事务和乐观锁
2. **状态不同步**: 定时器与数据库状态不一致
   - 解决方案: 状态检查和恢复机制

## 交付物清单

### 功能模块
- [ ] MainChainService (主链管理)
- [ ] AuxiliaryChainService (辅助链管理)  
- [ ] TimerService (定时器管理)
- [ ] ViolationService (违规处理)
- [ ] ChainCoordinationService (链协同)
- [ ] CTDPController (命令控制器)
- [ ] CallbackHandler (回调处理器)

### 测试交付物
- [ ] 单元测试 (覆盖率 ≥ 85%)
- [ ] 集成测试 (核心流程覆盖)
- [ ] 性能测试报告
- [ ] 定时器精度测试

### 文档交付物  
- [ ] CTDP协议实现文档
- [ ] API接口文档更新
- [ ] 用户命令使用指南
- [ ] 故障排查手册

## 验收标准

### 功能验收
- [ ] 主链任务的创建、执行、完成流程正常
- [ ] 辅助链预约机制工作正常  
- [ ] 15分钟定时器准确触发
- [ ] 违规处理的判例法逻辑正确
- [ ] 任务失败时的清零机制正确

### 性能验收
- [ ] 所有接口响应时间符合要求
- [ ] 定时器精度误差在接受范围内
- [ ] 并发场景下系统稳定运行

### 用户体验验收
- [ ] 命令交互简洁明了
- [ ] 错误提示清晰有用
- [ ] 按钮交互响应及时

---

**重点提醒**: CTDP协议是整个系统的核心，务必严格按照理论原理实现，确保每个环节都符合数学模型的要求。特别注意"神圣座位原理"的一损俱损特性和"下必为例原理"的判例法逻辑。