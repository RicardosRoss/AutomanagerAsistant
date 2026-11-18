#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');

function install(scriptDirectory) {
  const file = path.join(scriptDirectory, 'naut.js');
  const source = fs.readFileSync(file, 'utf8');
  const original = "function outJSON(obj) { process.stdout.write(`${JSON.stringify(obj, null, 2)}\\n`); }";
  const hook = `function outJSON(obj) {
  // A failed sync must not replay a successful plan edit.
  const mutations = ['add', 'remove', 'move', 'complete', 'window'];
  if (require.main === module && mutations.includes(process.argv[2]) && obj?.note && obj?.capacity) {
    try {
      obj.botSync = require('./bot-sync.cjs').autoSync(obj, module.exports);
    } catch (error) {
      obj.botSync = { status: 'failed', error: error.message,
        retry: '计划已保存；只重试 bot-sync.cjs sync，不要重复 add' };
    }
  }
  process.stdout.write(\`\${JSON.stringify(obj, null, 2)}\\n\`);
}`;
  let updated = source;
  if (!updated.includes("require('./bot-sync.cjs').autoSync")) {
    if (!source.includes(original)) throw new Error('naut.js 输出接口已变化，请先检查后安装');
    updated = updated.replace(original, hook);
  }
  const invoke = 'if (require.main === module) main();';
  // The hook needs the exported engine while main is running.
  if (updated.indexOf(invoke) < updated.indexOf('module.exports = {')) {
    updated = updated.replace(invoke, '').trimEnd() + `\n\n${invoke}\n`;
  }
  if (updated !== source) fs.writeFileSync(file, updated);
  fs.copyFileSync(path.join(__dirname, 'bot-sync.cjs'), path.join(scriptDirectory, 'bot-sync.cjs'));
}

if (require.main === module) {
  try {
    if (!process.argv[2]) throw new Error('用法: node install.cjs <nautilus-planner/scripts 目录>');
    install(path.resolve(process.argv[2]));
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
module.exports = { install };
