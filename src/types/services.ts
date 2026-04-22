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
  FortuneEvent
} from './cultivation.js';
import type { CombatResolution } from './cultivationCombat.js';
import type { DivinationBuff, PlayerCultivationState, RealmId } from './cultivationCanonical.js';

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

export interface CombatEncounterSummary {
  encounterId: string;
  enemyName: string;
  result: 'win' | 'loss' | 'narrow_win';
  summary: string;
  injuryLevel: 'none' | 'light' | 'medium' | 'heavy';
  rounds?: CombatResolution['rounds'];
}

export interface CultivationEncounterResult {
  type: 'none' | 'stones' | 'item' | 'combat';
  message: string | null;
  spiritStoneDelta: number;
  obtainedDefinitionIds: string[];
  combatEncounterId?: string;
  combatSummary?: CombatEncounterSummary;
}

export interface InjuryRecoverySummary {
  applied: boolean;
  previousLevel: PlayerCultivationState['injuryState']['level'];
  nextLevel: PlayerCultivationState['injuryState']['level'];
  summary: string | null;
}

export interface CultivationReward {
  spiritualPower: number;
  immortalStones: number;
  bonus: number;
  cultivationAttainment?: number;
  cultivationAttainmentDelta?: number;
  mainMethodName?: string;
  encounter?: CultivationEncounterResult;
  injuryRecovery?: InjuryRecoverySummary | null;
  breakthroughReady?: boolean;
  fortuneEvent: FortuneEventResult;
  oldRealm?: string;
  oldRealmId?: RealmId;
  newRealm: string;
  newRealmId?: RealmId;
  newStage: string;
  stageId?: string;
  realmChanged: boolean;
  oldSpiritualPower?: number;
  newSpiritualPower: number;
}

export interface CultivationStatusResult {
  user: UserDocument;
  realm: {
    id: number | RealmId;
    canonicalId?: RealmId;
    name: string;
    minPower: number;
    maxPower: number;
  };
  stage: {
    name: string;
  };
  fullName: string;
  title: string;
  progress: number;
  nextRealmProgress: number | null;
  immortalStones: number;
  ascensions: number;
  immortalMarks: number;
  breakthroughSuccesses: number;
  breakthroughFailures: number;
  canBreakthrough: boolean;
  breakthroughReady?: boolean;
  breakthroughReadiness?: {
    ready: boolean;
    missing: string[];
    targetRealmId: RealmId;
    reason: 'ready' | 'not_ready' | 'max_realm' | 'missing_requirement';
  };
  cultivationAttainment: number;
  mainMethodName: string;
  knownBattleArtCount: number;
  knownDivinePowerCount: number;
  canonicalState?: PlayerCultivationState;
  activeBuff?: string | null;
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
  buff: DivinationBuff;
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

export interface GetUserStatusOptions {
  includeTodayStats?: boolean;
}

export interface UserStatusResult {
  user: UserDocument | null;
  activeChain: TaskChainDocument | null;
  currentTask: ITask | undefined;
  todayStats?: DailyStatsDocument;
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
  task: ITask;
  user: UserDocument;
  wasChainBroken: boolean;
}

export interface CompleteMainTaskResult {
  mainChain: import('./models.js').MainChainDocument;
  task: ITask;
  user: UserDocument;
  wasChainBroken: boolean;
  cultivationReward: CultivationReward | null;
}
