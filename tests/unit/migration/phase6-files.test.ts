import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../..');

const phase6Targets = [
  ['src/handlers/coreCommands.ts', 'src/handlers/coreCommands.js'],
  ['src/handlers/taskCommands.ts', 'src/handlers/taskCommands.js'],
  ['src/handlers/cultivationCommands.ts', 'src/handlers/cultivationCommands.js'],
  ['src/bot.ts', 'src/bot.js'],
  ['src/app.ts', 'src/app.js']
] as const;

describe('Phase 6 TypeScript migration files', () => {
  test('phase 6 目标文件应该迁移为 TypeScript 文件', () => {
    phase6Targets.forEach(([tsFile, jsFile]) => {
      expect(fs.existsSync(path.join(projectRoot, tsFile)), `${tsFile} should exist`).toBe(true);
      expect(fs.existsSync(path.join(projectRoot, jsFile)), `${jsFile} should be removed`).toBe(false);
    });
  });
});
