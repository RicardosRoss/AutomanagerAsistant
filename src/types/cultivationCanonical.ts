import type {
  BattleLoadoutState,
  CombatHistorySummaryEntry,
} from './cultivationV2.js';
import type { PendingEncounterOfferState } from './cultivationCombat.js';

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

export type SpecializedLineageId = Exclude<LineageId, 'universal'>;

export type BreakthroughTransitionId =
  | 'taixi_to_lianqi'
  | 'lianqi_to_zhuji'
  | 'zhuji_to_zifu'
  | 'zifu_divine_power'
  | 'zifu_to_jindan';

export type BreakthroughAttemptKind =
  | 'realm_zhuji_to_zifu'
  | 'zifu_divine_power'
  | 'realm_zifu_to_jindan';

export interface FoundationDefinition {
  id: string;
  name: string;
  mainDaoTrack: SpecializedLineageId;
  firstDivinePowerId: string;
}

export interface DivinePowerBreakthroughRequirement {
  id: string;
  targetPowerOrdinal: 2 | 3 | 4 | 5;
  requiredPower: number;
  requiredAttainment: number;
  requiredItems: Array<{ definitionId: string; count: number }>;
}

export type BreakthroughGateId =
  | 'lift_foundation'
  | 'cross_illusion'
  | 'gestate_power'
  | 'enter_taixu'
  | 'shape_aux_foundation'
  | 'gestate_target_power';

export interface BreakthroughGateResolution {
  id: BreakthroughGateId;
  passed: boolean;
  requiredPower?: number;
  requiredAttainment?: number;
  consumedDefinitionIds?: string[];
}

export interface MainMethodZhujiOutcome {
  foundationId: string;
  mainDaoTrack: SpecializedLineageId;
  continuationMethodId: string;
  grade: number;
  traitPool?: string[];
}

export interface BreakthroughMethodDefinition {
  id: string;
  name: string;
  applicableTransition: BreakthroughTransitionId;
  successRateBonus: number;
  stabilityDelta: number;
  requiredItems: Array<{ definitionId: string; count: number }>;
  requiredEnvironment?: string[];
  extraCosts?: {
    lifespanLoss?: number;
    moralityCost?: number;
    vitalityCost?: number;
  };
  sideEffects?: string[];
  bonusOutcomeIds?: string[];
  compatibility?: {
    requiresFoundation?: boolean;
    allowedLineages?: SpecializedLineageId[];
    excludedLineages?: SpecializedLineageId[];
    minMethodGrade?: number;
    requiredKnownPowerIds?: string[];
  };
  jindanRoute?: {
    pathType:
      | 'direct_gold'
      | 'same_three_different_two'
      | 'same_four_different_one'
      | 'runyang'
      | 'runyin'
      | 'side_path';
    requiredPowerPattern?: {
      sameLineageCount?: number;
      differentLineageCount?: number;
      requiredPowerIds?: string[];
    };
    resultGoldNatureTag: string;
    failureRisk: 'low' | 'medium' | 'high' | 'catastrophic';
  };
}

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

export type DevEncounterType = 'none' | 'stones' | 'item' | 'combat' | 'offer';

export interface DevEncounterScript {
  type: DevEncounterType;
  remainingUses: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CombatFlagsState {
  devEncounterScript?: DevEncounterScript;
  pendingEncounterOffer?: PendingEncounterOfferState;
  [key: string]:
    | boolean
    | string
    | number
    | DevEncounterScript
    | PendingEncounterOfferState
    | undefined;
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

export interface CanonicalCombatBias {
  attack: number;
  defense: number;
  sense: number;
  speed: number;
}

export interface CanonicalMainMethod extends BaseDefinition {
  category: 'main_method';
  grade: number;
  cultivationMultiplier: number;
  combatBias: CanonicalCombatBias;
  foundationAffinity: string[];
  artSlotsBonus: number;
  divinePowerSlotsBonus: number;
  breakthroughAssist: string[];
  requiredAura: string[];
  lineageTag?: SpecializedLineageId;
  zhujiOutcome?: MainMethodZhujiOutcome;
  zifuPowerCoverage?: {
    candidatePowerIds: string[];
    maxPowerCount: 5;
  };
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
