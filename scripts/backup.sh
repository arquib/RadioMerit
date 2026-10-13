#!/bin/bash
# Dump of the "radiomerit" database, kept for 7 days. Run it from cron (e.g. nightly).
# PG_EXEC is how to run a command inside your Postgres container; PG_USER is a role that may dump the database.
set -euo pipefail
DIR="$(cd "$(dirname "$0")/.." && pwd)/backups"
PG_EXEC="${PG_EXEC:-docker compose exec -T db}"
PG_USER="${PG_USER:-postgres}"
mkdir -p "$DIR"
OUT="$DIR/radiomerit-$(date -u +%Y%m%d-%H%M).sql.gz"
$PG_EXEC pg_dump -U "$PG_USER" -d radiomerit --no-owner | gzip > "$OUT"
chmod 600 "$OUT"
find "$DIR" -name 'radiomerit-*.sql.gz' -mtime +7 -delete
echo "$(date -u +%FT%TZ) backup ok: $OUT ($(stat -c %s "$OUT") bytes)"
