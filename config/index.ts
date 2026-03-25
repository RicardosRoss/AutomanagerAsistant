import { config as loadEnv } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AppConfig, DeepPartial } from '../src/types/config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const environment = process.env.NODE_ENV ?? 'development';

if (environment === 'test') {
  loadEnv({ path: path.resolve(__dirname, '../.env.test') });
} else {
  loadEnv({ path: path.resolve(__dirname, '../.env') });
}

const environmentLoaders: Record<string, () => Promise<{ default: DeepPartial<AppConfig> }>> = {
  production: async () => import('./production.js')
};

let environmentConfig: DeepPartial<AppConfig> = {};
const loadEnvironmentConfig = environmentLoaders[environment];

if (loadEnvironmentConfig) {
  try {
    const envConfigModule = (await loadEnvironmentConfig()) as { default: DeepPartial<AppConfig> };
    environmentConfig = envConfigModule.default;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`警告: 加载 ${environment} 环境配置失败，使用默认配置`, message);
  }
}

const baseConfig: AppConfig = {
  app: {
    name: 'Telegram Self Control Bot',
    version: '1.0.0',
    environment,
    port: Number.parseInt(process.env.PORT ?? '3000', 10),
    debug: process.env.DEBUG_MODE === 'true',
    baseUrl: process.env.BASE_URL,
    supportEmail: process.env.SUPPORT_EMAIL,
    githubRepo: process.env.GITHUB_REPO
  },
  telegram: {
    token: process.env.BOT_TOKEN,
    webhookUrl: process.env.WEBHOOK_URL,
    webhookCert: process.env.WEBHOOK_CERT,
    polling: process.env.FORCE_POLLING === 'true' || environment !== 'production',
    mockApi: process.env.MOCK_TELEGRAM_API === 'true'
  },
  database: {
    uri: process.env.MONGODB_URI,
    testUri: process.env.MONGODB_TEST_URI,
    options: {
      maxPoolSize: Number.parseInt(process.env.DATABASE_POOL_SIZE ?? '10', 10),
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000
    }
  },
  redis: {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: Number.parseInt(process.env.REDIS_PORT ?? '6379', 10),
    password: process.env.REDIS_PASSWORD ?? undefined,
    db: environment === 'test' ? 1 : 0
  },
  logging: {
    level: process.env.LOG_LEVEL ?? 'info',
    file: process.env.LOG_FILE ?? 'logs/app.log',
    format: 'combined',
    datePattern: 'YYYY-MM-DD',
    maxSize: '20m',
    maxFiles: '14d'
  },
  security: {
    jwtSecret: process.env.JWT_SECRET,
    encryptionKey: process.env.ENCRYPTION_KEY,
    rateLimiting: {
      windowMs: 15 * 60 * 1000,
      maxRequests: 100
    }
  },
  features: {
    progressReminders: process.env.ENABLE_PROGRESS_REMINDERS === 'true',
    weeklyReports: process.env.ENABLE_WEEKLY_REPORTS === 'true',
    reservationSystem: process.env.ENABLE_RESERVATION_SYSTEM === 'true'
  },
  sacredSeat: {
    strictMode: process.env.SACRED_SEAT_STRICT_MODE === 'true',
    autoChainBreak: process.env.AUTO_CHAIN_BREAK_ON_FAILURE === 'true',
    resetOnFailure: true
  },
  linearDelay: {
    defaultReservationDelay: Number.parseInt(process.env.DEFAULT_RESERVATION_DELAY ?? '900', 10),
    reminderEnabled: process.env.RESERVATION_REMINDER_ENABLED === 'true',
    maxDelayTime: 30 * 60
  },
  queues: {
    concurrency: Number.parseInt(process.env.QUEUE_CONCURRENCY ?? '5', 10),
    maxConcurrentTasks: Number.parseInt(process.env.MAX_CONCURRENT_TASKS ?? '100', 10),
    defaultJobOptions: {
      removeOnComplete: 10,
      removeOnFail: 5,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000
      }
    }
  },
  tasks: {
    defaultDuration: 25,
    progressIntervals: [0.25, 0.5, 0.75],
    maxDuration: 120,
    minDuration: 5
  },
  monitoring: {
    enabled: process.env.METRICS_ENABLED === 'true',
    healthCheckInterval: Number.parseInt(process.env.HEALTH_CHECK_INTERVAL ?? '30000', 10),
    metricsPath: '/metrics',
    healthPath: '/health'
  },
  testing: {
    timeout: Number.parseInt(process.env.TEST_TIMEOUT ?? '30000', 10),
    mockExternalServices: environment === 'test',
    resetDbBetweenTests: environment === 'test'
  }
};

const finalConfig: AppConfig = {
  ...baseConfig,
  ...environmentConfig,
  app: {
    ...baseConfig.app,
    ...environmentConfig.app
  },
  telegram: {
    ...baseConfig.telegram,
    ...environmentConfig.telegram
  },
  database: {
    ...baseConfig.database,
    ...environmentConfig.database,
    options: {
      ...baseConfig.database.options,
      ...environmentConfig.database?.options
    }
  },
  redis: {
    ...baseConfig.redis,
    ...environmentConfig.redis
  },
  logging: {
    ...baseConfig.logging,
    ...environmentConfig.logging
  },
  security: {
    ...baseConfig.security,
    ...environmentConfig.security,
    rateLimiting: {
      ...baseConfig.security.rateLimiting,
      ...environmentConfig.security?.rateLimiting
    }
  },
  features: {
    ...baseConfig.features,
    ...environmentConfig.features
  },
  sacredSeat: {
    ...baseConfig.sacredSeat,
    ...environmentConfig.sacredSeat
  },
  linearDelay: {
    ...baseConfig.linearDelay,
    ...environmentConfig.linearDelay
  },
  queues: {
    ...baseConfig.queues,
    ...environmentConfig.queues,
    defaultJobOptions: {
      ...baseConfig.queues.defaultJobOptions,
      ...environmentConfig.queues?.defaultJobOptions,
      backoff: {
        ...baseConfig.queues.defaultJobOptions.backoff,
        ...environmentConfig.queues?.defaultJobOptions?.backoff
      }
    }
  },
  tasks: {
    ...baseConfig.tasks,
    ...environmentConfig.tasks
  },
  monitoring: {
    ...baseConfig.monitoring,
    ...environmentConfig.monitoring
  },
  testing: {
    ...baseConfig.testing,
    ...environmentConfig.testing
  }
};

function getNestedValue(target: Record<string, unknown>, field: string): unknown {
  return field.split('.').reduce<unknown>((value, key) => {
    if (value && typeof value === 'object') {
      return (value as Record<string, unknown>)[key];
    }
    return undefined;
  }, target);
}

function validateConfig(currentConfig: AppConfig): void {
  const requiredFields = ['telegram.token', 'database.uri'];

  const missingFields = requiredFields.filter(
    (field) => !getNestedValue(currentConfig as unknown as Record<string, unknown>, field)
  );
  if (missingFields.length > 0) {
    throw new Error(`缺少必需的配置字段: ${missingFields.join(', ')}`);
  }
}

if (environment !== 'test') {
  try {
    validateConfig(finalConfig);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('配置验证失败:', message);
    process.exit(1);
  }
}

export default finalConfig;
