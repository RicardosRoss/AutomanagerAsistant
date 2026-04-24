import { buildGuardianEncounter, getCombatEncounterById, getEnemyTemplateById } from '../config/xuanjianCombat.js';
import type { CombatEncounterDefinition, PendingEncounterOfferState } from '../types/cultivationCombat.js';
import type { IUserCultivationCanonical } from '../types/models.js';
import { buildPlayerCombatSnapshot } from './CombatStateAdapter.js';
import { resolveCombat } from './CombatResolver.js';
import { buildCombatOutcomePatch } from './CombatRewardBridge.js';

class CombatService {
  private resolveEncounterCombatDefinition(input: {
    canonical: IUserCultivationCanonical;
    encounter: CombatEncounterDefinition;
    enemyTemplate: {
      id: string;
      name: string;
      realmId: IUserCultivationCanonical['state']['realmId'];
      realmSubStageId: string;
      currentPower: number;
      dimensions: {
        attack: number;
        defense: number;
        sense: number;
        speed: number;
      };
      tags: string[];
    };
    seed: number;
  }) {
    const player = buildPlayerCombatSnapshot(input.canonical.state);
    const enemy = {
      side: 'enemy' as const,
      realmId: input.enemyTemplate.realmId,
      realmSubStageId: input.enemyTemplate.realmSubStageId,
      currentPower: input.enemyTemplate.currentPower,
      dimensions: input.enemyTemplate.dimensions,
      vitality: 16,
      stability: 8,
      battleArtIds: ['art.cloud_step'],
      divinePowerIds: [],
      injuryLevel: 'none' as const,
      tags: [...input.enemyTemplate.tags]
    };

    const resolution = resolveCombat({
      encounterId: input.encounter.id,
      player,
      enemy,
      seed: input.seed
    });
    const normalizedResolution = {
      ...resolution,
      enemyName: input.enemyTemplate.name
    };
    const patch = buildCombatOutcomePatch({
      outcome: normalizedResolution.outcome,
      encounterId: input.encounter.id,
      enemyName: normalizedResolution.enemyName,
      summary: normalizedResolution.summary,
      rewards: input.encounter.rewards,
      penalties: input.encounter.penalties
    });

    return {
      encounter: input.encounter,
      resolution: normalizedResolution,
      patch
    };
  }

  resolveEncounterCombat(input: {
    canonical: IUserCultivationCanonical;
    combatEncounterId: string;
    seed: number;
  }) {
    const encounter = getCombatEncounterById(input.combatEncounterId);
    if (!encounter) {
      throw new Error(`未找到奇遇战模板: ${input.combatEncounterId}`);
    }

    const enemyTemplate = getEnemyTemplateById(encounter.enemyTemplateId);
    if (!enemyTemplate) {
      throw new Error(`未找到敌方模板: ${encounter.enemyTemplateId}`);
    }

    return this.resolveEncounterCombatDefinition({
      canonical: input.canonical,
      encounter,
      enemyTemplate,
      seed: input.seed
    });
  }

  resolveGeneratedEncounterCombat(input: {
    canonical: IUserCultivationCanonical;
    offer: PendingEncounterOfferState;
    seed: number;
  }) {
    const generated = buildGuardianEncounter({
      prototypeId: input.offer.guardianStyle === 'guard'
        ? 'guardian.guard'
        : input.offer.guardianStyle === 'movement'
          ? 'guardian.movement'
          : input.offer.guardianStyle === 'sense'
            ? 'guardian.sense'
            : input.offer.guardianStyle === 'hybrid'
              ? 'guardian.hybrid'
              : 'guardian.rush',
      realmId: input.canonical.state.realmId,
      realmSubStageId: input.canonical.state.realmSubStageId,
      lootTier: input.offer.lootTier,
      seed: input.seed
    });

    return this.resolveEncounterCombatDefinition({
      canonical: input.canonical,
      encounter: generated.encounter,
      enemyTemplate: generated.enemy,
      seed: input.seed
    });
  }
}

export default CombatService;
