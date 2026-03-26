#!/bin/bash
set -euo pipefail

SERVICE_NAME="automanager-mongod.service"
PROJECT_NAME="telegram-self-control-bot"
HOME_CONFIG_DIR="${HOME}/.config/${PROJECT_NAME}"
HOME_STATE_DIR="${HOME}/.local/state/${PROJECT_NAME}"
HOME_DATA_DIR="${HOME}/.local/share/${PROJECT_NAME}/mongodb"
SYSTEMD_USER_DIR="${HOME}/.config/systemd/user"
UNIT_PATH="${SYSTEMD_USER_DIR}/${SERVICE_NAME}"

mkdir -p "${HOME_CONFIG_DIR}" "${HOME_STATE_DIR}" "${HOME_DATA_DIR}" "${SYSTEMD_USER_DIR}"

MONGOD_BIN="$(
  find "${HOME}/.cache/mongodb-binaries" -maxdepth 1 -type f -name 'mongod-x64-*' 2>/dev/null \
    | sort -V \
    | tail -n 1
)"

if [[ -z "${MONGOD_BIN}" ]]; then
  echo "❌ 未找到可用的 mongod 二进制。请先运行一次项目测试或初始化流程以缓存 MongoDB 二进制。"
  exit 1
fi

chmod +x "${MONGOD_BIN}"

UNIT_CONTENT="[Unit]
Description=MongoDB for ${PROJECT_NAME}
After=network.target

[Service]
Type=simple
ExecStart=${MONGOD_BIN} --dbpath ${HOME_DATA_DIR} --bind_ip 127.0.0.1 --port 27017 --logpath ${HOME_STATE_DIR}/mongod.log --logappend --pidfilepath ${HOME_STATE_DIR}/mongod.pid
ExecStop=/bin/kill -s SIGTERM \$MAINPID
Restart=on-failure
RestartSec=3
TimeoutStopSec=30

[Install]
WantedBy=default.target
"

printf '%s\n' "${UNIT_CONTENT}" > "${UNIT_PATH}"

systemctl --user daemon-reload
systemctl --user enable "${SERVICE_NAME}" >/dev/null

echo "✅ 已安装用户级 MongoDB 服务: ${UNIT_PATH}"
echo "   mongod: ${MONGOD_BIN}"
echo "   data:   ${HOME_DATA_DIR}"
echo "   log:    ${HOME_STATE_DIR}/mongod.log"
