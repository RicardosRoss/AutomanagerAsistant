import mongoose from 'mongoose';

/**
 * DivinationHistory Model - 占卜天机历史记录
 * 记录用户的每次占卜结果
 */
const divinationHistorySchema = new mongoose.Schema({
  userId: {
    type: Number,
    required: true,
    index: true
  },
  gameId: {
    type: String,
    required: true,
    unique: true
  },

  // 占卜信息
  betAmount: {
    type: Number,
    required: true,
    min: 1
  },
  diceRoll: {
    type: Number,
    required: true,
    min: 1,
    max: 8
  },
  guaName: String,      // 卦名（如"乾卦"）
  guaEmoji: String,     // 卦象 emoji
  meaning: String,      // 吉凶（如"大吉"）
  multiplier: Number,   // 倍率

  // 结果
  result: Number,       // 净收益（正数为盈利，负数为亏损）
  stonesAfter: Number,  // 占卜后的仙石数

  // 境界变化
  powerBefore: Number,  // 占卜前灵力
  powerAfter: Number,   // 占卜后灵力
  realmBefore: String,  // 占卜前境界
  realmAfter: String,   // 占卜后境界
  realmChanged: {       // 境界是否变化
    type: Boolean,
    default: false
  },

  // 时间戳
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  }
}, {
  timestamps: true
});

// 索引优化
divinationHistorySchema.index({ userId: 1, timestamp: -1 }); // 用户历史记录查询
divinationHistorySchema.index({ gameId: 1 }); // 游戏ID查询

// 静态方法：获取用户占卜历史
divinationHistorySchema.statics.getUserHistory = async function getUserHistory(userId, limit = 10) {
  return this.find({ userId })
    .sort({ timestamp: -1 })
    .limit(limit)
    .exec();
};

// 静态方法：获取用户占卜统计
divinationHistorySchema.statics.getUserStats = async function getUserStats(userId) {
  const stats = await this.aggregate([
    {
      $match: { userId }
    },
    {
      $group: {
        _id: null,
        totalGames: { $sum: 1 },
        totalBet: { $sum: '$betAmount' },
        totalGain: { $sum: { $cond: [{ $gt: ['$result', 0] }, '$result', 0] } },
        totalLoss: { $sum: { $cond: [{ $lt: ['$result', 0] }, { $abs: '$result' }, 0] } },
        netProfit: { $sum: '$result' },
        wins: { $sum: { $cond: [{ $gt: ['$result', 0] }, 1, 0] } },
        losses: { $sum: { $cond: [{ $lt: ['$result', 0] }, 1, 0] } },
        realmChanges: { $sum: { $cond: ['$realmChanged', 1, 0] } }
      }
    }
  ]);

  return stats[0] || {
    totalGames: 0,
    totalBet: 0,
    totalGain: 0,
    totalLoss: 0,
    netProfit: 0,
    wins: 0,
    losses: 0,
    realmChanges: 0
  };
};

// 静态方法：获取最近的大吉/大凶记录
divinationHistorySchema.statics.getExtremeResults = async function getExtremeResults(userId, limit = 5) {
  const bigWins = await this.find({
    userId,
    diceRoll: { $in: [7, 8] }
  })
    .sort({ timestamp: -1 })
    .limit(limit)
    .exec();

  const bigLosses = await this.find({
    userId,
    diceRoll: { $in: [1, 2] }
  })
    .sort({ timestamp: -1 })
    .limit(limit)
    .exec();

  return { bigWins, bigLosses };
};

// 实例方法：格式化显示
divinationHistorySchema.methods.formatDisplay = function formatDisplay() {
  const resultEmoji = this.result > 0 ? '📈' : '📉';
  const resultText = this.result > 0 ? `+${this.result}` : `${this.result}`;

  return `${this.guaEmoji} ${this.guaName} - ${this.meaning}\n` +
         `💰 下注：${this.betAmount} | ${resultEmoji} 结果：${resultText}\n` +
         `📊 仙石：${this.stonesAfter}`;
};

const DivinationHistory = mongoose.model('DivinationHistory', divinationHistorySchema);

export default DivinationHistory;
