import { describe, expect, test } from 'vitest';
import {
  evaluateBreakthroughReadiness,
  resolveBreakthroughAttempt
} from '../../../src/services/BreakthroughEngine.js';

describe('BreakthroughEngine', () => {
  test('requires configured materials and attainment to mark breakthrough ready', () => {
    const result = evaluateBreakthroughReadiness({
      currentRealmId: 'realm.lianqi',
      currentPower: 420,
      cultivationAttainment: 9,
      mainMethodId: 'method.lianqi_mingyang_route',
      selectedBreakthroughMethodId: 'breakthrough.lianqi_to_zhuji_base',
      inventory: []
    });

    expect(result.ready).toBe(false);
    expect(result.reason).toBe('not_ready');
    expect(result.missing).toContain('material.yellow_breakthrough_token');
    expect(result.missing).toContain('cultivationAttainment');
  });

  test('consumes required items and grants first zifu divine power from foundation mapping', () => {
    const now = new Date('2026-04-20T00:00:00.000Z');
    const result = resolveBreakthroughAttempt({
      currentRealmId: 'realm.zhuji',
      currentPower: 1120,
      cultivationAttainment: 10,
      mainMethodId: 'method.zhuji_mingyang_script',
      mainDaoTrack: 'mingyang',
      foundationId: 'foundation.zhuji_mingyang',
      selectedBreakthroughMethodId: 'breakthrough.zhuji_to_zifu_base',
      knownDivinePowerIds: [],
      hardConditionFlags: {},
      inventory: [
        {
          instanceId: 'inv_1',
          definitionId: 'material.mysterious_breakthrough_token',
          obtainedAt: now,
          sourceType: 'encounter',
          bound: false,
          used: false,
          stackCount: 1,
          instanceMeta: {}
        }
      ]
    });

    expect(result.success).toBe(true);
    expect(result.reason).toBe('ready');
    expect(result.targetRealmId).toBe('realm.zifu');
    expect(result.consumedDefinitionIds).toEqual(['material.mysterious_breakthrough_token']);
    expect(result.nextRealmId).toBe('realm.zifu');
    expect(result.updatedKnownDivinePowerIds).toContain('power.invoking_heaven_gate');
    expect(result.updatedKnownDivinePowerIds).not.toContain('power.zifu_first_light');
    expect(result.resetBreakthroughState).toBe(true);
    expect(result.updatedInventory[0]).toMatchObject({
      definitionId: 'material.mysterious_breakthrough_token',
      used: true,
      stackCount: 0
    });
    expect(result.breakthroughResolution.attemptKind).toBe('realm_zhuji_to_zifu');
    expect(result.breakthroughResolution.targetDivinePowerId).toBe('power.invoking_heaven_gate');
    expect(result.breakthroughResolution.gates.map((gate) => gate.id)).toEqual([
      'lift_foundation',
      'cross_illusion',
      'gestate_power',
      'enter_taixu'
    ]);
    expect(result.breakthroughResolution.gates.every((gate) => gate.passed)).toBe(true);
  });

  test('zhuji to zifu can deterministically fail at cross_illusion gate', () => {
    const now = new Date('2026-04-20T00:00:00.000Z');
    const result = resolveBreakthroughAttempt({
      currentRealmId: 'realm.zhuji',
      currentPower: 1120,
      cultivationAttainment: 10,
      mainMethodId: 'method.zhuji_mingyang_script',
      mainDaoTrack: 'mingyang',
      foundationId: 'foundation.zhuji_mingyang',
      selectedBreakthroughMethodId: 'breakthrough.zhuji_to_zifu_base',
      attemptKind: 'realm_zhuji_to_zifu',
      knownDivinePowerIds: [],
      hardConditionFlags: {
        'gate.cross_illusion.force_fail': true
      },
      inventory: [
        {
          instanceId: 'inv_fail_1',
          definitionId: 'material.mysterious_breakthrough_token',
          obtainedAt: now,
          sourceType: 'encounter',
          bound: false,
          used: false,
          stackCount: 1,
          instanceMeta: {}
        }
      ]
    });

    expect(result.success).toBe(false);
    expect(result.reason).toBe('attempt_failed');
    expect(result.targetRealmId).toBe('realm.zhuji');
    expect(result.nextRealmId).toBe('realm.zhuji');
    expect(result.powerLossApplied).toBeGreaterThan(0);
    expect(result.attainmentLossApplied).toBeGreaterThan(0);
    expect(result.failedGateId).toBe('cross_illusion');
    expect(result.consumedDefinitionIds).toEqual(['material.mysterious_breakthrough_token']);
    expect(result.breakthroughResolution?.attemptKind).toBe('realm_zhuji_to_zifu');
    expect(result.breakthroughResolution?.gates.map((gate) => gate.id)).toEqual([
      'lift_foundation',
      'cross_illusion',
      'gestate_power',
      'enter_taixu'
    ]);
    expect(result.breakthroughResolution?.gates.map((gate) => gate.passed)).toEqual([true, false, false, false]);
  });

  test('lianqi to zhuji breakthrough locks dao track and foundation from lineaged main method', () => {
    const now = new Date('2026-04-20T00:00:00.000Z');
    const result = resolveBreakthroughAttempt({
      currentRealmId: 'realm.lianqi',
      currentPower: 420,
      cultivationAttainment: 10,
      mainMethodId: 'method.lianqi_mingyang_route',
      selectedBreakthroughMethodId: 'breakthrough.lianqi_to_zhuji_base',
      knownDivinePowerIds: [],
      inventory: [
        {
          instanceId: 'inv_3',
          definitionId: 'material.yellow_breakthrough_token',
          obtainedAt: now,
          sourceType: 'encounter',
          bound: false,
          used: false,
          stackCount: 1,
          instanceMeta: {}
        }
      ]
    });

    expect(result.success).toBe(true);
    expect(result.targetRealmId).toBe('realm.zhuji');
    expect(result.nextMainDaoTrack).toBe('mingyang');
    expect(result.nextFoundationId).toBe('foundation.zhuji_mingyang');
    expect(result.nextMainMethodId).toBe('method.zhuji_mingyang_script');
    expect(result.breakthroughResolution).toMatchObject({
      methodId: 'breakthrough.lianqi_to_zhuji_base',
      successRateApplied: 1
    });
  });

  test('lianqi readiness requires a compatible breakthrough method for the transition', () => {
    const now = new Date('2026-04-20T00:00:00.000Z');
    const result = evaluateBreakthroughReadiness({
      currentRealmId: 'realm.lianqi',
      currentPower: 420,
      cultivationAttainment: 10,
      mainMethodId: 'method.lianqi_mingyang_route',
      selectedBreakthroughMethodId: 'breakthrough.zhuji_to_zifu_base',
      inventory: [
        {
          instanceId: 'inv_compat_1',
          definitionId: 'material.yellow_breakthrough_token',
          obtainedAt: now,
          sourceType: 'encounter',
          bound: false,
          used: false,
          stackCount: 1,
          instanceMeta: {}
        }
      ]
    });

    expect(result.ready).toBe(false);
    expect(result.reason).toBe('not_ready');
    expect(result.missing).toContain('selectedBreakthroughMethodId');
  });

  test('zhuji readiness requires compatible lineage and environment for specialized zifu methods', () => {
    const now = new Date('2026-04-20T00:00:00.000Z');
    const result = evaluateBreakthroughReadiness({
      currentRealmId: 'realm.zhuji',
      currentPower: 1120,
      cultivationAttainment: 10,
      mainMethodId: 'method.zhuji_lihuo_script',
      mainDaoTrack: 'lihuo',
      foundationId: 'foundation.zhuji_lihuo',
      selectedBreakthroughMethodId: 'breakthrough.zhuji_to_zifu_mingyang_manifest',
      knownDivinePowerIds: [],
      hardConditionFlags: {},
      inventory: [
        {
          instanceId: 'inv_compat_zifu_1',
          definitionId: 'material.mysterious_breakthrough_token',
          obtainedAt: now,
          sourceType: 'encounter',
          bound: false,
          used: false,
          stackCount: 1,
          instanceMeta: {}
        },
        {
          instanceId: 'inv_compat_zifu_2',
          definitionId: 'material.mingyang_manifest_token',
          obtainedAt: now,
          sourceType: 'encounter',
          bound: false,
          used: false,
          stackCount: 1,
          instanceMeta: {}
        }
      ]
    });

    expect(result.ready).toBe(false);
    expect(result.reason).toBe('not_ready');
    expect(result.missing).toContain('mainDaoTrack');
    expect(result.missing).toContain('env.mingyang_surge');
  });

  test('zhuji specialized breakthrough method grants method-specific power and side effects', () => {
    const now = new Date('2026-04-20T00:00:00.000Z');
    const result = resolveBreakthroughAttempt({
      currentRealmId: 'realm.zhuji',
      currentPower: 1120,
      cultivationAttainment: 10,
      mainMethodId: 'method.zhuji_mingyang_script',
      mainDaoTrack: 'mingyang',
      foundationId: 'foundation.zhuji_mingyang',
      selectedBreakthroughMethodId: 'breakthrough.zhuji_to_zifu_mingyang_manifest',
      knownDivinePowerIds: [],
      hardConditionFlags: {
        'env.mingyang_surge': true
      },
      inventory: [
        {
          instanceId: 'inv_zifu_special_1',
          definitionId: 'material.mysterious_breakthrough_token',
          obtainedAt: now,
          sourceType: 'encounter',
          bound: false,
          used: false,
          stackCount: 1,
          instanceMeta: {}
        },
        {
          instanceId: 'inv_zifu_special_2',
          definitionId: 'material.mingyang_manifest_token',
          obtainedAt: now,
          sourceType: 'encounter',
          bound: false,
          used: false,
          stackCount: 1,
          instanceMeta: {}
        }
      ]
    });

    expect(result.success).toBe(true);
    expect(result.targetRealmId).toBe('realm.zifu');
    expect(result.consumedDefinitionIds).toEqual([
      'material.mysterious_breakthrough_token',
      'material.mingyang_manifest_token'
    ]);
    expect(result.updatedKnownDivinePowerIds).toContain('power.invoking_heaven_gate');
    expect(result.updatedKnownDivinePowerIds).not.toContain('power.zifu_first_light');
    expect(result.breakthroughResolution).toMatchObject({
      methodId: 'breakthrough.zhuji_to_zifu_mingyang_manifest',
      bonusOutcomeIds: ['power.invoking_heaven_gate'],
      sideEffectsApplied: ['zifu_mingyang_burn']
    });
  });

  test('zifu divine power readiness requires branch proofs for the target power', () => {
    const now = new Date('2026-04-23T00:00:00.000Z');
    const result = evaluateBreakthroughReadiness({
      attemptKind: 'zifu_divine_power',
      currentRealmId: 'realm.zifu',
      currentPower: 1360,
      cultivationAttainment: 18,
      mainMethodId: 'method.zhuji_mingyang_script',
      mainDaoTrack: 'mingyang',
      foundationId: 'foundation.zhuji_mingyang',
      selectedBreakthroughMethodId: 'breakthrough.zifu_divine_power_base',
      knownDivinePowerIds: ['power.invoking_heaven_gate'],
      branchChoice: 'power.clear_heart',
      branchProofs: {},
      inventory: [
        {
          instanceId: 'inv_zifu_power_missing_proof',
          definitionId: 'material.zifu_second_power_token',
          obtainedAt: now,
          sourceType: 'encounter',
          bound: false,
          used: false,
          stackCount: 1,
          instanceMeta: {}
        }
      ]
    });

    expect(result.ready).toBe(false);
    expect(result.reason).toBe('not_ready');
    expect(result.targetRealmId).toBe('realm.zifu');
    expect(result.missing).toContain('proof.mingyang_fate_anchor');
  });

  test('zifu divine power success adds branchChoice target power through four gates', () => {
    const now = new Date('2026-04-23T00:00:00.000Z');
    const result = resolveBreakthroughAttempt({
      attemptKind: 'zifu_divine_power',
      currentRealmId: 'realm.zifu',
      currentPower: 1360,
      cultivationAttainment: 18,
      mainMethodId: 'method.zhuji_mingyang_script',
      mainDaoTrack: 'mingyang',
      foundationId: 'foundation.zhuji_mingyang',
      selectedBreakthroughMethodId: 'breakthrough.zifu_divine_power_base',
      knownDivinePowerIds: ['power.invoking_heaven_gate'],
      branchChoice: 'power.clear_heart',
      branchProofs: { 'proof.mingyang_fate_anchor': true },
      hardConditionFlags: {},
      inventory: [
        {
          instanceId: 'inv_zifu_power_success',
          definitionId: 'material.zifu_second_power_token',
          obtainedAt: now,
          sourceType: 'encounter',
          bound: false,
          used: false,
          stackCount: 1,
          instanceMeta: {}
        }
      ]
    });

    expect(result.success).toBe(true);
    expect(result.targetRealmId).toBe('realm.zifu');
    expect(result.nextRealmId).toBe('realm.zifu');
    expect(result.consumedDefinitionIds).toEqual(['material.zifu_second_power_token']);
    expect(result.updatedKnownDivinePowerIds).toEqual([
      'power.invoking_heaven_gate',
      'power.clear_heart'
    ]);
    expect(result.breakthroughResolution.targetDivinePowerId).toBe('power.clear_heart');
    expect(result.breakthroughResolution.gates.map((gate) => gate.id)).toEqual([
      'shape_aux_foundation',
      'cross_illusion',
      'gestate_target_power',
      'enter_taixu'
    ]);
    expect(result.breakthroughResolution.gates.every((gate) => gate.passed)).toBe(true);
  });

  test('jindan readiness requires zifu perfect stage and five divine powers', () => {
    const now = new Date('2026-04-24T00:00:00.000Z');
    const result = evaluateBreakthroughReadiness({
      attemptKind: 'realm_zifu_to_jindan',
      currentRealmId: 'realm.zifu',
      realmSubStageId: 'realmSubStage.zifu.late',
      currentPower: 2620,
      cultivationAttainment: 80,
      mainMethodId: 'method.zhuji_mingyang_script',
      mainDaoTrack: 'mingyang',
      foundationId: 'foundation.zhuji_mingyang',
      selectedBreakthroughMethodId: 'breakthrough.zifu_to_jindan_direct_gold',
      knownDivinePowerIds: [
        'power.invoking_heaven_gate',
        'power.clear_heart',
        'power.long_bright_steps',
        'power.imperial_gaze_origin'
      ],
      inventory: [
        {
          instanceId: 'inv_jindan_1',
          definitionId: 'material.jindan_gold_catalyst',
          obtainedAt: now,
          sourceType: 'encounter',
          bound: false,
          used: false,
          stackCount: 1,
          instanceMeta: {}
        },
        {
          instanceId: 'inv_jindan_2',
          definitionId: 'material.same_origin_treasure',
          obtainedAt: now,
          sourceType: 'encounter',
          bound: false,
          used: false,
          stackCount: 1,
          instanceMeta: {}
        }
      ]
    });

    expect(result.ready).toBe(false);
    expect(result.targetRealmId).toBe('realm.jindan');
    expect(result.missing).toContain('realmSubStage.zifu.perfect');
    expect(result.missing).toContain('knownDivinePowerIds.5');
  });

  test('jindan direct gold success consumes route materials and records gold nature', () => {
    const now = new Date('2026-04-24T00:00:00.000Z');
    const result = resolveBreakthroughAttempt({
      attemptKind: 'realm_zifu_to_jindan',
      currentRealmId: 'realm.zifu',
      realmSubStageId: 'realmSubStage.zifu.perfect',
      currentPower: 2620,
      cultivationAttainment: 80,
      mainMethodId: 'method.zhuji_mingyang_script',
      mainDaoTrack: 'mingyang',
      foundationId: 'foundation.zhuji_mingyang',
      selectedBreakthroughMethodId: 'breakthrough.zifu_to_jindan_direct_gold',
      knownDivinePowerIds: [
        'power.invoking_heaven_gate',
        'power.clear_heart',
        'power.long_bright_steps',
        'power.imperial_gaze_origin',
        'power.scarlet_sundering_bolt'
      ],
      hardConditionFlags: {},
      inventory: [
        {
          instanceId: 'inv_jindan_success_1',
          definitionId: 'material.jindan_gold_catalyst',
          obtainedAt: now,
          sourceType: 'encounter',
          bound: false,
          used: false,
          stackCount: 1,
          instanceMeta: {}
        },
        {
          instanceId: 'inv_jindan_success_2',
          definitionId: 'material.same_origin_treasure',
          obtainedAt: now,
          sourceType: 'encounter',
          bound: false,
          used: false,
          stackCount: 1,
          instanceMeta: {}
        }
      ]
    });

    expect(result.success).toBe(true);
    expect(result.targetRealmId).toBe('realm.jindan');
    expect(result.nextRealmId).toBe('realm.jindan');
    expect(result.consumedDefinitionIds).toEqual([
      'material.jindan_gold_catalyst',
      'material.same_origin_treasure'
    ]);
    expect(result.updatedKnownDivinePowerIds).toHaveLength(5);
    expect(result.breakthroughResolution.attemptKind).toBe('realm_zifu_to_jindan');
    expect(result.breakthroughResolution.methodId).toBe('breakthrough.zifu_to_jindan_direct_gold');
    expect(result.breakthroughResolution.sideEffectsApplied).toContain('jindan_path.direct_gold');
    expect(result.breakthroughResolution.bonusOutcomeIds).toContain('goldNature.direct_mingyang');
  });

  test('failed breakthrough attempt keeps inputs effectively unchanged', () => {
    const now = new Date('2026-04-20T00:00:00.000Z');
    const inventory = [
      {
        instanceId: 'inv_2',
        definitionId: 'material.yellow_breakthrough_token',
        obtainedAt: now,
        sourceType: 'encounter' as const,
        bound: false,
        used: false,
        stackCount: 1,
        instanceMeta: {}
      }
    ];
    const result = resolveBreakthroughAttempt({
      currentRealmId: 'realm.lianqi',
      currentPower: 420,
      cultivationAttainment: 0,
      mainMethodId: 'method.starter_tuna',
      mainDaoTrack: 'universal',
      foundationId: 'foundation.unshaped',
      selectedBreakthroughMethodId: 'breakthrough.lianqi_to_zhuji_base',
      knownDivinePowerIds: ['power.existing'],
      hardConditionFlags: {},
      inventory
    });

    expect(result.success).toBe(false);
    expect(result.reason).toBe('not_ready');
    expect(result.consumedDefinitionIds).toEqual([]);
    expect(result.resetBreakthroughState).toBe(false);
    expect(result.updatedKnownDivinePowerIds).toEqual(['power.existing']);
    expect(result.updatedInventory).toEqual(inventory);
    expect(result.nextMainMethodId).toBeNull();
    expect(inventory[0]).toMatchObject({
      used: false,
      stackCount: 1
    });
  });
});
