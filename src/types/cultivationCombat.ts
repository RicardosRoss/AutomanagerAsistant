import type { RealmId } from './cultivationCanonical.js';

export type CombatOutcome = 'win' | 'loss' | 'narrow_win';
export type InjuryLevel = 'none' | 'light' | 'medium' | 'heavy';
export type EncounterRiskTier = 'ordinary' | 'tough' | 'dangerous' | 'deadly';
export type GuardianStyle = 'rush' | 'guard' | 'movement' | 'sense' | 'hybrid';
export type EncounterLootTier = '凡' | '黄' | '玄' | '地';
export type EncounterLootGrantMode = 'inventory' | 'deferred_battle_art' | 'deferred_divine_power';
export type CombatActionType =
  | 'attack'
  | 'guard'
  | 'movement'
  | 'support'
  | 'burst'
  | 'control'
  | 'ward'
  | 'domain';

export interface CombatDimensions {
  attack: number;
  defense: number;
  sense: number;
  speed: number;
}

export interface CombatantSnapshot {
  side: 'player' | 'enemy';
  realmId: RealmId;
  realmSubStageId: string;
  currentPower: number;
  dimensions: CombatDimensions;
  vitality: number;
  stability: number;
  battleArtIds: string[];
  divinePowerIds: string[];
  injuryLevel: InjuryLevel;
  tags: string[];
}

export interface EncounterOfferSummary {
  offerId: string;
  lootDefinitionId: string;
  lootDisplayName: string;
  lootTier: EncounterLootTier;
  guardianStyle: GuardianStyle;
  riskTier: EncounterRiskTier;
  guardianEncounterId: string;
  guardianName: string;
}

export interface PendingEncounterOfferState extends EncounterOfferSummary {
  createdAt: Date;
  grantMode: EncounterLootGrantMode;
  obtainedDefinitionIdsOnWin: string[];
  deferredContentId?: string;
}

export const INJURY_LEVEL_VALUES = {
  none: 0,
  light: 1,
  medium: 2,
  heavy: 3
} as const satisfies Record<InjuryLevel, number>;

export const INJURY_POINTS_CAP = INJURY_LEVEL_VALUES.heavy;

export const INJURY_OVERFLOW_POWER_LOSS_RATE = 0.05;

export const INJURY_RECOVERY_BY_DURATION = [
  { minDuration: 120, recoveryPoints: 3 },
  { minDuration: 90, recoveryPoints: 2 },
  { minDuration: 60, recoveryPoints: 1 }
] as const;

export function getInjuryPointsForLevel(level: InjuryLevel): number {
  return INJURY_LEVEL_VALUES[level];
}

export function getInjuryLevelByPoints(points: number): InjuryLevel {
  if (!Number.isFinite(points) || points <= 0) return 'none';
  if (points >= INJURY_LEVEL_VALUES.heavy) return 'heavy';
  if (points >= INJURY_LEVEL_VALUES.medium) return 'medium';
  if (points >= INJURY_LEVEL_VALUES.light) return 'light';
  return 'none';
}

export function normalizeInjuryPoints(points: number | undefined, level: InjuryLevel): number {
  if (Number.isFinite(points)) {
    return Math.max(0, Math.min(INJURY_POINTS_CAP, Math.floor(points as number)));
  }

  return getInjuryPointsForLevel(level);
}

export function normalizeInjuryState(input?: {
  level?: InjuryLevel;
  points?: number;
  modifiers?: string[];
}) {
  const level = input?.level ?? 'none';
  const pointsFromLevel = getInjuryPointsForLevel(level);
  const normalizedPoints = normalizeInjuryPoints(input?.points, level);
  const points = Math.max(pointsFromLevel, normalizedPoints);

  return {
    level: getInjuryLevelByPoints(points),
    points,
    modifiers: [...(input?.modifiers ?? [])]
  };
}

export function getInjuryRecoveryPoints(duration: number): number {
  if (!Number.isFinite(duration)) {
    return 0;
  }

  const matched = INJURY_RECOVERY_BY_DURATION.find((entry) => duration >= entry.minDuration);
  return matched?.recoveryPoints ?? 0;
}

export function getInjuryOverflowPowerLoss(currentPower: number, overflowPoints: number): number {
  if (!Number.isFinite(currentPower) || currentPower <= 0 || overflowPoints <= 0) {
    return 0;
  }

  return Math.floor(currentPower * overflowPoints * INJURY_OVERFLOW_POWER_LOSS_RATE);
}

export interface CombatEncounterDefinition {
  id: string;
  enemyTemplateId: string;
  maxRounds: number;
  rewards: {
    spiritStoneDeltaOnWin: number;
    attainmentDeltaOnWin: number;
    obtainedDefinitionIdsOnWin: string[];
  };
  penalties: {
    injuryLevelOnLoss: Exclude<InjuryLevel, 'none'>;
    spiritStoneDeltaOnLoss: number;
  };
}

export interface CombatResolution {
  encounterId: string;
  outcome: CombatOutcome;
  enemyName: string;
  firstStrike: 'player' | 'enemy';
  rounds: Array<{
    round: number;
    actor: 'player' | 'enemy';
    action: CombatActionType;
    damage: number;
  }>;
  summary: string;
}

export interface CombatOutcomePatch {
  spiritStoneDelta: number;
  cultivationAttainmentDelta: number;
  obtainedDefinitionIds: string[];
  injuryLevel: InjuryLevel;
  cooldownPatch: Record<string, number>;
}
