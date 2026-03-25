import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../..');

const phase4Targets = [
  ['src/models/User.ts', 'src/models/User.js'],
  ['src/models/TaskChain.ts', 'src/models/TaskChain.js'],
  ['src/models/DailyStats.ts', 'src/models/DailyStats.js'],
  ['src/models/DivinationHistory.ts', 'src/models/DivinationHistory.js'],
  ['src/models/index.ts', 'src/models/index.js']
] as const;

describe('Phase 4 TypeScript migration files', () => {
  test('phase 4 目标文件应该迁移为 TypeScript 文件', () => {
    phase4Targets.forEach(([tsFile, jsFile]) => {
      expect(fs.existsSync(path.join(projectRoot, tsFile)), `${tsFile} should exist`).toBe(true);
      expect(fs.existsSync(path.join(projectRoot, jsFile)), `${jsFile} should be removed`).toBe(false);
    });
  });
});
