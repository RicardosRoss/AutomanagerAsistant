// 简化启动脚本 - 测试系统功能
import config from '../config/index.js';
import logger from '../src/utils/logger.js';

console.log('🧪 测试配置加载...');
console.log('Bot Token:', config.telegram.token ? '✅ 已配置' : '❌ 未配置');
console.log('MongoDB URI:', config.database.uri ? '✅ 已配置' : '❌ 未配置');
console.log('Redis Host:', config.redis.host ? '✅ 已配置' : '❌ 未配置');

console.log('\n🧪 测试数据库连接...');
try {
  const databaseConnection = (await import('../src/database/connection.js')).default;
  await databaseConnection.connect();
  console.log('✅ 数据库连接测试成功');

  console.log('\n🧪 测试Redis连接...');
  const redisConnection = (await import('../src/config/redis.js')).default;
  await redisConnection.connect();
  console.log('✅ Redis连接测试成功');

  console.log('\n🧪 测试TaskService...');
  const TaskService = (await import('../src/services/TaskService.js')).default;
  const taskService = new TaskService();
  console.log('✅ TaskService实例化成功');

  console.log('\n🎉 所有基础功能测试通过！');
  console.log('\n📝 启动建议:');
  console.log('1. 如需真实Bot功能，请在 @BotFather 创建新Bot并更新BOT_TOKEN');
  console.log('2. 当前配置的Token不是有效的Telegram Bot Token');
  console.log('3. 系统其他功能（数据库、Redis、服务层）均正常工作');

  // 清理连接
  await databaseConnection.disconnect();
  await redisConnection.disconnect();

} catch (error) {
  console.log('❌ 测试失败:', error.message);
  process.exit(1);
}