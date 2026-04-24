import TelegramBot from 'node-telegram-bot-api';
import config from '../../config/index.js';
import logger from '../utils/logger.js';
import { formatDurationFromSeconds } from '../utils/helpers.js';

interface RuntimeOptions {
  polling: boolean;
  webHook: boolean;
}

interface BotInfo {
  name: string;
  version: string;
  description: string;
  features: string[];
  support: {
    email: string | null;
    github: string | null;
  };
}

class BotConfig {
  token: string;

  options: RuntimeOptions;

  constructor() {
    this.token = config.telegram.token ?? '';

    const usePolling = config.telegram.polling || config.app.environment !== 'production';
    this.options = {
      polling: usePolling,
      webHook: !usePolling && config.app.environment === 'production'
    };

    this.validate();
  }

  validate(): void {
    if (!this.token || this.token === 'your_telegram_bot_token_here') {
      const message = '未配置有效的Telegram Bot Token，请检查环境变量 BOT_TOKEN';
      logger.error(message);
      throw new Error(message);
    }

    if (process.env.NODE_ENV === 'development') {
      logger.warn('开发环境模式：使用测试Bot Token，Bot功能可能受限');
      return;
    }

    if (!/^\d+:[A-Za-z0-9_-]{35}$/.test(this.token)) {
      const message = 'Bot Token格式无效，请检查配置';
      logger.error(message);
      throw new Error(message);
    }

    logger.info('Bot配置验证通过', {
      hasToken: Boolean(this.token),
      environment: process.env.NODE_ENV,
      polling: this.options.polling
    });
  }

  getBotOptions(): TelegramBot.ConstructorOptions {
    const baseOptions: TelegramBot.ConstructorOptions = {
      polling: this.options.polling,
      filepath: false
    };

    if (this.options.polling) {
      baseOptions.polling = {
        interval: 1000,
        autoStart: false,
        params: {
          timeout: 10
        }
      };
    }

    return baseOptions;
  }

  getWebHookConfig(): {
    url: string;
    port: number;
    host: string;
    certificate: string | null;
  } | null {
    if (!this.options.webHook || !config.app.baseUrl) {
      return null;
    }

    return {
      url: `${config.app.baseUrl}/webhook/${this.token}`,
      port: config.app.port,
      host: '0.0.0.0',
      certificate: config.telegram.webhookCert ?? null
    };
  }

  getSupportedCommands(): TelegramBot.BotCommand[] {
    const reservationDelayText = formatDurationFromSeconds(config.linearDelay.defaultReservationDelay);

    return [
      { command: 'start', description: '开始使用自控力助手' },
      { command: 'help', description: '查看帮助信息' },
      { command: 'task', description: '创建专注任务 - 用法: /task <描述> [时长(分钟)]' },
      { command: 'reserve', description: `预约${reservationDelayText}后开始任务` },
      { command: 'status', description: '查看当前状态和进度' },
      { command: 'stats', description: '查看今日统计数据' },
      { command: 'week', description: '查看本周统计报告' },
      { command: 'settings', description: '管理个人设置' },
      { command: 'patterns', description: '查看 RSIP 定式树' },
      { command: 'precedents', description: '查看下必为例判例' },
      { command: 'reserve_status', description: '查看辅助链预约状态' },
      { command: 'loadout', description: '查看当前战斗构筑' },
      { command: 'equip_art', description: '设置主战法门 - 用法: /equip_art <id[,id...]>' },
      { command: 'equip_support', description: '设置辅助法门 - 用法: /equip_support <id|none>' },
      { command: 'equip_power', description: '设置神通构筑 - 用法: /equip_power <id[,id...]|none>' }
    ];
  }

  getBotInfo(): BotInfo {
    const reservationDelayText = formatDurationFromSeconds(config.linearDelay.defaultReservationDelay);

    return {
      name: 'Telegram自控力助手',
      version: config.app.version,
      description: '基于科学自控力理论的专注任务管理机器人',
      features: [
        '🎯 神圣座位原理：失败重置所有进度',
        `⏰ ${reservationDelayText}预约机制：降低启动阻力`,
        '📊 详细统计分析：追踪专注表现',
        '🏆 成就系统：连击记录和等级提升',
        '📅 每日/周报：专注数据可视化'
      ],
      support: {
        email: config.app.supportEmail ?? null,
        github: config.app.githubRepo ?? null
      }
    };
  }

  getErrorConfig(): {
    maxRetries: number;
    retryDelay: number;
    enableErrorLogging: boolean;
    userFriendlyErrors: boolean;
    debugMode: boolean;
  } {
    return {
      maxRetries: 3,
      retryDelay: 1000,
      enableErrorLogging: true,
      userFriendlyErrors: true,
      debugMode: config.app.environment === 'development'
    };
  }

  getRateLimitConfig(): {
    windowMs: number;
    maxRequests: number;
    message: string;
    enableLogging: boolean;
  } {
    return {
      windowMs: 60 * 1000,
      maxRequests: config.api?.rateLimit?.perMinute ?? 60,
      message: '操作过于频繁，请稍后再试',
      enableLogging: true
    };
  }
}

export default BotConfig;
