import winston from 'winston';
import config from '../../config/index.js';
import { sanitizeForLogging } from './helpers.js';

// 自定义日志格式
const logFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss.SSS'
  }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({
    level, message, timestamp, ...meta
  }) => {
    let log = `${timestamp} [${level.toUpperCase()}]: ${message}`;

    // 添加元数据
    if (Object.keys(meta).length > 0) {
      const sanitizedMeta = sanitizeForLogging(meta);
      log += ` | ${JSON.stringify(sanitizedMeta)}`;
    }

    return log;
  })
);

// 创建 Winston Logger 实例
const logger = winston.createLogger({
  level: config.logging.level,
  format: logFormat,
  transports: [
    // 控制台输出
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        logFormat
      )
    })
  ],
  // 异常处理
  exceptionHandlers: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        logFormat
      )
    })
  ],
  // Promise 拒绝处理
  rejectionHandlers: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        logFormat
      )
    })
  ]
});

// 在生产环境和开发环境添加文件日志
if (config.app.environment !== 'test') {
  // 创建日志目录（如果不存在）
  try {
    await import('fs').then((fs) => {
      if (!fs.existsSync('logs')) {
        fs.mkdirSync('logs', { recursive: true });
      }
    });
  } catch (error) {
    console.warn('创建日志目录失败:', error.message);
  }

  // 添加文件传输器
  logger.add(
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5,
      tailable: true
    })
  );

  logger.add(
    new winston.transports.File({
      filename: 'logs/combined.log',
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5,
      tailable: true
    })
  );
}

// 扩展 logger 功能
class Logger {
  constructor(winstonLogger) {
    this.winston = winstonLogger;
  }

  // 基础日志方法
  error(message, meta = {}) {
    this.winston.error(message, meta);
  }

  warn(message, meta = {}) {
    this.winston.warn(message, meta);
  }

  info(message, meta = {}) {
    this.winston.info(message, meta);
  }

  debug(message, meta = {}) {
    this.winston.debug(message, meta);
  }

  verbose(message, meta = {}) {
    this.winston.verbose(message, meta);
  }

  // 业务特定的日志方法

  /**
   * 记录用户操作日志
   * @param {number} userId - 用户ID
   * @param {string} action - 操作类型
   * @param {Object} details - 操作详情
   */
  logUserAction(userId, action, details = {}) {
    this.info(`用户操作: ${action}`, {
      userId,
      action,
      ...details,
      category: 'USER_ACTION'
    });
  }

  /**
   * 记录任务操作日志
   * @param {number} userId - 用户ID
   * @param {string} taskId - 任务ID
   * @param {string} action - 操作类型
   * @param {Object} details - 操作详情
   */
  logTaskAction(userId, taskId, action, details = {}) {
    this.info(`任务操作: ${action}`, {
      userId,
      taskId,
      action,
      ...details,
      category: 'TASK_ACTION'
    });
  }

  /**
   * 记录链条操作日志
   * @param {number} userId - 用户ID
   * @param {string} chainId - 链条ID
   * @param {string} action - 操作类型
   * @param {Object} details - 操作详情
   */
  logChainAction(userId, chainId, action, details = {}) {
    this.info(`链条操作: ${action}`, {
      userId,
      chainId,
      action,
      ...details,
      category: 'CHAIN_ACTION'
    });
  }

  /**
   * 记录神圣座位原理执行日志
   * @param {number} userId - 用户ID
   * @param {string} chainId - 链条ID
   * @param {string} reason - 破链原因
   * @param {Object} details - 详细信息
   */
  logSacredSeatPrinciple(userId, chainId, reason, details = {}) {
    this.warn(`神圣座位原理执行: ${reason}`, {
      userId,
      chainId,
      reason,
      ...details,
      category: 'SACRED_SEAT_PRINCIPLE',
      principle: 'SACRED_SEAT'
    });
  }

  /**
   * 记录线性时延原理执行日志
   * @param {number} userId - 用户ID
   * @param {string} reservationId - 预约ID
   * @param {number} delay - 延迟时间
   * @param {Object} details - 详细信息
   */
  logLinearDelayPrinciple(userId, reservationId, delay, details = {}) {
    this.info(`线性时延原理执行: 预约 ${reservationId}`, {
      userId,
      reservationId,
      delay,
      ...details,
      category: 'LINEAR_DELAY_PRINCIPLE',
      principle: 'LINEAR_DELAY'
    });
  }

  /**
   * 记录队列操作日志
   * @param {string} queueName - 队列名称
   * @param {string} action - 操作类型
   * @param {Object} details - 操作详情
   */
  logQueueAction(queueName, action, details = {}) {
    this.info(`队列操作: ${action}`, {
      queueName,
      action,
      ...details,
      category: 'QUEUE_ACTION'
    });
  }

  /**
   * 记录数据库操作日志
   * @param {string} operation - 操作类型
   * @param {string} collection - 集合名称
   * @param {Object} details - 操作详情
   */
  logDatabaseAction(operation, collection, details = {}) {
    this.debug(`数据库操作: ${operation}`, {
      operation,
      collection,
      ...details,
      category: 'DATABASE_ACTION'
    });
  }

  /**
   * 记录性能日志
   * @param {string} operation - 操作名称
   * @param {number} duration - 执行时长（毫秒）
   * @param {Object} details - 详细信息
   */
  logPerformance(operation, duration, details = {}) {
    const level = duration > 1000 ? 'warn' : 'debug';
    this[level](`性能监控: ${operation}`, {
      operation,
      duration,
      ...details,
      category: 'PERFORMANCE'
    });
  }

  /**
   * 记录 API 请求日志
   * @param {string} method - HTTP 方法
   * @param {string} path - 请求路径
   * @param {number} statusCode - 响应状态码
   * @param {number} duration - 响应时间
   * @param {Object} details - 详细信息
   */
  logApiRequest(method, path, statusCode, duration, details = {}) {
    const level = statusCode >= 400 ? 'warn' : 'info';
    this[level](`API 请求: ${method} ${path}`, {
      method,
      path,
      statusCode,
      duration,
      ...details,
      category: 'API_REQUEST'
    });
  }

  /**
   * 记录安全相关日志
   * @param {string} event - 安全事件类型
   * @param {Object} details - 事件详情
   */
  logSecurityEvent(event, details = {}) {
    this.warn(`安全事件: ${event}`, {
      event,
      ...details,
      category: 'SECURITY'
    });
  }

  /**
   * 记录Bot操作日志
   * @param {number} userId - 用户ID
   * @param {string} command - 命令类型
   * @param {Object} details - 操作详情
   */
  logBotCommand(userId, command, details = {}) {
    this.info(`Bot命令: ${command}`, {
      userId,
      command,
      ...details,
      category: 'BOT_COMMAND'
    });
  }

  /**
   * 记录错误详细信息
   * @param {Error} error - 错误对象
   * @param {Object} context - 错误上下文
   */
  logError(error, context = {}) {
    const errorDetails = {
      message: error.message,
      stack: error.stack,
      code: error.code,
      ...context,
      category: 'ERROR'
    };

    this.error(`发生错误: ${error.message}`, errorDetails);
  }

  /**
   * 创建子 logger（带有预设上下文）
   * @param {Object} defaultMeta - 默认元数据
   * @returns {Logger} 子 logger
   */
  child(defaultMeta = {}) {
    const childLogger = this.winston.child(defaultMeta);
    return new Logger(childLogger);
  }

  /**
   * 临时设置日志级别
   * @param {string} level - 日志级别
   */
  setLevel(level) {
    this.winston.level = level;
  }

  /**
   * 获取当前日志级别
   * @returns {string} 当前日志级别
   */
  getLevel() {
    return this.winston.level;
  }

  /**
   * 检查是否启用了某个日志级别
   * @param {string} level - 日志级别
   * @returns {boolean}
   */
  isLevelEnabled(level) {
    return this.winston.isLevelEnabled(level);
  }

  /**
   * 刷新日志缓冲区
   * @returns {Promise<void>}
   */
  async flush() {
    return new Promise((resolve) => {
      // Winston 没有直接的 flush 方法，我们等待所有传输器完成
      const { transports } = this.winston;
      let pendingFlushes = transports.length;

      if (pendingFlushes === 0) {
        resolve();
        return;
      }

      transports.forEach((transport) => {
        if (typeof transport.flush === 'function') {
          transport.flush(() => {
            pendingFlushes -= 1;
            if (pendingFlushes === 0) {
              resolve();
            }
          });
        } else {
          pendingFlushes -= 1;
          if (pendingFlushes === 0) {
            resolve();
          }
        }
      });
    });
  }
}

// 创建并导出 logger 实例
const appLogger = new Logger(logger);

export default appLogger;

// 同时导出原始的 winston logger（如果需要的话）
export { logger as winstonLogger };
