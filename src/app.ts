import type { Server } from 'node:http';
import express, { type NextFunction, type Request, type Response } from 'express';
import SelfControlBot from './bot.js';
import databaseConnection from './database/connection.js';
import redisConnection from './config/redis.js';
import ContentNameResolver from './services/ContentNameResolver.js';
import config from '../config/index.js';
import logger from './utils/logger.js';

class SelfControlApp {
  app: express.Express;

  bot: SelfControlBot | null;

  db: typeof databaseConnection;

  redis: typeof redisConnection;

  contentNameResolver: ContentNameResolver;

  server: Server | null;

  constructor() {
    this.app = express();
    this.bot = null;
    this.db = databaseConnection;
    this.redis = redisConnection;
    this.contentNameResolver = new ContentNameResolver();
    this.server = null;
  }

  async initialize(): Promise<void> {
    try {
      logger.info('🚀 初始化自控力助手应用', {
        version: config.app.version,
        environment: config.app.environment,
        nodeVersion: process.version
      });

      await this.connectDatabase();
      await this.connectRedis();
      await this.warmupContentNames();
      await this.setupExpress();
      await this.startBot();
      await this.startServer();
      this.setupGracefulShutdown();

      logger.info('✅ 自控力助手启动完成', {
        port: config.app.port,
        botStatus: 'running',
        dbStatus: 'connected',
        redisStatus: 'connected'
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;
      logger.error('应用初始化失败', { error: message, stack });
      await this.shutdown(1);
    }
  }

  async connectDatabase(): Promise<void> {
    try {
      await this.db.connect();
      logger.info('✅ 数据库连接成功');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('数据库连接失败', { error: message });
      throw error;
    }
  }

  async connectRedis(): Promise<void> {
    try {
      await this.redis.connect();
      logger.info('✅ Redis连接成功');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('Redis连接失败', { error: message });
      throw error;
    }
  }

  async warmupContentNames(): Promise<void> {
    try {
      await this.contentNameResolver.warmup();
      logger.info('✅ 玄鉴内容名称缓存预热完成');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('玄鉴内容名称缓存预热失败', { error: message });
      throw error;
    }
  }

  async setupExpress(): Promise<void> {
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));

    this.app.get('/health', (_req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: config.app.version,
        environment: config.app.environment,
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        database: this.db.isConnected ? 'connected' : 'disconnected',
        redis: this.redis.isConnected ? 'connected' : 'disconnected'
      });
    });

    this.app.get('/api/info', (_req, res) => {
      res.json({
        name: 'Telegram自控力助手API',
        version: config.app.version,
        description: '基于科学自控力理论的专注任务管理系统',
        documentation: '/api/docs',
        health: '/health'
      });
    });

    this.app.use((error: Error, req: Request, res: Response, _next: NextFunction) => {
      logger.error('Express错误', {
        error: error.message,
        stack: error.stack,
        url: req.url,
        method: req.method
      });

      res.status(500).json({
        error: '服务器内部错误',
        timestamp: new Date().toISOString(),
        requestId: req.headers['x-request-id'] || 'unknown'
      });
    });

    this.app.use('*', (req, res) => {
      res.status(404).json({
        error: '端点不存在',
        path: req.originalUrl,
        method: req.method,
        timestamp: new Date().toISOString()
      });
    });

    logger.info('✅ Express应用配置完成');
  }

  async startBot(): Promise<void> {
    try {
      this.bot = new SelfControlBot({
        contentNameResolver: this.contentNameResolver
      });
      await this.bot.start();
      logger.info('✅ Telegram Bot启动成功');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('Bot启动失败', { error: message });
      throw error;
    }
  }

  async startServer(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.server = this.app.listen(config.app.port, (error?: Error) => {
        if (error) {
          logger.error('HTTP服务器启动失败', { error: error.message });
          reject(error);
        } else {
          logger.info(`✅ HTTP服务器启动成功，端口: ${config.app.port}`);
          resolve();
        }
      });
    });
  }

  setupGracefulShutdown(): void {
    const signals = ['SIGTERM', 'SIGINT', 'SIGUSR2'] as const;

    signals.forEach((signal) => {
      process.on(signal, () => {
        logger.info(`收到 ${signal} 信号，开始优雅关闭`);
        void this.shutdown(0);
      });
    });

    process.on('uncaughtException', (error) => {
      logger.error('未捕获的异常', {
        error: error.message,
        stack: error.stack
      });
      void this.shutdown(1);
    });

    process.on('unhandledRejection', (reason, promise) => {
      const reasonMessage = reason instanceof Error ? reason.message : String(reason);
      logger.error('未处理的Promise拒绝', {
        reason: reasonMessage,
        promise: promise?.toString()
      });
      void this.shutdown(1);
    });
  }

  async shutdown(exitCode = 0): Promise<void> {
    logger.info('开始关闭应用服务');

    const shutdownPromises: Promise<unknown>[] = [];

    if (this.bot) {
      shutdownPromises.push(
        this.bot.stop().catch((error: unknown) => {
          const message = error instanceof Error ? error.message : String(error);
          logger.error('关闭Bot失败', { error: message });
        })
      );
    }

    if (this.server) {
      shutdownPromises.push(
        new Promise<void>((resolve) => {
          this.server?.close((error?: Error) => {
            if (error) {
              logger.error('关闭HTTP服务器失败', { error: error.message });
            } else {
              logger.info('HTTP服务器已关闭');
            }
            resolve();
          });
        })
      );
    }

    shutdownPromises.push(
      this.db.disconnect().catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        logger.error('关闭数据库连接失败', { error: message });
      })
    );

    shutdownPromises.push(
      this.redis.disconnect().catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        logger.error('关闭Redis连接失败', { error: message });
      })
    );

    try {
      await Promise.allSettled(shutdownPromises);
      logger.info('应用已优雅关闭');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('关闭过程中发生错误', { error: message });
    }

    process.exit(exitCode);
  }

  getStatus(): Record<string, unknown> {
    return {
      app: {
        version: config.app.version,
        environment: config.app.environment,
        uptime: process.uptime(),
        memory: process.memoryUsage()
      },
      database: {
        connected: this.db.isConnected,
        state: this.db.getConnectionState()
      },
      redis: {
        connected: this.redis.isConnected,
        host: config.redis.host,
        port: config.redis.port
      },
      bot: {
        running: this.bot?.isRunning || false
      }
    };
  }
}

const app = new SelfControlApp();

if (import.meta.url === `file://${process.argv[1]}`) {
  app.initialize().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('应用启动失败', { error: message });
    process.exit(1);
  });
}

export default app;
