#!/usr/bin/env bash
# Entrypoint for the Sunshine container.
# Waits for the Postgres database to accept connections before starting the app.
set -euo pipefail

# ── Parse DB host/port from ROCKET_DATABASES ──────────────────────────────────
# Format: ROCKET_DATABASES={sunshine_db={url="postgres://user:pass@host:port/db"}}
if [ -z "${ROCKET_DATABASES:-}" ]; then
  echo "FATAL: ROCKET_DATABASES is not set. Cannot start without a database."
  echo "  Expected format: ROCKET_DATABASES={sunshine_db={url=\"postgres://user:pass@host:port/db\"}}"
  exit 1
fi

# Extract host:port from the URL
DB_URL=$(echo "$ROCKET_DATABASES" | grep -oP 'url="?\K[^"}\s]+')
if [ -z "$DB_URL" ]; then
  echo "FATAL: Could not parse database URL from ROCKET_DATABASES."
  echo "  ROCKET_DATABASES=${ROCKET_DATABASES}"
  exit 1
fi

DB_HOST=$(echo "$DB_URL" | grep -oP '@\K[^:/]+')
DB_PORT=$(echo "$DB_URL" | grep -oP '@[^:/]+:\K[0-9]+')
DB_PORT="${DB_PORT:-5432}"

echo "Waiting for database at ${DB_HOST}:${DB_PORT}..."

# ── Wait for DB (max 60 seconds) ─────────────────────────────────────────────
TIMEOUT=60
ELAPSED=0
while ! pg_isready -h "$DB_HOST" -p "$DB_PORT" -q 2>/dev/null; do
  if [ "$ELAPSED" -ge "$TIMEOUT" ]; then
    echo "FATAL: Database at ${DB_HOST}:${DB_PORT} not reachable after ${TIMEOUT}s."
    exit 1
  fi
  sleep 2
  ELAPSED=$((ELAPSED + 2))
done

echo "Database is ready (${ELAPSED}s). Starting Sunshine..."

# ── Start the app ─────────────────────────────────────────────────────────────
exec ./sunshine
