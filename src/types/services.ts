import type {
  DailyStatsDocument,
  DivinationHistoryDocument,
  IDivinationHistoryStats,
  ITask,
  PatternTreeDocument,
  TaskChainDocument,
  UserDocument
} from './models.js';
import type {
  BaguaDivination,
  FortuneEvent,
  RealmDisplay
} from './cultivation.js';

export interface ProgressReminderData {
  userId: number;
  taskId: string;
  progress: number;
  message: string;
}

export interface CompletionReminderData {
  userId: number;
  taskId: string;
  message: string;
}

export interface ReservationJobData {
  userId: number;
  reservationId: string;
  taskDescription: string;
  duration: number;
  scheduledFor: Date;
  principle: 'LINEAR_DELAY';
}

export type ReminderJobData = ProgressReminderData | CompletionReminderData;
export type ReminderJobType = 'progress' | 'completion';

export interface QueueCounts {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  total: number;
}

export interface QueueStats {
  reminders: QueueCounts;
  reservations: QueueCounts;
  timestamp: string;
}

export interface QueueHealthCheck {
  status: 'healthy' | 'unhealthy';
  message: string;
  stats?: QueueStats;
  queues?: {
    reminder: {
      paused: boolean;
      name: string;
    };
    reservation: {
      paused: boolean;
      name: string;
    };
  };
  error?: string;
}

export interface FortuneEventResult {
  power: number;
  stones: number;
  message: string | null;
}

export interface CultivationReward {
  spiritualPower: number;
  immortalStones: number;
  bonus: number;
  fortuneEvent: FortuneEventResult;
  oldRealm?: string;
  newRealm: string;
  newStage: string;
  realmChanged: boolean;
  oldSpiritualPower?: number;
  newSpiritualPower: number;
}

export interface CultivationStatusResult extends RealmDisplay {
  user: UserDocument;
  immortalStones: number;
  ascensions: number;
  immortalMarks: number;
  breakthroughSuccesses: number;
  breakthroughFailures: number;
  canBreakthrough: boolean;
}

export interface DivinationCastResult {
  roll: number;
  gua: BaguaDivination;
  betAmount: number;
  result: number;
  powerChange: number;
  stonesBefore: number;
  stonesAfter: number;
  powerBefore: number;
  powerAfter: number;
  realmBefore: string;
  realmAfter: string;
  realmChanged: boolean;
  newStage: string;
}

export interface BreakthroughSuccessResult {
  success: true;
  message: string;
  oldRealm: string;
  newRealm: string;
  newTitle: string;
}

export interface BreakthroughFailureResult {
  success: false;
  message: string;
  penalty: number;
  realmDemoted: boolean;
  newRealm: string;
  currentPower: number;
}

export type BreakthroughResult = BreakthroughSuccessResult | BreakthroughFailureResult;

export interface AscensionResult {
  success: true;
  ascensionCount: number;
  immortalMarks: number;
  message: string;
}

export interface QueueServiceDependency {
  addReminder(type: ReminderJobType, data: ReminderJobData, delay: number): Promise<string | number | undefined>;
  cancelTaskReminders(taskId: string): Promise<number>;
}

export interface CultivationServiceDependency {
  awardCultivation(userId: number, duration: number): Promise<CultivationReward>;
}

export interface CreateTaskResult {
  chain: TaskChainDocument;
  task: ITask;
  user: UserDocument;
}

export interface CompleteTaskResult {
  chain: TaskChainDocument;
  task: ITask;
  user: UserDocument;
  wasChainBroken: boolean;
  cultivationReward: CultivationReward | null;
}

export interface UserStatusResult {
  user: UserDocument | null;
  activeChain: TaskChainDocument | null;
  currentTask: ITask | undefined;
  todayStats: DailyStatsDocument;
  isActive: boolean;
  stats: UserDocument['stats'] | Record<string, never>;
}

export interface WeeklyReportDay {
  date: Date;
  completed: number;
  minutes: number;
  successRate: number;
}

export interface WeeklyReportSummary {
  totalTasks: number;
  totalCompletedTasks: number;
  totalMinutes: number;
  averageSuccessRate: number;
  bestDay: WeeklyReportDay | null;
  worstDay: WeeklyReportDay | null;
  dailyStats: WeeklyReportDay[];
  trends: {
    improving: boolean;
    declining: boolean;
    stable: boolean;
  };
}

export interface PlatformStats {
  totalUsers: number;
  totalTasks: number;
  totalCompletedTasks: number;
  totalMinutes: number;
  totalChains: number;
  totalBrokenChains: number;
  averageSuccessRate: number;
}

export interface CultivationLeaderboardEntry extends UserDocument {
  cultivation: UserDocument['cultivation'];
}

export interface DivinationStatsResult extends IDivinationHistoryStats {}

export interface CultivationServiceContract {
  getCultivationStatus(userId: number): Promise<CultivationStatusResult>;
  awardCultivation(userId: number, duration: number): Promise<CultivationReward>;
  castDivination(userId: number, betAmount: number): Promise<DivinationCastResult>;
  attemptBreakthrough(userId: number): Promise<BreakthroughResult>;
  ascend(userId: number): Promise<AscensionResult>;
  getDivinationHistory(userId: number, limit?: number): Promise<DivinationHistoryDocument[]>;
  getDivinationStats(userId: number): Promise<DivinationStatsResult>;
  getLeaderboard(type?: string, limit?: number): Promise<UserDocument[]>;
  checkFortuneEvent(): FortuneEvent | null;
}

export interface QueueServiceContract {
  initialize(): Promise<void>;
  addReminder(type: ReminderJobType, data: ReminderJobData, delay: number): Promise<string | number | undefined>;
  scheduleReservation(
    userId: number,
    reservationId: string,
    taskDescription: string,
    duration?: number
  ): Promise<string | number | undefined>;
  cancelTaskReminders(taskId: string): Promise<number>;
  cancelReservation(reservationId: string): Promise<boolean>;
  setBotInstance(botInstance: unknown): void;
  getQueueStats(): Promise<QueueStats>;
  cleanup(): Promise<void>;
  pauseQueues(): Promise<void>;
  resumeQueues(): Promise<void>;
  healthCheck(): Promise<QueueHealthCheck>;
  close(): Promise<void>;
}

// ─── RSIP Service ───────────────────────────────────────────────────────────

export interface AddPatternInput {
  title: string;
  parentId?: string;
}

export interface AddPatternResult {
  tree: PatternTreeDocument;
  newNodeId: string;
}

export interface DeletePatternResult {
  removedNodeIds: string[];
}

// ─── CTDP Service ────────────────────────────────────────────────────────────

export interface StartMainTaskInput {
  markerLabel: string;
  description: string;
  duration: number;
  isReserved?: boolean;
  reservationId?: string;
}

export interface StartMainTaskResult {
  mainChain: import('./models.js').MainChainDocument;
  task: ITask;
}

export interface FailMainTaskResult {
  mainChain: import('./models.js').MainChainDocument;
}

export interface CompleteMainTaskResult {
  mainChain: import('./models.js').MainChainDocument;
  task: ITask;
  cultivationReward: CultivationReward | null;
}
