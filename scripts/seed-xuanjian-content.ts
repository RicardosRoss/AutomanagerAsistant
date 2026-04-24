import config from '../config/index.js';
import databaseConnection from '../src/database/connection.js';
import ContentDefinition from '../src/models/ContentDefinition.js';
import { getRuntimeContentName, getRuntimeReadyContentBatch } from '../src/config/xuanjianV2Registry.js';

async function run(): Promise<void> {
  if (!config.database.uri) {
    throw new Error('缺少数据库连接配置 database.uri');
  }

  await databaseConnection.connect(config.database.uri);

  try {
    const batch = getRuntimeReadyContentBatch();
    let upsertedCount = 0;

    for (const { entry, runtimeProfile } of batch.battleArts) {
      await ContentDefinition.updateOne(
        { definitionId: entry.id, version: runtimeProfile.balanceProfile.version },
        {
          $set: {
            definitionId: entry.id,
            category: 'battle_art',
            name: getRuntimeContentName(entry.id),
            version: runtimeProfile.balanceProfile.version,
            status: 'runtime_ready',
            source: 'builtin_seed',
            tags: entry.tags,
            realmFloor: entry.requiredRealmId,
            payload: {
              runtimeReady: entry.runtimeReady,
              category: entry.category,
              requiredRealmId: entry.requiredRealmId,
              requiredRealmSubStageId: entry.requiredRealmSubStageId
            },
            balanceProfile: {
              ...runtimeProfile.balanceProfile,
              actionType: runtimeProfile.actionProfile.actionType
            }
          }
        },
        { upsert: true }
      );
      upsertedCount += 1;
    }

    for (const { entry, runtimeProfile } of batch.divinePowers) {
      await ContentDefinition.updateOne(
        { definitionId: entry.id, version: runtimeProfile.balanceProfile.version },
        {
          $set: {
            definitionId: entry.id,
            category: 'divine_power',
            name: getRuntimeContentName(entry.id),
            version: runtimeProfile.balanceProfile.version,
            status: 'runtime_ready',
            source: 'builtin_seed',
            tags: entry.tags,
            realmFloor: entry.requiredRealmId,
            payload: {
              runtimeReady: entry.runtimeReady,
              category: entry.category,
              requiredRealmId: entry.requiredRealmId,
              requiredRealmSubStageId: entry.requiredRealmSubStageId
            },
            balanceProfile: {
              ...runtimeProfile.balanceProfile,
              actionType: runtimeProfile.actionProfile.actionType
            }
          }
        },
        { upsert: true }
      );
      upsertedCount += 1;
    }

    console.log(`[seed:xuanjian-content] upserted=${upsertedCount}`);
  } finally {
    await databaseConnection.disconnect();
  }
}

void run().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[seed:xuanjian-content] failed: ${message}`);
  process.exitCode = 1;
});
