import type {
  BattleLoadoutState,
  CombatHistorySummaryEntry,
} from './cultivationV2.js';

export type RealmId =
  | 'realm.taixi'
  | 'realm.lianqi'
  | 'realm.zhuji'
  | 'realm.zifu'
  | 'realm.jindan'
  | 'realm.yuanying';

export type LineageId =
  | 'universal'
  | 'mingyang'
  | 'zhengmu'
  | 'pinshui'
  | 'lihuo'
  | 'duijin';

/**
 * 占卜产生的临时增益/减益，下次专注后消耗。
 * 设计文档: xuanjian-encounter-codex.md §DivinationBuff
 */
export interface DivinationBuff {
  encounterBonus: number;
  qualityBonus: number;
  expiresAfterNextFocus: true;
  label: string;
  description: string;
}

export type DevEncounterType = 'none' | 'stones' | 'item' | 'combat';

export interface DevEncounterScript {
  type: DevEncounterType;
  remainingUses: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CombatFlagsState {
  devEncounterScript?: DevEncounterScript;
  [key: string]: boolean | string | number | DevEncounterScript | undefined;
}

export interface BaseDefinition {
  id: string;
  name: string;
  category: string;
  tier: '凡' | '黄' | '玄' | '地';
  realmFloor: RealmId;
  realmCeiling: RealmId;
  source: string;
  tags: string[];
  dropScope: 'common' | 'heritage' | 'majorFortune' | 'breakthroughOnly' | 'npcOnly';
  enabledInV1: boolean;
  reservedForV2: boolean;
}

export interface PlayerCultivationState {
  realmId: RealmId;
  currentPower: number;
  mainMethodId: string;
  mainDaoTrack: string;
  cultivationAttainment: number;
  foundationId: string;
  knownBattleArtIds: string[];
  equippedBattleArtIds: string[];
  knownDivinePowerIds: string[];
  equippedDivinePowerIds: string[];
  equipmentLoadout: Record<string, string>;
  inventoryItemIds: string[];
  injuryState: {
    level: 'none' | 'light' | 'medium' | 'heavy';
    points: number;
    modifiers: string[];
  };
  focusStreak: number;
  lastCultivationAt: Date | null;
  pendingDivinationBuff: DivinationBuff | null;
  schemaVersion: 1;
  // ── V2 inert fields (active-combat phase A) ──────────────────────────────
  realmSubStageId: string;
  branchCultivationAttainments: Record<string, number>;
  battleLoadout: BattleLoadoutState;
  cooldowns: Record<string, number>;
  combatFlags: CombatFlagsState;
  combatHistorySummary: CombatHistorySummaryEntry[];
}

export interface InventoryInstance {
  instanceId: string;
  definitionId: string;
  obtainedAt: Date;
  sourceType: 'focus' | 'encounter' | 'migration' | 'admin';
  bound: boolean;
  used: boolean;
  stackCount: number;
  instanceMeta: Record<string, string | number | boolean | null>;
}
