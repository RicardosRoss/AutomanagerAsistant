import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  userId: {
    type: Number,
    required: true,
    unique: true,
    index: true // 性能关键索引
  },
  username: String,
  firstName: String,
  lastName: String,
  settings: {
    defaultDuration: { type: Number, default: 25 }, // 默认专注时长（分钟）
    reminderEnabled: { type: Boolean, default: true },
    timezone: { type: String, default: 'UTC' },
    language: { type: String, default: 'zh-CN' }
  },
  stats: {
    totalTasks: { type: Number, default: 0 },
    completedTasks: { type: Number, default: 0 },
    failedTasks: { type: Number, default: 0 },
    totalMinutes: { type: Number, default: 0 },
    currentStreak: { type: Number, default: 0 }, // 当前连击数
    longestStreak: { type: Number, default: 0 }, // 历史最长连击
    todayCompletedTasks: { type: Number, default: 0 },
    lastTaskDate: Date
  },
  preferences: {
    notificationSound: { type: Boolean, default: true },
    progressReminders: { type: Boolean, default: true },
    weeklyReport: { type: Boolean, default: true }
  }
}, {
  timestamps: true, // 自动添加 createdAt 和 updatedAt
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// 虚拟字段：成功率
userSchema.virtual('successRate').get(function getSuccessRate() {
  if (this.stats.totalTasks === 0) return 0;
  return parseFloat((this.stats.completedTasks / this.stats.totalTasks * 100).toFixed(1));
});

// 虚拟字段：今日专注时长
userSchema.virtual('todayMinutes').get(() =>
  // 这里实际应该从 DailyStats 中获取，这只是一个占位符
  0);

// 虚拟字段：全名
userSchema.virtual('fullName').get(function getFullName() {
  if (this.firstName && this.lastName) {
    return `${this.firstName} ${this.lastName}`;
  }
  return this.username || `用户${this.userId}`;
});

// 实例方法：重置每日统计
userSchema.methods.resetDailyStats = function resetDailyStats() {
  this.stats.todayCompletedTasks = 0;
  return this.save();
};

// 实例方法：更新连击数
userSchema.methods.updateStreak = function updateStreak(success) {
  if (success) {
    this.stats.currentStreak += 1;
    this.stats.longestStreak = Math.max(
      this.stats.longestStreak,
      this.stats.currentStreak
    );
  } else {
    // 神圣座位原理：失败重置连击
    this.stats.currentStreak = 0;
  }
  return this;
};

// 实例方法：添加完成的任务
userSchema.methods.addCompletedTask = function addCompletedTask(duration) {
  this.stats.completedTasks += 1;
  this.stats.totalMinutes += duration;
  this.stats.todayCompletedTasks += 1;
  this.stats.lastTaskDate = new Date();
  return this;
};

// 实例方法：添加失败的任务
userSchema.methods.addFailedTask = function addFailedTask() {
  this.stats.failedTasks += 1;
  this.stats.currentStreak = 0; // 神圣座位原理：失败重置连击
  return this;
};

// 实例方法：获取用户等级（基于完成任务数）
userSchema.methods.getLevel = function getLevel() {
  const completed = this.stats.completedTasks;
  if (completed < 10) return { level: 1, name: '初学者' };
  if (completed < 50) return { level: 2, name: '专注者' };
  if (completed < 100) return { level: 3, name: '自律者' };
  if (completed < 300) return { level: 4, name: '大师' };
  if (completed < 500) return { level: 5, name: '宗师' };
  return { level: 6, name: '传奇' };
};

// 静态方法：根据用户ID查找或创建用户
userSchema.statics.findOrCreate = async function findOrCreate(userData) {
  let user = await this.findOne({ userId: userData.userId });

  if (!user) {
    user = await this.create({
      userId: userData.userId,
      username: userData.username,
      firstName: userData.firstName,
      lastName: userData.lastName,
      settings: {
        defaultDuration: 25,
        reminderEnabled: true,
        timezone: 'UTC',
        language: 'zh-CN'
      }
    });
  }

  return user;
};

// 静态方法：获取排行榜
userSchema.statics.getLeaderboard = async function getLeaderboard(type = 'streak', limit = 10) {
  const sortField = type === 'streak' ? 'stats.currentStreak'
    : type === 'completed' ? 'stats.completedTasks'
      : type === 'minutes' ? 'stats.totalMinutes' : 'stats.currentStreak';

  return this.find({})
    .sort({ [sortField]: -1 })
    .limit(limit)
    .select('userId username firstName lastName stats')
    .exec();
};

// 静态方法：获取活跃用户统计
userSchema.statics.getActiveUserStats = async function getActiveUserStats(days = 7) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);

  const stats = await this.aggregate([
    {
      $match: {
        updatedAt: { $gte: cutoffDate }
      }
    },
    {
      $group: {
        _id: null,
        totalUsers: { $sum: 1 },
        averageStreak: { $avg: '$stats.currentStreak' },
        totalTasks: { $sum: '$stats.totalTasks' },
        totalCompletedTasks: { $sum: '$stats.completedTasks' },
        totalMinutes: { $sum: '$stats.totalMinutes' }
      }
    }
  ]);

  return stats[0] || {
    totalUsers: 0,
    averageStreak: 0,
    totalTasks: 0,
    totalCompletedTasks: 0,
    totalMinutes: 0
  };
};

// 索引优化（基于 PRP 要求）
userSchema.index({ userId: 1 }); // 主键索引
userSchema.index({ 'stats.currentStreak': -1 }); // 排行榜查询
userSchema.index({ updatedAt: -1 }); // 活跃用户查询
userSchema.index({ 'stats.completedTasks': -1 }); // 完成任务排行
userSchema.index({ 'stats.totalMinutes': -1 }); // 专注时长排行

// 中间件：保存前验证
userSchema.pre('save', function preSave(next) {
  // 确保连击数不能为负数
  if (this.stats.currentStreak < 0) {
    this.stats.currentStreak = 0;
  }

  // 确保最长连击不小于当前连击
  if (this.stats.longestStreak < this.stats.currentStreak) {
    this.stats.longestStreak = this.stats.currentStreak;
  }

  // 确保统计数据不为负数
  if (this.stats.totalTasks < 0) this.stats.totalTasks = 0;
  if (this.stats.completedTasks < 0) this.stats.completedTasks = 0;
  if (this.stats.failedTasks < 0) this.stats.failedTasks = 0;
  if (this.stats.totalMinutes < 0) this.stats.totalMinutes = 0;

  next();
});

// 中间件：删除前清理相关数据
userSchema.pre('remove', async function preRemove() {
  try {
    // 删除用户相关的任务链
    const TaskChain = mongoose.model('TaskChain');
    await TaskChain.deleteMany({ userId: this.userId });

    // 删除用户相关的统计数据
    const DailyStats = mongoose.model('DailyStats');
    await DailyStats.deleteMany({ userId: this.userId });

    console.log(`已清理用户 ${this.userId} 的相关数据`);
  } catch (error) {
    console.error(`清理用户 ${this.userId} 相关数据失败:`, error);
  }
});

const User = mongoose.model('User', userSchema);

export default User;
