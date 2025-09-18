import config from '../../config/index.js';
import logger from '../utils/logger.js';

/**
 * Bot配置管理
 */
class BotConfig {
  constructor() {
    this.token = config.telegram.token;
    this.options = {
      polling: config.app.environment !== 'production',
      webHook: config.app.environment === 'production'
    };

    // 验证必要的配置
    this.validate();
  }

  /**
   * 验证Bot配置
   */
  validate() {
    if (!this.token || this.token === 'your_telegram_bot_token_here') {
      const message = '未配置有效的Telegram Bot Token，请检查环境变量 BOT_TOKEN';
      logger.error(message);
      throw new Error(message);
    }

    // 开发环境允许任何Token进行测试
    if (process.env.NODE_ENV === 'development') {
      logger.warn('开发环境模式：使用测试Bot Token，Bot功能可能受限');
      return;
    }

    // 生产环境严格验证Token格式
    if (!/^\d+:[A-Za-z0-9_-]{35}$/.test(this.token)) {
      const message = 'Bot Token格式无效，请检查配置';
      logger.error(message);
      throw new Error(message);
    }

    logger.info('Bot配置验证通过', {
      hasToken: !!this.token,
      environment: process.env.NODE_ENV,
      polling: this.options.polling
    });
  }

  /**
   * 获取Bot实例配置
   */
  getBotOptions() {
    const baseOptions = {
      polling: this.options.polling,
      filepath: false // 禁用文件下载到本地
    };

    if (this.options.polling) {
      // 轮询模式配置
      baseOptions.polling = {
        interval: 1000,
        autoStart: true,
        params: {
          timeout: 10
        }
      };
    }

    return baseOptions;
  }

  /**
   * 获取WebHook配置
   */
  getWebHookConfig() {
    if (!this.options.webHook || !config.app.baseUrl) {
      return null;
    }

    return {
      url: `${config.app.baseUrl}/webhook/${this.token}`,
      port: config.app.port,
      host: '0.0.0.0',
      certificate: config.telegram.webhookCert || null
    };
  }

  /**
   * 获取支持的命令列表
   */
  getSupportedCommands() {
    return [
      {
        command: 'start',
        description: '开始使用自控力助手'
      },
      {
        command: 'help',
        description: '查看帮助信息'
      },
      {
        command: 'task',
        description: '创建专注任务 - 用法: /task <描述> [时长(分钟)]'
      },
      {
        command: 'reserve',
        description: '预约15分钟后开始任务'
      },
      {
        command: 'status',
        description: '查看当前状态和进度'
      },
      {
        command: 'stats',
        description: '查看今日统计数据'
      },
      {
        command: 'week',
        description: '查看本周统计报告'
      },
      {
        command: 'settings',
        description: '管理个人设置'
      }
    ];
  }

  /**
   * 获取Bot信息显示配置
   */
  getBotInfo() {
    return {
      name: 'Telegram自控力助手',
      version: config.app.version,
      description: '基于科学自控力理论的专注任务管理机器人',
      features: [
        '🎯 神圣座位原理：失败重置所有进度',
        '⏰ 15分钟预约机制：降低启动阻力',
        '📊 详细统计分析：追踪专注表现',
        '🏆 成就系统：连击记录和等级提升',
        '📅 每日/周报：专注数据可视化'
      ],
      support: {
        email: config.app.supportEmail || null,
        github: config.app.githubRepo || null
      }
    };
  }

  /**
   * 获取错误处理配置
   */
  getErrorConfig() {
    return {
      maxRetries: 3,
      retryDelay: 1000,
      enableErrorLogging: true,
      userFriendlyErrors: true,
      debugMode: config.app.environment === 'development'
    };
  }

  /**
   * 获取限流配置
   */
  getRateLimitConfig() {
    return {
      windowMs: 60 * 1000, // 1分钟窗口
      maxRequests: config.api?.rateLimit?.perMinute || 60,
      message: '操作过于频繁，请稍后再试',
      enableLogging: true
    };
  }
}

export default BotConfig;
