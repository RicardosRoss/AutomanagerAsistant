#!/bin/bash
# Telegram Bot 启动脚本

set -e
cd "$(dirname "$0")"
export NODE_ENV=production
exec node dist/src/app.js
