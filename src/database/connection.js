import mongoose from 'mongoose';
import config from '../../config/index.js';

class DatabaseConnection {
  constructor() {
    this.isConnected = false;
    this.connection = null;
  }

  async connect(uri = null) {
    try {
      const connectionUri = uri || config.database.uri;

      if (!connectionUri) {
        throw new Error('数据库连接URI未配置');
      }

      // MongoDB 连接选项
      const options = {
        ...config.database.options,
        // 确保使用最新的连接选项
        useNewUrlParser: true,
        useUnifiedTopology: true
      };

      // 连接到 MongoDB
      this.connection = await mongoose.connect(connectionUri, options);
      this.isConnected = true;

      console.log(`✅ 数据库连接成功: ${connectionUri.replace(/\/\/.*@/, '//***:***@')}`);

      // 监听连接事件
      this.setupEventListeners();

      return this.connection;
    } catch (error) {
      console.error('❌ 数据库连接失败:', error.message);
      throw error;
    }
  }

  setupEventListeners() {
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

  async disconnect() {
    try {
      if (this.isConnected && mongoose.connection.readyState === 1) {
        await mongoose.connection.close();
        this.isConnected = false;
        console.log('✅ 数据库连接已关闭');
      }
    } catch (error) {
      console.error('❌ 关闭数据库连接时出错:', error.message);
      throw error;
    }
  }

  async dropDatabase() {
    try {
      if (config.app.environment === 'test') {
        await mongoose.connection.dropDatabase();
        console.log('🗑️ 测试数据库已清空');
      } else {
        throw new Error('只能在测试环境中删除数据库');
      }
    } catch (error) {
      console.error('❌ 删除数据库失败:', error.message);
      throw error;
    }
  }

  getConnectionState() {
    const states = {
      0: 'disconnected',
      1: 'connected',
      2: 'connecting',
      3: 'disconnecting'
    };

    return {
      state: states[mongoose.connection.readyState] || 'unknown',
      readyState: mongoose.connection.readyState,
      isConnected: this.isConnected,
      host: mongoose.connection.host,
      port: mongoose.connection.port,
      name: mongoose.connection.name
    };
  }

  async healthCheck() {
    try {
      if (!this.isConnected) {
        return { status: 'unhealthy', message: '数据库未连接' };
      }

      // 执行简单查询测试连接
      await mongoose.connection.db.admin().ping();

      return {
        status: 'healthy',
        message: '数据库连接正常',
        details: this.getConnectionState()
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        message: `数据库健康检查失败: ${error.message}`,
        error: error.message
      };
    }
  }

  // 获取数据库统计信息
  async getStats() {
    try {
      if (!this.isConnected) {
        throw new Error('数据库未连接');
      }

      const stats = await mongoose.connection.db.stats();

      return {
        collections: stats.collections,
        dataSize: stats.dataSize,
        storageSize: stats.storageSize,
        indexes: stats.indexes,
        indexSize: stats.indexSize,
        objects: stats.objects
      };
    } catch (error) {
      console.error('获取数据库统计信息失败:', error.message);
      throw error;
    }
  }
}

// 创建单例实例
const databaseConnection = new DatabaseConnection();

export default databaseConnection;
