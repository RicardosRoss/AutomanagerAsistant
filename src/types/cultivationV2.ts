import type { LineageId } from './cultivationCanonical.js';

/**
 * V2 inert type extensions for Xuanjian active combat.
 *
 * These types exist at the type level only — no V1 behaviour reads or writes
 * these fields.  They are added to PlayerCultivationState so that downstream
 * adapters and tests can reference them without casting.
 */

export interface BattleLoadoutState {
  equippedBattleArtIds: string[];
  equippedDivinePowerIds: string[];
  equippedArtifactIds: string[];
  activeSupportArtId: string | null;
}

export interface CombatHistorySummaryEntry {
  encounterId: string;
  result: 'win' | 'loss' | 'narrow_win';
  happenedAt: Date;
  summary: string;
  enemyName?: string;
}

export interface RuntimeReadyBattleArtProfile {
  definitionId: string;
  lineageTag?: LineageId;
  balanceProfile: {
    version: 1;
    attackWeight: number;
    defenseWeight: number;
    senseWeight: number;
    speedWeight: number;
  };
  actionProfile: {
    actionType: 'attack' | 'guard' | 'movement' | 'support';
    tags: string[];
  };
}

export interface RuntimeReadyDivinePowerProfile {
  definitionId: string;
  lineageTag?: LineageId;
  balanceProfile: {
    version: 1;
    attackWeight: number;
    defenseWeight: number;
    senseWeight: number;
    speedWeight: number;
    stabilityWeight: number;
  };
  actionProfile: {
    actionType: 'burst' | 'control' | 'ward' | 'domain';
    tags: string[];
  };
}
