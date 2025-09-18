import express from 'express';
import SelfControlBot from './bot.js';
import databaseConnection from './database/connection.js';
import redisConnection from './config/redis.js';
import config from '../config/index.js';
import logger from './utils/logger.js';

/**
 * 自控力助手应用主入口
 */
class SelfControlApp {
  constructor() {
    this.app = express();
    this.bot = null;
    this.db = databaseConnection;
    this.redis = redisConnection;
    this.server = null;
  }

  /**
   * 初始化应用
   */
  async initialize() {
    try {
      logger.info('🚀 初始化自控力助手应用', {
        version: config.app.version,
        environment: config.app.environment,
        nodeVersion: process.version
      });

      // 1. 连接数据库
      await this.connectDatabase();

      // 2. 连接Redis
      await this.connectRedis();

      // 3. 设置Express应用
      await this.setupExpress();

      // 4. 初始化并启动Bot
      await this.startBot();

      // 5. 启动HTTP服务器
      await this.startServer();

      // 6. 设置优雅关闭
      this.setupGracefulShutdown();

      logger.info('✅ 自控力助手启动完成', {
        port: config.app.port,
        botStatus: 'running',
        dbStatus: 'connected',
        redisStatus: 'connected'
      });

      // 通知PM2应用已准备就绪
      if (process.send) {
        process.send('ready');
      }
    } catch (error) {
      logger.error('应用初始化失败', { error: error.message, stack: error.stack });
      await this.shutdown(1);
    }
  }

  /**
   * 连接数据库
   */
  async connectDatabase() {
    try {
      await this.db.connect();
      logger.info('✅ 数据库连接成功');
    } catch (error) {
      logger.error('数据库连接失败', { error: error.message });
      throw error;
    }
  }

  /**
   * 连接Redis
   */
  async connectRedis() {
    try {
      await this.redis.connect();
      logger.info('✅ Redis连接成功');
    } catch (error) {
      logger.error('Redis连接失败', { error: error.message });
      throw error;
    }
  }

  /**
   * 设置Express应用
   */
  async setupExpress() {
    // 基础中间件
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));

    // 健康检查端点
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: config.app.version,
        environment: config.app.environment,
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        database: this.db.isConnected() ? 'connected' : 'disconnected',
        redis: this.redis.isConnected ? 'connected' : 'disconnected'
      });
    });

    // API信息端点
    this.app.get('/api/info', (req, res) => {
      res.json({
        name: 'Telegram自控力助手API',
        version: config.app.version,
        description: '基于科学自控力理论的专注任务管理系统',
        documentation: '/api/docs',
        health: '/health'
      });
    });

    // 错误处理中间件
    this.app.use((error, req, res, _next) => {
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

    // 404处理
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

  /**
   * 启动Bot
   */
  async startBot() {
    try {
      this.bot = new SelfControlBot();
      await this.bot.start();
      logger.info('✅ Telegram Bot启动成功');
    } catch (error) {
      logger.error('Bot启动失败', { error: error.message });
      throw error;
    }
  }

  /**
   * 启动HTTP服务器
   */
  async startServer() {
    return new Promise((resolve, reject) => {
      this.server = this.app.listen(config.app.port, (error) => {
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

  /**
   * 设置优雅关闭
   */
  setupGracefulShutdown() {
    // 处理终止信号
    const signals = ['SIGTERM', 'SIGINT', 'SIGUSR2'];

    signals.forEach((signal) => {
      process.on(signal, () => {
        logger.info(`收到 ${signal} 信号，开始优雅关闭`);
        this.shutdown(0);
      });
    });

    // 处理未捕获的异常
    process.on('uncaughtException', (error) => {
      logger.error('未捕获的异常', {
        error: error.message,
        stack: error.stack
      });
      this.shutdown(1);
    });

    // 处理未处理的Promise拒绝
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('未处理的Promise拒绝', {
        reason: reason?.message || reason,
        promise: promise?.toString()
      });
      this.shutdown(1);
    });
  }

  /**
   * 优雅关闭应用
   */
  async shutdown(exitCode = 0) {
    logger.info('开始关闭应用服务');

    const shutdownPromises = [];

    // 关闭Bot
    if (this.bot) {
      shutdownPromises.push(
        this.bot.stop().catch((error) => {
          logger.error('关闭Bot失败', { error: error.message });
        })
      );
    }

    // 关闭HTTP服务器
    if (this.server) {
      shutdownPromises.push(
        new Promise((resolve) => {
          this.server.close((error) => {
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

    // 关闭数据库连接
    if (this.db) {
      shutdownPromises.push(
        this.db.disconnect().catch((error) => {
          logger.error('关闭数据库连接失败', { error: error.message });
        })
      );
    }

    // 关闭Redis连接
    if (this.redis) {
      shutdownPromises.push(
        this.redis.disconnect().catch((error) => {
          logger.error('关闭Redis连接失败', { error: error.message });
        })
      );
    }

    // 等待所有关闭操作完成
    try {
      await Promise.allSettled(shutdownPromises);
      logger.info('应用已优雅关闭');
    } catch (error) {
      logger.error('关闭过程中发生错误', { error: error.message });
    }

    // 强制退出
    process.exit(exitCode);
  }

  /**
   * 获取应用状态
   */
  getStatus() {
    return {
      app: {
        version: config.app.version,
        environment: config.app.environment,
        uptime: process.uptime(),
        memory: process.memoryUsage()
      },
      database: {
        connected: this.db.isConnected(),
        connectionString: this.db.getConnectionString()
      },
      redis: {
        connected: this.redis.isConnected,
        host: this.redis.host,
        port: this.redis.port
      },
      bot: {
        running: this.bot?.isRunning || false
      }
    };
  }
}

// 创建应用实例
const app = new SelfControlApp();

// 启动应用
if (import.meta.url === `file://${process.argv[1]}`) {
  app.initialize().catch((error) => {
    logger.error('应用启动失败', { error: error.message });
    process.exit(1);
  });
}

export default app;
