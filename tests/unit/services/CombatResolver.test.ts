import { describe, expect, test } from 'vitest';
import {
  buildOutcomeSummary,
  buildRuntimeReadyActionPool,
  resolveCombat
} from '../../../src/services/CombatResolver.js';

const player = {
  side: 'player',
  realmId: 'realm.taixi',
  realmSubStageId: 'realmSubStage.taixi.qingyuan',
  currentPower: 60,
  dimensions: { attack: 12, defense: 10, sense: 9, speed: 11 },
  vitality: 32,
  stability: 12,
  battleArtIds: ['art.cloud_step'],
  divinePowerIds: [],
  injuryLevel: 'none',
  tags: ['neutral']
} as const;

const enemy = {
  side: 'enemy',
  realmId: 'realm.taixi',
  realmSubStageId: 'realmSubStage.taixi.qingyuan',
  currentPower: 72,
  dimensions: { attack: 8, defense: 6, sense: 5, speed: 8 },
  vitality: 24,
  stability: 8,
  battleArtIds: ['art.cloud_step'],
  divinePowerIds: [],
  injuryLevel: 'none',
  tags: ['rush']
} as const;

describe('CombatResolver', () => {
  test('returns a reproducible result under the same seed', () => {
    const first = resolveCombat({ encounterId: 'combatEncounter.taixi.roadside_wolf', player, enemy, seed: 42 });
    const second = resolveCombat({ encounterId: 'combatEncounter.taixi.roadside_wolf', player, enemy, seed: 42 });

    expect(first).toEqual(second);
    expect(first.outcome).toBe('win');
    expect(first.firstStrike).toBe('player');
  });

  test('a weaker player can deterministically lose', () => {
    const weakened = {
      ...player,
      dimensions: { attack: 5, defense: 4, sense: 4, speed: 4 },
      vitality: 18
    };

    const result = resolveCombat({ encounterId: 'combatEncounter.taixi.roadside_wolf', player: weakened, enemy, seed: 7 });
    expect(result.outcome).toBe('loss');
  });

  test('action decision should be driven by battle-art/divine-power action profiles', () => {
    const playerWithProfiles = {
      ...player,
      battleArtIds: ['art.flowing_shadow_step'],
      divinePowerIds: ['power.binding_mist']
    };

    const result = resolveCombat({
      encounterId: 'combatEncounter.taixi.roadside_wolf',
      player: playerWithProfiles,
      enemy,
      seed: 42
    });
    const playerActions = result.rounds.filter((item) => item.actor === 'player').map((item) => item.action);

    expect(playerActions.length).toBeGreaterThan(0);
    expect(playerActions.every((action) => action === 'movement' || action === 'control')).toBe(true);
  });

  test('builds action pool from runtime-ready batch and ignores pending entries', () => {
    const actionPool = buildRuntimeReadyActionPool({
      ...player,
      battleArtIds: ['art.crimson_split_spear', 'art.spirit_gathering_chant'],
      divinePowerIds: ['power.void_breaking_ray', 'power.binding_mist']
    });

    expect(actionPool).toEqual(['support', 'control']);
  });

  test('builds different formal summaries for movement-first and attack-first wins', () => {
    const movementSummary = buildOutcomeSummary({
      outcome: 'win',
      firstAction: 'movement',
      enemyTags: ['movement']
    });
    const attackSummary = buildOutcomeSummary({
      outcome: 'win',
      firstAction: 'attack',
      enemyTags: ['rush']
    });

    expect(movementSummary).not.toBe(attackSummary);
    expect(movementSummary).toContain('身法');
    expect(attackSummary).toContain('先声夺人');
  });
});
