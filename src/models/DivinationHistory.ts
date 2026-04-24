import mongoose, { Schema } from 'mongoose';
import type {
  DivinationHistoryDocument,
  IDivinationHistory,
  IDivinationHistoryExtremes,
  IDivinationHistoryMethods,
  IDivinationHistoryModel,
  IDivinationHistoryStats
} from '../types/models.js';

const divinationHistorySchema = new Schema<
  IDivinationHistory,
  IDivinationHistoryModel,
  IDivinationHistoryMethods
>(
  {
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
    guaName: String,
    guaEmoji: String,
    meaning: String,
    multiplier: Number,
    result: Number,
    stonesAfter: Number,
    powerBefore: Number,
    powerAfter: Number,
    realmBefore: String,
    realmAfter: String,
    realmChanged: {
      type: Boolean,
      default: false
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true
    }
  },
  {
    timestamps: true
  }
);

divinationHistorySchema.index({ userId: 1, timestamp: -1 });
divinationHistorySchema.index({ gameId: 1 });

divinationHistorySchema.statics.getUserHistory = async function getUserHistory(
  this: IDivinationHistoryModel,
  userId: number,
  limit = 10
) {
  return this.find({ userId })
    .sort({ timestamp: -1 })
    .limit(limit)
    .exec();
};

divinationHistorySchema.statics.getUserStats = async function getUserStats(
  this: IDivinationHistoryModel,
  userId: number
): Promise<IDivinationHistoryStats> {
  const stats = await this.aggregate<IDivinationHistoryStats>([
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

  return (
    stats[0] || {
      totalGames: 0,
      totalBet: 0,
      totalGain: 0,
      totalLoss: 0,
      netProfit: 0,
      wins: 0,
      losses: 0,
      realmChanges: 0
    }
  );
};

divinationHistorySchema.statics.getExtremeResults = async function getExtremeResults(
  this: IDivinationHistoryModel,
  userId: number,
  limit = 5
): Promise<IDivinationHistoryExtremes> {
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

divinationHistorySchema.methods.formatDisplay = function formatDisplay(this: DivinationHistoryDocument) {
  const resultEmoji = this.result && this.result > 0 ? '📈' : '📉';
  const resultText = this.result && this.result > 0 ? `+${this.result}` : `${this.result}`;

  return (
    `${this.guaEmoji} ${this.guaName} - ${this.meaning}\n` +
    `💰 下注：${this.betAmount} | ${resultEmoji} 结果：${resultText}\n` +
    `📊 灵石：${this.stonesAfter}`
  );
};

const DivinationHistory = mongoose.model<IDivinationHistory, IDivinationHistoryModel>(
  'DivinationHistory',
  divinationHistorySchema
);

export type {
  DivinationHistoryDocument,
  IDivinationHistory,
  IDivinationHistoryMethods,
  IDivinationHistoryModel
} from '../types/models.js';
export default DivinationHistory;
