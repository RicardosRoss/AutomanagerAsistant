import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { posix } from 'node:path';
import { expect, test } from 'vitest';

const require = createRequire(import.meta.url);
const { collectReleaseFiles } = require('../../scripts/package-nautilus.cjs');

test('the release includes the source, runtime and metadata of every new schedule module and its app route', () => {
  const files: string[] = collectReleaseFiles(process.cwd());
  for (const module of ['routes/scheduleSync', 'models/ScheduledPlan', 'services/ScheduleService',
    'handlers/scheduleCommands', 'utils/scheduleSnapshot']) {
    expect(files).toContain(`src/${module}.ts`);
    for (const suffix of ['.js', '.js.map', '.d.ts']) expect(files).toContain(`dist/src/${module}${suffix}`);
  }
  const entry = readFileSync('dist/src/app.js', 'utf8');
  const imports = Array.from(entry.matchAll(/from ['"](\.[^'"]+)['"]/g)).map(match =>
    posix.normalize(posix.join('dist/src', match[1]!)));
  for (const file of imports.filter(file => /schedule/i.test(file))) expect(files).toContain(file);
});
