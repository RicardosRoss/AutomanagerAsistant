export type CultivationDifficulty = 'easy' | 'medium' | 'hard' | 'very_hard' | 'extreme' | 'ascension';

export interface RealmStage {
  name: string;
  progress: readonly [number, number];
  bonus: number;
}

export interface BreakthroughConfig {
  difficulty: CultivationDifficulty;
  successRate: number;
  failurePenalty: number;
  message: string;
}

export interface CultivationRealm {
  id: number;
  name: string;
  nameEn: string;
  minPower: number;
  maxPower: number;
  title: string;
  emoji: string;
  color: string;
  description: string;
  cultivationBonus: number;
  breakthrough: BreakthroughConfig;
}

export interface BaguaDivination {
  name: string;
  meaning: string;
  multiplier: number;
  emoji: string;
  color: string;
}

export interface FortuneRewardPower {
  type: 'power';
  amount?: number;
  multiplier?: number;
}

export interface FortuneRewardStones {
  type: 'stones';
  amount: number;
}

export interface FortuneRewardBoth {
  type: 'both';
  power: number;
  stones: number;
}

export type FortuneReward = FortuneRewardPower | FortuneRewardStones | FortuneRewardBoth;

export interface FortuneEvent {
  id: string;
  name: string;
  probability: number;
  reward: FortuneReward;
  message: string;
}

export interface RealmDisplay {
  realm: CultivationRealm;
  stage: RealmStage;
  fullName: string;
  title: string;
  progress: number;
  nextRealmProgress: number | null;
}

export type {
  BaseDefinition,
  InventoryInstance,
  PlayerCultivationState,
  RealmId
} from './cultivationCanonical.js';
