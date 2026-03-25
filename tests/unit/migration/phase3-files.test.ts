import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../..');

const phase3Targets = [
  ['src/utils/logger.ts', 'src/utils/logger.js'],
  ['src/utils/index.ts', 'src/utils/index.js'],
  ['config/index.ts', 'config/index.js'],
  ['src/config/bot.ts', 'src/config/bot.js'],
  ['src/config/redis.ts', 'src/config/redis.js'],
  ['src/database/connection.ts', 'src/database/connection.js']
] as const;

describe('Phase 3 TypeScript migration files', () => {
  test('phase 3 目标文件应该迁移为 TypeScript 文件', () => {
    phase3Targets.forEach(([tsFile, jsFile]) => {
      expect(fs.existsSync(path.join(projectRoot, tsFile)), `${tsFile} should exist`).toBe(true);
      expect(fs.existsSync(path.join(projectRoot, jsFile)), `${jsFile} should be removed`).toBe(false);
    });
  });
});
