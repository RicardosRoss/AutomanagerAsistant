import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../..');
const deployScriptPath = path.join(projectRoot, 'scripts/deploy-pm2.sh');

describe('PM2 deploy cleanup script', () => {
  test('cleans up both built app and source app manual processes before starting PM2', () => {
    const scriptContent = fs.readFileSync(deployScriptPath, 'utf8');

    expect(scriptContent).toContain('dist/src/app.js');
    expect(scriptContent).toMatch(/src\/app\.\(ts\|js\)|src\/app\.(ts|js)/);
  });
});
