import fs from 'node:fs';
import winston, { type Logger as WinstonLogger } from 'winston';
import config from '../../config/index.js';
import { sanitizeForLogging } from './helpers.js';

type LogMeta = Record<string, unknown>;
type LogLevel = 'error' | 'warn' | 'info' | 'debug' | 'verbose';

interface FlushableTransport {
  flush?: (callback: () => void) => void;
}

const logFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss.SSS'
  }),
  winston.format.errors({ stack: true }),
  winston.format.printf((info) => {
    const { level, message, timestamp, ...meta } = info;
    let log = `${timestamp} [${level.toUpperCase()}]: ${message}`;

    if (Object.keys(meta).length > 0) {
      const sanitizedMeta = sanitizeForLogging(meta as LogMeta);
      log += ` | ${JSON.stringify(sanitizedMeta)}`;
    }

    return log;
  })
);

const logger = winston.createLogger({
  level: config.logging.level,
  format: logFormat,
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        logFormat
      )
    })
  ],
  exceptionHandlers: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        logFormat
      )
    })
  ],
  rejectionHandlers: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        logFormat
      )
    })
  ]
});

if (config.app.environment !== 'test') {
  try {
    if (!fs.existsSync('logs')) {
      fs.mkdirSync('logs', { recursive: true });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn('创建日志目录失败:', message);
  }

  logger.add(
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      maxsize: 10 * 1024 * 1024,
      maxFiles: 5,
      tailable: true
    })
  );

  logger.add(
    new winston.transports.File({
      filename: 'logs/combined.log',
      maxsize: 10 * 1024 * 1024,
      maxFiles: 5,
      tailable: true
    })
  );
}

class Logger {
  winston: WinstonLogger;

  constructor(winstonLogger: WinstonLogger) {
    this.winston = winstonLogger;
  }

  error(message: string, meta: LogMeta = {}): void {
    this.winston.error(message, meta);
  }

  warn(message: string, meta: LogMeta = {}): void {
    this.winston.warn(message, meta);
  }

  info(message: string, meta: LogMeta = {}): void {
    this.winston.info(message, meta);
  }

  debug(message: string, meta: LogMeta = {}): void {
    this.winston.debug(message, meta);
  }

  verbose(message: string, meta: LogMeta = {}): void {
    this.winston.verbose(message, meta);
  }

  logUserAction(userId: number, action: string, details: LogMeta = {}): void {
    this.info(`用户操作: ${action}`, {
      userId,
      action,
      ...details,
      category: 'USER_ACTION'
    });
  }

  logTaskAction(userId: number, taskId: string, action: string, details: LogMeta = {}): void {
    this.info(`任务操作: ${action}`, {
      userId,
      taskId,
      action,
      ...details,
      category: 'TASK_ACTION'
    });
  }

  logChainAction(userId: number, chainId: string, action: string, details: LogMeta = {}): void {
    this.info(`链条操作: ${action}`, {
      userId,
      chainId,
      action,
      ...details,
      category: 'CHAIN_ACTION'
    });
  }

  logSacredSeatPrinciple(userId: number, chainId: string, reason: string, details: LogMeta = {}): void {
    this.warn(`神圣座位原理执行: ${reason}`, {
      userId,
      chainId,
      reason,
      ...details,
      category: 'SACRED_SEAT_PRINCIPLE',
      principle: 'SACRED_SEAT'
    });
  }

  logLinearDelayPrinciple(
    userId: number,
    reservationId: string,
    delay: number,
    details: LogMeta = {}
  ): void {
    this.info(`线性时延原理执行: 预约 ${reservationId}`, {
      userId,
      reservationId,
      delay,
      ...details,
      category: 'LINEAR_DELAY_PRINCIPLE',
      principle: 'LINEAR_DELAY'
    });
  }

  logQueueAction(queueName: string, action: string, details: LogMeta = {}): void {
    this.info(`队列操作: ${action}`, {
      queueName,
      action,
      ...details,
      category: 'QUEUE_ACTION'
    });
  }

  logDatabaseAction(operation: string, collection: string, details: LogMeta = {}): void {
    this.debug(`数据库操作: ${operation}`, {
      operation,
      collection,
      ...details,
      category: 'DATABASE_ACTION'
    });
  }

  logPerformance(operation: string, duration: number, details: LogMeta = {}): void {
    const level: LogLevel = duration > 1000 ? 'warn' : 'debug';
    this[level](`性能监控: ${operation}`, {
      operation,
      duration,
      ...details,
      category: 'PERFORMANCE'
    });
  }

  logApiRequest(
    method: string,
    path: string,
    statusCode: number,
    duration: number,
    details: LogMeta = {}
  ): void {
    const level: LogLevel = statusCode >= 400 ? 'warn' : 'info';
    this[level](`API 请求: ${method} ${path}`, {
      method,
      path,
      statusCode,
      duration,
      ...details,
      category: 'API_REQUEST'
    });
  }

  logSecurityEvent(event: string, details: LogMeta = {}): void {
    this.warn(`安全事件: ${event}`, {
      event,
      ...details,
      category: 'SECURITY'
    });
  }

  logBotCommand(userId: number, command: string, details: LogMeta = {}): void {
    this.info(`Bot命令: ${command}`, {
      userId,
      command,
      ...details,
      category: 'BOT_COMMAND'
    });
  }

  logError(error: unknown, context: LogMeta = {}): void {
    const normalizedError = error instanceof Error ? error : new Error(String(error));
    const normalizedErrorWithCode = normalizedError as Error & { code?: string };
    this.error(`发生错误: ${normalizedError.message}`, {
      message: normalizedError.message,
      stack: normalizedError.stack,
      ...(normalizedErrorWithCode.code ? { code: normalizedErrorWithCode.code } : {}),
      ...context,
      category: 'ERROR'
    });
  }

  child(defaultMeta: LogMeta = {}): Logger {
    return new Logger(this.winston.child(defaultMeta));
  }

  setLevel(level: string): void {
    this.winston.level = level;
  }

  getLevel(): string {
    return this.winston.level;
  }

  isLevelEnabled(level: string): boolean {
    return this.winston.isLevelEnabled(level);
  }

  async flush(): Promise<void> {
    return new Promise((resolve) => {
      const transports = this.winston.transports as Array<FlushableTransport>;
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

const appLogger = new Logger(logger);

export default appLogger;
export { logger as winstonLogger };
