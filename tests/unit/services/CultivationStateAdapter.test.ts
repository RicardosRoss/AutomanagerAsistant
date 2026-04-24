import { describe, expect, test } from 'vitest';
import {
  deriveCanonicalSnapshotFromLegacy,
  toLegacyCultivationShell
} from '../../../src/services/CultivationStateAdapter.js';

type LegacyUserLike = {
  cultivation: {
    spiritualPower: number;
    realm: string;
    realmId: number;
    realmStage: string;
    immortalStones: number;
  };
  stats: {
    currentStreak: number;
  };
};

describe('CultivationStateAdapter', () => {
  test('derives canonical state as a fresh restart regardless of legacy shell power', () => {
    const legacyUser: LegacyUserLike = {
      cultivation: {
        spiritualPower: 2500,
        realm: '金丹期',
        realmId: 3,
        realmStage: '初期',
        immortalStones: 77
      },
      stats: {
        currentStreak: 7
      }
    };

    const snapshot = deriveCanonicalSnapshotFromLegacy(
      legacyUser as Parameters<typeof deriveCanonicalSnapshotFromLegacy>[0]
    );

    expect(snapshot.state.realmId).toBe('realm.taixi');
    expect(snapshot.state.currentPower).toBe(0);
    expect(snapshot.state.cultivationAttainment).toBe(0);
    expect(snapshot.state.focusStreak).toBe(7);
    expect(snapshot.state.mainMethodId).toBe('method.starter_tuna');
    expect(snapshot.inventory).toEqual([]);
  });

  test('maps legacy shell stage from realm-local progress semantics', () => {
    const shell = toLegacyCultivationShell(
      {
        realmId: 'realm.zhuji',
        currentPower: 420,
        mainMethodId: 'method.starter_tuna',
        mainDaoTrack: 'neutral',
        cultivationAttainment: 0,
        foundationId: 'foundation.unshaped',
        knownBattleArtIds: [],
        equippedBattleArtIds: [],
        knownDivinePowerIds: [],
        equippedDivinePowerIds: [],
        equipmentLoadout: {},
        inventoryItemIds: [],
        injuryState: { level: 'none', modifiers: [] },
        focusStreak: 0,
        lastCultivationAt: null,
        pendingDivinationBuff: null,
        schemaVersion: 1
      },
      12
    );

    expect(shell.realm).toBe('筑基');
    expect(shell.realmId).toBe(3);
    expect(shell.realmStage).toBe('初期');
  });
});
