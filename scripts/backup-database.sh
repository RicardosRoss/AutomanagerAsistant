#!/usr/bin/env bash
set -euo pipefail
umask 077

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
backup_base="${TASK_BACKUP_DIRECTORY:-/root/automanager-backups}"
service=telegram-self-control-bot
helper="$project_root/scripts/database-backup.mjs"
cd "$project_root"
for command in node pm2 mongodump timeout flock sha256sum curl; do command -v "$command" >/dev/null; done
mkdir -p "$backup_base"
chmod 700 "$backup_base"
exec 9>"$backup_base/.database-backup.lock"
flock -n 9 || { echo 'A database backup is already running' >&2; exit 1; }
timeout 20s node "$helper" pm2-check online
timeout 20s node "$helper" preflight
mongodump --version >/dev/null
backup_dir="$(mktemp -d "$backup_base/database-$(date -u +%Y%m%d-%H%M%S)-XXXXXX")"
restore_needed=0
cleanup() {
  result=$?
  trap - EXIT INT TERM
  if [ "$restore_needed" = 1 ]; then
    if ! timeout 30s pm2 restart "$service" >/dev/null 2>&1; then
      echo 'CRITICAL: bot restart failed; inspect PM2 immediately' >&2
      result=1
    fi
  fi
  rm -f "$backup_dir/tools-config.yml"
  exit "$result"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
trap 'exit 129' HUP

restore_needed=1
timeout 30s pm2 stop "$service" >/dev/null
timeout 20s node "$helper" pm2-check stopped
timeout 30s node "$helper" snapshot "$backup_dir/before.json"
timeout 20s node "$helper" config "$backup_dir/tools-config.yml"
timeout --kill-after=5s 90s mongodump --config="$backup_dir/tools-config.yml" \
  --archive="$backup_dir/selfcontrol.archive.gz" --gzip --quiet >"$backup_dir/dump.log" 2>&1
timeout 20s node "$helper" pm2-check stopped
timeout 30s node "$helper" snapshot "$backup_dir/after.json"
node "$helper" compare "$backup_dir/before.json" "$backup_dir/after.json"
test -s "$backup_dir/selfcontrol.archive.gz"
(cd "$backup_dir" && sha256sum selfcontrol.archive.gz before.json after.json > SHA256SUMS)
timeout 30s pm2 restart "$service" >/dev/null
restore_needed=0
timeout 20s node "$helper" pm2-check online
timeout --kill-after=5s 65s curl --fail --silent --show-error --retry 60 --retry-connrefused --retry-delay 1 \
  --max-time 3 --retry-max-time 60 http://127.0.0.1:3000/health >"$backup_dir/health.json"
printf 'quiescent standalone dump; isolated restore verification still required\n' >"$backup_dir/COMPLETE"
echo "$backup_dir"
