#!/bin/bash

# PM2 启动脚本模板
# 复制此文件为 pm2-start.sh 并填入实际的环境变量值

# 示例配置（请替换为实际值）
# MONGODB_URI="mongodb://localhost:27017/selfcontrol"
# BOT_TOKEN="your-bot-token-here"
# NODE_ENV="production"

echo "❌ 错误：请先创建 scripts/pm2-start.sh 文件"
echo "📝 步骤："
echo "1. 复制 scripts/pm2-start.example.sh 为 scripts/pm2-start.sh"
echo "2. 编辑 pm2-start.sh 填入实际的环境变量值"
echo "3. 运行 chmod +x scripts/pm2-start.sh 赋予执行权限"
echo "4. 运行 yarn pm2:start 启动服务"

exit 1