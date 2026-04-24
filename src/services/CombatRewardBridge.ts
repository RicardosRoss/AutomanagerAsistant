import type { CombatOutcomePatch } from '../types/cultivationCombat.js';

export function buildCombatOutcomePatch(input: {
  outcome: 'win' | 'loss' | 'narrow_win';
  encounterId: string;
  enemyName: string;
  summary: string;
  rewards: {
    spiritStoneDeltaOnWin: number;
    attainmentDeltaOnWin: number;
    obtainedDefinitionIdsOnWin: string[];
  };
  penalties: {
    injuryLevelOnLoss: 'light' | 'medium' | 'heavy';
    spiritStoneDeltaOnLoss: number;
  };
}): CombatOutcomePatch {
  if (input.outcome === 'loss') {
    return {
      spiritStoneDelta: input.penalties.spiritStoneDeltaOnLoss,
      cultivationAttainmentDelta: 0,
      obtainedDefinitionIds: [],
      injuryLevel: input.penalties.injuryLevelOnLoss,
      cooldownPatch: {}
    };
  }

  return {
    spiritStoneDelta: input.rewards.spiritStoneDeltaOnWin,
    cultivationAttainmentDelta: input.rewards.attainmentDeltaOnWin,
    obtainedDefinitionIds: [...input.rewards.obtainedDefinitionIdsOnWin],
    injuryLevel: 'none',
    cooldownPatch: {}
  };
}
