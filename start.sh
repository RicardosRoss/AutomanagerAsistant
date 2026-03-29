#!/bin/bash
set -euo pipefail

PROJECT_DIR="/home/jimjones/telegramBots/AutomanagerAsistant"
STATE_DIR="${HOME}/.local/state/telegram-self-control-bot"
APP_PID_FILE="${STATE_DIR}/app.pid"
APP_PID=""

cleanup() {
  local exit_code=$?

  trap - EXIT SIGINT SIGTERM

  if [[ -n "${APP_PID}" ]] && kill -0 "${APP_PID}" 2>/dev/null; then
    kill -TERM "${APP_PID}" 2>/dev/null || true
    wait "${APP_PID}" || true
  fi

  rm -f "${APP_PID_FILE}"
  "${PROJECT_DIR}/scripts/mongodb-service.sh" stop || true
  exit "${exit_code}"
}

trap cleanup EXIT SIGINT SIGTERM

cd "${PROJECT_DIR}"
mkdir -p "${STATE_DIR}"
export NODE_ENV="${NODE_ENV:-production}"

"${PROJECT_DIR}/scripts/mongodb-service.sh" start
npm run build

node dist/src/app.js &
APP_PID=$!
printf '%s\n' "${APP_PID}" > "${APP_PID_FILE}"
wait "${APP_PID}"
