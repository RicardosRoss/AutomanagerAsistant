#!/bin/bash
set -euo pipefail

PROJECT_DIR="/home/jimjones/telegramBots/AutomanagerAsistant"
SERVICE_NAME="automanager-mongod.service"
HOST="127.0.0.1"
PORT="27017"

wait_for_port() {
  local expected_state="$1"
  local attempts=30

  for _ in $(seq 1 "${attempts}"); do
    if timeout 1 bash -lc "</dev/tcp/${HOST}/${PORT}" >/dev/null 2>&1; then
      [[ "${expected_state}" == "open" ]] && return 0
    else
      [[ "${expected_state}" == "closed" ]] && return 0
    fi
    sleep 1
  done

  echo "❌ MongoDB 端口 ${HOST}:${PORT} 未达到期望状态: ${expected_state}"
  return 1
}

ensure_service() {
  if [[ ! -f "${HOME}/.config/systemd/user/${SERVICE_NAME}" ]]; then
    "${PROJECT_DIR}/scripts/install-mongod-user-service.sh"
  fi
}

case "${1:-status}" in
  install)
    "${PROJECT_DIR}/scripts/install-mongod-user-service.sh"
    ;;
  start)
    ensure_service
    systemctl --user start "${SERVICE_NAME}"
    wait_for_port open
    echo "✅ MongoDB 服务已启动"
    ;;
  stop)
    ensure_service
    if systemctl --user --quiet is-active "${SERVICE_NAME}"; then
      systemctl --user stop "${SERVICE_NAME}"
      wait_for_port closed
      echo "✅ MongoDB 服务已停止"
    else
      echo "ℹ️ MongoDB 服务未运行"
    fi
    ;;
  restart)
    ensure_service
    systemctl --user restart "${SERVICE_NAME}"
    wait_for_port open
    echo "✅ MongoDB 服务已重启"
    ;;
  status)
    ensure_service
    systemctl --user status "${SERVICE_NAME}" --no-pager
    ;;
  logs)
    ensure_service
    journalctl --user -u "${SERVICE_NAME}" -n 100 --no-pager
    ;;
  *)
    echo "用法: $0 {install|start|stop|restart|status|logs}"
    exit 1
    ;;
esac
