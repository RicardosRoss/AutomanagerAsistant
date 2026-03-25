import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../..');

const phase5Targets = [
  ['src/services/QueueService.ts', 'src/services/QueueService.js'],
  ['src/services/CultivationService.ts', 'src/services/CultivationService.js'],
  ['src/services/TaskService.ts', 'src/services/TaskService.js'],
  ['src/services/index.ts', 'src/services/index.js']
] as const;

describe('Phase 5 TypeScript migration files', () => {
  test('phase 5 目标文件应该迁移为 TypeScript 文件', () => {
    phase5Targets.forEach(([tsFile, jsFile]) => {
      expect(fs.existsSync(path.join(projectRoot, tsFile)), `${tsFile} should exist`).toBe(true);
      expect(fs.existsSync(path.join(projectRoot, jsFile)), `${jsFile} should be removed`).toBe(false);
    });
  });
});
