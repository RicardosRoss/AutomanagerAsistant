export default {
  // 数据库配置覆盖 - 只覆盖 options，保留基础配置中的 uri
  database: {
    uri: process.env.MONGODB_URI, // 确保不会丢失
    options: {
      maxPoolSize: 20, // 生产环境增加连接池
      serverSelectionTimeoutMS: 10000
    }
  },

  // Redis 配置优化
  redis: {
    retryDelayOnFailover: 100,
    maxRetriesPerRequest: 3,
    lazyConnect: true
  },

  // 日志配置
  logging: {
    level: 'info', // 生产环境减少日志
    file: 'logs/app.log'
  },

  // 性能优化
  queues: {
    concurrency: 10, // 生产环境提高并发
    maxConcurrentTasks: 200
  },

  // 监控启用
  monitoring: {
    enabled: true,
    healthCheckInterval: 60000 // 1分钟检查一次
  },

  // 安全配置
  security: {
    rateLimiting: {
      windowMs: 5 * 60 * 1000, // 5分钟
      maxRequests: 200
    }
  }
};