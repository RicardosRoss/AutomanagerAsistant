import { describe, expect, test } from 'vitest';
import { deriveCanonicalSnapshotFromLegacy } from '../../../src/services/CultivationStateAdapter.js';
import {
  createDefaultBattleLoadoutState,
  getStarterBattleArtIds
} from '../../../src/config/xuanjianCanonical.js';

describe('CultivationStateAdapter V2 defaults', () => {
  test('derives inert V2 fields without changing fresh-start behavior', () => {
    const snapshot = deriveCanonicalSnapshotFromLegacy({
      cultivation: {
        spiritualPower: 9999,
        realm: '元婴期',
        realmId: 6,
        realmStage: '圆满',
        immortalStones: 12
      },
      stats: {
        currentStreak: 3
      }
    } as never);

    expect(snapshot.state.realmId).toBe('realm.taixi');
    expect(snapshot.state.currentPower).toBe(0);
    expect(snapshot.state.realmSubStageId).toBe('realmSubStage.taixi.xuanjing');
    expect(snapshot.state.mainDaoTrack).toBe('universal');
    expect(snapshot.state.knownBattleArtIds).toEqual(getStarterBattleArtIds());
    expect(snapshot.state.equippedBattleArtIds).toEqual(getStarterBattleArtIds());
    expect(snapshot.state.battleLoadout).toEqual(createDefaultBattleLoadoutState());
    expect(snapshot.state.branchCultivationAttainments).toEqual({});
    expect(snapshot.state.battleLoadout.activeSupportArtId).toBeNull();
    expect(snapshot.state.cooldowns).toEqual({});
    expect(snapshot.state.combatFlags).toEqual({});
    expect(snapshot.state.combatHistorySummary).toEqual([]);
  });
});
