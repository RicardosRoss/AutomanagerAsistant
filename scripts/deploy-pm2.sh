#!/bin/bash

# Telegram 自控力助手 PM2 部署脚本
# 用于配置和启动系统服务

set -e

echo "🚀 开始部署 Telegram 自控力助手..."

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 项目目录
PROJECT_DIR="/home/telegramAutomanager"
APP_NAME="telegram-self-control-bot"

# 检查必要的服务
check_services() {
    echo -e "${YELLOW}📋 检查系统服务状态...${NC}"

    # 检查 MongoDB
    if systemctl is-active --quiet mongod; then
        echo -e "${GREEN}✅ MongoDB 运行中${NC}"
    else
        echo -e "${RED}❌ MongoDB 未运行，请启动 MongoDB${NC}"
        exit 1
    fi

    # 检查 Redis
    if systemctl is-active --quiet redis; then
        echo -e "${GREEN}✅ Redis 运行中${NC}"
    else
        echo -e "${YELLOW}⚠️  Redis 未运行，尝试启动...${NC}"
        sudo systemctl start redis
    fi
}

# 创建必要目录
create_directories() {
    echo -e "${YELLOW}📁 创建日志目录...${NC}"
    mkdir -p $PROJECT_DIR/logs/pm2
    mkdir -p $PROJECT_DIR/logs/app
    echo -e "${GREEN}✅ 目录创建完成${NC}"
}

# 安装依赖
install_dependencies() {
    echo -e "${YELLOW}📦 检查依赖...${NC}"
    cd $PROJECT_DIR

    if [ ! -d "node_modules" ]; then
        echo -e "${YELLOW}安装 Node.js 依赖...${NC}"
        yarn install --production
    fi

    echo -e "${GREEN}✅ 依赖检查完成${NC}"
}

# 停止现有进程
stop_existing_process() {
    echo -e "${YELLOW}🛑 停止现有进程...${NC}"

    # 停止 PM2 进程
    if pm2 describe $APP_NAME > /dev/null 2>&1; then
        pm2 stop $APP_NAME
        pm2 delete $APP_NAME
        echo -e "${GREEN}✅ 已停止现有 PM2 进程${NC}"
    fi

    # 查找并停止直接运行的进程
    PIDS=$(pgrep -f "node.*src/app.js" | head -5 || true)
    if [ ! -z "$PIDS" ]; then
        echo -e "${YELLOW}停止直接运行的进程: $PIDS${NC}"
        echo $PIDS | xargs kill -TERM 2>/dev/null || true
        sleep 3
        echo $PIDS | xargs kill -KILL 2>/dev/null || true
    fi
}

# 启动应用
start_application() {
    echo -e "${YELLOW}🚀 启动应用...${NC}"
    cd $PROJECT_DIR

    # 使用 PM2 启动
    pm2 start ecosystem.config.js --env production

    # 保存 PM2 配置
    pm2 save

    echo -e "${GREEN}✅ 应用启动完成${NC}"
}

# 验证部署
verify_deployment() {
    echo -e "${YELLOW}🔍 验证部署...${NC}"

    sleep 5

    # 检查 PM2 状态
    if pm2 describe $APP_NAME > /dev/null 2>&1; then
        STATUS=$(pm2 jlist | jq -r ".[] | select(.name==\"$APP_NAME\") | .pm2_env.status")
        if [ "$STATUS" = "online" ]; then
            echo -e "${GREEN}✅ PM2 进程状态: $STATUS${NC}"
        else
            echo -e "${RED}❌ PM2 进程状态: $STATUS${NC}"
            pm2 logs $APP_NAME --lines 20
            exit 1
        fi
    else
        echo -e "${RED}❌ PM2 进程未找到${NC}"
        exit 1
    fi

    # 检查健康端点
    sleep 3
    if curl -f http://localhost:3000/health > /dev/null 2>&1; then
        echo -e "${GREEN}✅ 健康检查通过${NC}"
    else
        echo -e "${YELLOW}⚠️  健康检查失败，应用可能仍在启动中${NC}"
    fi
}

# 显示状态信息
show_status() {
    echo -e "${GREEN}🎉 部署完成！${NC}"
    echo ""
    echo -e "${YELLOW}📊 应用状态:${NC}"
    pm2 status $APP_NAME
    echo ""
    echo -e "${YELLOW}📝 有用的命令:${NC}"
    echo "  查看状态:   yarn pm2:status"
    echo "  查看日志:   yarn pm2:logs"
    echo "  重启应用:   yarn pm2:restart"
    echo "  停止应用:   yarn pm2:stop"
    echo "  监控面板:   yarn pm2:monit"
    echo ""
    echo -e "${YELLOW}🔗 访问地址:${NC}"
    echo "  健康检查:   http://localhost:3000/health"
    echo "  API信息:    http://localhost:3000/api/info"
    echo ""
    echo -e "${YELLOW}📋 日志文件:${NC}"
    echo "  组合日志:   tail -f logs/pm2/combined.log"
    echo "  错误日志:   tail -f logs/pm2/error.log"
    echo "  输出日志:   tail -f logs/pm2/out.log"
}

# 主执行流程
main() {
    echo "🤖 Telegram 自控力助手 PM2 部署脚本"
    echo "========================================="
    echo ""

    check_services
    create_directories
    install_dependencies
    stop_existing_process
    start_application
    verify_deployment
    show_status

    echo ""
    echo -e "${GREEN}🎊 部署成功完成！Bot 现在作为系统服务运行。${NC}"
}

# 处理脚本参数
case "${1:-deploy}" in
    "deploy")
        main
        ;;
    "status")
        pm2 status $APP_NAME
        ;;
    "logs")
        pm2 logs $APP_NAME
        ;;
    "restart")
        pm2 restart $APP_NAME
        echo -e "${GREEN}✅ 应用已重启${NC}"
        ;;
    "stop")
        pm2 stop $APP_NAME
        echo -e "${YELLOW}🛑 应用已停止${NC}"
        ;;
    "start")
        pm2 start $APP_NAME
        echo -e "${GREEN}🚀 应用已启动${NC}"
        ;;
    *)
        echo "用法: $0 {deploy|status|logs|restart|stop|start}"
        echo ""
        echo "  deploy   - 完整部署应用"
        echo "  status   - 查看应用状态"
        echo "  logs     - 查看应用日志"
        echo "  restart  - 重启应用"
        echo "  stop     - 停止应用"
        echo "  start    - 启动应用"
        exit 1
        ;;
esac