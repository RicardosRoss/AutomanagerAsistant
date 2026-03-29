import mongoose, { Schema, type CallbackWithoutResultAndOptionalError } from 'mongoose';
import type {
  IUser,
  IUserActiveStats,
  IUserIdentityInput,
  IUserLevelInfo,
  IUserMethods,
  IUserModel,
  UserDocument
} from '../types/models.js';

const userSchema = new Schema<IUser, IUserModel, IUserMethods>(
  {
    userId: {
      type: Number,
      required: true,
      unique: true,
      index: true
    },
    username: String,
    firstName: String,
    lastName: String,
    settings: {
      defaultDuration: { type: Number, default: 25 },
      reminderEnabled: { type: Boolean, default: true },
      timezone: { type: String, default: 'UTC' },
      language: { type: String, default: 'zh-CN' }
    },
    stats: {
      totalTasks: { type: Number, default: 0 },
      completedTasks: { type: Number, default: 0 },
      failedTasks: { type: Number, default: 0 },
      totalMinutes: { type: Number, default: 0 },
      currentStreak: { type: Number, default: 0 },
      longestStreak: { type: Number, default: 0 },
      todayCompletedTasks: { type: Number, default: 0 },
      lastTaskDate: Date
    },
    preferences: {
      notificationSound: { type: Boolean, default: true },
      progressReminders: { type: Boolean, default: true },
      weeklyReport: { type: Boolean, default: true }
    },
    cultivation: {
      spiritualPower: { type: Number, default: 0 },
      realm: { type: String, default: '炼气期' },
      realmId: { type: Number, default: 1 },
      realmStage: { type: String, default: '初期' },
      immortalStones: { type: Number, default: 0 },
      ascensions: { type: Number, default: 0 },
      immortalMarks: { type: Number, default: 0 },
      lastAscensionAt: Date,
      breakthroughSuccesses: { type: Number, default: 0 },
      breakthroughFailures: { type: Number, default: 0 },
      lastBreakthroughAt: Date,
      divinationCount: { type: Number, default: 0 },
      divinationWins: { type: Number, default: 0 },
      divinationLosses: { type: Number, default: 0 },
      totalDivinationGain: { type: Number, default: 0 },
      totalDivinationLoss: { type: Number, default: 0 },
      totalSpiritualPowerEarned: { type: Number, default: 0 },
      peakRealm: { type: String, default: '炼气期' },
      peakRealmId: { type: Number, default: 1 },
      peakSpiritualPower: { type: Number, default: 0 },
      achievements: [String],
      fortuneEventsTriggered: { type: Number, default: 0 }
    }
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

userSchema.virtual('successRate').get(function getSuccessRate(this: UserDocument) {
  if (this.stats.totalTasks === 0) {
    return 0;
  }

  return Number.parseFloat(((this.stats.completedTasks / this.stats.totalTasks) * 100).toFixed(1));
});

userSchema.virtual('todayMinutes').get(() => 0);

userSchema.virtual('fullName').get(function getFullName(this: UserDocument) {
  if (this.firstName && this.lastName) {
    return `${this.firstName} ${this.lastName}`;
  }

  return this.username || `用户${this.userId}`;
});

userSchema.methods.resetDailyStats = function resetDailyStats(this: UserDocument) {
  this.stats.todayCompletedTasks = 0;
  return this.save();
};

userSchema.methods.updateStreak = function updateStreak(this: UserDocument, success: boolean) {
  if (success) {
    this.stats.currentStreak += 1;
    this.stats.longestStreak = Math.max(this.stats.longestStreak, this.stats.currentStreak);
  } else {
    this.stats.currentStreak = 0;
  }

  return this;
};

userSchema.methods.addCompletedTask = function addCompletedTask(this: UserDocument, duration: number) {
  this.stats.completedTasks += 1;
  this.stats.totalMinutes += duration;
  this.stats.todayCompletedTasks += 1;
  this.stats.lastTaskDate = new Date();
  return this;
};

userSchema.methods.addFailedTask = function addFailedTask(this: UserDocument) {
  this.stats.failedTasks += 1;
  this.stats.currentStreak = 0;
  return this;
};

userSchema.methods.getLevel = function getLevel(this: UserDocument): IUserLevelInfo {
  const completed = this.stats.completedTasks;

  if (completed < 10) return { level: 1, name: '初学者' };
  if (completed < 50) return { level: 2, name: '专注者' };
  if (completed < 100) return { level: 3, name: '自律者' };
  if (completed < 300) return { level: 4, name: '大师' };
  if (completed < 500) return { level: 5, name: '宗师' };

  return { level: 6, name: '传奇' };
};

userSchema.statics.findOrCreate = async function findOrCreate(this: IUserModel, userData: IUserIdentityInput) {
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

userSchema.statics.getLeaderboard = async function getLeaderboard(this: IUserModel, type = 'streak', limit = 10) {
  const sortField =
    type === 'streak'
      ? 'stats.currentStreak'
      : type === 'completed'
        ? 'stats.completedTasks'
        : type === 'minutes'
          ? 'stats.totalMinutes'
          : 'stats.currentStreak';

  return this.find({})
    .sort({ [sortField]: -1 })
    .limit(limit)
    .select('userId username firstName lastName stats')
    .exec();
};

userSchema.methods.addSpiritualPower = function addSpiritualPower(this: UserDocument, amount: number) {
  this.cultivation.spiritualPower += amount;
  this.cultivation.totalSpiritualPowerEarned += amount;

  if (this.cultivation.spiritualPower > this.cultivation.peakSpiritualPower) {
    this.cultivation.peakSpiritualPower = this.cultivation.spiritualPower;
  }

  return this;
};

userSchema.methods.addImmortalStones = function addImmortalStones(this: UserDocument, amount: number) {
  this.cultivation.immortalStones += amount;
  return this;
};

userSchema.methods.updateRealm = function updateRealm(this: UserDocument, newRealm: { id: number; name: string }) {
  this.cultivation.realm = newRealm.name;
  this.cultivation.realmId = newRealm.id;

  if (newRealm.id > this.cultivation.peakRealmId) {
    this.cultivation.peakRealm = newRealm.name;
    this.cultivation.peakRealmId = newRealm.id;
  }

  return this;
};

userSchema.methods.updateRealmStage = function updateRealmStage(this: UserDocument, stageName: string) {
  this.cultivation.realmStage = stageName;
  return this;
};

userSchema.methods.recordBreakthrough = function recordBreakthrough(this: UserDocument, success: boolean) {
  this.cultivation.lastBreakthroughAt = new Date();

  if (success) {
    this.cultivation.breakthroughSuccesses += 1;
  } else {
    this.cultivation.breakthroughFailures += 1;
  }

  return this;
};

userSchema.methods.recordDivination = function recordDivination(this: UserDocument, result: number) {
  this.cultivation.divinationCount += 1;

  if (result > 0) {
    this.cultivation.divinationWins += 1;
    this.cultivation.totalDivinationGain += result;
  } else {
    this.cultivation.divinationLosses += 1;
    this.cultivation.totalDivinationLoss += Math.abs(result);
  }

  return this;
};

userSchema.methods.ascend = function ascend(this: UserDocument) {
  this.cultivation.ascensions += 1;
  this.cultivation.immortalMarks += 1;
  this.cultivation.lastAscensionAt = new Date();
  this.cultivation.spiritualPower = 0;
  this.cultivation.realm = '炼气期';
  this.cultivation.realmId = 1;
  this.cultivation.realmStage = '初期';
  return this;
};

userSchema.methods.addAchievement = function addAchievement(this: UserDocument, achievementName: string) {
  if (!this.cultivation.achievements.includes(achievementName)) {
    this.cultivation.achievements.push(achievementName);
  }

  return this;
};

userSchema.virtual('divinationWinRate').get(function getDivinationWinRate(this: UserDocument) {
  if (this.cultivation.divinationCount === 0) {
    return 0;
  }

  return Number.parseFloat(
    ((this.cultivation.divinationWins / this.cultivation.divinationCount) * 100).toFixed(1)
  );
});

userSchema.virtual('breakthroughSuccessRate').get(function getBreakthroughSuccessRate(this: UserDocument) {
  const total = this.cultivation.breakthroughSuccesses + this.cultivation.breakthroughFailures;

  if (total === 0) {
    return 0;
  }

  return Number.parseFloat(((this.cultivation.breakthroughSuccesses / total) * 100).toFixed(1));
});

userSchema.statics.getCultivationLeaderboard = async function getCultivationLeaderboard(
  this: IUserModel,
  type = 'power',
  limit = 10
) {
  const sortField =
    type === 'power'
      ? 'cultivation.spiritualPower'
      : type === 'realm'
        ? 'cultivation.realmId'
        : type === 'ascension'
          ? 'cultivation.ascensions'
          : 'cultivation.spiritualPower';

  return this.find({})
    .sort({ [sortField]: -1 })
    .limit(limit)
    .select('userId username firstName lastName cultivation')
    .exec();
};

userSchema.statics.getActiveUserStats = async function getActiveUserStats(
  this: IUserModel,
  days = 7
): Promise<IUserActiveStats> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);

  const stats = await this.aggregate<IUserActiveStats>([
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

  return (
    stats[0] || {
      totalUsers: 0,
      averageStreak: 0,
      totalTasks: 0,
      totalCompletedTasks: 0,
      totalMinutes: 0
    }
  );
};

userSchema.index({ userId: 1 });
userSchema.index({ 'stats.currentStreak': -1 });
userSchema.index({ updatedAt: -1 });
userSchema.index({ 'stats.completedTasks': -1 });
userSchema.index({ 'stats.totalMinutes': -1 });
userSchema.index({ 'cultivation.spiritualPower': -1 });
userSchema.index({ 'cultivation.realmId': -1 });
userSchema.index({ 'cultivation.ascensions': -1 });

userSchema.pre('save', function preSave(this: UserDocument, next: CallbackWithoutResultAndOptionalError) {
  if (this.stats.currentStreak < 0) {
    this.stats.currentStreak = 0;
  }

  if (this.stats.longestStreak < this.stats.currentStreak) {
    this.stats.longestStreak = this.stats.currentStreak;
  }

  if (this.stats.totalTasks < 0) this.stats.totalTasks = 0;
  if (this.stats.completedTasks < 0) this.stats.completedTasks = 0;
  if (this.stats.failedTasks < 0) this.stats.failedTasks = 0;
  if (this.stats.totalMinutes < 0) this.stats.totalMinutes = 0;

  if (this.cultivation.spiritualPower < 0) this.cultivation.spiritualPower = 0;
  if (this.cultivation.immortalStones < 0) this.cultivation.immortalStones = 0;
  if (this.cultivation.ascensions < 0) this.cultivation.ascensions = 0;

  next();
});

(userSchema.pre as unknown as (event: string, fn: (this: UserDocument) => Promise<void>) => void)(
  'remove',
  async function preRemove(this: UserDocument) {
    try {
      const TaskChain = mongoose.model('TaskChain');
      await TaskChain.deleteMany({ userId: this.userId });

      const DailyStats = mongoose.model('DailyStats');
      await DailyStats.deleteMany({ userId: this.userId });

      console.log(`已清理用户 ${this.userId} 的相关数据`);
    } catch (error) {
      console.error(`清理用户 ${this.userId} 相关数据失败:`, error);
    }
  }
);

const User = mongoose.model<IUser, IUserModel>('User', userSchema);

export type { IUser, IUserMethods, IUserModel, UserDocument } from '../types/models.js';
export default User;
