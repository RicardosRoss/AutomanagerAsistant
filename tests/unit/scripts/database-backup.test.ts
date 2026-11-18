import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, writeFile, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, test } from 'vitest';

const exec = promisify(execFile);

const scenarios = [
  'success', 'slow-health', 'dump-fails', 'dump-times-out', 'mismatch', 'restart-fails', 'busy', 'locked'
];

test.each(scenarios)('database backup handles %s with service recovery', async mode => {
  const directory = await mkdtemp(join(tmpdir(), 'selfcontrol-backup-test-'));
  const tools = join(directory, 'bin');
  await exec('mkdir', ['-p', tools]);
  const log = join(directory, 'calls');
  const fixture = `#!/bin/bash
set -eu
name="$(basename "$0")"
printf '%s %s\\n' "$name" "$*" >> "$TASK_FIXTURE_LOG"
case "$name" in
timeout)
  case "$1" in --kill-after=*) shift;; esac
  shift
  exec "$@";;
flock) if [ "$TASK_FIXTURE_MODE" = locked ]; then exit 1; fi;;
node)
  case "$2" in
    pm2-check) exit 0;;
    preflight) exit 0;;
    config) printf 'uri: "mongodb://test:secret-password@localhost/selfcontrol"\\n' > "$3";;
    snapshot) if [ "$TASK_FIXTURE_MODE" = busy ]; then exit 4; fi; printf '{"collections":[]}' > "$3";;
    compare) if [ "$TASK_FIXTURE_MODE" = mismatch ]; then exit 5; fi;;
    *) exit 9;;
  esac;;
pm2) if [ "$1" = restart ] && [ "$TASK_FIXTURE_MODE" = restart-fails ]; then exit 6; fi;;
mongodump)
  if [ "$1" = --version ]; then exit 0; fi
  if [ "$TASK_FIXTURE_MODE" = dump-fails ]; then exit 3; fi
  if [ "$TASK_FIXTURE_MODE" = dump-times-out ]; then exit 124; fi
  for arg in "$@"; do
    case "$arg" in --archive=*)
      destination="$(printf '%s' "$arg" | cut -d= -f2-)"
      printf 'archive' > "$destination";;
    esac
  done;;
curl)
  if [ "$TASK_FIXTURE_MODE" = slow-health ]; then
    retries=0
    next=0
    for arg in "$@"; do
      if [ "$arg" = --retry ]; then next=1; continue; fi
      if [ "$next" = 1 ]; then retries="$arg"; next=0; fi
    done
    # The live restart needed more than the original ten readiness probes.
    if [ "$retries" -lt 12 ]; then exit 22; fi
  fi
  printf '{"status":"healthy"}';;
esac
`;
  for (const name of ['node', 'pm2', 'mongodump', 'curl', 'timeout', 'flock']) {
    await writeFile(join(tools, name), fixture, { mode: 0o700 });
  }
  let failed = false;
  try {
    await exec('bash', [resolve('scripts/backup-database.sh')], {
      env: {
        ...process.env,
        PATH: `${tools}:${process.env.PATH}`,
        TASK_BACKUP_DIRECTORY: join(directory, 'backups'),
        TASK_FIXTURE_LOG: log,
        TASK_FIXTURE_MODE: mode
      }
    });
  } catch {
    failed = true;
  }
  try {
    expect(failed).toBe(!['success', 'slow-health'].includes(mode));
    const calls = await readFile(log, 'utf8');
    if (mode !== 'locked') {
      expect(calls).toContain('pm2 stop telegram-self-control-bot');
      expect(calls).toContain('pm2 restart telegram-self-control-bot');
    } else {
      expect(calls).not.toContain('pm2 stop');
      expect(calls).not.toContain('pm2 restart');
    }
    expect(calls).not.toContain('secret-password');
    expect(calls).not.toContain('telegram-sticker-bot');
    const backups = join(directory, 'backups');
    const outputs = (await readdir(backups)).filter(name => name.startsWith('database-'));
    expect(outputs).toHaveLength(mode === 'locked' ? 0 : 1);
    if (mode === 'locked') return;
    const files = await readdir(join(backups, outputs[0]!));
    expect(files.includes('COMPLETE')).toBe(['success', 'slow-health'].includes(mode));
    expect(files).not.toContain('tools-config.yml');
    if (mode === 'busy') expect(calls).not.toContain('--archive=');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
