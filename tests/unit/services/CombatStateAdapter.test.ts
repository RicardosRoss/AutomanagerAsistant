import { describe, expect, test } from 'vitest';
import { buildPlayerCombatSnapshot } from '../../../src/services/CombatStateAdapter.js';

describe('CombatStateAdapter', () => {
  test('projects canonical state into a combat snapshot using battleLoadout first', () => {
    const snapshot = buildPlayerCombatSnapshot({
      realmId: 'realm.taixi',
      realmSubStageId: 'realmSubStage.taixi.qingyuan',
      currentPower: 60,
      cultivationAttainment: 8,
      branchCultivationAttainments: { neutral: 3 },
      mainMethodId: 'method.starter_tuna',
      mainDaoTrack: 'neutral',
      knownBattleArtIds: ['art.basic_guarding_hand', 'art.cloud_step'],
      equippedBattleArtIds: ['art.basic_guarding_hand', 'art.cloud_step'],
      knownDivinePowerIds: ['power.spirit_flash'],
      equippedDivinePowerIds: ['power.spirit_flash'],
      battleLoadout: {
        equippedBattleArtIds: ['art.cloud_step'],
        equippedDivinePowerIds: ['power.spirit_flash'],
        equippedArtifactIds: [],
        activeSupportArtId: null
      },
      injuryState: { level: 'light', modifiers: ['recent_loss'] }
    } as never);

    expect(snapshot.realmSubStageId).toBe('realmSubStage.taixi.qingyuan');
    expect(snapshot.battleArtIds).toEqual(['art.cloud_step']);
    expect(snapshot.divinePowerIds).toEqual([]);
    expect(snapshot.injuryLevel).toBe('light');
    expect(snapshot.dimensions.speed).toBeGreaterThan(snapshot.dimensions.defense);
  });

  test('falls back to canonical equipped battle arts when battleLoadout is empty', () => {
    const snapshot = buildPlayerCombatSnapshot({
      realmId: 'realm.taixi',
      realmSubStageId: 'realmSubStage.taixi.chengming',
      currentPower: 22,
      cultivationAttainment: 0,
      branchCultivationAttainments: {},
      mainMethodId: 'method.starter_tuna',
      mainDaoTrack: 'neutral',
      knownBattleArtIds: ['art.basic_guarding_hand'],
      equippedBattleArtIds: ['art.basic_guarding_hand'],
      knownDivinePowerIds: [],
      equippedDivinePowerIds: [],
      battleLoadout: {
        equippedBattleArtIds: [],
        equippedDivinePowerIds: [],
        equippedArtifactIds: [],
        activeSupportArtId: null
      },
      injuryState: { level: 'none', modifiers: [] }
    } as never);

    expect(snapshot.battleArtIds).toEqual(['art.basic_guarding_hand']);
    expect(snapshot.vitality).toBeGreaterThan(0);
  });

  test('filters divine powers out of pre-zifu snapshots even when they are known and equipped', () => {
    const snapshot = buildPlayerCombatSnapshot({
      realmId: 'realm.lianqi',
      realmSubStageId: 'realmSubStage.lianqi.4',
      currentPower: 240,
      cultivationAttainment: 10,
      branchCultivationAttainments: {},
      mainMethodId: 'method.starter_tuna',
      mainDaoTrack: 'neutral',
      knownBattleArtIds: ['art.basic_guarding_hand'],
      equippedBattleArtIds: ['art.basic_guarding_hand'],
      knownDivinePowerIds: ['power.spirit_flash'],
      equippedDivinePowerIds: ['power.spirit_flash'],
      battleLoadout: {
        equippedBattleArtIds: [],
        equippedDivinePowerIds: ['power.spirit_flash'],
        equippedArtifactIds: [],
        activeSupportArtId: null
      },
      injuryState: { level: 'none', modifiers: [] }
    } as never);

    expect(snapshot.divinePowerIds).toEqual([]);
  });

  test('applies runtime-ready divine power projection once the divine-power slot is unlocked', () => {
    const snapshot = buildPlayerCombatSnapshot({
      realmId: 'realm.zifu',
      realmSubStageId: 'realmSubStage.zifu.early',
      currentPower: 1200,
      cultivationAttainment: 10,
      branchCultivationAttainments: {},
      mainMethodId: 'method.starter_tuna',
      mainDaoTrack: 'neutral',
      knownBattleArtIds: ['art.basic_guarding_hand'],
      equippedBattleArtIds: ['art.basic_guarding_hand'],
      knownDivinePowerIds: ['power.invoking_heaven_gate'],
      equippedDivinePowerIds: ['power.invoking_heaven_gate'],
      battleLoadout: {
        equippedBattleArtIds: ['art.basic_guarding_hand'],
        equippedDivinePowerIds: ['power.invoking_heaven_gate'],
        equippedArtifactIds: [],
        activeSupportArtId: null
      },
      injuryState: { level: 'none', modifiers: [] }
    } as never);

    expect(snapshot.divinePowerIds).toEqual(['power.invoking_heaven_gate']);
    expect(snapshot.stability).toBeGreaterThan(12);
  });

  test('zifu four sub-stages produce increasing combat baselines', () => {
    const baseState = {
      realmId: 'realm.zifu',
      currentPower: 1120,
      cultivationAttainment: 20,
      branchCultivationAttainments: {},
      mainMethodId: 'method.zhuji_mingyang_script',
      mainDaoTrack: 'mingyang',
      knownBattleArtIds: ['art.basic_guarding_hand'],
      equippedBattleArtIds: ['art.basic_guarding_hand'],
      knownDivinePowerIds: ['power.invoking_heaven_gate'],
      equippedDivinePowerIds: ['power.invoking_heaven_gate'],
      battleLoadout: {
        equippedBattleArtIds: ['art.basic_guarding_hand'],
        equippedDivinePowerIds: ['power.invoking_heaven_gate'],
        equippedArtifactIds: [],
        activeSupportArtId: null
      },
      injuryState: { level: 'none', modifiers: [] }
    } as never;
    const early = buildPlayerCombatSnapshot({
      ...baseState,
      realmSubStageId: 'realmSubStage.zifu.early'
    });
    const perfect = buildPlayerCombatSnapshot({
      ...baseState,
      realmSubStageId: 'realmSubStage.zifu.perfect'
    });

    expect(perfect.dimensions.attack).toBeGreaterThan(early.dimensions.attack);
    expect(perfect.dimensions.defense).toBeGreaterThan(early.dimensions.defense);
    expect(perfect.dimensions.speed).toBeGreaterThan(early.dimensions.speed);
  });

  test('folds active support art into the snapshot loadout and bias calculation', () => {
    const baseState = {
      realmId: 'realm.taixi',
      realmSubStageId: 'realmSubStage.taixi.yujing',
      currentPower: 90,
      cultivationAttainment: 12,
      branchCultivationAttainments: {},
      mainMethodId: 'method.starter_tuna',
      mainDaoTrack: 'neutral',
      knownBattleArtIds: ['art.cloud_step', 'art.spirit_gathering_chant'],
      equippedBattleArtIds: ['art.cloud_step'],
      knownDivinePowerIds: [],
      equippedDivinePowerIds: [],
      battleLoadout: {
        equippedBattleArtIds: ['art.cloud_step'],
        equippedDivinePowerIds: [],
        equippedArtifactIds: [],
        activeSupportArtId: 'art.spirit_gathering_chant'
      },
      injuryState: { level: 'none', modifiers: [] }
    } as never;
    const snapshot = buildPlayerCombatSnapshot(baseState);
    const baseline = buildPlayerCombatSnapshot({
      ...baseState,
      battleLoadout: {
        ...baseState.battleLoadout,
        activeSupportArtId: null
      }
    });

    expect(snapshot.battleArtIds).toEqual([
      'art.cloud_step',
      'art.spirit_gathering_chant'
    ]);
    expect(snapshot.dimensions.sense).toBeGreaterThan(baseline.dimensions.sense);
  });

  test('does not project support or divine powers when the current slot limits are zero', () => {
    const snapshot = buildPlayerCombatSnapshot({
      realmId: 'realm.taixi',
      realmSubStageId: 'realmSubStage.taixi.xuanjing',
      currentPower: 10,
      cultivationAttainment: 3,
      branchCultivationAttainments: {},
      mainMethodId: 'method.starter_tuna',
      mainDaoTrack: 'neutral',
      knownBattleArtIds: ['art.basic_guarding_hand', 'art.spirit_gathering_chant'],
      equippedBattleArtIds: ['art.basic_guarding_hand'],
      knownDivinePowerIds: ['power.spirit_flash'],
      equippedDivinePowerIds: ['power.spirit_flash'],
      battleLoadout: {
        equippedBattleArtIds: ['art.basic_guarding_hand'],
        equippedDivinePowerIds: ['power.spirit_flash'],
        equippedArtifactIds: [],
        activeSupportArtId: 'art.spirit_gathering_chant'
      },
      injuryState: { level: 'none', modifiers: [] }
    } as never);

    expect(snapshot.battleArtIds).toEqual(['art.basic_guarding_hand']);
    expect(snapshot.divinePowerIds).toEqual([]);
  });

  test('applies dao-track specialization only to matching lineage content after zhuji', () => {
    const baseState = {
      realmId: 'realm.zifu',
      realmSubStageId: 'realmSubStage.zifu.early',
      currentPower: 1200,
      cultivationAttainment: 60,
      branchCultivationAttainments: {},
      mainMethodId: 'method.zhuji_mingyang_script',
      mainDaoTrack: 'universal',
      knownBattleArtIds: ['art.basic_guarding_hand'],
      equippedBattleArtIds: ['art.basic_guarding_hand'],
      knownDivinePowerIds: ['power.invoking_heaven_gate'],
      equippedDivinePowerIds: ['power.invoking_heaven_gate'],
      battleLoadout: {
        equippedBattleArtIds: ['art.basic_guarding_hand'],
        equippedDivinePowerIds: ['power.invoking_heaven_gate'],
        equippedArtifactIds: [],
        activeSupportArtId: null
      },
      injuryState: { level: 'none', modifiers: [] }
    } as never;

    const universal = buildPlayerCombatSnapshot(baseState);
    const matching = buildPlayerCombatSnapshot({
      ...baseState,
      mainDaoTrack: 'mingyang'
    });
    const mismatch = buildPlayerCombatSnapshot({
      ...baseState,
      mainDaoTrack: 'lihuo'
    });

    expect(matching.dimensions.attack).toBeGreaterThan(universal.dimensions.attack);
    expect(matching.dimensions.sense).toBeGreaterThan(universal.dimensions.sense);
    expect(mismatch.dimensions.attack).toBe(universal.dimensions.attack);
    expect(mismatch.dimensions.sense).toBe(universal.dimensions.sense);
  });

  test('does not apply dao-track specialization before zhuji even with matching lineage content', () => {
    const baseState = {
      realmId: 'realm.lianqi',
      realmSubStageId: 'realmSubStage.lianqi.4',
      currentPower: 240,
      cultivationAttainment: 60,
      branchCultivationAttainments: {},
      mainMethodId: 'method.zhuji_duijin_script',
      mainDaoTrack: 'universal',
      knownBattleArtIds: ['art.golden_light_art'],
      equippedBattleArtIds: ['art.golden_light_art'],
      knownDivinePowerIds: [],
      equippedDivinePowerIds: [],
      battleLoadout: {
        equippedBattleArtIds: ['art.golden_light_art'],
        equippedDivinePowerIds: [],
        equippedArtifactIds: [],
        activeSupportArtId: null
      },
      injuryState: { level: 'none', modifiers: [] }
    } as never;

    const universal = buildPlayerCombatSnapshot(baseState);
    const matching = buildPlayerCombatSnapshot({
      ...baseState,
      mainDaoTrack: 'duijin'
    });

    expect(matching.dimensions.attack).toBe(universal.dimensions.attack);
    expect(matching.dimensions.defense).toBe(universal.dimensions.defense);
  });
});
