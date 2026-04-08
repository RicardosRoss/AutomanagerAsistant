type ValueOf<T> = T[keyof T];

// 应用常量定义
export const TASK_STATUS = {
  PENDING: 'pending',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled'
} as const;

export type TaskStatus = ValueOf<typeof TASK_STATUS>;

export const CHAIN_STATUS = {
  ACTIVE: 'active',
  BROKEN: 'broken',
  COMPLETED: 'completed',
  PAUSED: 'paused'
} as const;

export type ChainStatus = ValueOf<typeof CHAIN_STATUS>;

export const QUEUE_TYPES = {
  REMINDERS: 'reminders',
  RESERVATIONS: 'reservations'
} as const;

export type QueueType = ValueOf<typeof QUEUE_TYPES>;

export const REMINDER_TYPES = {
  PROGRESS: 'progress',
  COMPLETION: 'completion',
  RESERVATION: 'reservation'
} as const;

export type ReminderType = ValueOf<typeof REMINDER_TYPES>;

export const USER_LEVELS = [
  { level: 1, name: '初学者', minTasks: 0, maxTasks: 9 },
  { level: 2, name: '专注者', minTasks: 10, maxTasks: 49 },
  { level: 3, name: '自律者', minTasks: 50, maxTasks: 99 },
  { level: 4, name: '大师', minTasks: 100, maxTasks: 299 },
  { level: 5, name: '宗师', minTasks: 300, maxTasks: 499 },
  { level: 6, name: '传奇', minTasks: 500, maxTasks: Infinity }
] as const;

export const FOCUS_LEVELS = [
  { level: 1, name: '起步', minMinutes: 0, maxMinutes: 29 },
  { level: 2, name: '进步', minMinutes: 30, maxMinutes: 89 },
  { level: 3, name: '专注', minMinutes: 90, maxMinutes: 179 },
  { level: 4, name: '卓越', minMinutes: 180, maxMinutes: 299 },
  { level: 5, name: '传奇', minMinutes: 300, maxMinutes: Infinity }
] as const;

export const TASK_CONSTRAINTS = {
  MIN_DURATION: 5,
  MAX_DURATION: 480,
  DEFAULT_DURATION: 25,
  PROGRESS_INTERVALS: [0.25, 0.5, 0.75]
} as const;

export const SACRED_SEAT_PRINCIPLE = {
  RESET_ON_FAILURE: true,
  RESET_FIELDS: ['totalTasks', 'completedTasks', 'failedTasks', 'totalMinutes', 'averageTaskDuration'],
  BREAK_MESSAGES: [
    '根据神圣座位原理，任务失败导致链条重置',
    '连续性被打破，重新开始积累',
    '失败是成功之母，重新出发！'
  ]
} as const;

export const LINEAR_DELAY_PRINCIPLE = {
  DEFAULT_DELAY_MINUTES: 15,
  MAX_DELAY_MINUTES: 30,
  MIN_DELAY_MINUTES: 5,
  DELAY_STEP_MINUTES: 5,
  RESISTANCE_REDUCTION: 0.6
} as const;

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
} as const;

export type BotCommand = ValueOf<typeof BOT_COMMANDS>;

export const CALLBACK_PREFIXES = {
  COMPLETE_TASK: 'complete_task_',
  FAIL_TASK: 'fail_task_',
  START_RESERVED: 'start_reserved_',
  DELAY_RESERVATION: 'delay_reservation_',
  CANCEL_RESERVATION: 'cancel_reservation_',
  SETTINGS: 'settings_',
  PATTERN_EXECUTE: 'pattern_execute_',
  PRECEDENT_BREAK: 'precedent_break_',
  PRECEDENT_ALLOW: 'precedent_allow_'
} as const;

export const ERROR_CODES = {
  USER_NOT_FOUND: 'USER_NOT_FOUND',
  INVALID_USER_ID: 'INVALID_USER_ID',
  TASK_NOT_FOUND: 'TASK_NOT_FOUND',
  INVALID_TASK_DURATION: 'INVALID_TASK_DURATION',
  TASK_ALREADY_RUNNING: 'TASK_ALREADY_RUNNING',
  TASK_NOT_RUNNING: 'TASK_NOT_RUNNING',
  CHAIN_NOT_FOUND: 'CHAIN_NOT_FOUND',
  CHAIN_BROKEN: 'CHAIN_BROKEN',
  CHAIN_NOT_ACTIVE: 'CHAIN_NOT_ACTIVE',
  RESERVATION_NOT_FOUND: 'RESERVATION_NOT_FOUND',
  RESERVATION_EXPIRED: 'RESERVATION_EXPIRED',
  RESERVATION_CANCELLED: 'RESERVATION_CANCELLED',
  DATABASE_ERROR: 'DATABASE_ERROR',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  DUPLICATE_ERROR: 'DUPLICATE_ERROR',
  QUEUE_ERROR: 'QUEUE_ERROR',
  QUEUE_NOT_INITIALIZED: 'QUEUE_NOT_INITIALIZED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  NETWORK_ERROR: 'NETWORK_ERROR',
  TIMEOUT_ERROR: 'TIMEOUT_ERROR'
} as const;

export const LOG_LEVELS = {
  ERROR: 'error',
  WARN: 'warn',
  INFO: 'info',
  DEBUG: 'debug',
  VERBOSE: 'verbose'
} as const;

export const STATS_TYPES = {
  DAILY: 'daily',
  WEEKLY: 'weekly',
  MONTHLY: 'monthly',
  YEARLY: 'yearly',
  ALL_TIME: 'all_time'
} as const;

export const LEADERBOARD_TYPES = {
  CURRENT_STREAK: 'current_streak',
  LONGEST_STREAK: 'longest_streak',
  COMPLETED_TASKS: 'completed_tasks',
  TOTAL_MINUTES: 'total_minutes',
  SUCCESS_RATE: 'success_rate'
} as const;

export const EXPORT_FORMATS = {
  JSON: 'json',
  CSV: 'csv',
  PDF: 'pdf'
} as const;

export const TIMEZONES = {
  CHINA: 'Asia/Shanghai',
  UTC: 'UTC',
  TOKYO: 'Asia/Tokyo',
  NEW_YORK: 'America/New_York',
  LONDON: 'Europe/London'
} as const;

export const LANGUAGES = {
  CHINESE: 'zh-CN',
  ENGLISH: 'en-US',
  JAPANESE: 'ja-JP'
} as const;

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
} as const;

export const DEFAULT_SETTINGS = {
  DEFAULT_DURATION: 25,
  REMINDER_ENABLED: true,
  TIMEZONE: TIMEZONES.CHINA,
  LANGUAGE: LANGUAGES.CHINESE
} as const;

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
  DEFAULT_SETTINGS
};
