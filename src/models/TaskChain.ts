import mongoose, { Schema, type CallbackWithoutResultAndOptionalError } from 'mongoose';
import type {
  ITask,
  ITaskChain,
  ITaskChainMethods,
  ITaskChainModel,
  ITaskChainStats,
  ITaskCreationInput,
  TaskChainDocument
} from '../types/models.js';

const taskSchema = new Schema<ITask>(
  {
    taskId: { type: String, required: true },
    description: { type: String, required: true },
    duration: { type: Number, required: true },
    startTime: { type: Date, required: true },
    endTime: Date,
    status: {
      type: String,
      enum: ['pending', 'running', 'completed', 'failed', 'cancelled'],
      default: 'pending'
    },
    actualDuration: Number,
    isReserved: { type: Boolean, default: false },
    reservedAt: Date,
    reservationId: String,
    metadata: {
      progressReminders: [
        {
          time: Date,
          sent: { type: Boolean, default: false }
        }
      ],
      interruptions: [
        {
          time: Date,
          reason: String
        }
      ],
      notes: String
    }
  },
  {
    _id: false
  }
);

const taskChainSchema = new Schema<ITaskChain, ITaskChainModel, ITaskChainMethods>(
  {
    userId: { type: Number, required: true, index: true },
    chainId: { type: String, required: true, unique: true },
    title: { type: String, default: '专注任务链' },
    description: String,
    tasks: [taskSchema],
    totalTasks: { type: Number, default: 0 },
    completedTasks: { type: Number, default: 0 },
    failedTasks: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ['active', 'broken', 'completed', 'paused'],
      default: 'active'
    },
    totalMinutes: { type: Number, default: 0 },
    averageTaskDuration: { type: Number, default: 0 },
    lastTaskCompletedAt: Date,
    brokenAt: Date,
    brokenReason: String,
    brokenTaskId: String,
    restoredAt: Date,
    restorationCount: { type: Number, default: 0 }
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

taskChainSchema.virtual('currentTask').get(function getCurrentTask(this: TaskChainDocument) {
  return this.tasks.find((task) => task.status === 'running');
});

taskChainSchema.virtual('successRate').get(function getSuccessRate(this: TaskChainDocument) {
  if (this.totalTasks === 0) {
    return 100;
  }

  return Number.parseFloat(((this.completedTasks / this.totalTasks) * 100).toFixed(1));
});

taskChainSchema.virtual('chainStrength').get(function getChainStrength(this: TaskChainDocument) {
  if (this.status === 'broken') {
    return 0;
  }

  return this.completedTasks;
});

taskChainSchema.virtual('isActive').get(function getIsActive(this: TaskChainDocument) {
  return this.status === 'active' && this.tasks.some((task) => task.status === 'running');
});

taskChainSchema.methods.breakChain = function breakChain(
  this: TaskChainDocument,
  reason = '任务失败',
  taskId = null
) {
  this.status = 'broken';
  this.totalTasks = 0;
  this.completedTasks = 0;
  this.failedTasks = 0;
  this.totalMinutes = 0;
  this.averageTaskDuration = 0;
  this.brokenAt = new Date();
  this.brokenReason = reason;
  this.brokenTaskId = taskId;

  console.log(`🔴 链条破坏: ${this.chainId}, 原因: ${reason}, 任务ID: ${taskId}`);

  return this;
};

taskChainSchema.methods.restoreChain = function restoreChain(this: TaskChainDocument) {
  this.status = 'active';
  this.restoredAt = new Date();
  this.restorationCount += 1;
  this.brokenAt = null;
  this.brokenReason = null;
  this.brokenTaskId = null;

  console.log(`🟢 链条恢复: ${this.chainId}, 恢复次数: ${this.restorationCount}`);

  return this;
};

taskChainSchema.methods.addTask = function addTask(this: TaskChainDocument, taskData: ITaskCreationInput): ITask {
  const runningTask = this.tasks.find((task) => task.status === 'running');

  if (runningTask) {
    throw new Error('当前已有任务正在进行中');
  }

  const task: ITask = {
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

taskChainSchema.methods.completeTask = function completeTask(
  this: TaskChainDocument,
  taskId: string,
  success = true,
  failureReason = null
): ITask {
  const task = this.tasks.find((entry) => entry.taskId === taskId);

  if (!task) {
    throw new Error('任务不存在');
  }

  if (task.status !== 'running') {
    throw new Error('任务未在运行状态');
  }

  const endTime = new Date();
  task.status = success ? 'completed' : 'failed';
  task.endTime = endTime;
  task.actualDuration = Math.floor((endTime.getTime() - task.startTime.getTime()) / 60000);

  if (success) {
    this.completedTasks += 1;
    this.totalMinutes += task.actualDuration;
    this.lastTaskCompletedAt = endTime;

    const completedTasksArray = this.tasks.filter((entry) => entry.status === 'completed');
    if (completedTasksArray.length > 0) {
      this.averageTaskDuration = this.totalMinutes / completedTasksArray.length;
    }

    console.log(`✅ 任务完成: ${taskId}, 链条强度: ${this.completedTasks}`);
  } else {
    this.failedTasks += 1;
    this.breakChain(failureReason || '任务未能完成', taskId);
  }

  return task;
};

taskChainSchema.methods.getChainStats = function getChainStats(this: TaskChainDocument): ITaskChainStats {
  const completedTasks = this.tasks.filter((task) => task.status === 'completed');
  const failedTasks = this.tasks.filter((task) => task.status === 'failed');
  const runningTasks = this.tasks.filter((task) => task.status === 'running');

  return {
    total: this.tasks.length,
    completed: completedTasks.length,
    failed: failedTasks.length,
    running: runningTasks.length,
    successRate: this.successRate ?? 100,
    totalMinutes: this.totalMinutes,
    averageDuration: this.averageTaskDuration,
    chainStrength: this.chainStrength ?? 0,
    status: this.status,
    isActive: this.isActive ?? false,
    lastCompleted: this.lastTaskCompletedAt,
    brokenInfo: this.brokenAt
      ? {
          brokenAt: this.brokenAt,
          reason: this.brokenReason,
          taskId: this.brokenTaskId
        }
      : null
  };
};

taskChainSchema.statics.findActiveChain = async function findActiveChain(this: ITaskChainModel, userId: number) {
  return this.findOne({ userId, status: 'active' });
};

taskChainSchema.statics.createChain = async function createChain(
  this: ITaskChainModel,
  userId: number,
  title = '专注任务链'
) {
  const chainId = `chain_${userId}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

  return this.create({
    userId,
    chainId,
    title,
    status: 'active'
  });
};

taskChainSchema.statics.getUserChainHistory = async function getUserChainHistory(
  this: ITaskChainModel,
  userId: number,
  limit = 10
) {
  return this.find({ userId })
    .sort({ updatedAt: -1 })
    .limit(limit)
    .select('chainId title status totalTasks completedTasks totalMinutes createdAt updatedAt')
    .exec();
};

taskChainSchema.statics.getChainLeaderboard = async function getChainLeaderboard(
  this: ITaskChainModel,
  type = 'strength',
  limit = 10
) {
  const sortField =
    type === 'strength'
      ? 'completedTasks'
      : type === 'duration'
        ? 'totalMinutes'
        : type === 'tasks'
          ? 'totalTasks'
          : 'completedTasks';

  return this.find({ status: 'active' })
    .sort({ [sortField]: -1 })
    .limit(limit)
    .populate('userId', 'username firstName lastName')
    .exec();
};

taskChainSchema.index({ userId: 1, status: 1 });
taskChainSchema.index({ 'tasks.taskId': 1 });
taskChainSchema.index({ userId: 1, updatedAt: -1 });
taskChainSchema.index({ status: 1, updatedAt: -1 });
taskChainSchema.index({ completedTasks: -1 });
taskChainSchema.index({ totalMinutes: -1 });

taskChainSchema.pre('save', function preSave(
  this: TaskChainDocument,
  next: CallbackWithoutResultAndOptionalError
) {
  if (this.status === 'broken' && (this.totalTasks !== 0 || this.completedTasks !== 0)) {
    console.warn(`⚠️  神圣座位原理违规检测: 链条 ${this.chainId} 破链状态下计数不为零，自动修正`);
    this.totalTasks = 0;
    this.completedTasks = 0;
    this.failedTasks = 0;
    this.totalMinutes = 0;
    this.averageTaskDuration = 0;
  }

  const actualCompleted = this.tasks.filter((task) => task.status === 'completed').length;

  if (this.status === 'active' && this.completedTasks !== actualCompleted) {
    console.warn(`⚠️  统计不一致检测: 链条 ${this.chainId} 完成任务计数不匹配，自动修正`);
    this.completedTasks = actualCompleted;
  }

  next();
});

taskChainSchema.post('save', (doc: TaskChainDocument) => {
  if (doc.status === 'broken' && doc.brokenAt) {
    console.log(`🔴 神圣座位原理执行: 用户 ${doc.userId} 的链条 ${doc.chainId} 已破坏`);
  }
});

(taskChainSchema.pre as unknown as (event: string, fn: (this: TaskChainDocument) => Promise<void>) => void)(
  'remove',
  async function preRemove(this: TaskChainDocument) {
    console.log(`清理链条: ${this.chainId}`);
  }
);

const TaskChain = mongoose.model<ITaskChain, ITaskChainModel>('TaskChain', taskChainSchema);

export type { ITask, ITaskChain, ITaskChainMethods, ITaskChainModel, TaskChainDocument } from '../types/models.js';
export default TaskChain;
