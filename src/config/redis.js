import Redis from 'redis';
import config from '../../config/index.js';

class RedisConnection {
  constructor() {
    this.client = null;
    this.subscriber = null;
    this.publisher = null;
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.reconnectDelay = 1000; // 1秒
  }

  async connect() {
    try {
      const redisConfig = {
        host: config.redis.host,
        port: config.redis.port,
        password: config.redis.password,
        db: config.redis.db,
        retryDelayOnFailover: 100,
        enableReadyCheck: false,
        maxRetriesPerRequest: 3,
        lazyConnect: true,
        retryStrategyOnFailover: (times) => Math.min(times * 50, 2000),
        connectTimeout: 10000,
        commandTimeout: 5000
      };

      // 创建主客户端
      this.client = Redis.createClient({
        socket: {
          host: redisConfig.host,
          port: redisConfig.port,
          connectTimeout: redisConfig.connectTimeout,
          commandTimeout: redisConfig.commandTimeout
        },
        password: redisConfig.password,
        database: redisConfig.db
      });

      // 创建发布客户端
      this.publisher = Redis.createClient({
        socket: {
          host: redisConfig.host,
          port: redisConfig.port
        },
        password: redisConfig.password,
        database: redisConfig.db
      });

      // 创建订阅客户端
      this.subscriber = Redis.createClient({
        socket: {
          host: redisConfig.host,
          port: redisConfig.port
        },
        password: redisConfig.password,
        database: redisConfig.db
      });

      // 设置事件监听器
      this.setupEventListeners();

      // 连接所有客户端
      await Promise.all([
        this.client.connect(),
        this.publisher.connect(),
        this.subscriber.connect()
      ]);

      this.isConnected = true;
      this.reconnectAttempts = 0;

      console.log(`✅ Redis 连接成功: ${config.redis.host}:${config.redis.port}`);

      // 测试连接
      await this.client.ping();
      console.log('📡 Redis 连接测试成功');

      return this.client;
    } catch (error) {
      console.error('❌ Redis 连接失败:', error.message);
      this.isConnected = false;
      throw error;
    }
  }

  setupEventListeners() {
    // 主客户端事件
    this.client.on('connect', () => {
      console.log('📡 Redis 主客户端已连接');
      this.isConnected = true;
      this.reconnectAttempts = 0;
    });

    this.client.on('error', (error) => {
      console.error('❌ Redis 主客户端错误:', error.message);
      this.isConnected = false;
      this.handleReconnect();
    });

    this.client.on('disconnect', () => {
      console.log('📡 Redis 主客户端已断开连接');
      this.isConnected = false;
    });

    this.client.on('reconnecting', () => {
      console.log('🔄 Redis 主客户端重连中...');
    });

    // 发布客户端事件
    this.publisher.on('error', (error) => {
      console.error('❌ Redis 发布客户端错误:', error.message);
    });

    // 订阅客户端事件
    this.subscriber.on('error', (error) => {
      console.error('❌ Redis 订阅客户端错误:', error.message);
    });

    // 优雅关闭
    process.on('SIGINT', async () => {
      await this.disconnect();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      await this.disconnect();
      process.exit(0);
    });
  }

  async handleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error(`❌ Redis 重连失败，已达到最大重连次数 ${this.maxReconnectAttempts}`);
      return;
    }

    this.reconnectAttempts += 1;
    const delay = this.reconnectDelay * 2 ** (this.reconnectAttempts - 1); // 指数退避

    console.log(`🔄 Redis 重连尝试 ${this.reconnectAttempts}/${this.maxReconnectAttempts}，等待 ${delay}ms`);

    setTimeout(async () => {
      try {
        await this.connect();
      } catch (error) {
        console.error(`❌ Redis 重连尝试 ${this.reconnectAttempts} 失败:`, error.message);
        this.handleReconnect();
      }
    }, delay);
  }

  async disconnect() {
    try {
      if (this.client && this.client.isOpen) {
        await this.client.disconnect();
      }
      if (this.publisher && this.publisher.isOpen) {
        await this.publisher.disconnect();
      }
      if (this.subscriber && this.subscriber.isOpen) {
        await this.subscriber.disconnect();
      }

      this.isConnected = false;
      console.log('✅ Redis 连接已关闭');
    } catch (error) {
      console.error('❌ 关闭 Redis 连接时出错:', error.message);
      throw error;
    }
  }

  // 获取主客户端
  getClient() {
    if (!this.isConnected || !this.client) {
      throw new Error('Redis 未连接或客户端不可用');
    }
    return this.client;
  }

  // 获取发布客户端
  getPublisher() {
    if (!this.isConnected || !this.publisher) {
      throw new Error('Redis 发布客户端未连接');
    }
    return this.publisher;
  }

  // 获取订阅客户端
  getSubscriber() {
    if (!this.isConnected || !this.subscriber) {
      throw new Error('Redis 订阅客户端未连接');
    }
    return this.subscriber;
  }

  // 健康检查
  async healthCheck() {
    try {
      if (!this.isConnected || !this.client) {
        return { status: 'unhealthy', message: 'Redis 未连接' };
      }

      // 执行 ping 命令测试连接
      const response = await this.client.ping();
      if (response !== 'PONG') {
        return { status: 'unhealthy', message: 'Redis ping 响应异常' };
      }

      // 测试基本操作
      const testKey = 'health_check_test';
      const testValue = Date.now().toString();

      await this.client.set(testKey, testValue, { EX: 5 }); // 5秒过期
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
      return {
        status: 'unhealthy',
        message: `Redis 健康检查失败: ${error.message}`,
        error: error.message
      };
    }
  }

  // 获取 Redis 信息
  async getInfo() {
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
      console.error('获取 Redis 信息失败:', error.message);
      throw error;
    }
  }

  // 解析 Redis INFO 输出
  parseInfo(infoString, section) {
    const lines = infoString.split('\r\n');
    const result = {};
    let inSection = false;

    for (const line of lines) {
      if (line.startsWith('#')) {
        inSection = line.toLowerCase().includes(section.toLowerCase());
        continue;
      }

      if (inSection && line.includes(':')) {
        const [key, value] = line.split(':');
        result[key] = isNaN(value) ? value : Number(value);
      }
    }

    return result;
  }

  // 清理过期数据
  async cleanup() {
    try {
      if (!this.isConnected || !this.client) {
        throw new Error('Redis 未连接');
      }

      // 清理测试键
      const testKeys = await this.client.keys('test_*');
      if (testKeys.length > 0) {
        await this.client.del(testKeys);
        console.log(`🧹 清理了 ${testKeys.length} 个测试键`);
      }

      // 清理过期的队列数据（根据需要添加更多清理逻辑）
      console.log('🧹 Redis 清理完成');
    } catch (error) {
      console.error('❌ Redis 清理失败:', error.message);
      throw error;
    }
  }

  // 获取连接状态
  getConnectionStatus() {
    return {
      isConnected: this.isConnected,
      reconnectAttempts: this.reconnectAttempts,
      maxReconnectAttempts: this.maxReconnectAttempts,
      clientReady: this.client ? this.client.isReady : false,
      publisherReady: this.publisher ? this.publisher.isReady : false,
      subscriberReady: this.subscriber ? this.subscriber.isReady : false
    };
  }

  // 执行原子操作
  async executeTransaction(operations) {
    try {
      if (!this.isConnected || !this.client) {
        throw new Error('Redis 未连接');
      }

      const multi = this.client.multi();

      // 添加操作到事务
      operations.forEach((op) => {
        multi[op.command](...op.args);
      });

      // 执行事务
      const results = await multi.exec();
      return results;
    } catch (error) {
      console.error('Redis 事务执行失败:', error.message);
      throw error;
    }
  }

  // 发布消息
  async publish(channel, message) {
    try {
      if (!this.publisher) {
        throw new Error('Redis 发布客户端未连接');
      }

      const messageStr = typeof message === 'string' ? message : JSON.stringify(message);
      return await this.publisher.publish(channel, messageStr);
    } catch (error) {
      console.error(`Redis 发布消息失败 [${channel}]:`, error.message);
      throw error;
    }
  }

  // 订阅消息
  async subscribe(channel, callback) {
    try {
      if (!this.subscriber) {
        throw new Error('Redis 订阅客户端未连接');
      }

      await this.subscriber.subscribe(channel, (message) => {
        try {
          const parsedMessage = JSON.parse(message);
          callback(parsedMessage);
        } catch {
          callback(message); // 如果不是 JSON，直接传递字符串
        }
      });

      console.log(`📡 已订阅 Redis 频道: ${channel}`);
    } catch (error) {
      console.error(`Redis 订阅失败 [${channel}]:`, error.message);
      throw error;
    }
  }
}

// 创建单例实例
const redisConnection = new RedisConnection();

export default redisConnection;
