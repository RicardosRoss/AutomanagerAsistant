import { createHash, timingSafeEqual } from 'node:crypto';
import express, { type NextFunction, type Request, type Response } from 'express';
import type ScheduleService from '../services/ScheduleService.js';
import { ScheduleError } from '../utils/scheduleSnapshot.js';

export function isLoopbackAddress(address: string | undefined): boolean {
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
}

export function createScheduleRouter(getService: () => ScheduleService | null,
  settings: { token?: string; userId?: number }, isReady: () => boolean): express.Router {
  const router = express.Router();
  router.use((req, res, next) => {
    if (!isLoopbackAddress(req.socket.remoteAddress)) {
      res.status(403).json({ error: '日程同步仅接受服务器本机连接' });
      return;
    }
    if (!settings.token || settings.token.length < 32 || !Number.isSafeInteger(settings.userId) ||
      settings.userId! <= 0) {
      res.status(503).json({ error: '日程同步尚未配置' });
      return;
    }
    const match = /^Bearer ([^\s]+)$/i.exec(req.headers.authorization ?? '');
    const supplied = createHash('sha256').update(match?.[1] ?? '').digest();
    const expected = createHash('sha256').update(settings.token).digest();
    if (!match || !timingSafeEqual(supplied, expected)) {
      res.status(401).json({ error: '同步身份验证失败' });
      return;
    }
    if (!isReady() || !getService()) {
      res.status(503).json({ error: 'bot 正在启动或依赖未就绪，请稍后重试同步' });
      return;
    }
    next();
  });
  router.use(express.json({ limit: '1mb' }));
  router.post('/sync', async (req, res) => {
    try {
      res.json(await getService()!.sync(settings.userId!, req.body));
    } catch (error) {
      res.status(error instanceof ScheduleError ? error.status : 503).json({
        error: error instanceof ScheduleError ? error.message : '日程保存暂时失败，请稍后重试同步'
      });
    }
  });
  router.use((error: { type?: string }, _req: Request, res: Response, _next: NextFunction) => {
    res.status(error.type === 'entity.too.large' ? 413 : 400).json({ error: '日程 JSON 无效或内容过大' });
  });
  return router;
}
