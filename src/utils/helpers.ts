export interface RetryOptions {
  maxAttempts?: number;
  delay?: number;
  backoff?: 'fixed' | 'exponential';
  shouldRetry?: (error: unknown) => boolean;
}

export interface ParsedTaskCommand {
  description: string;
  duration: number;
}

export interface DateBounds {
  start: Date;
  end: Date;
}

export interface AppError extends Error {
  code: string;
  details: Record<string, unknown>;
  timestamp: string;
}

/**
 * 生成唯一ID
 */
export function generateId(prefix = 'id'): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 11);
  return `${prefix}_${timestamp}_${random}`;
}

/**
 * 格式化时长（分钟）
 */
export function formatDuration(minutes: number | null | undefined): string {
  if (!minutes || minutes <= 0) return '0分钟';

  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;

  if (hours > 0) {
    return mins > 0 ? `${hours}小时${mins}分钟` : `${hours}小时`;
  }
  return `${mins}分钟`;
}

/**
 * 格式化日期时间
 */
export function formatDate(
  date: Date | string | number | null | undefined,
  format: 'date' | 'time' | 'datetime' | 'relative' = 'datetime'
): string {
  if (date == null) {
    return '无效日期';
  }

  const dateObj = new Date(date);

  if (Number.isNaN(dateObj.getTime())) {
    return '无效日期';
  }

  const locale = 'zh-CN';
  const timeZone = 'Asia/Shanghai';

  switch (format) {
    case 'date':
      return dateObj.toLocaleDateString(locale, {
        timeZone,
        year: 'numeric',
        month: 'numeric',
        day: 'numeric'
      });

    case 'time':
      return dateObj.toLocaleTimeString(locale, {
        timeZone,
        hour: '2-digit',
        minute: '2-digit'
      });

    case 'datetime':
      return dateObj.toLocaleString(locale, {
        timeZone,
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });

    case 'relative':
      return formatRelativeTime(dateObj);

    default:
      return dateObj.toLocaleString(locale, { timeZone });
  }
}

/**
 * 格式化相对时间
 */
export function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));

  if (diffMinutes < 1) return '刚刚';
  if (diffMinutes < 60) return `${diffMinutes}分钟前`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}小时前`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}天前`;

  const diffWeeks = Math.floor(diffDays / 7);
  if (diffWeeks < 4) return `${diffWeeks}周前`;

  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths < 12) return `${diffMonths}月前`;

  const diffYears = Math.floor(diffDays / 365);
  return `${diffYears}年前`;
}

/**
 * 验证用户ID
 */
export function validateUserId(userId: unknown): userId is number {
  return typeof userId === 'number' && userId > 0;
}

/**
 * 验证任务时长
 */
export function validateTaskDuration(duration: unknown): duration is number {
  return typeof duration === 'number' && duration >= 5 && duration <= 480;
}

/**
 * 清理敏感数据（用于日志记录）
 */
export function sanitizeForLogging<T extends Record<string, unknown>>(data: T): T {
  const sensitiveFields = ['password', 'token', 'secret', 'key', 'auth'];
  const sanitized: Record<string, unknown> = { ...data };

  Object.keys(sanitized).forEach((key) => {
    const lowerKey = key.toLowerCase();
    if (sensitiveFields.some((field) => lowerKey.includes(field))) {
      sanitized[key] = '[REDACTED]';
    }
  });

  return sanitized as T;
}

/**
 * 深度复制对象
 */
export function deepClone<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  if (obj instanceof Date) {
    return new Date(obj.getTime()) as T;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => deepClone(item)) as T;
  }

  const cloned: Record<string, unknown> = {};
  Object.keys(obj as Record<string, unknown>).forEach((key) => {
    cloned[key] = deepClone((obj as Record<string, unknown>)[key]);
  });

  return cloned as T;
}

/**
 * 等待指定时间
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    globalThis.setTimeout(resolve, ms);
  });
}

/**
 * 重试函数
 */
export async function retry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const {
    maxAttempts = 3,
    delay = 1000,
    backoff = 'exponential',
    shouldRetry = () => true
  } = options;

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt === maxAttempts || !shouldRetry(error)) {
        throw error;
      }

      const waitTime = backoff === 'exponential' ? delay * 2 ** (attempt - 1) : delay;
      console.warn(`重试尝试 ${attempt}/${maxAttempts} 失败，等待 ${waitTime}ms 后重试:`, error);
      await sleep(waitTime);
    }
  }

  throw (lastError instanceof Error ? lastError : new Error('重试失败'));
}

/**
 * 截断字符串
 */
export function truncateString(str: string | null | undefined, maxLength = 100, suffix = '...'): string {
  if (!str || str.length <= maxLength) {
    return str ?? '';
  }
  return str.substring(0, maxLength - suffix.length) + suffix;
}

/**
 * 计算百分比
 */
export function calculatePercentage(value: number, total: number, decimals = 1): number {
  if (!total) return 0;
  return Number(((value / total) * 100).toFixed(decimals));
}

/**
 * 随机选择数组中的元素
 */
export function randomChoice<T>(array: readonly T[]): T | null {
  if (!Array.isArray(array) || array.length === 0) {
    return null;
  }
  return array[Math.floor(Math.random() * array.length)] ?? null;
}

/**
 * 检查是否为今天
 */
export function isToday(date: Date | string | number): boolean {
  const dateObj = new Date(date);
  if (Number.isNaN(dateObj.getTime())) {
    return false;
  }

  const today = new Date();
  return dateObj.getDate() === today.getDate()
    && dateObj.getMonth() === today.getMonth()
    && dateObj.getFullYear() === today.getFullYear();
}

/**
 * 获取今天的开始和结束时间
 */
export function getTodayBounds(date: Date = new Date()): DateBounds {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);

  const end = new Date(date);
  end.setHours(23, 59, 59, 999);

  return { start, end };
}

/**
 * 解析任务命令参数
 */
export function parseTaskCommand(input: string | null | undefined): ParsedTaskCommand {
  if (!input || typeof input !== 'string') {
    return { description: '专注任务', duration: 25 };
  }

  const trimmed = input.trim();
  if (!trimmed) {
    return { description: '专注任务', duration: 25 };
  }

  const parts = trimmed.split(' ');
  const lastPart = parts.at(-1);
  if (!lastPart) {
    return { description: '专注任务', duration: 25 };
  }
  const duration = Number.parseInt(lastPart, 10);

  if (!Number.isNaN(duration) && duration >= 5 && duration <= 480) {
    const description = parts.slice(0, -1).join(' ') || '专注任务';
    return { description, duration };
  }

  return { description: trimmed, duration: 25 };
}

/**
 * 创建错误对象
 */
export function createError(
  message: string,
  code = 'GENERAL_ERROR',
  details: Record<string, unknown> = {}
): AppError {
  const error = new Error(message) as AppError;
  error.code = code;
  error.details = details;
  error.timestamp = new Date().toISOString();
  return error;
}

export default {
  generateId,
  formatDuration,
  formatDate,
  formatRelativeTime,
  validateUserId,
  validateTaskDuration,
  sanitizeForLogging,
  deepClone,
  sleep,
  retry,
  truncateString,
  calculatePercentage,
  randomChoice,
  isToday,
  getTodayBounds,
  parseTaskCommand,
  createError
};
