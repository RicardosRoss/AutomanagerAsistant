import Redis, { type RedisClientType } from 'redis';
import config from '../../config/index.js';

type RedisClient = RedisClientType;
type RedisInfoValue = string | number;

export interface RedisHealthStatus {
  status: 'healthy' | 'unhealthy';
  message: string;
  details?: Record<string, unknown>;
  error?: string;
}

export interface RedisTransactionOperation {
  command: string;
  args: unknown[];
}

class RedisConnection {
  client: RedisClient | null;

  subscriber: RedisClient | null;

  publisher: RedisClient | null;

  isConnected: boolean;

  reconnectAttempts: number;

  maxReconnectAttempts: number;

  reconnectDelay: number;

  constructor() {
    this.client = null;
    this.subscriber = null;
    this.publisher = null;
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.reconnectDelay = 1000;
  }

  async connect(): Promise<RedisClient> {
    try {
      const redisConfig = {
        host: config.redis.host,
        port: config.redis.port,
        password: config.redis.password,
        db: config.redis.db,
        connectTimeout: 10000
      };

      this.client = Redis.createClient({
        socket: {
          host: redisConfig.host,
          port: redisConfig.port,
          connectTimeout: redisConfig.connectTimeout
        },
        password: redisConfig.password,
        database: redisConfig.db
      });

      this.publisher = Redis.createClient({
        socket: {
          host: redisConfig.host,
          port: redisConfig.port
        },
        password: redisConfig.password,
        database: redisConfig.db
      });

      this.subscriber = Redis.createClient({
        socket: {
          host: redisConfig.host,
          port: redisConfig.port
        },
        password: redisConfig.password,
        database: redisConfig.db
      });

      this.setupEventListeners();

      await Promise.all([
        this.client.connect(),
        this.publisher.connect(),
        this.subscriber.connect()
      ]);

      this.isConnected = true;
      this.reconnectAttempts = 0;

      console.log(`✅ Redis 连接成功: ${config.redis.host}:${config.redis.port}`);
      await this.client.ping();
      console.log('📡 Redis 连接测试成功');

      return this.client;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('❌ Redis 连接失败:', message);
      this.isConnected = false;
      throw error;
    }
  }

  setupEventListeners(): void {
    this.client?.on('connect', () => {
      console.log('📡 Redis 主客户端已连接');
      this.isConnected = true;
      this.reconnectAttempts = 0;
    });

    this.client?.on('error', (error) => {
      console.error('❌ Redis 主客户端错误:', error.message);
      this.isConnected = false;
      void this.handleReconnect();
    });

    this.client?.on('disconnect', () => {
      console.log('📡 Redis 主客户端已断开连接');
      this.isConnected = false;
    });

    this.client?.on('reconnecting', () => {
      console.log('🔄 Redis 主客户端重连中...');
    });

    this.publisher?.on('error', (error) => {
      console.error('❌ Redis 发布客户端错误:', error.message);
    });

    this.subscriber?.on('error', (error) => {
      console.error('❌ Redis 订阅客户端错误:', error.message);
    });

    process.on('SIGINT', () => {
      void this.disconnect().finally(() => process.exit(0));
    });

    process.on('SIGTERM', () => {
      void this.disconnect().finally(() => process.exit(0));
    });
  }

  async handleReconnect(): Promise<void> {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error(`❌ Redis 重连失败，已达到最大重连次数 ${this.maxReconnectAttempts}`);
      return;
    }

    this.reconnectAttempts += 1;
    const delay = this.reconnectDelay * 2 ** (this.reconnectAttempts - 1);

    console.log(`🔄 Redis 重连尝试 ${this.reconnectAttempts}/${this.maxReconnectAttempts}，等待 ${delay}ms`);

    globalThis.setTimeout(() => {
      void this.connect().catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`❌ Redis 重连尝试 ${this.reconnectAttempts} 失败:`, message);
        void this.handleReconnect();
      });
    }, delay);
  }

  async disconnect(): Promise<void> {
    try {
      if (this.client?.isOpen) {
        await this.client.disconnect();
      }
      if (this.publisher?.isOpen) {
        await this.publisher.disconnect();
      }
      if (this.subscriber?.isOpen) {
        await this.subscriber.disconnect();
      }

      this.isConnected = false;
      console.log('✅ Redis 连接已关闭');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('❌ 关闭 Redis 连接时出错:', message);
      throw error;
    }
  }

  getClient(): RedisClient {
    if (!this.isConnected || !this.client) {
      throw new Error('Redis 未连接或客户端不可用');
    }
    return this.client;
  }

  getPublisher(): RedisClient {
    if (!this.isConnected || !this.publisher) {
      throw new Error('Redis 发布客户端未连接');
    }
    return this.publisher;
  }

  getSubscriber(): RedisClient {
    if (!this.isConnected || !this.subscriber) {
      throw new Error('Redis 订阅客户端未连接');
    }
    return this.subscriber;
  }

  async healthCheck(): Promise<RedisHealthStatus> {
    try {
      if (!this.isConnected || !this.client) {
        return { status: 'unhealthy', message: 'Redis 未连接' };
      }

      const response = await this.client.ping();
      if (response !== 'PONG') {
        return { status: 'unhealthy', message: 'Redis ping 响应异常' };
      }

      const testKey = 'health_check_test';
      const testValue = Date.now().toString();

      await this.client.set(testKey, testValue, { EX: 5 });
      const retrievedValue = await this.client.get(testKey);

      if (retrievedValue !== testValue) {
        return { status: 'unhealthy', message: 'Redis 读写测试失败' };
      }

      await this.client.del(testKey);

      return {
        status: 'healthy',
        message: 'Redis 连接正常',
        details: {
          host: config.redis.host,
          port: config.redis.port,
          db: config.redis.db,
          reconnectAttempts: this.reconnectAttempts
        }
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        status: 'unhealthy',
        message: `Redis 健康检查失败: ${message}`,
        error: message
      };
    }
  }

  async getInfo(): Promise<Record<string, Record<string, RedisInfoValue>>> {
    try {
      if (!this.isConnected || !this.client) {
        throw new Error('Redis 未连接');
      }

      const info = await this.client.info();
      const keyspace = await this.client.info('keyspace');

      return {
        server: this.parseInfo(info, 'server'),
        memory: this.parseInfo(info, 'memory'),
        stats: this.parseInfo(info, 'stats'),
        keyspace: this.parseInfo(keyspace, 'keyspace')
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('获取 Redis 信息失败:', message);
      throw error;
    }
  }

  parseInfo(infoString: string, section: string): Record<string, RedisInfoValue> {
    const lines = infoString.split('\r\n');
    const result: Record<string, RedisInfoValue> = {};
    let inSection = false;

    for (const line of lines) {
      if (line.startsWith('#')) {
        inSection = line.toLowerCase().includes(section.toLowerCase());
        continue;
      }

      if (inSection && line.includes(':')) {
        const separatorIndex = line.indexOf(':');
        const key = line.slice(0, separatorIndex);
        const value = line.slice(separatorIndex + 1);
        const numericValue = Number(value);
        result[key] = Number.isNaN(numericValue) ? value : numericValue;
      }
    }

    return result;
  }

  async cleanup(): Promise<void> {
    try {
      if (!this.isConnected || !this.client) {
        throw new Error('Redis 未连接');
      }

      const testKeys = await this.client.keys('test_*');
      if (testKeys.length > 0) {
        await this.client.del(testKeys);
        console.log(`🧹 清理了 ${testKeys.length} 个测试键`);
      }

      console.log('🧹 Redis 清理完成');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('❌ Redis 清理失败:', message);
      throw error;
    }
  }

  getConnectionStatus(): {
    isConnected: boolean;
    reconnectAttempts: number;
    maxReconnectAttempts: number;
    clientReady: boolean;
    publisherReady: boolean;
    subscriberReady: boolean;
  } {
    return {
      isConnected: this.isConnected,
      reconnectAttempts: this.reconnectAttempts,
      maxReconnectAttempts: this.maxReconnectAttempts,
      clientReady: this.client?.isReady ?? false,
      publisherReady: this.publisher?.isReady ?? false,
      subscriberReady: this.subscriber?.isReady ?? false
    };
  }

  async executeTransaction(operations: RedisTransactionOperation[]): Promise<unknown> {
    try {
      if (!this.isConnected || !this.client) {
        throw new Error('Redis 未连接');
      }

      const multi = this.client.multi() as unknown as Record<string, (...args: unknown[]) => unknown> & {
        exec: () => Promise<unknown>;
      };

      operations.forEach((operation) => {
        const command = multi[operation.command];
        if (typeof command !== 'function') {
          throw new Error(`不支持的 Redis 事务命令: ${operation.command}`);
        }
        command.apply(multi, operation.args);
      });

      return await multi.exec();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('Redis 事务执行失败:', message);
      throw error;
    }
  }

  async publish(channel: string, message: unknown): Promise<number> {
    try {
      if (!this.publisher) {
        throw new Error('Redis 发布客户端未连接');
      }

      const payload = typeof message === 'string' ? message : JSON.stringify(message);
      return await this.publisher.publish(channel, payload);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`Redis 发布消息失败 [${channel}]:`, errorMessage);
      throw error;
    }
  }

  async subscribe(channel: string, callback: (message: unknown) => void): Promise<void> {
    try {
      if (!this.subscriber) {
        throw new Error('Redis 订阅客户端未连接');
      }

      await this.subscriber.subscribe(channel, (message) => {
        try {
          callback(JSON.parse(message));
        } catch {
          callback(message);
        }
      });

      console.log(`📡 已订阅 Redis 频道: ${channel}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`Redis 订阅失败 [${channel}]:`, errorMessage);
      throw error;
    }
  }
}

const redisConnection = new RedisConnection();

export default redisConnection;
