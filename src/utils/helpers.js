/**
 * 生成唯一ID
 * @param {string} prefix - ID前缀
 * @returns {string} 唯一ID
 */
export function generateId(prefix = 'id') {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substr(2, 9); // 增加随机性
  return `${prefix}_${timestamp}_${random}`;
}

/**
 * 格式化时长（分钟）
 * @param {number} minutes - 分钟数
 * @returns {string} 格式化后的时长字符串
 */
export function formatDuration(minutes) {
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
 * @param {Date|string} date - 日期对象或日期字符串
 * @param {string} format - 格式类型 ('date', 'time', 'datetime', 'relative')
 * @returns {string} 格式化后的日期字符串
 */
export function formatDate(date, format = 'datetime') {
  const dateObj = new Date(date);

  if (isNaN(dateObj.getTime())) {
    return '无效日期';
  }

  const options = {
    timeZone: 'Asia/Shanghai',
    locale: 'zh-CN'
  };

  switch (format) {
    case 'date':
      return dateObj.toLocaleDateString('zh-CN', {
        ...options,
        year: 'numeric',
        month: 'numeric',
        day: 'numeric'
      });

    case 'time':
      return dateObj.toLocaleTimeString('zh-CN', {
        ...options,
        hour: '2-digit',
        minute: '2-digit'
      });

    case 'datetime':
      return dateObj.toLocaleString('zh-CN', {
        ...options,
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });

    case 'relative':
      return formatRelativeTime(dateObj);

    default:
      return dateObj.toLocaleString('zh-CN', options);
  }
}

/**
 * 格式化相对时间
 * @param {Date} date - 日期对象
 * @returns {string} 相对时间字符串
 */
export function formatRelativeTime(date) {
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
 * @param {any} userId - 用户ID
 * @returns {boolean} 是否有效
 */
export function validateUserId(userId) {
  return typeof userId === 'number' && userId > 0;
}

/**
 * 验证任务时长
 * @param {any} duration - 任务时长（分钟）
 * @returns {boolean} 是否有效
 */
export function validateTaskDuration(duration) {
  return typeof duration === 'number' && duration >= 5 && duration <= 480; // 5分钟-8小时
}

/**
 * 清理敏感数据（用于日志记录）
 * @param {Object} data - 原始数据对象
 * @returns {Object} 清理后的数据对象
 */
export function sanitizeForLogging(data) {
  const sensitiveFields = ['password', 'token', 'secret', 'key', 'auth'];
  const sanitized = { ...data };

  Object.keys(sanitized).forEach((key) => {
    const lowerKey = key.toLowerCase();
    if (sensitiveFields.some((field) => lowerKey.includes(field))) {
      sanitized[key] = '[REDACTED]';
    }
  });

  return sanitized;
}

/**
 * 深度复制对象
 * @param {any} obj - 源对象
 * @returns {any} 复制的对象
 */
export function deepClone(obj) {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  if (obj instanceof Date) {
    return new Date(obj.getTime());
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => deepClone(item));
  }

  const cloned = {};
  Object.keys(obj).forEach((key) => {
    cloned[key] = deepClone(obj[key]);
  });

  return cloned;
}

/**
 * 等待指定时间
 * @param {number} ms - 等待时间（毫秒）
 * @returns {Promise<void>}
 */
export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 重试函数
 * @param {Function} fn - 要重试的函数
 * @param {Object} options - 重试选项
 * @returns {Promise<any>}
 */
export async function retry(fn, options = {}) {
  const {
    maxAttempts = 3,
    delay = 1000,
    backoff = 'exponential',
    shouldRetry = () => true
  } = options;

  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt === maxAttempts || !shouldRetry(error)) {
        throw error;
      }

      const waitTime = backoff === 'exponential' ? delay * 2 ** (attempt - 1) : delay;
      console.warn(`重试尝试 ${attempt}/${maxAttempts} 失败，等待 ${waitTime}ms 后重试:`, error.message);

      await sleep(waitTime);
    }
  }

  throw lastError;
}

/**
 * 截断字符串
 * @param {string} str - 原始字符串
 * @param {number} maxLength - 最大长度
 * @param {string} suffix - 截断后缀
 * @returns {string} 截断后的字符串
 */
export function truncateString(str, maxLength = 100, suffix = '...') {
  if (!str || str.length <= maxLength) {
    return str || '';
  }
  return str.substring(0, maxLength - suffix.length) + suffix;
}

/**
 * 计算百分比
 * @param {number} value - 当前值
 * @param {number} total - 总值
 * @param {number} decimals - 小数位数
 * @returns {number} 百分比
 */
export function calculatePercentage(value, total, decimals = 1) {
  if (!total || total === 0) return 0;
  return Number(((value / total) * 100).toFixed(decimals));
}

/**
 * 随机选择数组中的元素
 * @param {Array} array - 数组
 * @returns {any} 随机选中的元素
 */
export function randomChoice(array) {
  if (!Array.isArray(array) || array.length === 0) {
    return null;
  }
  return array[Math.floor(Math.random() * array.length)];
}

/**
 * 检查是否为今天
 * @param {Date|string} date - 日期
 * @returns {boolean} 是否为今天
 */
export function isToday(date) {
  const dateObj = new Date(date);
  const today = new Date();

  return dateObj.getDate() === today.getDate()
    && dateObj.getMonth() === today.getMonth()
    && dateObj.getFullYear() === today.getFullYear();
}

/**
 * 获取今天的开始和结束时间
 * @param {Date} date - 日期（可选，默认今天）
 * @returns {Object} { start, end }
 */
export function getTodayBounds(date = new Date()) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);

  const end = new Date(date);
  end.setHours(23, 59, 59, 999);

  return { start, end };
}

/**
 * 解析任务命令参数
 * @param {string} input - 用户输入的命令参数
 * @returns {Object} { description, duration }
 */
export function parseTaskCommand(input) {
  if (!input || typeof input !== 'string') {
    return { description: '专注任务', duration: 25 };
  }

  const parts = input.trim().split(' ');

  // 尝试从最后一个参数提取时长
  const lastPart = parts[parts.length - 1];
  const duration = parseInt(lastPart, 10);

  if (!isNaN(duration) && duration >= 5 && duration <= 480) {
    // 最后一个参数是有效的时长
    const description = parts.slice(0, -1).join(' ') || '专注任务';
    return { description, duration };
  }

  // 没有有效时长，整个输入作为描述
  return { description: input || '专注任务', duration: 25 };
}

/**
 * 创建错误对象
 * @param {string} message - 错误消息
 * @param {string} code - 错误代码
 * @param {Object} details - 详细信息
 * @returns {Error} 错误对象
 */
export function createError(message, code = 'GENERAL_ERROR', details = {}) {
  const error = new Error(message);
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
