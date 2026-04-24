import config from '../config/index.js';
import databaseConnection from '../src/database/connection.js';
import ContentDefinition from '../src/models/ContentDefinition.js';
import ContentDefinitionService from '../src/services/ContentDefinitionService.js';

async function run(): Promise<void> {
  if (!config.database.uri) {
    throw new Error('缺少数据库连接配置 database.uri');
  }

  await databaseConnection.connect(config.database.uri);

  try {
    const service = new ContentDefinitionService();
    const batch = await service.loadRuntimeReadyContentBatch();
    const totalDefinitions = await ContentDefinition.countDocuments();
    const runtimeReadyDefinitions = await ContentDefinition.countDocuments({ status: 'runtime_ready' });

    console.log(`[validate:xuanjian-content] definitions=${totalDefinitions}`);
    console.log(`[validate:xuanjian-content] runtimeReadyDefinitions=${runtimeReadyDefinitions}`);
    console.log(`[validate:xuanjian-content] projectedBattleArts=${batch.battleArts.length}`);
    console.log(`[validate:xuanjian-content] projectedDivinePowers=${batch.divinePowers.length}`);
  } finally {
    await databaseConnection.disconnect();
  }
}

void run().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[validate:xuanjian-content] failed: ${message}`);
  process.exitCode = 1;
});
