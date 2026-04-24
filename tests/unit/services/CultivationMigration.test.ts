import { describe, expect, test } from 'vitest';
import { User } from '../../../src/models/index.js';
import { prepareCanonicalMigrationForUser } from '../../../src/services/CultivationMigration.js';
import CultivationService from '../../../src/services/CultivationService.js';

describe('CultivationMigration', () => {
  test('prepares a fresh-start canonical state for legacy high-power users', async () => {
    await User.collection.insertOne({
      userId: 909001,
      cultivation: {
        spiritualPower: 12000,
        realm: '炼虚期',
        realmId: 9,
        realmStage: '圆满',
        immortalStones: 88
      },
      stats: {
        totalTasks: 30,
        completedTasks: 24,
        failedTasks: 6,
        totalMinutes: 1800,
        currentStreak: 12,
        longestStreak: 20,
        todayCompletedTasks: 0
      }
    });
    const user = await User.findOne({ userId: 909001 });

    expect(user).not.toBeNull();
    if (!user) {
      throw new Error('legacy user not found');
    }

    const result = prepareCanonicalMigrationForUser(user);

    expect(result.changed).toBe(true);
    expect(user.cultivation.canonical?.state.realmId).toBe('realm.taixi');
    expect(user.cultivation.canonical?.state.currentPower).toBe(0);
    expect(user.cultivation.canonical?.state.cultivationAttainment).toBe(0);
    expect(user.cultivation.canonical?.state.focusStreak).toBe(12);
    expect(user.cultivation.spiritualPower).toBe(0);
    expect(user.cultivation.realm).toBe('胎息');
    expect(user.cultivation.realmId).toBe(1);
    expect(user.cultivation.immortalStones).toBe(88);
  });

  test('does not report changes for already-synced canonical users', async () => {
    const user = await User.create({
      userId: 909002,
      cultivation: {
        spiritualPower: 0,
        realm: '胎息',
        realmId: 1,
        realmStage: '玄景',
        immortalStones: 16,
        canonical: {
          schemaVersion: 1,
          state: {
            realmId: 'realm.taixi',
            currentPower: 0,
            mainMethodId: 'method.starter_tuna',
            mainDaoTrack: 'universal',
            cultivationAttainment: 0,
            foundationId: 'foundation.unshaped',
            knownBattleArtIds: ['art.basic_guarding_hand', 'art.cloud_step'],
            equippedBattleArtIds: ['art.basic_guarding_hand', 'art.cloud_step'],
            knownDivinePowerIds: [],
            equippedDivinePowerIds: [],
            equipmentLoadout: {},
            inventoryItemIds: [],
            injuryState: { level: 'none', modifiers: [] },
            focusStreak: 3,
            lastCultivationAt: null,
            pendingDivinationBuff: null,
            schemaVersion: 1
          },
          breakthrough: null,
          inventory: []
        }
      },
      stats: {
        currentStreak: 3
      }
    });

    const result = prepareCanonicalMigrationForUser(user);

    expect(result.changed).toBe(false);
    expect(result.hadCanonical).toBe(true);
    expect(result.hasCanonical).toBe(true);
    expect(user.cultivation.canonical?.state.realmId).toBe('realm.taixi');
    expect(user.cultivation.spiritualPower).toBe(0);
    expect(user.cultivation.realm).toBe('胎息');
  });

  test('normalizePhaseAState should backfill branchChoice/branchProofs for legacy breakthrough payloads', async () => {
    const userId = 909003;
    const cultivationService = new CultivationService();
    const user = await User.create({ userId, username: 'legacy-branch-backfill' });
    const canonical = user.ensureCanonicalCultivation();
    canonical.state.realmId = 'realm.zhuji';
    canonical.state.currentPower = 700;
    canonical.breakthrough = {
      targetRealm: 'realm.zifu',
      selectedBreakthroughMethodId: 'breakthrough.zhuji_to_zifu_base',
      requirementProgress: {},
      hardConditionFlags: {},
      stabilityScore: 0,
      attemptHistory: []
    };
    user.replaceCanonicalCultivation(canonical);
    user.syncLegacyCultivationShell();
    await user.save();

    await cultivationService.getCultivationStatus(userId);

    const refreshed = await User.findOne({ userId }).lean();
    expect(refreshed?.cultivation.canonical.breakthrough?.branchChoice).toBeNull();
    expect(refreshed?.cultivation.canonical.breakthrough?.branchProofs).toEqual({});
  });

  test('normalizePhaseAState should not recompute first divine power for existing zifu users', async () => {
    const userId = 909004;
    const cultivationService = new CultivationService();
    const user = await User.create({ userId, username: 'legacy-zifu-no-recompute' });
    const canonical = user.ensureCanonicalCultivation();
    canonical.state.realmId = 'realm.zifu';
    canonical.state.currentPower = 1300;
    canonical.state.foundationId = 'foundation.zhuji_mingyang';
    canonical.state.knownDivinePowerIds = ['power.zifu_first_light'];
    canonical.state.equippedDivinePowerIds = ['power.zifu_first_light'];
    canonical.breakthrough = null;
    user.replaceCanonicalCultivation(canonical);
    user.syncLegacyCultivationShell();
    await user.save();

    await cultivationService.getCultivationStatus(userId);

    const refreshed = await User.findOne({ userId }).lean();
    expect(refreshed?.cultivation.canonical.state.knownDivinePowerIds).toEqual(['power.zifu_first_light']);
    expect(refreshed?.cultivation.canonical.state.knownDivinePowerIds).not.toContain('power.invoking_heaven_gate');
  });
});
