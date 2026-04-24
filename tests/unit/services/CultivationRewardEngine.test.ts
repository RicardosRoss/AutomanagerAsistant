import { describe, expect, test } from 'vitest';
import {
  getFocusAttainmentDelta,
  resolveFocusReward,
  rollFocusEncounter
} from '../../../src/services/CultivationRewardEngine.js';

describe('CultivationRewardEngine', () => {
  test('focus completion is the main source of power gain', () => {
    const result = resolveFocusReward({
      duration: 90,
      rng: () => 0.99,
      state: {
        realmId: 'realm.taixi',
        currentPower: 0,
        mainMethodId: 'method.starter_tuna',
        mainDaoTrack: 'neutral',
        cultivationAttainment: 0,
        foundationId: 'foundation.unshaped',
        knownBattleArtIds: ['art.basic_guarding_hand'],
        equippedBattleArtIds: ['art.basic_guarding_hand'],
        knownDivinePowerIds: [],
        equippedDivinePowerIds: [],
        equipmentLoadout: {},
        inventoryItemIds: [],
        injuryState: { level: 'none', modifiers: [] },
        focusStreak: 4,
        lastCultivationAt: null,
        pendingDivinationBuff: null,
        schemaVersion: 1
      }
    });

    expect(result.basePowerGain).toBe(2);
    expect(result.totalPowerGain).toBe(2);
    expect(result.attainmentDelta).toBe(1);
    expect(result.nextFocusStreak).toBe(5);
  });

  test('encounter only affects side rewards and not main power gain formula', () => {
    const state = {
      realmId: 'realm.taixi' as const,
      currentPower: 0,
      mainMethodId: 'method.starter_tuna',
      mainDaoTrack: 'neutral',
      cultivationAttainment: 30,
      foundationId: 'foundation.unshaped',
      knownBattleArtIds: ['art.basic_guarding_hand'],
      equippedBattleArtIds: ['art.basic_guarding_hand'],
      knownDivinePowerIds: [],
      equippedDivinePowerIds: [],
      equipmentLoadout: {},
      inventoryItemIds: [],
      injuryState: { level: 'none' as const, modifiers: [] },
      focusStreak: 1,
      lastCultivationAt: null,
      pendingDivinationBuff: null,
      schemaVersion: 1 as const
    };
    const gainResult = resolveFocusReward({
      duration: 90,
      rng: () => 0.88,
      state
    });
    const itemResult = resolveFocusReward({
      duration: 90,
      rng: () => 0.999,
      state
    });

    expect(gainResult.basePowerGain).toBe(itemResult.basePowerGain);
    expect(gainResult.totalPowerGain).toBe(itemResult.totalPowerGain);
    expect(gainResult.attainmentDelta).toBe(itemResult.attainmentDelta);
    expect(gainResult.encounter).toEqual({
      type: 'stones',
      message: '偶得灵石',
      spiritStoneDelta: 8,
      obtainedDefinitionIds: []
    });
    expect(itemResult.encounter).toEqual({
      type: 'item',
      message: '得到低阶丹药',
      spiritStoneDelta: 0,
      obtainedDefinitionIds: ['consumable.low_cultivation_pill']
    });
  });

  test('focus attainment delta follows exact streak anchors', () => {
    expect(getFocusAttainmentDelta(4)).toBe(0);
    expect(getFocusAttainmentDelta(5)).toBe(1);
    expect(getFocusAttainmentDelta(50)).toBe(1);
    expect(getFocusAttainmentDelta(99)).toBe(0);
    expect(getFocusAttainmentDelta(100)).toBe(1);
    expect(getFocusAttainmentDelta(101)).toBe(1);
  });

  test('encounter helper keeps fallback exit path deterministic', () => {
    const encounter = rollFocusEncounter(() => 1.5, 'realm.taixi');
    expect(encounter.type).toBe('none');
  });

  test('lineage specialization only starts at zhuji with matching dao track', () => {
    const baseState = {
      realmId: 'realm.lianqi' as const,
      currentPower: 420,
      mainMethodId: 'method.zhuji_mingyang_script',
      mainDaoTrack: 'universal',
      cultivationAttainment: 30,
      foundationId: 'foundation.unshaped',
      knownBattleArtIds: ['art.basic_guarding_hand'],
      equippedBattleArtIds: ['art.basic_guarding_hand'],
      knownDivinePowerIds: [],
      equippedDivinePowerIds: [],
      equipmentLoadout: {},
      inventoryItemIds: [],
      injuryState: { level: 'none' as const, modifiers: [] },
      focusStreak: 10,
      lastCultivationAt: null,
      pendingDivinationBuff: null,
      schemaVersion: 1 as const
    };

    const lianqiUniversal = resolveFocusReward({
      duration: 300,
      rng: () => 0.5,
      state: baseState
    });
    const lianqiMatching = resolveFocusReward({
      duration: 300,
      rng: () => 0.5,
      state: {
        ...baseState,
        mainDaoTrack: 'mingyang'
      }
    });
    const zhujiUniversal = resolveFocusReward({
      duration: 300,
      rng: () => 0.5,
      state: {
        ...baseState,
        realmId: 'realm.zhuji',
        mainDaoTrack: 'universal'
      }
    });
    const zhujiMismatch = resolveFocusReward({
      duration: 300,
      rng: () => 0.5,
      state: {
        ...baseState,
        realmId: 'realm.zhuji',
        mainDaoTrack: 'lihuo'
      }
    });
    const zhujiMatching = resolveFocusReward({
      duration: 300,
      rng: () => 0.5,
      state: {
        ...baseState,
        realmId: 'realm.zhuji',
        mainDaoTrack: 'mingyang'
      }
    });

    expect(lianqiMatching.totalPowerGain).toBe(lianqiUniversal.totalPowerGain);
    expect(zhujiMismatch.totalPowerGain).toBe(zhujiUniversal.totalPowerGain);
    expect(zhujiMatching.totalPowerGain).toBeGreaterThan(zhujiUniversal.totalPowerGain);
  });

  test('short focus without forced encounter should not trigger encounter rewards', () => {
    const result = resolveFocusReward({
      duration: 1,
      rng: () => 0.995,
      state: {
        realmId: 'realm.taixi',
        currentPower: 0,
        mainMethodId: 'method.starter_tuna',
        mainDaoTrack: 'neutral',
        cultivationAttainment: 0,
        foundationId: 'foundation.unshaped',
        knownBattleArtIds: ['art.basic_guarding_hand'],
        equippedBattleArtIds: ['art.basic_guarding_hand'],
        knownDivinePowerIds: [],
        equippedDivinePowerIds: [],
        equipmentLoadout: {},
        inventoryItemIds: [],
        injuryState: { level: 'none', modifiers: [] },
        focusStreak: 1,
        lastCultivationAt: null,
        pendingDivinationBuff: null,
        schemaVersion: 1
      }
    });

    expect(result.basePowerGain).toBe(0);
    expect(result.totalPowerGain).toBe(0);
    expect(result.encounter).toEqual({
      type: 'none',
      message: null,
      spiritStoneDelta: 0,
      obtainedDefinitionIds: []
    });
  });

  test('focus encounter rolls into combat branch with a seeded encounter id', () => {
    const rolls = [0.99, 0.12];
    const encounter = rollFocusEncounter(() => rolls.shift() ?? 0, 'realm.taixi', null);

    expect(encounter).toMatchObject({
      type: 'combat',
      combatEncounterId: 'combatEncounter.taixi.roadside_wolf'
    });
    expect(encounter.spiritStoneDelta).toBe(0);
    expect(encounter.obtainedDefinitionIds).toEqual([]);
  });

  test('forced none override always returns no encounter', () => {
    const encounter = rollFocusEncounter(() => 0.99, 'realm.taixi', null, 'none');

    expect(encounter).toEqual({
      type: 'none',
      message: null,
      spiritStoneDelta: 0,
      obtainedDefinitionIds: []
    });
  });

  test('forced stones override stays inside stones category', () => {
    const encounter = rollFocusEncounter(() => 0.1, 'realm.taixi', null, 'stones');

    expect(encounter.type).toBe('stones');
    expect(encounter.spiritStoneDelta).not.toBe(0);
    expect(encounter.obtainedDefinitionIds).toEqual([]);
  });

  test('forced item override stays inside item category', () => {
    const encounter = rollFocusEncounter(() => 0.9, 'realm.taixi', null, 'item');

    expect(encounter.type).toBe('item');
    expect(encounter.obtainedDefinitionIds.length).toBeGreaterThan(0);
  });

  test('forced combat override stays inside combat category', () => {
    const encounter = rollFocusEncounter(() => 0.1, 'realm.taixi', null, 'combat');

    expect(encounter.type).toBe('combat');
    expect(encounter.combatEncounterId).toBe('combatEncounter.taixi.roadside_wolf');
  });

  test('forced offer override returns a guardian offer instead of immediate combat', () => {
    const encounter = rollFocusEncounter(() => 0.12, 'realm.taixi', null, 'offer');

    expect(encounter).toMatchObject({
      type: 'offer',
      spiritStoneDelta: 0,
      obtainedDefinitionIds: []
    });
    expect(encounter.offerSummary).toMatchObject({
      lootDisplayName: expect.any(String),
      guardianStyle: expect.stringMatching(/rush|guard|movement|sense|hybrid/),
      riskTier: expect.stringMatching(/ordinary|tough|dangerous|deadly/)
    });
  });
});
