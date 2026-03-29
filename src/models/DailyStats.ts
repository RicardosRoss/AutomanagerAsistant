import mongoose, { Schema, type CallbackWithoutResultAndOptionalError } from 'mongoose';
import type {
  DailyStatsDocument,
  IDailyStats,
  IDailyStatsMethods,
  IDailyStatsModel,
  IDailySummary,
  ITask
} from '../types/models.js';

interface IWeeklyReportDay {
  date: Date;
  completed: number;
  minutes: number;
  successRate: number;
}

interface IWeeklyReportSummary {
  totalTasks: number;
  totalCompletedTasks: number;
  totalMinutes: number;
  averageSuccessRate: number;
  bestDay: IWeeklyReportDay | null;
  worstDay: IWeeklyReportDay | null;
  dailyStats: IWeeklyReportDay[];
  trends: {
    improving: boolean;
    declining: boolean;
    stable: boolean;
  };
}

interface IPlatformStats {
  totalUsers: number;
  totalTasks: number;
  totalCompletedTasks: number;
  totalMinutes: number;
  totalChains: number;
  totalBrokenChains: number;
  averageSuccessRate: number;
}

const dailyStatsSchema = new Schema<IDailyStats, IDailyStatsModel, IDailyStatsMethods>(
  {
    userId: { type: Number, required: true, index: true },
    date: { type: Date, required: true },
    stats: {
      tasksStarted: { type: Number, default: 0 },
      tasksCompleted: { type: Number, default: 0 },
      tasksFailed: { type: Number, default: 0 },
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
    this.stats.averageTaskDuration > 0 ? Math.min(this.stats.averageTaskDuration / 25, 2) : 1;

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

dailyStatsSchema.statics.findOrCreateDaily = async function findOrCreateDaily(
  this: IDailyStatsModel,
  userId: number,
  date = new Date()
) {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);

  let dailyStats = await this.findOne({
    userId,
    date: startOfDay
  });

  if (!dailyStats) {
    dailyStats = await this.create({
      userId,
      date: startOfDay,
      stats: {
        tasksStarted: 0,
        tasksCompleted: 0,
        tasksFailed: 0,
        totalMinutes: 0,
        averageTaskDuration: 0,
        longestTask: 0,
        shortestTask: Number.MAX_VALUE,
        successRate: 0,
        chainsCreated: 0,
        chainsBroken: 0,
        longestChain: 0
      },
      patterns: [],
      metadata: {
        interruptions: 0,
        peakPerformanceHours: [],
        lowPerformanceHours: []
      }
    });
  }

  return dailyStats;
};

dailyStatsSchema.statics.getUserPeriodStats = async function getUserPeriodStats(
  this: IDailyStatsModel,
  userId: number,
  days = 7
) {
  const endDate = new Date();
  const startDate = new Date();

  startDate.setDate(startDate.getDate() - days);
  startDate.setHours(0, 0, 0, 0);
  endDate.setHours(23, 59, 59, 999);

  return this.find({
    userId,
    date: { $gte: startDate, $lte: endDate }
  }).sort({ date: -1 });
};

dailyStatsSchema.statics.generateWeeklyReport = async function generateWeeklyReport(
  this: IDailyStatsModel,
  userId: number
): Promise<IWeeklyReportSummary> {
  const weeklyStats = await this.getUserPeriodStats(userId, 7);

  const summary: IWeeklyReportSummary = {
    totalTasks: 0,
    totalCompletedTasks: 0,
    totalMinutes: 0,
    averageSuccessRate: 0,
    bestDay: null,
    worstDay: null,
    dailyStats: [],
    trends: {
      improving: false,
      declining: false,
      stable: true
    }
  };

  if (weeklyStats.length === 0) {
    return summary;
  }

  weeklyStats.forEach((dayStats) => {
    summary.totalTasks += dayStats.stats.tasksStarted;
    summary.totalCompletedTasks += dayStats.stats.tasksCompleted;
    summary.totalMinutes += dayStats.stats.totalMinutes;
    summary.dailyStats.push({
      date: dayStats.date,
      completed: dayStats.stats.tasksCompleted,
      minutes: dayStats.stats.totalMinutes,
      successRate: dayStats.stats.successRate
    });
  });

  summary.averageSuccessRate =
    summary.totalTasks > 0 ? (summary.totalCompletedTasks / summary.totalTasks) * 100 : 0;

  let bestScore = -1;
  let worstScore = Number.POSITIVE_INFINITY;

  weeklyStats.forEach((dayStats) => {
    const score = dayStats.stats.tasksCompleted + dayStats.stats.totalMinutes / 60;

    if (score > bestScore) {
      bestScore = score;
      summary.bestDay = {
        date: dayStats.date,
        completed: dayStats.stats.tasksCompleted,
        minutes: dayStats.stats.totalMinutes,
        successRate: dayStats.stats.successRate
      };
    }

    if (score < worstScore && score > 0) {
      worstScore = score;
      summary.worstDay = {
        date: dayStats.date,
        completed: dayStats.stats.tasksCompleted,
        minutes: dayStats.stats.totalMinutes,
        successRate: dayStats.stats.successRate
      };
    }
  });

  if (weeklyStats.length >= 3) {
    const recent = weeklyStats.slice(0, 3);
    const earlier = weeklyStats.slice(-3);
    const recentAvg = recent.reduce((sum, day) => sum + day.stats.tasksCompleted, 0) / recent.length;
    const earlierAvg = earlier.reduce((sum, day) => sum + day.stats.tasksCompleted, 0) / earlier.length;

    if (recentAvg > earlierAvg * 1.2) {
      summary.trends.improving = true;
      summary.trends.stable = false;
    } else if (recentAvg < earlierAvg * 0.8) {
      summary.trends.declining = true;
      summary.trends.stable = false;
    }
  }

  return summary;
};

dailyStatsSchema.statics.getPlatformStats = async function getPlatformStats(
  this: IDailyStatsModel,
  date = new Date()
): Promise<IPlatformStats> {
  const startOfDay = new Date(date);
  const endOfDay = new Date(date);

  startOfDay.setHours(0, 0, 0, 0);
  endOfDay.setHours(23, 59, 59, 999);

  const stats = await this.aggregate<IPlatformStats>([
    {
      $match: {
        date: { $gte: startOfDay, $lte: endOfDay }
      }
    },
    {
      $group: {
        _id: null,
        totalUsers: { $sum: 1 },
        totalTasks: { $sum: '$stats.tasksStarted' },
        totalCompletedTasks: { $sum: '$stats.tasksCompleted' },
        totalMinutes: { $sum: '$stats.totalMinutes' },
        totalChains: { $sum: '$stats.chainsCreated' },
        totalBrokenChains: { $sum: '$stats.chainsBroken' },
        averageSuccessRate: { $avg: '$stats.successRate' }
      }
    }
  ]);

  return (
    stats[0] || {
      totalUsers: 0,
      totalTasks: 0,
      totalCompletedTasks: 0,
      totalMinutes: 0,
      totalChains: 0,
      totalBrokenChains: 0,
      averageSuccessRate: 0
    }
  );
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
