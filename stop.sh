#!/bin/bash
set -euo pipefail

PROJECT_DIR="/home/jimjones/telegramBots/AutomanagerAsistant"
STATE_DIR="${HOME}/.local/state/telegram-self-control-bot"
APP_PID_FILE="${STATE_DIR}/app.pid"

if [[ -f "${APP_PID_FILE}" ]]; then
  APP_PID="$(cat "${APP_PID_FILE}")"
  if [[ -n "${APP_PID}" ]] && kill -0 "${APP_PID}" 2>/dev/null; then
    kill -TERM "${APP_PID}"
    wait "${APP_PID}" 2>/dev/null || true
    echo "✅ 应用进程已停止"
  else
    echo "ℹ️ 未发现运行中的应用进程"
  fi
  rm -f "${APP_PID_FILE}"
else
  echo "ℹ️ 未找到应用 PID 文件"
fi

"${PROJECT_DIR}/scripts/mongodb-service.sh" stop
