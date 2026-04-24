import { describe, expect, test } from 'vitest';
import {
  createDefaultBattleLoadoutState,
  getRealmSubStageById,
  getRealmSubStagesByRealmId,
  getBattleArtRegistryEntry,
  getBattleSlotLimits,
  getBattleArtRegistryEntries,
  getDivinePowerRegistryEntry,
  getDivinePowerRegistryEntries,
  getStarterBattleArtIds,
  getRuntimeReadyContentBatch,
  projectBattleArtRuntimeProfile,
  projectDivinePowerRuntimeProfile,
  projectCombatLoadout
} from '../../../src/config/xuanjianV2Registry.js';

describe('xuanjian V2 registry', () => {
  test('exposes shared starter battle-art seeds and default battle loadout', () => {
    expect(getStarterBattleArtIds()).toEqual([
      'art.basic_guarding_hand',
      'art.cloud_step'
    ]);
    expect(createDefaultBattleLoadoutState()).toEqual({
      equippedBattleArtIds: ['art.basic_guarding_hand'],
      equippedDivinePowerIds: [],
      equippedArtifactIds: [],
      activeSupportArtId: null
    });
  });

  test('exposes full phase-B sub-stage seeds for taixi, lianqi, and zhuji', () => {
    expect(getRealmSubStagesByRealmId('realm.taixi').map((item) => item.label)).toEqual([
      '玄景', '承明', '周行', '青元', '玉京', '灵初'
    ]);
    expect(getRealmSubStagesByRealmId('realm.lianqi')).toHaveLength(9);
    expect(getRealmSubStagesByRealmId('realm.zhuji').map((item) => item.label)).toEqual([
      '初层', '中层', '后层'
    ]);
    expect(getRealmSubStageById('realmSubStage.taixi.qingyuan')?.displayName).toBe('胎息·青元');
  });

  test('projects a V1 battle art into runtime-ready shape without enabling combat resolver semantics', () => {
    const entry = getBattleArtRegistryEntry('art.basic_guarding_hand');
    expect(entry?.runtimeReady).toBe(true);

    const runtimeProfile = projectBattleArtRuntimeProfile('art.basic_guarding_hand');
    expect(runtimeProfile.definitionId).toBe('art.basic_guarding_hand');
    expect(runtimeProfile.actionProfile.actionType).toBe('guard');
    expect(runtimeProfile.balanceProfile.version).toBe(1);
  });

  test('keeps runtime-ready and pending entries in the same registry but only projects ready entries', () => {
    const arts = getBattleArtRegistryEntries();
    expect(arts.length).toBeGreaterThanOrEqual(6);
    expect(arts.some((entry) => entry.runtimeReady)).toBe(true);
    expect(arts.some((entry) => !entry.runtimeReady)).toBe(true);
    expect(() => projectBattleArtRuntimeProfile('art.crimson_split_spear')).toThrow(/not found/);
  });

  test('projects divine power runtime profile and filters non-ready entries', () => {
    const powers = getDivinePowerRegistryEntries();
    expect(powers.length).toBeGreaterThanOrEqual(4);
    expect(powers.some((entry) => entry.runtimeReady)).toBe(true);
    expect(powers.some((entry) => !entry.runtimeReady)).toBe(true);

    const profile = projectDivinePowerRuntimeProfile('power.spirit_flash');
    expect(profile.actionProfile.actionType).toBe('burst');
    expect(profile.balanceProfile.version).toBe(1);
    expect(() => projectDivinePowerRuntimeProfile('power.void_breaking_ray')).toThrow(/not found/);
  });

  test('exposes lineageTag for lineaged runtime-ready battle arts and keeps starter arts undefined', () => {
    expect(projectBattleArtRuntimeProfile('art.golden_light_art').lineageTag).toBe('duijin');
    expect(projectBattleArtRuntimeProfile('art.fire_sparrow_art').lineageTag).toBe('lihuo');
    expect(projectBattleArtRuntimeProfile('art.clear_eye_spirit_gaze').lineageTag).toBe('pinshui');
    expect(projectBattleArtRuntimeProfile('art.heart_cauldron_dispel').lineageTag).toBe('zhengmu');
    expect(projectBattleArtRuntimeProfile('art.basic_guarding_hand').lineageTag).toBeUndefined();
  });

  test('exposes lineageTag for lineaged runtime-ready divine powers and keeps starter powers undefined', () => {
    expect(projectDivinePowerRuntimeProfile('power.invoking_heaven_gate').lineageTag).toBe('mingyang');
    expect(projectDivinePowerRuntimeProfile('power.orderly_conquest').lineageTag).toBe('lihuo');
    expect(projectDivinePowerRuntimeProfile('power.rank_from_luo').lineageTag).toBe('duijin');
    expect(projectDivinePowerRuntimeProfile('power.spirit_flash').lineageTag).toBeUndefined();
  });

  test('exposes zifu acquisition metadata for seeded divine powers', () => {
    expect(getDivinePowerRegistryEntry('power.clear_heart')?.zifuAcquisition).toEqual({
      minExistingPowerCount: 1,
      proofRequirementIds: ['proof.mingyang_fate_anchor']
    });
  });

  test('keeps first-wave lineage tags in registry entries, including pending content', () => {
    expect(getBattleArtRegistryEntry('art.golden_light_art')?.lineageTag).toBe('duijin');
    expect(getBattleArtRegistryEntry('art.fire_sparrow_art')?.lineageTag).toBe('lihuo');
    expect(getBattleArtRegistryEntry('art.clear_eye_spirit_gaze')?.lineageTag).toBe('pinshui');
    expect(getBattleArtRegistryEntry('art.heart_cauldron_dispel')?.lineageTag).toBe('zhengmu');
    expect(getBattleArtRegistryEntry('art.crimson_split_spear')?.lineageTag).toBe('mingyang');
    expect(getBattleArtRegistryEntry('art.basic_guarding_hand')?.lineageTag).toBeUndefined();

    const powerById = new Map(getDivinePowerRegistryEntries().map((entry) => [entry.id, entry]));
    expect(powerById.get('power.invoking_heaven_gate')?.lineageTag).toBe('mingyang');
    expect(powerById.get('power.orderly_conquest')?.lineageTag).toBe('lihuo');
    expect(powerById.get('power.rank_from_luo')?.lineageTag).toBe('duijin');
  });

  test('projects combat loadout with fallback and runtime-ready filtering', () => {
    const projection = projectCombatLoadout({
      realmId: 'realm.taixi',
      realmSubStageId: 'realmSubStage.taixi.qingyuan',
      currentPower: 60,
      cultivationAttainment: 2,
      branchCultivationAttainments: {},
      mainMethodId: 'method.starter_tuna',
      mainDaoTrack: 'neutral',
      knownBattleArtIds: ['art.basic_guarding_hand', 'art.crimson_split_spear'],
      equippedBattleArtIds: ['art.crimson_split_spear'],
      knownDivinePowerIds: ['power.spirit_flash', 'power.void_breaking_ray'],
      equippedDivinePowerIds: ['power.spirit_flash', 'power.void_breaking_ray'],
      battleLoadout: {
        equippedBattleArtIds: [],
        equippedDivinePowerIds: [],
        equippedArtifactIds: [],
        activeSupportArtId: null
      },
      injuryState: { level: 'none', modifiers: [] }
    } as never);

    expect(projection.battleArtIds).toEqual(['art.basic_guarding_hand']);
    expect(projection.divinePowerIds).toEqual([]);
  });

  test('includes active support art in runtime projection when unlocked and runtime-ready', () => {
    const projection = projectCombatLoadout({
      realmId: 'realm.taixi',
      realmSubStageId: 'realmSubStage.taixi.yujing',
      currentPower: 90,
      cultivationAttainment: 6,
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
    } as never);

    expect(projection.battleArtIds).toEqual([
      'art.cloud_step',
      'art.spirit_gathering_chant'
    ]);
    expect(projection.battleArtProfiles.map((item) => item.actionProfile.actionType)).toEqual([
      'movement',
      'support'
    ]);
  });

  test('derives battle slot limits from current realm and sub-stage', () => {
    expect(getBattleSlotLimits({
      realmId: 'realm.taixi',
      realmSubStageId: 'realmSubStage.taixi.xuanjing'
    })).toEqual({
      battleArtSlots: 1,
      supportSlots: 0,
      divinePowerSlots: 0
    });

    expect(getBattleSlotLimits({
      realmId: 'realm.taixi',
      realmSubStageId: 'realmSubStage.taixi.yujing'
    })).toEqual({
      battleArtSlots: 2,
      supportSlots: 1,
      divinePowerSlots: 0
    });
  });

  test('truncates illegal over-slot battle arts and divine powers from runtime projection', () => {
    const projection = projectCombatLoadout({
      realmId: 'realm.taixi',
      realmSubStageId: 'realmSubStage.taixi.xuanjing',
      currentPower: 10,
      cultivationAttainment: 2,
      branchCultivationAttainments: {},
      mainMethodId: 'method.starter_tuna',
      mainDaoTrack: 'neutral',
      knownBattleArtIds: ['art.basic_guarding_hand', 'art.cloud_step', 'art.spirit_gathering_chant'],
      equippedBattleArtIds: ['art.basic_guarding_hand', 'art.cloud_step'],
      knownDivinePowerIds: ['power.spirit_flash'],
      equippedDivinePowerIds: ['power.spirit_flash'],
      battleLoadout: {
        equippedBattleArtIds: ['art.basic_guarding_hand', 'art.cloud_step'],
        equippedDivinePowerIds: ['power.spirit_flash'],
        equippedArtifactIds: [],
        activeSupportArtId: 'art.spirit_gathering_chant'
      },
      injuryState: { level: 'none', modifiers: [] }
    } as never);

    expect(projection.slotLimits).toEqual({
      battleArtSlots: 1,
      supportSlots: 0,
      divinePowerSlots: 0
    });
    expect(projection.battleArtIds).toEqual(['art.basic_guarding_hand']);
    expect(projection.activeSupportArtId).toBeNull();
    expect(projection.divinePowerIds).toEqual([]);
  });

  test('exposes a runtime-ready content batch with projected profiles only for ready entries', () => {
    const batch = getRuntimeReadyContentBatch();

    expect(batch.battleArts.map((item) => item.entry.id)).toEqual([
      'art.basic_guarding_hand',
      'art.cloud_step',
      'art.wind_breaking_palm',
      'art.earth_wall_seal',
      'art.flowing_shadow_step',
      'art.spirit_gathering_chant',
      'art.golden_light_art',
      'art.black_water_sword_art',
      'art.fire_sparrow_art',
      'art.folding_feather_spear',
      'art.surging_river_step',
      'art.blood_escape_art',
      'art.clear_eye_spirit_gaze',
      'art.returning_origin_shield',
      'art.heart_cauldron_dispel',
      'art.profound_broad_healing',
      'art.morning_glow_stride',
      'art.cloudfall_glide',
      'art.flaming_step'
    ]);
    expect(batch.divinePowers.map((item) => item.entry.id)).toEqual([
      'power.spirit_flash',
      'power.binding_mist',
      'power.guarding_true_light',
      'power.thunder_domain_mark',
      'power.invoking_heaven_gate',
      'power.scarlet_sundering_bolt',
      'power.imperial_gaze_origin',
      'power.long_bright_steps',
      'power.great_departure_book',
      'power.treading_peril',
      'power.southern_sorrow_water',
      'power.hundred_bodies',
      'power.clear_heart',
      'power.no_purple_garment',
      'power.asking_two_forgetfulness',
      'power.rank_from_luo',
      'power.orderly_conquest',
      'power.locust_shade_ghost'
    ]);
    expect(batch.battleArts.every((item) => item.entry.runtimeReady)).toBe(true);
    expect(batch.divinePowers.every((item) => item.entry.runtimeReady)).toBe(true);
    expect(batch.battleArts.every((item) => item.runtimeProfile.definitionId === item.entry.id)).toBe(true);
    expect(batch.divinePowers.every((item) => item.runtimeProfile.definitionId === item.entry.id)).toBe(true);
  });

  test('keeps quasi-divine arts and dual-class divine powers pending until dedicated balance rules exist', () => {
    expect(getBattleArtRegistryEntry('art.high_sun_subduing_light')?.runtimeReady).toBe(false);
    expect(getBattleArtRegistryEntry('art.emperor_diverging_light')?.runtimeReady).toBe(false);
    expect(getBattleArtRegistryEntry('art.south_emperor_binding_law')?.runtimeReady).toBe(false);
    expect(getBattleArtRegistryEntry('art.heavenly_punishment_execution')?.runtimeReady).toBe(false);

    const pendingPower = getDivinePowerRegistryEntries().find((entry) => entry.id === 'power.resonant_spring_voice');
    expect(pendingPower?.runtimeReady).toBe(false);
    expect(() => projectDivinePowerRuntimeProfile('power.resonant_spring_voice')).toThrow(/not found/);
  });

  test('does not project zifu-only arts and divine powers for low-realm players even when learned', () => {
    const projection = projectCombatLoadout({
      realmId: 'realm.taixi',
      realmSubStageId: 'realmSubStage.taixi.lingchu',
      currentPower: 115,
      cultivationAttainment: 8,
      branchCultivationAttainments: {},
      mainMethodId: 'method.starter_tuna',
      mainDaoTrack: 'neutral',
      knownBattleArtIds: ['art.golden_light_art', 'art.cloudfall_glide'],
      equippedBattleArtIds: ['art.golden_light_art', 'art.cloudfall_glide'],
      knownDivinePowerIds: ['power.invoking_heaven_gate', 'power.clear_heart'],
      equippedDivinePowerIds: ['power.invoking_heaven_gate', 'power.clear_heart'],
      battleLoadout: {
        equippedBattleArtIds: ['art.golden_light_art', 'art.cloudfall_glide'],
        equippedDivinePowerIds: ['power.invoking_heaven_gate', 'power.clear_heart'],
        equippedArtifactIds: [],
        activeSupportArtId: null
      },
      injuryState: { level: 'none', modifiers: [] }
    } as never);

    expect(projection.battleArtIds).toEqual(['art.golden_light_art']);
    expect(projection.divinePowerIds).toEqual([]);
  });
});
