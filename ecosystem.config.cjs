// ecosystem.config.cjs
require('dotenv').config(); // 自动加载根目录的 .env 文件

module.exports = {
  apps: [
    {
      name: 'telegram-self-control-bot', // 服务名称
      script: 'dist/src/app.js',
      cwd: '/home/telegramAutomanager', // 工作目录（绝对路径）

      // Interpreter settings
      interpreter: 'node',

      // Environment variables - Production
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
        REDIS_DB: 0, // 明确指定使用 DB 0
        ...process.env,
      },
      // Environment variables - Development
      env_development: {
        NODE_ENV: 'development',
        PORT: 3000,
        REDIS_DB: 0,
        ...process.env,
      },

      // Process management
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',

      // Restart settings
      restart_delay: 5000,
      min_uptime: '5s',  // 降低最小运行时间要求
      max_restarts: 50,  // 增加最大重启次数

      // PM2 ready signal - disabled to prevent timeout issues
      // wait_ready: true,
      // listen_timeout: 10000,

      // Graceful shutdown
      kill_timeout: 5000,

      // Logging - 使用PM2默认日志路径
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,

      // Error handling
      exp_backoff_restart_delay: 100,

      // Metadata tags for easy filtering
      tags: ['telegram-bot', 'self-control', 'mongodb', 'redis-db0']
    },
  ],
};
