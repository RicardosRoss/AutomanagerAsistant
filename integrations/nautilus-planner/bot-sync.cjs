#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const configPath = path.join(__dirname, 'bot-sync.json');

function readConfig(file = configPath) {
  if (!fs.existsSync(file)) return { enabled: false };
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function insideVault(note, vault) {
  if (!vault) return false;
  const relative = path.relative(path.resolve(vault), path.resolve(note));
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function buildSnapshot(naut, vault, note, timezone) {
  const generatedAt = new Date().toISOString();
  const previousTimezone = process.env.TZ;
  process.env.TZ = timezone;
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date());
    if (!insideVault(note, vault)) throw new Error('计划笔记不属于配置的 vault');
    const plan = naut.loadPlan(vault, note);
    if (!plan.block) throw new Error('笔记没有 Nautilus 块');
    const date = naut.dateFromPath(note);
    if (!date) throw new Error('日记文件名必须包含 YYYY-MM-DD 日期');
    const view = naut.planView(vault, note, plan, date);
    if (view.malformed.length) throw new Error('日程包含无法解析的行，请先修正后同步');
    if (view.conflicts.length) throw new Error('固定事件存在时间冲突，请先确认或调整日程后同步');
    const capacity = naut.computeCapacity(plan.items, plan.settings, date).capacity;
    const scheduled = new Map(capacity.scheduledTasks.map(task => [task.uid, task]));
    const items = [];
    const flexTitles = new Set();
    for (const item of plan.items) {
      if (item.done) continue;
      if (item.kind === 'task') {
        if (flexTitles.has(item.title)) throw new Error('存在重复弹性任务，请用不同标题区分后再同步');
        flexTitles.add(item.title);
      }
      const slot = item.kind === 'event' ? item : scheduled.get(`L${item.line}`);
      if (!slot) continue;
      const title = item.pinned ? item.title.replace(/^\d{1,2}:\d{1,2}\s+/, '') : item.title;
      items.push({ title, kind: item.kind === 'task' ? 'flex' : item.pinned ? 'pinned' : 'fixed',
        startMinute: slot.start, endMinute: slot.end });
    }
    return { snapshot: { source: 'nautilus', date: view.date, timezone, generatedAt, items },
      capacity: view.capacity.summary, overflow: view.capacity.overflowTasks };
  } finally {
    if (previousTimezone === undefined) delete process.env.TZ;
    else process.env.TZ = previousTimezone;
  }
}

function syncPlan(naut, note, settings, transport = spawnSync) {
  if (!/^[A-Za-z0-9_.@-]+$/.test(settings.sshHost || '') || settings.sshHost.startsWith('-') ||
      !/^\/[A-Za-z0-9_/.-]+$/.test(settings.remoteProject || '') ||
      !/^\/[A-Za-z0-9_/.-]+$/.test(settings.remoteNode || '')) {
    throw new Error('同步连接配置无效');
  }
  const built = buildSnapshot(naut, settings.vault, note, settings.timezone);
  const remote = `cd ${settings.remoteProject} && ${settings.remoteNode} scripts/import-nautilus.mjs`;
  const result = transport('ssh', ['-T', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=8',
    '-o', 'ServerAliveInterval=5', '-o', 'ServerAliveCountMax=2', settings.sshHost, remote], {
    input: JSON.stringify(built.snapshot), encoding: 'utf8', timeout: 45000, maxBuffer: 1024 * 1024
  });
  if (result.status !== 0 || result.error) {
    return { status: 'failed', error: String(result.stderr || result.error?.message || 'SSH 同步失败').trim().slice(0, 400),
      date: built.snapshot.date, capacity: built.capacity, overflow: built.overflow,
      retry: '计划已保存；只重试 bot-sync.cjs sync，不要重复 add' };
  }
  let receipt;
  try { receipt = JSON.parse(result.stdout); } catch { throw new Error('服务器同步响应无效，请重试同步'); }
  if (receipt.date !== built.snapshot.date || !Number.isInteger(receipt.count) || typeof receipt.queued !== 'boolean') {
    throw new Error('服务器同步回执不完整，请重试同步');
  }
  return { status: receipt.queued ? 'synced' : 'saved-awaiting-queue', ...receipt,
    capacity: built.capacity, overflow: built.overflow };
}

function autoSync(view, naut, settings = readConfig(), transport = spawnSync) {
  if (!settings.enabled) return { status: 'disabled' };
  if (!insideVault(view.note, settings.vault)) return { status: 'other-vault' };
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (view.date < naut.fmtISO(yesterday)) return { status: 'past-date' };
  return syncPlan(naut, view.note, settings, transport);
}

function main() {
  const args = process.argv.slice(2);
  if (args.shift() !== 'sync') throw new Error('用法: node bot-sync.cjs sync [--date tomorrow] [--dry-run]');
  const options = {};
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--dry-run') options.dryRun = true;
    else if (['--date', '--vault', '--config', '--naut'].includes(args[i])) {
      if (!args[i + 1]) throw new Error(`缺少 ${args[i]} 参数`);
      options[args[i].slice(2)] = args[++i];
    } else throw new Error(`未知选项: ${args[i]}`);
  }
  const settings = readConfig(options.config);
  if (!settings.enabled && !options.dryRun) throw new Error('请先配置并启用 bot-sync.json');
  settings.vault = options.vault || settings.vault;
  settings.timezone = settings.timezone || 'Asia/Shanghai';
  if (!settings.vault) throw new Error('请指定 vault');
  process.env.TZ = settings.timezone;
  const naut = require(options.naut || path.join(__dirname, 'naut.js'));
  const date = naut.resolveDateArg(options.date || 'tomorrow');
  const note = naut.notePathFor(settings.vault, date);
  const result = options.dryRun ? buildSnapshot(naut, settings.vault, note, settings.timezone)
    : syncPlan(naut, note, settings);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result.status === 'failed' || result.status === 'saved-awaiting-queue') process.exitCode = 1;
}

if (require.main === module) {
  try { main(); } catch (error) {
    process.stderr.write(`nautilus-sync: ${error.message}\n`);
    process.exitCode = 1;
  }
}
module.exports = { readConfig, buildSnapshot, syncPlan, autoSync };
