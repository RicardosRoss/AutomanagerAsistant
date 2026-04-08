import AuxChain from './AuxChain.js';
import DailyStats from './DailyStats.js';
import DivinationHistory from './DivinationHistory.js';
import MainChain from './MainChain.js';
import PrecedentRule from './PrecedentRule.js';
import TaskChain from './TaskChain.js';
import User from './User.js';

export { AuxChain, MainChain, PrecedentRule, User, TaskChain, DailyStats, DivinationHistory };

export type { DailyStatsDocument, IDailyStats, IDailyStatsModel } from './DailyStats.js';
export type {
  DivinationHistoryDocument,
  IDivinationHistory,
  IDivinationHistoryModel
} from './DivinationHistory.js';
export type { ITask, ITaskChain, ITaskChainModel, TaskChainDocument } from './TaskChain.js';
export type { IUser, IUserModel, UserDocument } from './User.js';
export type { IMainChain, IMainChainModel, MainChainDocument } from './MainChain.js';
export type { IAuxChain, IAuxChainModel, AuxChainDocument } from './AuxChain.js';
export type { IPrecedentRule, IPrecedentRuleModel, PrecedentRuleDocument } from './PrecedentRule.js';

export default {
  AuxChain,
  MainChain,
  PrecedentRule,
  User,
  TaskChain,
  DailyStats,
  DivinationHistory
};
