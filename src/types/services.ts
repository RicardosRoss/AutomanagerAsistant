import type {
  DailyStatsDocument,
  ITask,
  TaskChainDocument,
  UserDocument
} from './models.js';

export interface FortuneEventResult {
  power: number;
  stones: number;
  message: string | null;
}

export interface CultivationReward {
  spiritualPower: number;
  immortalStones: number;
  bonus: number;
  fortuneEvent: FortuneEventResult | null;
  oldRealm?: string;
  newRealm: string;
  newStage: string;
  realmChanged: boolean;
  oldSpiritualPower?: number;
  newSpiritualPower: number;
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
