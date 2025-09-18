import mongoose from 'mongoose';

const dailyStatsSchema = new mongoose.Schema({
  userId: { type: Number, required: true, index: true },
  date: { type: Date, required: true }, // 统计日期（日期开始）
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
  patterns: [{ // 执行的定式ID列表
    patternId: String,
    executedAt: Date,
    success: Boolean
  }],
  metadata: {
    firstTaskAt: Date,
    lastTaskAt: Date,
    mostProductiveHour: Number, // 0-23
    interruptions: { type: Number, default: 0 },
    peakPerformanceHours: [Number], // 高效时段
    lowPerformanceHours: [Number] // 低效时段
  }
}, {
  timestamps: true
});

// 虚拟字段：效率分数（基于完成率和平均时长）
dailyStatsSchema.virtual('efficiencyScore').get(function getEfficiencyScore() {
  if (this.stats.tasksStarted === 0) return 0;

  const completionRate = this.stats.tasksCompleted / this.stats.tasksStarted;
  const averageRate = this.stats.averageTaskDuration > 0 ? Math.min(this.stats.averageTaskDuration / 25, 2) : 1;

  return Math.round(completionRate * averageRate * 100);
});

// 虚拟字段：专注等级
dailyStatsSchema.virtual('focusLevel').get(function getFocusLevel() {
  const minutes = this.stats.totalMinutes;
  if (minutes < 30) return { level: 1, name: '起步' };
  if (minutes < 90) return { level: 2, name: '进步' };
  if (minutes < 180) return { level: 3, name: '专注' };
  if (minutes < 300) return { level: 4, name: '卓越' };
  return { level: 5, name: '传奇' };
});

// 实例方法：添加任务统计
dailyStatsSchema.methods.addTaskStats = function addTaskStats(task, success) {
  this.stats.tasksStarted += 1;

  if (success) {
    this.stats.tasksCompleted += 1;
    this.stats.totalMinutes += task.actualDuration || task.duration;

    // 更新最长和最短任务时长
    const duration = task.actualDuration || task.duration;
    this.stats.longestTask = Math.max(this.stats.longestTask, duration);
    if (this.stats.shortestTask === Number.MAX_VALUE) {
      this.stats.shortestTask = duration;
    } else {
      this.stats.shortestTask = Math.min(this.stats.shortestTask, duration);
    }
  } else {
    this.stats.tasksFailed += 1;
  }

  // 更新成功率
  this.stats.successRate = (this.stats.tasksCompleted / this.stats.tasksStarted * 100);

  // 更新平均时长
  if (this.stats.tasksCompleted > 0) {
    this.stats.averageTaskDuration = this.stats.totalMinutes / this.stats.tasksCompleted;
  }

  // 更新时间信息
  const taskTime = task.startTime || new Date();
  if (!this.metadata.firstTaskAt) {
    this.metadata.firstTaskAt = taskTime;
  }
  this.metadata.lastTaskAt = taskTime;

  // 更新最高效时段
  const hour = taskTime.getHours();
  this.updateProductivityHours(hour, success);

  return this;
};

// 实例方法：更新生产力时段
dailyStatsSchema.methods.updateProductivityHours = function updateProductivityHours(hour, success) {
  if (!this.metadata.peakPerformanceHours) {
    this.metadata.peakPerformanceHours = [];
  }
  if (!this.metadata.lowPerformanceHours) {
    this.metadata.lowPerformanceHours = [];
  }

  if (success) {
    // 添加到高效时段
    if (!this.metadata.peakPerformanceHours.includes(hour)) {
      this.metadata.peakPerformanceHours.push(hour);
    }
    // 从低效时段移除
    const lowIndex = this.metadata.lowPerformanceHours.indexOf(hour);
    if (lowIndex > -1) {
      this.metadata.lowPerformanceHours.splice(lowIndex, 1);
    }
  } else {
    // 添加到低效时段
    if (!this.metadata.lowPerformanceHours.includes(hour)) {
      this.metadata.lowPerformanceHours.push(hour);
    }
  }

  // 更新最高效时段（使用众数）
  if (this.metadata.peakPerformanceHours.length > 0) {
    this.metadata.mostProductiveHour = this.metadata.peakPerformanceHours[0]; // 简化实现
  }
};

// 实例方法：添加链条统计
dailyStatsSchema.methods.addChainStats = function addChainStats(chainCreated = false, chainBroken = false, chainLength = 0) {
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

// 实例方法：添加定式执行记录
dailyStatsSchema.methods.addPatternExecution = function addPatternExecution(patternId, success = true) {
  this.patterns.push({
    patternId,
    executedAt: new Date(),
    success
  });

  return this;
};

// 实例方法：添加中断记录
dailyStatsSchema.methods.addInterruption = function addInterruption() {
  this.metadata.interruptions = (this.metadata.interruptions || 0) + 1;
  return this;
};

// 实例方法：获取统计摘要
dailyStatsSchema.methods.getSummary = function getSummary() {
  return {
    date: this.date.toISOString().split('T')[0],
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
      successful: this.patterns.filter((p) => p.success).length
    },
    performance: {
      efficiencyScore: this.efficiencyScore,
      focusLevel: this.focusLevel,
      mostProductiveHour: this.metadata.mostProductiveHour,
      interruptions: this.metadata.interruptions
    }
  };
};

// 静态方法：获取或创建每日统计
dailyStatsSchema.statics.findOrCreateDaily = async function findOrCreateDaily(userId, date = new Date()) {
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

// 静态方法：获取用户一段时间的统计
dailyStatsSchema.statics.getUserPeriodStats = async function getUserPeriodStats(userId, days = 7) {
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

// 静态方法：获取用户周报数据
dailyStatsSchema.statics.generateWeeklyReport = async function generateWeeklyReport(userId) {
  const weeklyStats = await this.getUserPeriodStats(userId, 7);

  const summary = {
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

  // 计算总计
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

  // 计算平均值
  summary.averageSuccessRate = summary.totalTasks > 0
    ? (summary.totalCompletedTasks / summary.totalTasks * 100) : 0;

  // 找出最佳和最差的一天
  let bestScore = -1;
  let worstScore = Infinity;

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

    if (score < worstScore && score > 0) { // 排除没有活动的天
      worstScore = score;
      summary.worstDay = {
        date: dayStats.date,
        completed: dayStats.stats.tasksCompleted,
        minutes: dayStats.stats.totalMinutes,
        successRate: dayStats.stats.successRate
      };
    }
  });

  // 分析趋势
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

// 静态方法：获取平台统计
dailyStatsSchema.statics.getPlatformStats = async function getPlatformStats(date = new Date()) {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  const stats = await this.aggregate([
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

  return stats[0] || {
    totalUsers: 0,
    totalTasks: 0,
    totalCompletedTasks: 0,
    totalMinutes: 0,
    totalChains: 0,
    totalBrokenChains: 0,
    averageSuccessRate: 0
  };
};

// 复合索引：用户+日期唯一
dailyStatsSchema.index({ userId: 1, date: 1 }, { unique: true });
dailyStatsSchema.index({ date: 1 }); // 全平台统计查询
dailyStatsSchema.index({ 'stats.successRate': -1 }); // 排行榜
dailyStatsSchema.index({ 'stats.totalMinutes': -1 }); // 专注时长排行
dailyStatsSchema.index({ 'stats.tasksCompleted': -1 }); // 完成任务排行

// 中间件：保存前验证数据一致性
dailyStatsSchema.pre('save', function preSave(next) {
  // 确保成功率在0-100之间
  if (this.stats.successRate < 0) this.stats.successRate = 0;
  if (this.stats.successRate > 100) this.stats.successRate = 100;

  // 确保统计数据不为负数
  if (this.stats.tasksStarted < 0) this.stats.tasksStarted = 0;
  if (this.stats.tasksCompleted < 0) this.stats.tasksCompleted = 0;
  if (this.stats.tasksFailed < 0) this.stats.tasksFailed = 0;
  if (this.stats.totalMinutes < 0) this.stats.totalMinutes = 0;

  // 重置短任务时长的无效值
  if (this.stats.shortestTask === Number.MAX_VALUE && this.stats.tasksCompleted === 0) {
    this.stats.shortestTask = 0;
  }

  next();
});

// 中间件：更新时记录日志
dailyStatsSchema.post('save', (doc) => {
  const dateStr = doc.date.toISOString().split('T')[0];
  console.log(`📊 每日统计更新: 用户 ${doc.userId}, 日期 ${dateStr}, 完成 ${doc.stats.tasksCompleted} 个任务`);
});

const DailyStats = mongoose.model('DailyStats', dailyStatsSchema);

export default DailyStats;
