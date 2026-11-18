#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');

const sources = [
  'src/app.ts', 'src/bot.ts', 'src/config/bot.ts', 'src/handlers/taskDraftCommands.ts',
  'src/handlers/scheduleCommands.ts', 'src/models/index.ts', 'src/models/ScheduledPlan.ts',
  'src/services/QueueService.ts', 'src/services/ScheduleService.ts', 'src/types/config.ts',
  'src/utils/scheduleSnapshot.ts', 'src/routes/scheduleSync.ts', 'config/index.ts'
];

function collectReleaseFiles(root) {
  const files = new Set(sources);
  for (const source of sources) {
    const stem = `dist/${source.slice(0, -3)}`;
    for (const suffix of ['.js', '.js.map', '.d.ts']) files.add(stem + suffix);
  }
  for (const file of [
    'scripts/import-nautilus.mjs', 'scripts/verify-nautilus.mjs', 'scripts/package-nautilus.cjs', '.env.example',
    'docs/guides/commands.md', 'docs/superpowers/specs/2026-10-10-nautilus-reminders-design.md',
    'docs/superpowers/plans/2026-10-10-nautilus-reminders.md', 'tests/integration/nautilus-bridge.test.ts',
    'tests/unit/nautilus-release.test.ts'
  ]) files.add(file);
  for (const directory of ['integrations/nautilus-planner', 'tests/unit', 'tests/integration']) {
    for (const name of fs.readdirSync(path.join(root, directory))) {
      const file = `${directory}/${name}`;
      if (fs.statSync(path.join(root, file)).isFile() &&
          (directory.startsWith('integrations/') || /^schedule.*\.test\.ts$/.test(name))) files.add(file);
    }
  }
  for (const file of files) {
    if (!fs.existsSync(path.join(root, file))) throw new Error(`Missing release artifact: ${file}; run yarn build`);
  }
  return [...files].sort();
}

function packageRelease(root) {
  const files = collectReleaseFiles(root);
  const manifest = Object.fromEntries(files.map(file => [file,
    createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex')]));
  const manifestPath = 'reports/nautilus-release-manifest.json';
  fs.writeFileSync(path.join(root, manifestPath), `${JSON.stringify(manifest, null, 2)}\n`);
  execFileSync('tar', ['-czf', 'reports/nautilus-release.tar.gz', ...files, manifestPath], { cwd: root });
  return { files: files.length, manifest: manifestPath, archive: 'reports/nautilus-release.tar.gz' };
}

if (require.main === module) process.stdout.write(`${JSON.stringify(packageRelease(process.cwd()))}\n`);
module.exports = { collectReleaseFiles, packageRelease };
