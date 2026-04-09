import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../..');

describe('package.json startup scripts', () => {
  test('dev script should point to the TypeScript app entry', () => {
    const packageJsonPath = path.join(projectRoot, 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8')) as {
      main: string;
      scripts: Record<string, string>;
    };

    expect(packageJson.main).toBe('dist/src/app.js');
    expect(packageJson.scripts.start).toBe('node dist/src/app.js');
    expect(packageJson.scripts.dev).toBe('tsx watch src/app.ts');
  });
});
