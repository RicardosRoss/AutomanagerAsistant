import mongoose, { Schema, type CallbackWithoutResultAndOptionalError } from 'mongoose';
import { DEFAULT_TASK_DURATION_MINUTES } from '../types/taskDefaults.js';
import type {
  DailyStatsDocument,
  IDailyStats,
  IDailyStatsMethods,
  IDailyStatsModel,
  IDailySummary,
  ITask
} from '../types/models.js';

const dailyStatsSchema = new Schema<IDailyStats, IDailyStatsModel, IDailyStatsMethods>(
  {
    userId: { type: Number, required: true, index: true },
    date: { type: Date, required: true },
    stats: {
      tasksStarted: { type: Number, default: 0 },
      tasksCompleted: { type: Number, default: 0 },
      tasksFailed: { type: Number, default: 0 },
      tasksCancelled: { type: Number, default: 0 },
      totalMinutes: { type: Number, default: 0 },
      averageTaskDuration: { type: Number, default: 0 },
      longestTask: { type: Number, default: 0 },
      shortestTask: { type: Number, default: Number.MAX_VALUE },
      successRate: { type: Number, default: 0 },
      chainsCreated: { type: Number, default: 0 },
      chainsBroken: { type: Number, default: 0 },
      longestChain: { type: Number, default: 0 }
    },
    patterns: [
      {
        patternId: String,
        executedAt: Date,
        success: Boolean
      }
    ],
    metadata: {
      refreshToken: String,
      refreshPending: Boolean,
      refreshTimezone: String,
      firstTaskAt: Date,
      lastTaskAt: Date,
      mostProductiveHour: Number,
      interruptions: { type: Number, default: 0 },
      peakPerformanceHours: [Number],
      lowPerformanceHours: [Number]
    }
  },
  {
    timestamps: true
  }
);

dailyStatsSchema.virtual('efficiencyScore').get(function getEfficiencyScore(this: DailyStatsDocument) {
  if (this.stats.tasksStarted === 0) {
    return 0;
  }

  const completionRate = this.stats.tasksCompleted / this.stats.tasksStarted;
  const averageRate =
    this.stats.averageTaskDuration > 0
      ? Math.min(this.stats.averageTaskDuration / DEFAULT_TASK_DURATION_MINUTES, 2)
      : 1;

  return Math.round(completionRate * averageRate * 100);
});

dailyStatsSchema.virtual('focusLevel').get(function getFocusLevel(this: DailyStatsDocument) {
  const minutes = this.stats.totalMinutes;

  if (minutes < 30) return { level: 1, name: '起步' };
  if (minutes < 90) return { level: 2, name: '进步' };
  if (minutes < 180) return { level: 3, name: '专注' };
  if (minutes < 300) return { level: 4, name: '卓越' };

  return { level: 5, name: '传奇' };
});

dailyStatsSchema.methods.addTaskStats = function addTaskStats(
  this: DailyStatsDocument,
  task: Pick<ITask, 'duration'> & Partial<ITask>,
  success: boolean
) {
  this.stats.tasksStarted += 1;

  if (success) {
    const duration = task.actualDuration || task.duration;
    this.stats.tasksCompleted += 1;
    this.stats.totalMinutes += duration;
    this.stats.longestTask = Math.max(this.stats.longestTask, duration);

    if (this.stats.shortestTask === Number.MAX_VALUE) {
      this.stats.shortestTask = duration;
    } else {
      this.stats.shortestTask = Math.min(this.stats.shortestTask, duration);
    }
  } else {
    this.stats.tasksFailed += 1;
  }

  this.stats.successRate = (this.stats.tasksCompleted / this.stats.tasksStarted) * 100;

  if (this.stats.tasksCompleted > 0) {
    this.stats.averageTaskDuration = this.stats.totalMinutes / this.stats.tasksCompleted;
  }

  const taskTime = task.startTime || new Date();
  if (!this.metadata.firstTaskAt) {
    this.metadata.firstTaskAt = taskTime;
  }
  this.metadata.lastTaskAt = taskTime;

  this.updateProductivityHours(taskTime.getHours(), success);

  return this;
};

dailyStatsSchema.methods.updateProductivityHours = function updateProductivityHours(
  this: DailyStatsDocument,
  hour: number,
  success: boolean
) {
  if (!this.metadata.peakPerformanceHours) {
    this.metadata.peakPerformanceHours = [];
  }

  if (!this.metadata.lowPerformanceHours) {
    this.metadata.lowPerformanceHours = [];
  }

  if (success) {
    if (!this.metadata.peakPerformanceHours.includes(hour)) {
      this.metadata.peakPerformanceHours.push(hour);
    }

    const lowIndex = this.metadata.lowPerformanceHours.indexOf(hour);
    if (lowIndex > -1) {
      this.metadata.lowPerformanceHours.splice(lowIndex, 1);
    }
  } else if (!this.metadata.lowPerformanceHours.includes(hour)) {
    this.metadata.lowPerformanceHours.push(hour);
  }

  if (this.metadata.peakPerformanceHours.length > 0) {
    this.metadata.mostProductiveHour = this.metadata.peakPerformanceHours[0];
  }
};

dailyStatsSchema.methods.addChainStats = function addChainStats(
  this: DailyStatsDocument,
  chainCreated = false,
  chainBroken = false,
  chainLength = 0
) {
  if (chainCreated) {
    this.stats.chainsCreated += 1;
  }

  if (chainBroken) {
    this.stats.chainsBroken += 1;
  }

  if (chainLength > this.stats.longestChain) {
    this.stats.longestChain = chainLength;
  }

  return this;
};

dailyStatsSchema.methods.addPatternExecution = function addPatternExecution(
  this: DailyStatsDocument,
  patternId: string,
  success = true
) {
  this.patterns.push({
    patternId,
    executedAt: new Date(),
    success
  });

  return this;
};

dailyStatsSchema.methods.addInterruption = function addInterruption(this: DailyStatsDocument) {
  this.metadata.interruptions = (this.metadata.interruptions || 0) + 1;
  return this;
};

dailyStatsSchema.methods.getSummary = function getSummary(this: DailyStatsDocument): IDailySummary {
  const dateString = this.date.toISOString().split('T')[0] ?? '';

  return {
    date: dateString,
    tasks: {
      started: this.stats.tasksStarted,
      completed: this.stats.tasksCompleted,
      failed: this.stats.tasksFailed,
      successRate: this.stats.successRate
    },
    time: {
      totalMinutes: this.stats.totalMinutes,
      averageDuration: this.stats.averageTaskDuration,
      longestTask: this.stats.longestTask,
      shortestTask: this.stats.shortestTask === Number.MAX_VALUE ? 0 : this.stats.shortestTask
    },
    chains: {
      created: this.stats.chainsCreated,
      broken: this.stats.chainsBroken,
      longest: this.stats.longestChain
    },
    patterns: {
      executed: this.patterns.length,
      successful: this.patterns.filter((pattern) => pattern.success).length
    },
    performance: {
      efficiencyScore: this.efficiencyScore ?? 0,
      focusLevel: this.focusLevel ?? { level: 1, name: '起步' },
      mostProductiveHour: this.metadata.mostProductiveHour,
      interruptions: this.metadata.interruptions
    }
  };
};

dailyStatsSchema.index({ userId: 1, date: 1 }, { unique: true });
dailyStatsSchema.index({ date: 1 });
dailyStatsSchema.index({ 'stats.successRate': -1 });
dailyStatsSchema.index({ 'stats.totalMinutes': -1 });
dailyStatsSchema.index({ 'stats.tasksCompleted': -1 });

dailyStatsSchema.pre('save', function preSave(
  this: DailyStatsDocument,
  next: CallbackWithoutResultAndOptionalError
) {
  if (this.stats.successRate < 0) this.stats.successRate = 0;
  if (this.stats.successRate > 100) this.stats.successRate = 100;
  if (this.stats.tasksStarted < 0) this.stats.tasksStarted = 0;
  if (this.stats.tasksCompleted < 0) this.stats.tasksCompleted = 0;
  if (this.stats.tasksFailed < 0) this.stats.tasksFailed = 0;
  if (this.stats.totalMinutes < 0) this.stats.totalMinutes = 0;

  if (this.stats.shortestTask === Number.MAX_VALUE && this.stats.tasksCompleted === 0) {
    this.stats.shortestTask = 0;
  }

  next();
});

dailyStatsSchema.post('save', (doc: DailyStatsDocument) => {
  const dateStr = doc.date.toISOString().split('T')[0] ?? '';
  console.log(`📊 每日统计更新: 用户 ${doc.userId}, 日期 ${dateStr}, 完成 ${doc.stats.tasksCompleted} 个任务`);
});

const DailyStats = mongoose.model<IDailyStats, IDailyStatsModel>('DailyStats', dailyStatsSchema);

export type { DailyStatsDocument, IDailyStats, IDailyStatsMethods, IDailyStatsModel } from '../types/models.js';
export default DailyStats;
