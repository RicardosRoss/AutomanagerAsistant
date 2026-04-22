import { describe, expect, test } from 'vitest';
import CultivationService from '../../src/services/CultivationService.js';
import { User } from '../../src/models/index.js';

describe('xuanjian V2 phase A compatibility', () => {
  test('awardCultivation still uses the V1 loop even when V2 fields exist', async () => {
    const user = await User.create({
      userId: 41001,
      username: 'phase-a-user',
      cultivation: {
        canonical: {
          state: {
            realmId: 'realm.taixi',
            currentPower: 0,
            realmSubStageId: 'realmSubStage.taixi.xuanjing',
            mainMethodId: 'method.starter_tuna',
            mainDaoTrack: 'universal',
            cultivationAttainment: 0,
            branchCultivationAttainments: {},
            foundationId: 'foundation.unshaped',
            knownBattleArtIds: ['art.basic_guarding_hand', 'art.cloud_step'],
            equippedBattleArtIds: ['art.basic_guarding_hand', 'art.cloud_step'],
            knownDivinePowerIds: [],
            equippedDivinePowerIds: [],
            equipmentLoadout: {},
            battleLoadout: {
              equippedBattleArtIds: ['art.basic_guarding_hand'],
              equippedDivinePowerIds: [],
              equippedArtifactIds: [],
              activeSupportArtId: null
            },
            inventoryItemIds: [],
            injuryState: { level: 'none', modifiers: [] },
            cooldowns: {},
            combatFlags: {},
            combatHistorySummary: [],
            focusStreak: 0,
            lastCultivationAt: null,
            pendingDivinationBuff: null,
            schemaVersion: 1
          },
          breakthrough: null,
          inventory: []
        }
      }
    });

    const reward = await new CultivationService().awardCultivation(user.userId, 60);
    expect(reward.spiritualPower).toBeGreaterThan(0);

    const refreshed = await User.findOne({ userId: user.userId }).lean();
    expect(refreshed?.cultivation.canonical.state.currentPower).toBeGreaterThan(0);
    expect(refreshed?.cultivation.canonical.state.realmSubStageId).toBe('realmSubStage.taixi.xuanjing');
  });

  test('getCultivationStatus should persist backfilled inert V2 fields for older canonical snapshots', async () => {
    const user = await User.create({ userId: 41002, username: 'phase-a-backfill' });

    await User.collection.updateOne(
      { _id: user._id },
      {
        $unset: {
          'cultivation.canonical.state.realmSubStageId': '',
          'cultivation.canonical.state.branchCultivationAttainments': '',
          'cultivation.canonical.state.battleLoadout': '',
          'cultivation.canonical.state.cooldowns': '',
          'cultivation.canonical.state.combatFlags': '',
          'cultivation.canonical.state.combatHistorySummary': ''
        }
      }
    );

    await new CultivationService().getCultivationStatus(user.userId);

    const raw = await User.collection.findOne({ _id: user._id });
    expect(raw?.cultivation.canonical.state.realmSubStageId).toBe('realmSubStage.taixi.xuanjing');
    expect(raw?.cultivation.canonical.state.branchCultivationAttainments).toEqual({});
    expect(raw?.cultivation.canonical.state.battleLoadout).toEqual({
      equippedBattleArtIds: ['art.basic_guarding_hand'],
      equippedDivinePowerIds: [],
      equippedArtifactIds: [],
      activeSupportArtId: null
    });
    expect(raw?.cultivation.canonical.state.cooldowns).toEqual({});
    expect(raw?.cultivation.canonical.state.combatFlags).toEqual({});
    expect(raw?.cultivation.canonical.state.combatHistorySummary).toEqual([]);
  });
});
