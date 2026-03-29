import path from 'node:path';
import { describe, expect, test } from 'vitest';

import { resolveEnvFilePath } from '../../../config/index.js';

describe('config env path resolution', () => {
  test('should resolve the repository root .env from the source config directory', () => {
    const envPath = resolveEnvFilePath(path.resolve(process.cwd(), 'config'), '.env');

    expect(envPath).toBe(path.resolve(process.cwd(), '.env'));
  });

  test('should resolve the repository root .env from the built dist config directory', () => {
    const envPath = resolveEnvFilePath(path.resolve(process.cwd(), 'dist/config'), '.env');

    expect(envPath).toBe(path.resolve(process.cwd(), '.env'));
  });
});
