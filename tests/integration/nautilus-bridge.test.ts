import { createRequire } from 'node:module';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, cpSync, chmodSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { homedir, tmpdir } from 'node:os';
import { afterEach, expect, test, vi } from 'vitest';

const require = createRequire(import.meta.url);
const bridge = require('../../integrations/nautilus-planner/bot-sync.cjs');
const nautPath = join(homedir(), '.agents/skills/nautilus-planner/scripts/naut.js');
const naut = require(nautPath);
const directories: string[] = [];
afterEach(() => directories.splice(0).forEach(directory => rmSync(directory, { recursive: true, force: true })));

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'nautilus-bridge-test-'));
  directories.push(directory);
  mkdirSync(join(directory, '.obsidian'), { recursive: true });
  writeFileSync(join(directory, '.obsidian/daily-notes.json'),
    JSON.stringify({ folder: 'days', format: 'YYYY-MM-DD' }));
  return directory;
}

function command(vault: string, cmd: string, args: string[]) {
  const result = spawnSync(process.execPath, [nautPath, cmd, '--vault', vault, '--date', 'tomorrow', ...args],
    { encoding: 'utf8', env: { ...process.env, TZ: 'Asia/Shanghai' } });
  if (result.status) throw new Error(result.stderr);
  return JSON.parse(result.stdout);
}

test('bridge reuses actual Nautilus fixed, pinned and flex scheduling including offsets after midnight', () => {
  const vault = fixture();
  const tasks = [
    { title: '阅读', kind: 'pinned', start: '23:00', duration: 45 },
    { title: '实验室', kind: 'fixed', start: '00:30', end: '01:00' },
    { title: '复盘', kind: 'flex', duration: 45 }
  ];
  command(vault, 'add', ['--create', '--json', JSON.stringify(tasks)]);
  const view = command(vault, 'window', ['--start', '23', '--end', '26']);
  const result = bridge.buildSnapshot(naut, vault, view.note, 'Asia/Shanghai');
  expect(result.snapshot.items).toEqual([
    { title: '阅读', kind: 'pinned', startMinute: 1380, endMinute: 1425 },
    { title: '实验室', kind: 'fixed', startMinute: 1470, endMinute: 1500 },
    { title: '复盘', kind: 'flex', startMinute: 1425, endMinute: 1470 }
  ]);
  expect(result.capacity).toBe(view.capacity.summary);
  expect(result.overflow).toEqual([]);
});

test('bridge reports overflow rather than assigning an invented deadline, and rejects fixed conflicts', () => {
  const vault = fixture();
  command(vault, 'add', ['--create', '--json', JSON.stringify([
    { title: '会议', kind: 'fixed', start: '09:00', end: '10:00' },
    { title: '大任务', kind: 'flex', duration: 480 }
  ])]);
  const view = command(vault, 'window', ['--start', '9', '--end', '11']);
  const result = bridge.buildSnapshot(naut, vault, view.note, 'Asia/Shanghai');
  expect(result.snapshot.items).toHaveLength(1);
  expect(result.overflow).toEqual([{ title: '大任务', duration: 480 }]);
  command(vault, 'add', ['--json', JSON.stringify({ title: '组会', kind: 'fixed', start: '09:30', end: '10:30' })]);
  expect(() => bridge.buildSnapshot(naut, vault, view.note, 'Asia/Shanghai')).toThrow(/冲突/);
});

test('completed and removed tasks disappear from the full snapshot and empty means cancel', () => {
  const vault = fixture();
  command(vault, 'add', ['--create', '--json', JSON.stringify({
    title: '阅读', kind: 'pinned', start: '09:00', duration: 45
  })]);
  const done = command(vault, 'complete', ['--match', '阅读', '--at', '09:45']);
  expect(bridge.buildSnapshot(naut, vault, done.note, 'Asia/Shanghai').snapshot.items).toEqual([]);
  const removed = command(vault, 'remove', ['--match', '阅读']);
  expect(bridge.buildSnapshot(naut, vault, removed.note, 'Asia/Shanghai').snapshot.items).toEqual([]);
});

test('ambiguous repeated flex titles are rejected locally with a request to distinguish them', () => {
  const vault = fixture();
  const view = command(vault, 'add', ['--create', '--json', JSON.stringify([
    { title: '阅读', kind: 'flex', duration: 45 }, { title: '阅读', kind: 'flex', duration: 45 }
  ])]);
  expect(() => bridge.buildSnapshot(naut, vault, view.note, 'Asia/Shanghai')).toThrow(/重复.*标题/);
});

test('SSH passes task text on stdin and rejects command injection in connection settings', () => {
  const vault = fixture();
  const view = command(vault, 'add', ['--create', '--json', JSON.stringify({
    title: '读 $TOKEN 和 $(date)', kind: 'pinned', start: '09:00', duration: 45
  })]);
  const settings = { enabled: true, vault, timezone: 'Asia/Shanghai', sshHost: 'vps',
    remoteProject: '/home/user/bot', remoteNode: '/opt/node/bin/node' };
  const transport = vi.fn().mockReturnValue({ status: 0,
    stdout: JSON.stringify({ count: 1, pending: 1, queued: true, date: view.date }), stderr: '' });
  const result = bridge.syncPlan(naut, view.note, settings, transport);
  expect(result.status).toBe('synced');
  expect(transport.mock.calls[0]?.[2].input).toContain('读 $TOKEN 和 $(date)');
  expect(transport.mock.calls[0]?.[1].join(' ')).not.toContain('$TOKEN');
  expect(() => bridge.syncPlan(naut, view.note, { ...settings, sshHost: 'vps;cat secret' }, transport)).toThrow();
  expect(() => bridge.syncPlan(naut, view.note, {
    ...settings, remoteProject: '/tmp/$(command)'
  }, transport)).toThrow();
  const failed = vi.fn().mockReturnValue({ status: 1, stdout: '', stderr: 'Connection timed out' });
  expect(bridge.syncPlan(naut, view.note, settings, failed)).toMatchObject({ status: 'failed' });
});

test('post-write hook only syncs the bound vault, reports network failure without replaying the edit', () => {
  const vault = fixture();
  const view = command(vault, 'add', ['--create', '--json', JSON.stringify({
    title: '写作', kind: 'pinned', start: '10:00', duration: 30
  })]);
  expect(bridge.autoSync(view, naut, { enabled: false, vault })).toMatchObject({ status: 'disabled' });
  expect(bridge.autoSync(view, naut, {
    enabled: true, vault: join(vault, 'other')
  })).toMatchObject({ status: 'other-vault' });
});

test('installed skill automatically syncs writes, leaves show read-only, and does not replay failed edits', () => {
  const vault = fixture();
  const temporary = mkdtempSync(join(tmpdir(), 'nautilus-hook-test-'));
  directories.push(temporary);
  const scripts = join(temporary, 'scripts');
  cpSync(join(homedir(), '.agents/skills/nautilus-planner/scripts'), scripts, { recursive: true });
  const installer = require('../../integrations/nautilus-planner/install.cjs');
  installer.install(scripts);
  const installed = readFileSync(join(scripts, 'naut.js'), 'utf8');
  installer.install(scripts);
  expect(readFileSync(join(scripts, 'naut.js'), 'utf8')).toBe(installed);
  writeFileSync(join(scripts, 'bot-sync.json'), JSON.stringify({ enabled: true, vault, timezone: 'Asia/Shanghai',
    sshHost: 'vps', remoteProject: '/test/bot', remoteNode: '/usr/bin/node' }));
  const ssh = join(temporary, 'ssh');
  writeFileSync(ssh, '#!/usr/bin/env node\nlet data="";process.stdin.on("data",x=>data+=x);' +
    'process.stdin.on("end",()=>{const p=JSON.parse(data);process.stdout.write(JSON.stringify({' +
    'date:p.date,count:p.items.length,pending:p.items.length,queued:true}));});\n');
  chmodSync(ssh, 0o700);
  const run = (cmd: string, args: string[]) => spawnSync(process.execPath,
    [join(scripts, 'naut.js'), cmd, '--vault', vault, '--date', 'tomorrow', ...args], {
      encoding: 'utf8', env: { ...process.env, TZ: 'Asia/Shanghai', PATH: `${temporary}:${process.env.PATH}` }
    });
  const first = run('add', ['--create', '--json', JSON.stringify({ title: '写作', start: '10:00', duration: 30 })]);
  expect(first.status).toBe(0);
  expect(JSON.parse(first.stdout).botSync).toMatchObject({ status: 'synced', count: 1 });
  expect(JSON.parse(run('show', []).stdout).botSync).toBeUndefined();
  writeFileSync(ssh, '#!/usr/bin/env node\nprocess.stderr.write("test offline");process.exitCode=1;\n');
  const failed = run('add', ['--json', JSON.stringify({ title: '复盘', start: '11:00', duration: 30 })]);
  expect(failed.status).toBe(0);
  expect(JSON.parse(failed.stdout).botSync).toMatchObject({ status: 'failed' });
  expect(JSON.parse(run('show', []).stdout).items.map((item: any) => item.title)).toHaveLength(2);
  const standalone = spawnSync(process.execPath, [join(scripts, 'bot-sync.cjs'), 'sync', '--date', 'tomorrow'], {
    encoding: 'utf8', env: { ...process.env, TZ: 'Asia/Shanghai', PATH: `${temporary}:${process.env.PATH}` }
  });
  expect(standalone.status).toBe(1);
  expect(JSON.parse(run('show', []).stdout).items).toHaveLength(2);
});
