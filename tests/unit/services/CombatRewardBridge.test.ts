import { describe, expect, test } from 'vitest';
import { buildCombatOutcomePatch } from '../../../src/services/CombatRewardBridge.js';

describe('CombatRewardBridge', () => {
  test('maps a win into rewards and a clean history summary', () => {
    const patch = buildCombatOutcomePatch({
      outcome: 'win',
      encounterId: 'combatEncounter.taixi.roadside_wolf',
      enemyName: '拦路青狼',
      summary: '你以云步抢得先手，数合后斩退青狼。',
      rewards: { spiritStoneDeltaOnWin: 3, attainmentDeltaOnWin: 1, obtainedDefinitionIdsOnWin: [] },
      penalties: { injuryLevelOnLoss: 'light', spiritStoneDeltaOnLoss: -2 }
    });

    expect(patch.spiritStoneDelta).toBe(3);
    expect(patch.cultivationAttainmentDelta).toBe(1);
    expect(patch.injuryLevel).toBe('none');
  });

  test('maps a loss into injury and resource loss', () => {
    const patch = buildCombatOutcomePatch({
      outcome: 'loss',
      encounterId: 'combatEncounter.taixi.roadside_wolf',
      enemyName: '拦路青狼',
      summary: '你被青狼逼退，只得仓皇后撤。',
      rewards: { spiritStoneDeltaOnWin: 3, attainmentDeltaOnWin: 1, obtainedDefinitionIdsOnWin: [] },
      penalties: { injuryLevelOnLoss: 'light', spiritStoneDeltaOnLoss: -2 }
    });

    expect(patch.spiritStoneDelta).toBe(-2);
    expect(patch.cultivationAttainmentDelta).toBe(0);
    expect(patch.injuryLevel).toBe('light');
  });
});
