#!/usr/bin/env bash
# Menjalankan PostgreSQL sementara untuk pengujian lokal (tanpa Docker).
#   scripts/pg-local.sh start | stop
# Setelah start:  TEST_DATABASE_URL=postgres://postgres@127.0.0.1:54329/postgres npm run test:db
set -euo pipefail
PORT="${PGTEST_PORT:-54329}"
DIR="${PGTEST_DIR:-/tmp/lr1-pgtest}"
BIN="$(dirname "$(command -v initdb || ls /usr/lib/postgresql/*/bin/initdb | tail -1)")"
run() { if [ "$(id -u)" = "0" ]; then su postgres -c "$*"; else bash -c "$*"; fi; }
case "${1:-start}" in
  start)
    if [ ! -d "$DIR/data" ]; then
      mkdir -p "$DIR"; [ "$(id -u)" = "0" ] && chown postgres "$DIR"
      run "$BIN/initdb -D $DIR/data -U postgres -A trust >/dev/null"
    fi
    run "$BIN/pg_ctl -D $DIR/data -o '-p $PORT -c listen_addresses=127.0.0.1 -c max_connections=300 -c fsync=off' -l $DIR/log -w start"
    ;;
  stop) run "$BIN/pg_ctl -D $DIR/data -m fast stop" ;;
esac
