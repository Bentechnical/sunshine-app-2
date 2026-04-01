#!/usr/bin/env bash
# Ensure a Postgres database exists for a Dokploy application.
# Idempotent — skips creation if ROCKET_DATABASES is already configured.
#
# Required env vars:
#   DOKPLOY_URL          — Dokploy instance URL
#   DOKPLOY_API_TOKEN    — Dokploy API key
#   DOKPLOY_APP_ID       — Target application ID
#   DB_LABEL             — Human-readable label (e.g. "Staging", "Production")
set -euo pipefail

: "${DOKPLOY_URL:?Set DOKPLOY_URL}"
: "${DOKPLOY_API_TOKEN:?Set DOKPLOY_API_TOKEN}"
: "${DOKPLOY_APP_ID:?Set DOKPLOY_APP_ID}"
DB_LABEL="${DB_LABEL:-Default}"

API="${DOKPLOY_URL}/api"
AUTH=(-H "x-api-key: ${DOKPLOY_API_TOKEN}" -H "Content-Type: application/json")

# ── Fetch app info (single call) ─────────────────────────────────────────────
APP_JSON=$(curl -fsSL "${API}/application.one?applicationId=${DOKPLOY_APP_ID}" "${AUTH[@]}")
EXISTING_ENV=$(echo "$APP_JSON" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('env','') or '')")
APP_INFO=$(echo "$APP_JSON" | python3 -c "
import sys,json
d=json.load(sys.stdin)
print(d.get('projectId',''))
print(d.get('environmentId',''))
")
PROJECT_ID=$(echo "$APP_INFO" | head -1)
ENV_ID=$(echo "$APP_INFO" | tail -1)

echo "App info: projectId=${PROJECT_ID}, environmentId=${ENV_ID}"

if echo "$EXISTING_ENV" | grep -q "ROCKET_DATABASES"; then
  echo "ROCKET_DATABASES already configured — skipping DB setup."
  exit 0
fi

echo "No ROCKET_DATABASES found — creating Postgres database..."

# ── Create Postgres ───────────────────────────────────────────────────────────
DB_PASS=$(openssl rand -base64 24 | tr -d '/+=')

PG_CREATE_PAYLOAD=$(python3 -c "
import json, sys
payload = {
    'name': 'Sunshine ' + sys.argv[1] + ' DB',
    'databaseName': 'sunshine',
    'databaseUser': 'sunshine',
    'databasePassword': sys.argv[2],
    'dockerImage': 'postgis/postgis:16-3.4-alpine',
    'environmentId': sys.argv[3],
}
print(json.dumps(payload))
" "$DB_LABEL" "$DB_PASS" "$ENV_ID")
echo "Creating Postgres: $PG_CREATE_PAYLOAD"

PG=$(curl -sS -X POST "${API}/postgres.create" "${AUTH[@]}" \
  -d "$PG_CREATE_PAYLOAD")
echo "postgres.create response: $PG"

PG_ID=$(echo "$PG" | python3 -c "import sys,json; print(json.load(sys.stdin)['postgresId'])")

curl -fsSL -X POST "${API}/postgres.deploy" "${AUTH[@]}" \
  -d "{\"postgresId\": \"${PG_ID}\"}" > /dev/null

# ── Wait for Postgres ─────────────────────────────────────────────────────────
echo "Waiting for Postgres to start..."
for i in $(seq 1 30); do
  PG_INFO=$(curl -fsSL "${API}/postgres.one?postgresId=${PG_ID}" "${AUTH[@]}")
  STATUS=$(echo "$PG_INFO" | python3 -c "import sys,json; print(json.load(sys.stdin).get('applicationStatus','unknown'))")
  echo "  [${i}/30] status=${STATUS}"
  if [ "$STATUS" = "running" ] || [ "$STATUS" = "done" ] || [ "$STATUS" = "idle" ]; then break; fi
  if [ "$STATUS" = "error" ]; then echo "Postgres deployment failed."; exit 1; fi
  sleep 5
done

# ── Read the actual internal hostname from Dokploy ────────────────────────────
DB_APP_NAME=$(echo "$PG_INFO" | python3 -c "import sys,json; print(json.load(sys.stdin)['appName'])")
echo "Postgres internal hostname: ${DB_APP_NAME}"

# ── Save ROCKET_DATABASES to the app ──────────────────────────────────────────
DB_URL="postgres://sunshine:${DB_PASS}@${DB_APP_NAME}:5432/sunshine"

ROCKET_DB_LINE="ROCKET_DATABASES={sunshine_db={url=\"${DB_URL}\"}}"
if [ -n "$EXISTING_ENV" ]; then
  NEW_ENV="${EXISTING_ENV}
${ROCKET_DB_LINE}"
else
  NEW_ENV="$ROCKET_DB_LINE"
fi

# Build payload with Python to avoid shell quoting issues
PAYLOAD=$(python3 -c "
import json, sys
print(json.dumps({
    'applicationId': sys.argv[1],
    'env': sys.argv[2]
}))
" "$DOKPLOY_APP_ID" "$NEW_ENV")

echo "Saving environment via application.saveEnvironment..."
echo "Payload: $PAYLOAD"
SAVE_RESP=$(curl -sS -w "\n%{http_code}" -X POST "${API}/application.saveEnvironment" "${AUTH[@]}" \
  -d "$PAYLOAD")
SAVE_HTTP=$(echo "$SAVE_RESP" | tail -1)
SAVE_BODY=$(echo "$SAVE_RESP" | sed '$d')
echo "Response (HTTP ${SAVE_HTTP}): ${SAVE_BODY}"

if [ "$SAVE_HTTP" != "200" ] && [ "$SAVE_HTTP" != "201" ] && [ "$SAVE_HTTP" != "204" ]; then
  echo "saveEnvironment failed (HTTP ${SAVE_HTTP}). Trying application.update instead..."
  # Fallback: set env via application.update
  PAYLOAD2=$(python3 -c "
import json, sys
print(json.dumps({
    'applicationId': sys.argv[1],
    'env': sys.argv[2]
}))
" "$DOKPLOY_APP_ID" "$NEW_ENV")
  UPDATE_RESP=$(curl -sS -w "\n%{http_code}" -X POST "${API}/application.update" "${AUTH[@]}" \
    -d "$PAYLOAD2")
  UPDATE_HTTP=$(echo "$UPDATE_RESP" | tail -1)
  UPDATE_BODY=$(echo "$UPDATE_RESP" | sed '$d')
  echo "application.update response (HTTP ${UPDATE_HTTP}): ${UPDATE_BODY}"
  if [ "$UPDATE_HTTP" != "200" ] && [ "$UPDATE_HTTP" != "201" ] && [ "$UPDATE_HTTP" != "204" ]; then
    echo "WARNING: Could not set ROCKET_DATABASES via API. You may need to set it manually."
  fi
fi

echo "Database created and ROCKET_DATABASES configured."
