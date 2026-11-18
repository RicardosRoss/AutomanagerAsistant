import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm, writeFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, test } from 'vitest';

const exec = promisify(execFile);

test.each(['missing-marker', 'corrupt-checksum'])('isolated restore rejects %s before starting MongoDB', async mode => {
  const directory = await mkdtemp(join(tmpdir(), 'selfcontrol-verify-test-'));
  await writeFile(join(directory, 'selfcontrol.archive.gz'), 'broken');
  await writeFile(join(directory, 'SHA256SUMS'), `${'0'.repeat(64)}  selfcontrol.archive.gz\n`);
  if (mode === 'corrupt-checksum') await writeFile(join(directory, 'COMPLETE'), 'complete');
  try {
    const result = await exec('bash', [resolve('scripts/verify-database-backup.sh'), directory]).catch(
      (error: { code: number; stderr: string }) => error
    );
    expect(result).toMatchObject({ code: 1 });
    expect(result.stderr).toMatch(/Incomplete backup|checksum/i);
    expect((await readdir(directory)).some(name => name.startsWith('verify-'))).toBe(false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
