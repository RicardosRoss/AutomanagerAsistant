import config from '../config/index.js';
import User from '../src/models/User.js';
import databaseConnection from '../src/database/connection.js';
import { prepareCanonicalMigrationForUser } from '../src/services/CultivationMigration.js';

async function run(): Promise<void> {
  const isDryRun = process.argv.includes('--dry-run');
  let migratedCount = 0;
  let skippedCount = 0;

  if (!config.database.uri) {
    throw new Error('缺少数据库连接配置 database.uri');
  }

  await databaseConnection.connect(config.database.uri);

  try {
    for await (const user of User.find().cursor()) {
      const { changed } = prepareCanonicalMigrationForUser(user);

      if (!changed) {
        skippedCount += 1;
        continue;
      }

      migratedCount += 1;
      if (!isDryRun) {
        await user.save();
      }
    }
  } finally {
    await databaseConnection.disconnect();
  }

  console.log(`[migrate:xuanjian-cultivation] dryRun=${isDryRun}`);
  console.log(`[migrate:xuanjian-cultivation] migrated=${migratedCount}`);
  console.log(`[migrate:xuanjian-cultivation] skipped=${skippedCount}`);
}

void run().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[migrate:xuanjian-cultivation] failed: ${message}`);
  process.exitCode = 1;
});
