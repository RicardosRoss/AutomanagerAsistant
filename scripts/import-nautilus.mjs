import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';

// SSH carries the snapshot on stdin. The local credential never leaves this server.
loadEnv({ path: resolve('.env') });
try {
  const token = process.env.NAUTILUS_SYNC_TOKEN;
  if (!token || token.length < 32) throw new Error('VPS 尚未配置 Nautilus 同步');
  let input = '';
  for await (const chunk of process.stdin) {
    input += chunk;
    if (Buffer.byteLength(input) > 1024 * 1024) throw new Error('同步内容过大');
  }
  const payload = JSON.parse(input);
  const port = Number(process.env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('服务器端口配置无效');
  const response = await fetch(`http://127.0.0.1:${port}/api/nautilus/sync`, {
    method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(payload), signal: AbortSignal.timeout(20000)
  });
  const result = await response.json();
  if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : '同步请求失败');
  process.stdout.write(`${JSON.stringify(result)}\n`);
} catch (error) {
  const message = error instanceof Error && !/https?:|token|authorization/i.test(error.message)
    ? error.message : '同步失败，请检查 bot 健康状态后重试';
  process.stderr.write(`nautilus-sync: ${message}\n`);
  process.exitCode = 1;
}
