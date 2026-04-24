import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import { describe, expect, test } from 'vitest';
import { User } from '../../src/models/index.js';

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../..');

function getTestDatabaseUri(): string {
  const { host, port, name } = mongoose.connection;

  if (!host || !port || !name) {
    throw new Error('测试数据库连接信息不完整，无法执行迁移脚本集成测试');
  }

  return `mongodb://${host}:${port}/${name}`;
}

describe('migrate:xuanjian-cultivation --dry-run 集成测试', () => {
  test(
    '应输出 dry-run 统计，并且不写回任何用户修仙状态',
    async () => {
      await User.collection.insertOne({
        userId: 811001,
        cultivation: {
          spiritualPower: 12000,
          realm: '炼虚期',
          realmId: 9,
          realmStage: '圆满',
          immortalStones: 88
        },
        stats: {
          currentStreak: 12
        }
      });

      await User.create({
        userId: 811002,
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
              injuryState: { level: 'none', points: 0, modifiers: [] },
              focusStreak: 3,
              lastCultivationAt: null,
              pendingDivinationBuff: null,
              schemaVersion: 1,
              realmSubStageId: 'realmSubStage.taixi.xuanjing',
              branchCultivationAttainments: {},
              battleLoadout: {
                equippedBattleArtIds: ['art.basic_guarding_hand'],
                equippedDivinePowerIds: [],
                equippedArtifactIds: [],
                activeSupportArtId: null
              },
              cooldowns: {},
              combatFlags: {},
              combatHistorySummary: []
            },
            breakthrough: null,
            inventory: []
          }
        },
        stats: {
          currentStreak: 3
        }
      });

      const { stdout, stderr } = await execFileAsync(
        'yarn',
        ['migrate:xuanjian-cultivation', '--dry-run'],
        {
          cwd: projectRoot,
          env: {
            ...process.env,
            NODE_ENV: 'test',
            BOT_TOKEN: 'test-bot-token',
            MONGODB_URI: getTestDatabaseUri()
          }
        }
      );

      const legacyUser = await User.findOne({ userId: 811001 }).lean();
      const canonicalUser = await User.findOne({ userId: 811002 }).lean();

      expect(stderr).toBe('');
      expect(stdout).toContain('[migrate:xuanjian-cultivation] dryRun=true');
      expect(stdout).toContain('[migrate:xuanjian-cultivation] migrated=1');
      expect(stdout).toContain('[migrate:xuanjian-cultivation] skipped=1');

      expect(legacyUser?.cultivation.spiritualPower).toBe(12000);
      expect(legacyUser?.cultivation.realm).toBe('炼虚期');
      expect(legacyUser?.cultivation.realmId).toBe(9);
      expect(legacyUser?.cultivation.realmStage).toBe('圆满');
      expect(legacyUser?.cultivation.immortalStones).toBe(88);
      expect(legacyUser?.cultivation.canonical).toBeUndefined();

      expect(canonicalUser?.cultivation.spiritualPower).toBe(0);
      expect(canonicalUser?.cultivation.realm).toBe('胎息');
      expect(canonicalUser?.cultivation.realmId).toBe(1);
      expect(canonicalUser?.cultivation.realmStage).toBe('玄景');
      expect(canonicalUser?.cultivation.immortalStones).toBe(16);
      expect(canonicalUser?.cultivation.canonical?.state.realmId).toBe('realm.taixi');
      expect(canonicalUser?.cultivation.canonical?.state.focusStreak).toBe(3);
    },
    60000
  );
});
