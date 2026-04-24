import { describe, expect, test } from 'vitest';
import {
  COMBAT_BALANCE,
  buildGuardianEncounter,
  formatEncounterRiskTierLabel,
  formatCombatOutcomeLabel,
  formatGuardianStyleLabel,
  formatInjuryLevelLabel,
  getCombatEncounterById,
  getEncounterLootById,
  getEnemyTemplateById
} from '../../../src/config/xuanjianCombat.js';

describe('xuanjian combat config', () => {
  test('uses the expected starter combat balance max rounds', () => {
    expect(COMBAT_BALANCE.maxRounds).toBe(5);
  });

  test('exposes all taixi enemy templates and encounter mappings', () => {
    const contracts: Array<{ enemyId: string; encounterId: string; realmSubStageId: string }> = [
      {
        enemyId: 'enemy.taixi.roadside_wolf',
        encounterId: 'combatEncounter.taixi.roadside_wolf',
        realmSubStageId: 'realmSubStage.taixi.qingyuan'
      },
      {
        enemyId: 'enemy.taixi.stonehide_boar',
        encounterId: 'combatEncounter.taixi.stonehide_boar',
        realmSubStageId: 'realmSubStage.taixi.yujing'
      },
      {
        enemyId: 'enemy.taixi.shadow_marten',
        encounterId: 'combatEncounter.taixi.shadow_marten',
        realmSubStageId: 'realmSubStage.taixi.qingyuan'
      },
      {
        enemyId: 'enemy.taixi.mist_crow',
        encounterId: 'combatEncounter.taixi.mist_crow',
        realmSubStageId: 'realmSubStage.taixi.lingchu'
      }
    ];

    for (const contract of contracts) {
      expect(getEnemyTemplateById(contract.enemyId)).toMatchObject({
        id: contract.enemyId,
        realmId: 'realm.taixi',
        realmSubStageId: contract.realmSubStageId
      });

      expect(getCombatEncounterById(contract.encounterId)).toMatchObject({
        id: contract.encounterId,
        enemyTemplateId: contract.enemyId
      });
    }

    expect(getCombatEncounterById('combatEncounter.taixi.roadside_wolf')).toMatchObject({
      rewards: { spiritStoneDeltaOnWin: 3, attainmentDeltaOnWin: 1 },
      penalties: { injuryLevelOnLoss: 'light', spiritStoneDeltaOnLoss: -2 }
    });
  });

  test('formats combat outcome and injury labels for starter contract', () => {
    expect(formatCombatOutcomeLabel('narrow_win')).toBe('险胜');
    expect(formatInjuryLevelLabel('light')).toBe('轻伤');
  });

  test('builds guardian encounters from shared prototypes and loot tiers', () => {
    const built = buildGuardianEncounter({
      prototypeId: 'guardian.hybrid',
      realmId: 'realm.zhuji',
      realmSubStageId: 'realmSubStage.zhuji.middle',
      lootTier: '地',
      seed: 7
    });

    expect(built.enemy.realmId).toBe('realm.zhuji');
    expect(built.enemy.realmSubStageId).toBe('realmSubStage.zhuji.middle');
    expect(built.enemy.tags).toContain('elite');
    expect(built.guardianStyle).toBe('hybrid');
    expect(built.riskTier).toBe('deadly');
    expect(built.encounter.id).toContain('guardian.hybrid');

    expect(getEncounterLootById('loot.scroll.returning_origin_shield')).toMatchObject({
      id: 'loot.scroll.returning_origin_shield',
      tier: '玄',
      grantMode: 'deferred_battle_art',
      contentId: 'art.returning_origin_shield'
    });

    expect(formatEncounterRiskTierLabel('deadly')).toBe('极险');
    expect(formatGuardianStyleLabel('hybrid')).toBe('混成');
  });
});
