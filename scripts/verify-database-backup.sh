#!/usr/bin/env bash
set -euo pipefail
umask 077

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
backup_dir="$(cd "${1:?Supply the completed backup directory}" && pwd)"
helper="$project_root/scripts/database-backup.mjs"
cd "$project_root"
test -f "$backup_dir/COMPLETE" || { echo 'Incomplete backup' >&2; exit 1; }
(cd "$backup_dir" && sha256sum -c SHA256SUMS >/dev/null) || {
  echo 'Backup checksum mismatch' >&2; exit 1;
}
for command in node mongod mongorestore timeout; do command -v "$command" >/dev/null; done
verify_dir="$(mktemp -d "$backup_dir/verify-XXXXXX")"
mkdir "$verify_dir/db"
port="$(node --input-type=module -e '
import net from "node:net";
const server = net.createServer();
server.listen(0, "127.0.0.1", () => { console.log(server.address().port); server.close(); });
')"
case "$port" in ''|*[!0-9]*|27017) echo 'Invalid isolated MongoDB port' >&2; exit 1;; esac
cleanup() {
  result=$?
  trap - EXIT INT TERM HUP
  if [ -f "$verify_dir/mongod.pid" ]; then
    isolated_pid="$(cat "$verify_dir/mongod.pid")"
    # The PID file lives in this invocation's private, newly created directory.
    kill -TERM "$isolated_pid" 2>/dev/null || true
    for attempt in {1..100}; do
      kill -0 "$isolated_pid" 2>/dev/null || break
      sleep 0.1
    done
    if kill -0 "$isolated_pid" 2>/dev/null; then
      echo 'Isolated MongoDB required forced shutdown; verification run is unsuccessful' >&2
      kill -KILL "$isolated_pid" 2>/dev/null || true
      printf 'TERM timed out; SIGKILL sent to private isolated mongod\n' >"$verify_dir/shutdown-failed.log"
      rm -f "$verify_dir/RESTORE_VERIFIED"
      result=1
    fi
  fi
  exit "$result"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
trap 'exit 129' HUP
timeout 30s mongod --dbpath "$verify_dir/db" --bind_ip 127.0.0.1 --port "$port" \
  --logpath "$verify_dir/mongod.log" --pidfilepath "$verify_dir/mongod.pid" --fork >"$verify_dir/start.log" 2>&1
timeout --kill-after=5s 90s mongorestore --host=127.0.0.1 --port="$port" \
  --archive="$backup_dir/selfcontrol.archive.gz" --gzip --stopOnError --quiet >"$verify_dir/restore.log" 2>&1
TASK_BACKUP_VERIFY_URI="mongodb://127.0.0.1:$port/selfcontrol" \
  timeout 30s node "$helper" verify "$verify_dir/restored.json"
node "$helper" compare "$backup_dir/before.json" "$verify_dir/restored.json"
printf 'All BSON documents, collection options and index definitions match\n' >"$verify_dir/RESTORE_VERIFIED"
echo "$verify_dir"
