import mongoose, { type Connection, type ConnectOptions } from 'mongoose';
import config from '../../config/index.js';

export interface ConnectionState {
  state: string;
  readyState: number;
  isConnected: boolean;
  host?: string;
  port?: number;
  name?: string;
}

class DatabaseConnection {
  isConnected: boolean;

  connection: Connection | null;

  constructor() {
    this.isConnected = false;
    this.connection = null;
  }

  async connect(uri: string | null = null): Promise<Connection> {
    try {
      const connectionUri = uri ?? config.database.uri;

      if (!connectionUri) {
        throw new Error('数据库连接URI未配置');
      }

      const options: ConnectOptions = {
        ...config.database.options
      };

      const mongooseInstance = await mongoose.connect(connectionUri, options);
      this.connection = mongooseInstance.connection;
      this.isConnected = true;

      console.log(`✅ 数据库连接成功: ${connectionUri.replace(/\/\/.*@/, '//***:***@')}`);
      this.setupEventListeners();

      return this.connection;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('❌ 数据库连接失败:', message);
      throw error;
    }
  }

  setupEventListeners(): void {
    mongoose.connection.on('connected', () => {
      console.log('📡 Mongoose 已连接到 MongoDB');
      this.isConnected = true;
    });

    mongoose.connection.on('error', (error) => {
      console.error('❌ MongoDB 连接错误:', error);
      this.isConnected = false;
    });

    mongoose.connection.on('disconnected', () => {
      console.log('📡 Mongoose 已断开与 MongoDB 的连接');
      this.isConnected = false;
    });

    process.on('SIGINT', () => {
      void this.disconnect().finally(() => process.exit(0));
    });

    process.on('SIGTERM', () => {
      void this.disconnect().finally(() => process.exit(0));
    });
  }

  async disconnect(): Promise<void> {
    try {
      if (this.isConnected && mongoose.connection.readyState === 1) {
        await mongoose.connection.close();
        this.isConnected = false;
        console.log('✅ 数据库连接已关闭');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('❌ 关闭数据库连接时出错:', message);
      throw error;
    }
  }

  async dropDatabase(): Promise<void> {
    try {
      if (config.app.environment === 'test') {
        await mongoose.connection.dropDatabase();
        console.log('🗑️ 测试数据库已清空');
      } else {
        throw new Error('只能在测试环境中删除数据库');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('❌ 删除数据库失败:', message);
      throw error;
    }
  }

  getConnectionState(): ConnectionState {
    const states: Record<number, string> = {
      0: 'disconnected',
      1: 'connected',
      2: 'connecting',
      3: 'disconnecting'
    };

    return {
      state: states[mongoose.connection.readyState] ?? 'unknown',
      readyState: mongoose.connection.readyState,
      isConnected: this.isConnected,
      host: mongoose.connection.host,
      port: mongoose.connection.port,
      name: mongoose.connection.name
    };
  }

  async healthCheck(): Promise<Record<string, unknown>> {
    try {
      if (!this.isConnected) {
        return { status: 'unhealthy', message: '数据库未连接' };
      }

      const admin = mongoose.connection.db?.admin();
      if (!admin) {
        return { status: 'unhealthy', message: '数据库管理接口不可用' };
      }

      await admin.ping();

      return {
        status: 'healthy',
        message: '数据库连接正常',
        details: this.getConnectionState()
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        status: 'unhealthy',
        message: `数据库健康检查失败: ${message}`,
        error: message
      };
    }
  }

  async getStats(): Promise<Record<string, number>> {
    try {
      if (!this.isConnected) {
        throw new Error('数据库未连接');
      }

      const db = mongoose.connection.db;
      if (!db) {
        throw new Error('数据库实例不可用');
      }

      const stats = await db.stats();

      return {
        collections: stats.collections,
        dataSize: stats.dataSize,
        storageSize: stats.storageSize,
        indexes: stats.indexes,
        indexSize: stats.indexSize,
        objects: stats.objects
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('获取数据库统计信息失败:', message);
      throw error;
    }
  }
}

const databaseConnection = new DatabaseConnection();

export default databaseConnection;
