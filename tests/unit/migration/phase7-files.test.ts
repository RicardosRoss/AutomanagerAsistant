import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../..');

const phase7Targets = [
  ['tests/task-duplicate-completion.test.ts', 'tests/task-duplicate-completion.test.js'],
  ['tests/cultivation.test.ts', 'tests/cultivation.test.js']
] as const;

describe('Phase 7 TypeScript migration files', () => {
  test('phase 7 目标测试文件应该迁移为 Vitest TypeScript 文件', () => {
    phase7Targets.forEach(([tsFile, jsFile]) => {
      expect(fs.existsSync(path.join(projectRoot, tsFile)), `${tsFile} should exist`).toBe(true);
      expect(fs.existsSync(path.join(projectRoot, jsFile)), `${jsFile} should be removed`).toBe(false);
    });
  });
});
