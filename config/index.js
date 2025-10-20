import { config } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// 获取当前文件的目录
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 根据环境加载不同的配置文件
const environment = process.env.NODE_ENV || 'development';

// 加载环境变量
if (environment === 'test') {
  config({ path: path.resolve(__dirname, '../.env.test') });
} else {
  config({ path: path.resolve(__dirname, '../.env') });
}

// 环境特定配置
let environmentConfig = {};

try {
  const envConfigModule = await import(`./${environment}.js`);
  environmentConfig = envConfigModule.default;
} catch (error) {
  console.warn(`警告: 未找到 ${environment} 环境配置文件，使用默认配置`);
}

// 基础配置
const baseConfig = {
  // 应用配置
  app: {
    name: 'Telegram Self Control Bot',
    version: '1.0.0',
    environment,
    port: parseInt(process.env.PORT || '3000', 10),
    debug: process.env.DEBUG_MODE === 'true',
  },

  // Telegram Bot 配置
  telegram: {
    token: process.env.BOT_TOKEN,
    webhookUrl: process.env.WEBHOOK_URL,
    polling: process.env.FORCE_POLLING === 'true' || environment !== 'production',
    mockApi: process.env.MOCK_TELEGRAM_API === 'true',
  },

  // 数据库配置
  database: {
    uri: process.env.MONGODB_URI,
    testUri: process.env.MONGODB_TEST_URI,
    options: {
      maxPoolSize: parseInt(process.env.DATABASE_POOL_SIZE || '10', 10),
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    },
  },

  // Redis 配置
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    db: environment === 'test' ? 1 : 0,
  },

  // 日志配置
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    file: process.env.LOG_FILE || 'logs/app.log',
    format: 'combined',
    datePattern: 'YYYY-MM-DD',
    maxSize: '20m',
    maxFiles: '14d',
  },

  // 安全配置
  security: {
    jwtSecret: process.env.JWT_SECRET,
    encryptionKey: process.env.ENCRYPTION_KEY,
    rateLimiting: {
      windowMs: 15 * 60 * 1000, // 15分钟
      maxRequests: 100,
    },
  },

  // 功能开关
  features: {
    progressReminders: process.env.ENABLE_PROGRESS_REMINDERS === 'true',
    weeklyReports: process.env.ENABLE_WEEKLY_REPORTS === 'true',
    reservationSystem: process.env.ENABLE_RESERVATION_SYSTEM === 'true',
  },

  // 神圣座位原理配置
  sacredSeat: {
    strictMode: process.env.SACRED_SEAT_STRICT_MODE === 'true',
    autoChainBreak: process.env.AUTO_CHAIN_BREAK_ON_FAILURE === 'true',
    resetOnFailure: true, // 核心原理：失败立即重置
  },

  // 线性时延原理配置
  linearDelay: {
    defaultReservationDelay: parseInt(process.env.DEFAULT_RESERVATION_DELAY || '900', 10), // 15分钟
    reminderEnabled: process.env.RESERVATION_REMINDER_ENABLED === 'true',
    maxDelayTime: 30 * 60, // 最大延迟30分钟
  },

  // 队列配置
  queues: {
    concurrency: parseInt(process.env.QUEUE_CONCURRENCY || '5', 10),
    maxConcurrentTasks: parseInt(process.env.MAX_CONCURRENT_TASKS || '100', 10),
    defaultJobOptions: {
      removeOnComplete: 10,
      removeOnFail: 5,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
    },
  },

  // 任务配置
  tasks: {
    defaultDuration: 25, // 默认25分钟
    progressIntervals: [0.25, 0.5, 0.75], // 25%, 50%, 75%进度提醒
    maxDuration: 120, // 最大任务时长2小时
    minDuration: 5,   // 最小任务时长5分钟
  },

  // 监控配置
  monitoring: {
    enabled: process.env.METRICS_ENABLED === 'true',
    healthCheckInterval: parseInt(process.env.HEALTH_CHECK_INTERVAL || '30000', 10),
    metricsPath: '/metrics',
    healthPath: '/health',
  },

  // 测试配置
  testing: {
    timeout: parseInt(process.env.TEST_TIMEOUT || '30000', 10),
    mockExternalServices: environment === 'test',
    resetDbBetweenTests: environment === 'test',
  },
};

// 合并环境特定配置
const finalConfig = {
  ...baseConfig,
  ...environmentConfig,
};

// 配置验证
function validateConfig(config) {
  const requiredFields = [
    'telegram.token',
    'database.uri',
  ];

  const missingFields = requiredFields.filter(field => {
    const keys = field.split('.');
    let value = config;
    for (const key of keys) {
      value = value?.[key];
    }
    return !value;
  });

  if (missingFields.length > 0) {
    throw new Error(`缺少必需的配置字段: ${missingFields.join(', ')}`);
  }
}

// 只在非测试环境验证配置
if (environment !== 'test') {
  try {
    validateConfig(finalConfig);
  } catch (error) {
    console.error('配置验证失败:', error.message);
    process.exit(1);
  }
}

export default finalConfig;