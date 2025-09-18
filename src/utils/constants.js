// 应用常量定义

// 任务状态
export const TASK_STATUS = {
  PENDING: 'pending',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled'
};

// 任务链状态
export const CHAIN_STATUS = {
  ACTIVE: 'active',
  BROKEN: 'broken',
  COMPLETED: 'completed',
  PAUSED: 'paused'
};

// 队列类型
export const QUEUE_TYPES = {
  REMINDERS: 'reminders',
  RESERVATIONS: 'reservations'
};

// 提醒类型
export const REMINDER_TYPES = {
  PROGRESS: 'progress',
  COMPLETION: 'completion',
  RESERVATION: 'reservation'
};

// 用户等级定义
export const USER_LEVELS = [
  {
    level: 1, name: '初学者', minTasks: 0, maxTasks: 9
  },
  {
    level: 2, name: '专注者', minTasks: 10, maxTasks: 49
  },
  {
    level: 3, name: '自律者', minTasks: 50, maxTasks: 99
  },
  {
    level: 4, name: '大师', minTasks: 100, maxTasks: 299
  },
  {
    level: 5, name: '宗师', minTasks: 300, maxTasks: 499
  },
  {
    level: 6, name: '传奇', minTasks: 500, maxTasks: Infinity
  }
];

// 专注等级定义（基于每日专注时长）
export const FOCUS_LEVELS = [
  {
    level: 1, name: '起步', minMinutes: 0, maxMinutes: 29
  },
  {
    level: 2, name: '进步', minMinutes: 30, maxMinutes: 89
  },
  {
    level: 3, name: '专注', minMinutes: 90, maxMinutes: 179
  },
  {
    level: 4, name: '卓越', minMinutes: 180, maxMinutes: 299
  },
  {
    level: 5, name: '传奇', minMinutes: 300, maxMinutes: Infinity
  }
];

// 任务时长约束
export const TASK_CONSTRAINTS = {
  MIN_DURATION: 5, // 最小时长（分钟）
  MAX_DURATION: 480, // 最大时长（分钟）
  DEFAULT_DURATION: 25, // 默认时长（分钟）
  PROGRESS_INTERVALS: [0.25, 0.5, 0.75] // 进度提醒间隔
};

// 神圣座位原理相关常量
export const SACRED_SEAT_PRINCIPLE = {
  // 失败重置规则
  RESET_ON_FAILURE: true,
  RESET_FIELDS: [
    'totalTasks',
    'completedTasks',
    'failedTasks',
    'totalMinutes',
    'averageTaskDuration'
  ],
  // 链条破坏消息
  BREAK_MESSAGES: [
    '根据神圣座位原理，任务失败导致链条重置',
    '连续性被打破，重新开始积累',
    '失败是成功之母，重新出发！'
  ]
};

// 线性时延原理相关常量
export const LINEAR_DELAY_PRINCIPLE = {
  DEFAULT_DELAY_MINUTES: 15, // 默认延迟15分钟
  MAX_DELAY_MINUTES: 30, // 最大延迟30分钟
  MIN_DELAY_MINUTES: 5, // 最小延迟5分钟
  DELAY_STEP_MINUTES: 5, // 延迟步长5分钟
  RESISTANCE_REDUCTION: 0.6 // 阻力降低60%
};

// Bot 命令定义
export const BOT_COMMANDS = {
  START: 'start',
  HELP: 'help',
  TASK: 'task',
  RESERVE: 'reserve',
  STATUS: 'status',
  STATS: 'stats',
  WEEK: 'week',
  SETTINGS: 'settings',
  EXPORT: 'export',
  PATTERNS: 'patterns',
  LEADERBOARD: 'leaderboard'
};

// 回调数据前缀
export const CALLBACK_PREFIXES = {
  COMPLETE_TASK: 'complete_task_',
  FAIL_TASK: 'fail_task_',
  START_RESERVED: 'start_reserved_',
  DELAY_RESERVATION: 'delay_reservation_',
  CANCEL_RESERVATION: 'cancel_reservation_',
  SETTINGS: 'settings_',
  PATTERN_EXECUTE: 'pattern_execute_'
};

// 错误代码
export const ERROR_CODES = {
  // 用户相关
  USER_NOT_FOUND: 'USER_NOT_FOUND',
  INVALID_USER_ID: 'INVALID_USER_ID',

  // 任务相关
  TASK_NOT_FOUND: 'TASK_NOT_FOUND',
  INVALID_TASK_DURATION: 'INVALID_TASK_DURATION',
  TASK_ALREADY_RUNNING: 'TASK_ALREADY_RUNNING',
  TASK_NOT_RUNNING: 'TASK_NOT_RUNNING',

  // 链条相关
  CHAIN_NOT_FOUND: 'CHAIN_NOT_FOUND',
  CHAIN_BROKEN: 'CHAIN_BROKEN',
  CHAIN_NOT_ACTIVE: 'CHAIN_NOT_ACTIVE',

  // 预约相关
  RESERVATION_NOT_FOUND: 'RESERVATION_NOT_FOUND',
  RESERVATION_EXPIRED: 'RESERVATION_EXPIRED',
  RESERVATION_CANCELLED: 'RESERVATION_CANCELLED',

  // 数据库相关
  DATABASE_ERROR: 'DATABASE_ERROR',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  DUPLICATE_ERROR: 'DUPLICATE_ERROR',

  // 队列相关
  QUEUE_ERROR: 'QUEUE_ERROR',
  QUEUE_NOT_INITIALIZED: 'QUEUE_NOT_INITIALIZED',

  // 通用错误
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  NETWORK_ERROR: 'NETWORK_ERROR',
  TIMEOUT_ERROR: 'TIMEOUT_ERROR'
};

// 日志等级
export const LOG_LEVELS = {
  ERROR: 'error',
  WARN: 'warn',
  INFO: 'info',
  DEBUG: 'debug',
  VERBOSE: 'verbose'
};

// 统计相关常量
export const STATS_TYPES = {
  DAILY: 'daily',
  WEEKLY: 'weekly',
  MONTHLY: 'monthly',
  YEARLY: 'yearly',
  ALL_TIME: 'all_time'
};

// 排行榜类型
export const LEADERBOARD_TYPES = {
  CURRENT_STREAK: 'current_streak',
  LONGEST_STREAK: 'longest_streak',
  COMPLETED_TASKS: 'completed_tasks',
  TOTAL_MINUTES: 'total_minutes',
  SUCCESS_RATE: 'success_rate'
};

// 导出格式
export const EXPORT_FORMATS = {
  JSON: 'json',
  CSV: 'csv',
  PDF: 'pdf'
};

// 时区定义
export const TIMEZONES = {
  CHINA: 'Asia/Shanghai',
  UTC: 'UTC',
  TOKYO: 'Asia/Tokyo',
  NEW_YORK: 'America/New_York',
  LONDON: 'Europe/London'
};

// 语言代码
export const LANGUAGES = {
  CHINESE: 'zh-CN',
  ENGLISH: 'en-US',
  JAPANESE: 'ja-JP'
};

// 通知模板
export const NOTIFICATION_TEMPLATES = {
  TASK_STARTED: '✅ 任务已开始：{description}，时长：{duration}分钟',
  TASK_COMPLETED: '🎉 任务完成！实际用时：{actualDuration}分钟',
  TASK_FAILED: '😞 任务失败，链条重置。重新开始！',
  PROGRESS_25: '📊 任务进度：25% 完成，继续加油！',
  PROGRESS_50: '📊 任务进度：50% 完成，已经过半！',
  PROGRESS_75: '📊 任务进度：75% 完成，快要完成了！',
  RESERVATION_READY: '⏰ 预约时间到！根据线性时延原理，现在是最佳开始时机',
  CHAIN_BROKEN: '💔 根据神圣座位原理，链条已重置。失败是成功之母！',
  LEVEL_UP: '🎊 恭喜升级！您现在是 {levelName}（等级{level}）'
};

// 默认设置
export const DEFAULT_SETTINGS = {
  DEFAULT_DURATION: 25,
  REMINDER_ENABLED: true,
  TIMEZONE: TIMEZONES.CHINA,
  LANGUAGE: LANGUAGES.CHINESE,
  NOTIFICATION_SOUND: true,
  PROGRESS_REMINDERS: true,
  WEEKLY_REPORT: true
};

// API 限制
export const API_LIMITS = {
  MAX_TASK_DESCRIPTION_LENGTH: 200,
  MAX_TASKS_PER_DAY: 50,
  MAX_CHAINS_PER_USER: 10,
  MAX_PATTERNS_PER_USER: 20,
  RATE_LIMIT_PER_MINUTE: 60,
  MAX_EXPORT_DAYS: 365
};

// 缓存相关
export const CACHE_KEYS = {
  USER_STATS: 'user_stats:',
  DAILY_STATS: 'daily_stats:',
  LEADERBOARD: 'leaderboard:',
  USER_LEVEL: 'user_level:',
  CHAIN_STATUS: 'chain_status:'
};

export const CACHE_TTL = {
  USER_STATS: 300, // 5分钟
  DAILY_STATS: 3600, // 1小时
  LEADERBOARD: 1800, // 30分钟
  USER_LEVEL: 86400, // 24小时
  CHAIN_STATUS: 60 // 1分钟
};

// 健康检查相关
export const HEALTH_CHECK = {
  INTERVAL_MS: 30000, // 30秒
  TIMEOUT_MS: 5000, // 5秒超时
  UNHEALTHY_THRESHOLD: 3, // 连续失败3次认为不健康
  RECOVERY_THRESHOLD: 2 // 连续成功2次认为已恢复
};

// 性能监控
export const PERFORMANCE_METRICS = {
  SLOW_QUERY_THRESHOLD: 1000, // 1秒
  HIGH_MEMORY_THRESHOLD: 0.8, // 80%内存使用率
  HIGH_CPU_THRESHOLD: 0.7, // 70%CPU使用率
  MAX_CONCURRENT_TASKS: 100 // 最大并发任务数
};

// 清理任务配置
export const CLEANUP_CONFIG = {
  COMPLETED_JOBS_AGE_DAYS: 7, // 保留已完成任务7天
  FAILED_JOBS_AGE_DAYS: 3, // 保留失败任务3天
  OLD_STATS_AGE_DAYS: 90, // 保留统计数据90天
  INACTIVE_USERS_AGE_DAYS: 30 // 非活跃用户定义：30天未活动
};

// 默认导出所有常量
export default {
  TASK_STATUS,
  CHAIN_STATUS,
  QUEUE_TYPES,
  REMINDER_TYPES,
  USER_LEVELS,
  FOCUS_LEVELS,
  TASK_CONSTRAINTS,
  SACRED_SEAT_PRINCIPLE,
  LINEAR_DELAY_PRINCIPLE,
  BOT_COMMANDS,
  CALLBACK_PREFIXES,
  ERROR_CODES,
  LOG_LEVELS,
  STATS_TYPES,
  LEADERBOARD_TYPES,
  EXPORT_FORMATS,
  TIMEZONES,
  LANGUAGES,
  NOTIFICATION_TEMPLATES,
  DEFAULT_SETTINGS,
  API_LIMITS,
  CACHE_KEYS,
  CACHE_TTL,
  HEALTH_CHECK,
  PERFORMANCE_METRICS,
  CLEANUP_CONFIG
};
