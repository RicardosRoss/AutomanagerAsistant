import mongoose from 'mongoose';

// 子任务模式
const taskSchema = new mongoose.Schema({
  taskId: { type: String, required: true },
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
    progressReminders: [{
      time: Date,
      sent: { type: Boolean, default: false }
    }],
    interruptions: [{
      time: Date,
      reason: String
    }],
    notes: String
  }
}, {
  _id: false // 不为子文档创建单独的 _id
});

// 任务链模式 - 实现神圣座位原理
const taskChainSchema = new mongoose.Schema({
  userId: { type: Number, required: true, index: true },
  chainId: { type: String, required: true, unique: true },
  title: { type: String, default: '专注任务链' },
  description: String,
  tasks: [taskSchema],

  // 神圣座位原理核心字段
  totalTasks: { type: Number, default: 0 }, // 链中总任务数
  completedTasks: { type: Number, default: 0 }, // 已完成任务数
  failedTasks: { type: Number, default: 0 }, // 失败任务数
  status: {
    type: String,
    enum: ['active', 'broken', 'completed', 'paused'],
    default: 'active'
  },

  // 统计字段
  totalMinutes: { type: Number, default: 0 }, // 总专注时长
  averageTaskDuration: { type: Number, default: 0 },
  lastTaskCompletedAt: Date,

  // 破链信息（神圣座位原理）
  brokenAt: Date, // 破链时间
  brokenReason: String, // 破链原因
  brokenTaskId: String, // 导致破链的任务ID

  // 链恢复信息
  restoredAt: Date, // 恢复时间
  restorationCount: { type: Number, default: 0 }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// 虚拟字段：当前活跃任务
taskChainSchema.virtual('currentTask').get(function getCurrentTask() {
  return this.tasks.find((task) => task.status === 'running');
});

// 虚拟字段：成功率
taskChainSchema.virtual('successRate').get(function getSuccessRate() {
  if (this.totalTasks === 0) return 100;
  return parseFloat((this.completedTasks / this.totalTasks * 100).toFixed(1));
});

// 虚拟字段：链条强度（基于连续完成的任务数）
taskChainSchema.virtual('chainStrength').get(function getChainStrength() {
  if (this.status === 'broken') return 0;
  return this.completedTasks;
});

// 虚拟字段：是否活跃
taskChainSchema.virtual('isActive').get(function getIsActive() {
  return this.status === 'active' && this.tasks.some((task) => task.status === 'running');
});

// 神圣座位原理核心方法：破坏链条
taskChainSchema.methods.breakChain = function breakChain(reason = '任务失败', taskId = null) {
  // 🔴 神圣座位原理：完全重置
  this.status = 'broken';
  this.totalTasks = 0; // 核心：完全重置
  this.completedTasks = 0; // 核心：完全重置
  this.failedTasks = 0; // 重置失败计数
  this.totalMinutes = 0; // 重置总时长
  this.averageTaskDuration = 0; // 重置平均时长

  // 记录破链信息
  this.brokenAt = new Date();
  this.brokenReason = reason;
  this.brokenTaskId = taskId;

  console.log(`🔴 链条破坏: ${this.chainId}, 原因: ${reason}, 任务ID: ${taskId}`);

  return this;
};

// 链恢复方法
taskChainSchema.methods.restoreChain = function restoreChain() {
  this.status = 'active';
  this.restoredAt = new Date();
  this.restorationCount += 1;

  // 清除破链信息
  this.brokenAt = null;
  this.brokenReason = null;
  this.brokenTaskId = null;

  console.log(`🟢 链条恢复: ${this.chainId}, 恢复次数: ${this.restorationCount}`);

  return this;
};

// 添加任务方法
taskChainSchema.methods.addTask = function addTask(taskData) {
  // 检查是否有正在运行的任务
  const runningTask = this.tasks.find((task) => task.status === 'running');
  if (runningTask) {
    throw new Error('当前已有任务正在进行中');
  }

  const task = {
    taskId: taskData.taskId,
    description: taskData.description,
    duration: taskData.duration,
    startTime: taskData.startTime || new Date(),
    status: 'running',
    isReserved: taskData.isReserved || false,
    reservationId: taskData.reservationId,
    metadata: {
      progressReminders: [],
      interruptions: [],
      notes: taskData.notes || ''
    }
  };

  this.tasks.push(task);
  this.totalTasks += 1;

  return task;
};

// 完成任务方法
taskChainSchema.methods.completeTask = function completeTask(taskId, success = true, failureReason = null) {
  const task = this.tasks.find((t) => t.taskId === taskId);

  if (!task) {
    throw new Error('任务不存在');
  }

  if (task.status !== 'running') {
    throw new Error('任务未在运行状态');
  }

  const endTime = new Date();
  task.status = success ? 'completed' : 'failed';
  task.endTime = endTime;
  task.actualDuration = Math.floor((endTime - task.startTime) / 60000);

  if (success) {
    // 成功完成
    this.completedTasks += 1;
    this.totalMinutes += task.actualDuration;
    this.lastTaskCompletedAt = endTime;

    // 重新计算平均时长
    const completedTasksArray = this.tasks.filter((t) => t.status === 'completed');
    if (completedTasksArray.length > 0) {
      this.averageTaskDuration = this.totalMinutes / completedTasksArray.length;
    }

    console.log(`✅ 任务完成: ${taskId}, 链条强度: ${this.completedTasks}`);
  } else {
    // 🔴 神圣座位原理：失败立即破坏链条
    this.failedTasks += 1;
    this.breakChain(failureReason || '任务未能完成', taskId);
  }

  return task;
};

// 获取链条统计方法
taskChainSchema.methods.getChainStats = function getChainStats() {
  const completedTasks = this.tasks.filter((t) => t.status === 'completed');
  const failedTasks = this.tasks.filter((t) => t.status === 'failed');
  const runningTasks = this.tasks.filter((t) => t.status === 'running');

  return {
    total: this.tasks.length,
    completed: completedTasks.length,
    failed: failedTasks.length,
    running: runningTasks.length,
    successRate: this.successRate,
    totalMinutes: this.totalMinutes,
    averageDuration: this.averageTaskDuration,
    chainStrength: this.chainStrength,
    status: this.status,
    isActive: this.isActive,
    lastCompleted: this.lastTaskCompletedAt,
    brokenInfo: this.brokenAt ? {
      brokenAt: this.brokenAt,
      reason: this.brokenReason,
      taskId: this.brokenTaskId
    } : null
  };
};

// 静态方法：查找用户的活跃链
taskChainSchema.statics.findActiveChain = async function findActiveChain(userId) {
  return this.findOne({ userId, status: 'active' });
};

// 静态方法：创建新链
taskChainSchema.statics.createChain = async function createChain(userId, title = '专注任务链') {
  const chainId = `chain_${userId}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;

  return this.create({
    userId,
    chainId,
    title,
    status: 'active'
  });
};

// 静态方法：获取用户链条历史
taskChainSchema.statics.getUserChainHistory = async function getUserChainHistory(userId, limit = 10) {
  return this.find({ userId })
    .sort({ updatedAt: -1 })
    .limit(limit)
    .select('chainId title status totalTasks completedTasks totalMinutes createdAt updatedAt')
    .exec();
};

// 静态方法：获取链条排行榜
taskChainSchema.statics.getChainLeaderboard = async function getChainLeaderboard(type = 'strength', limit = 10) {
  const sortField = type === 'strength' ? 'completedTasks'
    : type === 'duration' ? 'totalMinutes'
      : type === 'tasks' ? 'totalTasks' : 'completedTasks';

  return this.find({ status: 'active' })
    .sort({ [sortField]: -1 })
    .limit(limit)
    .populate('userId', 'username firstName lastName')
    .exec();
};

// 性能关键索引（基于CLAUDE.md要求）
taskChainSchema.index({ userId: 1, status: 1 });
taskChainSchema.index({ 'tasks.taskId': 1 });
taskChainSchema.index({ userId: 1, updatedAt: -1 });
taskChainSchema.index({ status: 1, updatedAt: -1 });
taskChainSchema.index({ completedTasks: -1 }); // 链条强度排行
taskChainSchema.index({ totalMinutes: -1 }); // 专注时长排行

// 中间件：保存前验证神圣座位原理的一致性
taskChainSchema.pre('save', function preSave(next) {
  // 验证神圣座位原理的核心约束
  if (this.status === 'broken') {
    // 破链状态下，所有计数必须为0
    if (this.totalTasks !== 0 || this.completedTasks !== 0) {
      console.warn(`⚠️  神圣座位原理违规检测: 链条 ${this.chainId} 破链状态下计数不为零，自动修正`);
      this.totalTasks = 0;
      this.completedTasks = 0;
      this.failedTasks = 0;
      this.totalMinutes = 0;
      this.averageTaskDuration = 0;
    }
  }

  // 确保统计数据一致性
  const actualCompleted = this.tasks.filter((t) => t.status === 'completed').length;
  const actualFailed = this.tasks.filter((t) => t.status === 'failed').length;

  if (this.status === 'active' && this.completedTasks !== actualCompleted) {
    console.warn(`⚠️  统计不一致检测: 链条 ${this.chainId} 完成任务计数不匹配，自动修正`);
    this.completedTasks = actualCompleted;
  }

  next();
});

// 中间件：更新后记录日志
taskChainSchema.post('save', (doc) => {
  if (doc.status === 'broken' && doc.brokenAt) {
    console.log(`🔴 神圣座位原理执行: 用户 ${doc.userId} 的链条 ${doc.chainId} 已破坏`);
  }
});

// 中间件：删除前清理
taskChainSchema.pre('remove', async function preRemove() {
  // 可以在这里添加清理逻辑，比如取消相关的队列任务
  console.log(`清理链条: ${this.chainId}`);
});

const TaskChain = mongoose.model('TaskChain', taskChainSchema);

export default TaskChain;
