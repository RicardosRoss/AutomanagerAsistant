import DailyStats from './DailyStats.js';
import DivinationHistory from './DivinationHistory.js';
import TaskChain from './TaskChain.js';
import User from './User.js';

export { User, TaskChain, DailyStats, DivinationHistory };

export type { DailyStatsDocument, IDailyStats, IDailyStatsModel } from './DailyStats.js';
export type {
  DivinationHistoryDocument,
  IDivinationHistory,
  IDivinationHistoryModel
} from './DivinationHistory.js';
export type { ITask, ITaskChain, ITaskChainModel, TaskChainDocument } from './TaskChain.js';
export type { IUser, IUserModel, UserDocument } from './User.js';

export default {
  User,
  TaskChain,
  DailyStats,
  DivinationHistory
};
