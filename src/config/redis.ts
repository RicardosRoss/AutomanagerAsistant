import Redis, { type RedisClientType } from 'redis';
import { randomUUID } from 'node:crypto';
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

  private connectionPromise: Promise<RedisClient> | null = null;

  private disconnectPromise: Promise<void> | null = null;

  private generation = 0;

  private stopping = false;

  private readyPublished = false;

  private readonly readyListeners = new Set<() => Promise<void>>();

  reconnectAttempts: number;

  maxReconnectAttempts: number;

  reconnectDelay: number;

  constructor() {
    this.client = null;
    this.subscriber = null;
    this.publisher = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.reconnectDelay = 1000;
  }

  get isConnected(): boolean {
    return !this.stopping && Boolean(this.client?.isReady && this.publisher?.isReady && this.subscriber?.isReady);
  }

  connect(): Promise<RedisClient> {
    if (this.disconnectPromise) return this.disconnectPromise.then(() => this.connect(), () => this.connect());
    if (this.connectionPromise) return this.connectionPromise;
    if (this.isConnected) return Promise.resolve(this.client!);
    this.stopping = false;
    this.readyPublished = false;
    const generation = ++this.generation;
    const connecting = this.openConnections(generation).finally(() => {
      if (this.connectionPromise === connecting) this.connectionPromise = null;
    });
    this.connectionPromise = connecting;
    return connecting;
  }

  private async openConnections(generation: number): Promise<RedisClient> {
    const created: RedisClient[] = [];
    try {
      await this.closeClients([this.client, this.publisher, this.subscriber]);
      if (generation !== this.generation || this.stopping) throw new Error('Redis 连接已被取消');
      for (const role of ['main', 'publisher', 'subscriber']) {
        created.push(Redis.createClient({
          name: `selfcontrol:${process.pid}:${role}`,
          socket: {
            host: config.redis.host, port: config.redis.port, connectTimeout: 10000,
            reconnectStrategy: (retries: number) => this.getReconnectDelay(retries)
          },
          password: config.redis.password,
          database: config.redis.db,
          disableOfflineQueue: true
        }));
      }
      this.client = created[0]!;
      this.publisher = created[1]!;
      this.subscriber = created[2]!;
      this.setupEventListeners();
      await Promise.all(created.map((client) => client.connect()));
      if (generation !== this.generation || this.stopping) throw new Error('Redis 连接已被取消');
      if (!this.isConnected) throw new Error('Redis 客户端尚未就绪');
      if (await this.client!.ping() !== 'PONG') throw new Error('Redis ping 响应异常');
      if (generation !== this.generation || this.stopping) throw new Error('Redis 连接已被取消');
      this.reconnectAttempts = 0;
      console.log(`✅ Redis 连接成功: ${config.redis.host}:${config.redis.port}`);
      return this.client!;
    } catch (error) {
      if (generation === this.generation) this.stopping = true;
      try {
        await this.closeClients(created);
      } catch (cleanupError) {
        console.error('❌ Redis 部分连接清理失败:', String(cleanupError));
      }
      console.error('❌ Redis 连接失败:', error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  setupEventListeners(): void {
    const clients = [['主', this.client], ['发布', this.publisher], ['订阅', this.subscriber]] as const;
    for (const [role, client] of clients) {
      client?.on('connect', () => console.log(`📡 Redis ${role}客户端正在连接，等待就绪`));
      client?.on('ready', () => {
        if (this.isConnected) this.reconnectAttempts = 0;
        console.log(`✅ Redis ${role}客户端已就绪`);
        if (this.isConnected && !this.readyPublished) {
          this.readyPublished = true;
          for (const listener of this.readyListeners) {
            void this.recoverOnReady(listener).catch((error) => {
              console.error('❌ Redis 就绪后的业务恢复失败:', String(error));
            });
          }
        }
      });
      client?.on('end', () => {
        this.readyPublished = false;
        console.log(`📡 Redis ${role}客户端已关闭`);
      });
      client?.on('error', (error: Error) => {
        this.readyPublished = false;
        console.error(`❌ Redis ${role}客户端错误:`, error.message);
      });
      client?.on('reconnecting', () => {
        this.readyPublished = false;
        console.log(`🔄 Redis ${role}客户端重连中...`);
      });
    }
  }

  onReady(listener: () => Promise<void>): () => void {
    this.readyListeners.add(listener);
    return () => this.readyListeners.delete(listener);
  }

  private async recoverOnReady(listener: () => Promise<void>): Promise<void> {
    // Bootstrap cannot rely on a Bull repeat job which may have been lost.
    // Retry transient setup errors finitely; reconnection will start a new cycle.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      if (!this.isConnected || !this.readyListeners.has(listener)) return;
      try {
        await listener();
        return;
      } catch (error) {
        console.error('❌ Redis 就绪后恢复尝试失败:', { attempt: attempt + 1, error: String(error) });
        if (attempt === 2) throw error;
      }
    }
  }

  private async closeClients(clients: Array<RedisClient | null>): Promise<void> {
    const results = await Promise.allSettled(clients.map(async (client) => {
      if (client?.isOpen) await client.disconnect();
    }));
    const failures = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected');
    if (failures.length) {
      throw new AggregateError(failures.map((result) => result.reason),
        `Redis 客户端关闭失败: ${failures.map((result) => String(result.reason)).join('; ')}`);
    }
  }

  private getReconnectDelay(retries: number): number | Error {
    this.reconnectAttempts = retries;
    if (retries > this.maxReconnectAttempts) {
      return new Error(`Redis 重连失败，已达到最大重连次数 ${this.maxReconnectAttempts}`);
    }
    return Math.min(this.reconnectDelay * 2 ** Math.max(retries - 1, 0), 30000);
  }

  disconnect(): Promise<void> {
    if (this.disconnectPromise) return this.disconnectPromise;
    this.stopping = true;
    this.generation += 1;
    const disconnecting = this.closeClients([this.client, this.publisher, this.subscriber]).finally(() => {
      if (this.disconnectPromise === disconnecting) this.disconnectPromise = null;
    });
    this.disconnectPromise = disconnecting;
    return disconnecting;
  }

  getClient(): RedisClient {
    if (this.stopping || !this.client?.isReady) throw new Error('Redis 未连接或客户端不可用');
    return this.client;
  }

  getPublisher(): RedisClient {
    if (this.stopping || !this.publisher?.isReady) throw new Error('Redis 发布客户端未连接');
    return this.publisher;
  }

  getSubscriber(): RedisClient {
    if (this.stopping || !this.subscriber?.isReady) throw new Error('Redis 订阅客户端未连接');
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

      const testKey = `selfcontrol:health:${randomUUID()}`;
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
      clientReady: !this.stopping && (this.client?.isReady ?? false),
      publisherReady: !this.stopping && (this.publisher?.isReady ?? false),
      subscriberReady: !this.stopping && (this.subscriber?.isReady ?? false)
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
      const publisher = this.getPublisher();

      const payload = typeof message === 'string' ? message : JSON.stringify(message);
      return await publisher.publish(channel, payload);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`Redis 发布消息失败 [${channel}]:`, errorMessage);
      throw error;
    }
  }

  async subscribe(channel: string, callback: (message: unknown) => void): Promise<void> {
    try {
      const subscriber = this.getSubscriber();

      await subscriber.subscribe(channel, (message) => {
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

export { RedisConnection };
export default redisConnection;
