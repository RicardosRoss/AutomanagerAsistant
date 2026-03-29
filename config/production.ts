import type { AppConfig, DeepPartial } from '../src/types/config.js';

const productionConfig: DeepPartial<AppConfig> = {
  database: {
    uri: process.env.MONGODB_URI,
    options: {
      maxPoolSize: 20,
      serverSelectionTimeoutMS: 10000
    }
  },
  redis: {
    retryDelayOnFailover: 100,
    maxRetriesPerRequest: 3,
    lazyConnect: true
  },
  logging: {
    level: 'info',
    file: 'logs/app.log'
  },
  queues: {
    concurrency: 10,
    maxConcurrentTasks: 200
  },
  monitoring: {
    enabled: true,
    healthCheckInterval: 60000
  },
  security: {
    rateLimiting: {
      windowMs: 5 * 60 * 1000,
      maxRequests: 200
    }
  }
};

export default productionConfig;
