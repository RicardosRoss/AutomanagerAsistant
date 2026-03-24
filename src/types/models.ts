import type { HydratedDocument, Model } from 'mongoose';
import type { ChainStatus, TaskStatus } from '../utils/constants.js';

export interface IUserSettings {
  defaultDuration: number;
  reminderEnabled: boolean;
  timezone: string;
  language: string;
}

export interface IUserStats {
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  totalMinutes: number;
  currentStreak: number;
  longestStreak: number;
  todayCompletedTasks: number;
  lastTaskDate?: Date;
}

export interface IUserPreferences {
  notificationSound: boolean;
  progressReminders: boolean;
  weeklyReport: boolean;
}

export interface IUserCultivation {
  spiritualPower: number;
  realm: string;
  realmId: number;
  realmStage: string;
  immortalStones: number;
  ascensions: number;
  immortalMarks: number;
  lastAscensionAt?: Date;
  breakthroughSuccesses: number;
  breakthroughFailures: number;
  lastBreakthroughAt?: Date;
  divinationCount: number;
  divinationWins: number;
  divinationLosses: number;
  totalDivinationGain: number;
  totalDivinationLoss: number;
  totalSpiritualPowerEarned: number;
  peakRealm: string;
  peakRealmId: number;
  peakSpiritualPower: number;
  achievements: string[];
  fortuneEventsTriggered: number;
}

export interface IUserLevelInfo {
  level: number;
  name: string;
}

export interface IUserIdentityInput {
  userId: number;
  username?: string;
  firstName?: string;
  lastName?: string;
}

export interface IUser {
  userId: number;
  username?: string;
  firstName?: string;
  lastName?: string;
  settings: IUserSettings;
  stats: IUserStats;
  preferences: IUserPreferences;
  cultivation: IUserCultivation;
  createdAt?: Date;
  updatedAt?: Date;
  successRate?: number;
  todayMinutes?: number;
  fullName?: string;
}

export interface IUserMethods {
  resetDailyStats(): Promise<UserDocument>;
  updateStreak(success: boolean): UserDocument;
  addCompletedTask(duration: number): UserDocument;
  addFailedTask(): UserDocument;
  getLevel(): IUserLevelInfo;
  addSpiritualPower(amount: number): UserDocument;
  addImmortalStones(amount: number): UserDocument;
  updateRealm(newRealm: { id: number; name: string }): UserDocument;
  updateRealmStage(stageName: string): UserDocument;
  recordBreakthrough(success: boolean): UserDocument;
  recordDivination(result: number): UserDocument;
  ascend(): UserDocument;
}

export type UserDocument = HydratedDocument<IUser, IUserMethods>;

export interface IUserModel extends Model<IUser, Record<string, never>, IUserMethods> {
  findOrCreate(userData: IUserIdentityInput): Promise<UserDocument>;
  getLeaderboard(type?: string, limit?: number): Promise<UserDocument[]>;
}

export interface IProgressReminder {
  time: Date;
  sent: boolean;
}

export interface IInterruption {
  time: Date;
  reason?: string;
}

export interface ITaskMetadata {
  progressReminders: IProgressReminder[];
  interruptions: IInterruption[];
  notes?: string;
}

export interface ITask {
  taskId: string;
  description: string;
  duration: number;
  startTime: Date;
  endTime?: Date;
  status: TaskStatus;
  actualDuration?: number;
  isReserved: boolean;
  reservedAt?: Date;
  reservationId?: string | null;
  metadata: ITaskMetadata;
}

export interface ITaskCreationInput {
  taskId: string;
  description: string;
  duration: number;
  startTime?: Date;
  isReserved?: boolean;
  reservationId?: string | null;
  notes?: string;
}

export interface ITaskChain {
  userId: number;
  chainId: string;
  title: string;
  description?: string;
  tasks: ITask[];
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  status: ChainStatus;
  totalMinutes: number;
  averageTaskDuration: number;
  lastTaskCompletedAt?: Date;
  brokenAt?: Date | null;
  brokenReason?: string | null;
  brokenTaskId?: string | null;
  restoredAt?: Date | null;
  restorationCount: number;
  createdAt?: Date;
  updatedAt?: Date;
  currentTask?: ITask;
  successRate?: number;
  chainStrength?: number;
  isActive?: boolean;
}

export interface ITaskChainStats {
  total: number;
  completed: number;
  failed: number;
  running: number;
  successRate: number;
  totalMinutes: number;
  averageDuration: number;
  chainStrength: number;
  status: ChainStatus;
  isActive: boolean;
  lastCompleted?: Date;
  brokenInfo: {
    brokenAt?: Date;
    reason?: string | null;
    taskId?: string | null;
  } | null;
}

export interface ITaskChainMethods {
  breakChain(reason?: string, taskId?: string | null): TaskChainDocument;
  restoreChain(): TaskChainDocument;
  addTask(taskData: ITaskCreationInput): ITask;
  completeTask(taskId: string, success?: boolean, failureReason?: string | null): ITask;
  getChainStats(): ITaskChainStats;
}

export type TaskChainDocument = HydratedDocument<ITaskChain, ITaskChainMethods>;

export interface ITaskChainModel extends Model<ITaskChain, Record<string, never>, ITaskChainMethods> {
  findActiveChain(userId: number): Promise<TaskChainDocument | null>;
  createChain(userId: number, title?: string): Promise<TaskChainDocument>;
  getUserChainHistory(userId: number, limit?: number): Promise<TaskChainDocument[]>;
  getChainLeaderboard(type?: string, limit?: number): Promise<TaskChainDocument[]>;
}

export interface IDailyStatsStats {
  tasksStarted: number;
  tasksCompleted: number;
  tasksFailed: number;
  totalMinutes: number;
  averageTaskDuration: number;
  longestTask: number;
  shortestTask: number;
  successRate: number;
  chainsCreated: number;
  chainsBroken: number;
  longestChain: number;
}

export interface IDailyPatternExecution {
  patternId: string;
  executedAt: Date;
  success: boolean;
}

export interface IDailyStatsMetadata {
  firstTaskAt?: Date;
  lastTaskAt?: Date;
  mostProductiveHour?: number;
  interruptions: number;
  peakPerformanceHours: number[];
  lowPerformanceHours: number[];
}

export interface IFocusLevel {
  level: number;
  name: string;
}

export interface IDailySummary {
  date: string;
  tasks: {
    started: number;
    completed: number;
    failed: number;
    successRate: number;
  };
  time: {
    totalMinutes: number;
    averageDuration: number;
    longestTask: number;
    shortestTask: number;
  };
  chains: {
    created: number;
    broken: number;
    longest: number;
  };
  patterns: {
    executed: number;
    successful: number;
  };
  performance: {
    efficiencyScore: number;
    focusLevel: IFocusLevel;
    mostProductiveHour?: number;
    interruptions: number;
  };
}

export interface IDailyStats {
  userId: number;
  date: Date;
  stats: IDailyStatsStats;
  patterns: IDailyPatternExecution[];
  metadata: IDailyStatsMetadata;
  createdAt?: Date;
  updatedAt?: Date;
  efficiencyScore?: number;
  focusLevel?: IFocusLevel;
}

export interface IDailyStatsMethods {
  addTaskStats(task: Pick<ITask, 'duration'> & Partial<ITask>, success: boolean): DailyStatsDocument;
  updateProductivityHours(hour: number, success: boolean): void;
  addChainStats(chainCreated?: boolean, chainBroken?: boolean, chainLength?: number): DailyStatsDocument;
  addPatternExecution(patternId: string, success?: boolean): DailyStatsDocument;
  addInterruption(): DailyStatsDocument;
  getSummary(): IDailySummary;
}

export type DailyStatsDocument = HydratedDocument<IDailyStats, IDailyStatsMethods>;

export interface IDailyStatsModel extends Model<IDailyStats, Record<string, never>, IDailyStatsMethods> {
  findOrCreateDaily(userId: number, date?: Date): Promise<DailyStatsDocument>;
  getUserPeriodStats(userId: number, days?: number): Promise<DailyStatsDocument[]>;
  generateWeeklyReport(userId: number): Promise<Record<string, unknown>>;
}

export interface IDivinationHistory {
  userId: number;
  gameId: string;
  betAmount: number;
  diceRoll: number;
  guaName?: string;
  guaEmoji?: string;
  meaning?: string;
  multiplier?: number;
  result?: number;
  stonesAfter?: number;
  powerBefore?: number;
  powerAfter?: number;
  realmBefore?: string;
  realmAfter?: string;
  realmChanged: boolean;
  timestamp: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IDivinationHistoryMethods {
  formatDisplay(): string;
}

export type DivinationHistoryDocument = HydratedDocument<IDivinationHistory, IDivinationHistoryMethods>;

export interface IDivinationHistoryStats {
  totalGames: number;
  totalBet: number;
  totalGain: number;
  totalLoss: number;
  netProfit: number;
  wins: number;
  losses: number;
  realmChanges: number;
}

export interface IDivinationHistoryExtremes {
  bigWins: DivinationHistoryDocument[];
  bigLosses: DivinationHistoryDocument[];
}

export interface IDivinationHistoryModel
  extends Model<IDivinationHistory, Record<string, never>, IDivinationHistoryMethods> {
  getUserHistory(userId: number, limit?: number): Promise<DivinationHistoryDocument[]>;
  getUserStats(userId: number): Promise<IDivinationHistoryStats>;
  getExtremeResults(userId: number, limit?: number): Promise<IDivinationHistoryExtremes>;
}
