// ecosystem.config.cjs
require('dotenv').config(); // 自动加载根目录的 .env 文件

module.exports = {
  apps: [
    {
      name: 'telegram-self-control-bot', // 服务名称
      script: 'src/app.js', // 入口文件
      cwd: __dirname, // 工作目录（项目根目录）
      node_args: '--experimental-modules',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',

      // 默认环境（开发）
      env: {
        NODE_ENV: 'development',
        ...process.env,
      },

      // 生产环境
      env_production: {
        NODE_ENV: 'production',
        ...process.env,
      },

      // 修复重启问题
      wait_ready: true,   // 启用等待ready信号
      listen_timeout: 10000, // 等待ready信号10秒
      min_uptime: '10s',  // 至少运行10秒才算成功
      max_restarts: 10,   // 最大重启次数

      // 日志配置
      log_file: process.env.LOG_FILE || 'logs/combined.log',
      out_file: 'logs/out.log',
      error_file: 'logs/error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    },
  ],
};
