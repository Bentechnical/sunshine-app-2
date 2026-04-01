#!/usr/bin/env bash
# One-time script to create and wire up a Postgres database in Dokploy.
# Run this once per environment (staging / production).
#
# Usage:
#   export DOKPLOY_URL=https://your-dokploy-host
#   export DOKPLOY_API_TOKEN=your-api-token
#   export DOKPLOY_APP_ID=your-application-id
#   ./scripts/dokploy-setup-db.sh

set -euo pipefail

: "${DOKPLOY_URL:?Set DOKPLOY_URL}"
: "${DOKPLOY_API_TOKEN:?Set DOKPLOY_API_TOKEN}"
: "${DOKPLOY_APP_ID:?Set DOKPLOY_APP_ID}"

API="${DOKPLOY_URL}/api"
AUTH=(-H "x-api-key: ${DOKPLOY_API_TOKEN}" -H "Content-Type: application/json")

# ── 1. Get the app so we can extract its environmentId ────────────────────────
echo "Fetching app info..."
APP=$(curl -fsSL "${API}/application.one?applicationId=${DOKPLOY_APP_ID}" "${AUTH[@]}")
ENV_ID=$(echo "$APP" | python3 -c "import sys,json; print(json.load(sys.stdin)['environmentId'])")
echo "  environmentId: ${ENV_ID}"

# ── 2. Generate DB credentials ────────────────────────────────────────────────
DB_NAME="sunshine"
DB_USER="sunshine"
DB_PASS=$(openssl rand -base64 24 | tr -d '/+=')
DB_APP_NAME="sunshine-db-${ENV_ID:0:6}"

echo "Creating Postgres database..."
PG=$(curl -fsSL -X POST "${API}/postgres.create" "${AUTH[@]}" \
  -d "{
    \"name\": \"Sunshine DB\",
    \"appName\": \"${DB_APP_NAME}\",
    \"databaseName\": \"${DB_NAME}\",
    \"databaseUser\": \"${DB_USER}\",
    \"databasePassword\": \"${DB_PASS}\",
    \"dockerImage\": \"postgres:16-alpine\",
    \"environmentId\": \"${ENV_ID}\"
  }")

PG_ID=$(echo "$PG" | python3 -c "import sys,json; print(json.load(sys.stdin)['postgresId'])")
echo "  postgresId: ${PG_ID}"

# ── 3. Deploy (start) the Postgres container ──────────────────────────────────
echo "Deploying Postgres..."
curl -fsSL -X POST "${API}/postgres.deploy" "${AUTH[@]}" \
  -d "{\"postgresId\": \"${PG_ID}\"}" > /dev/null

# ── 4. Wait for Postgres to be running ────────────────────────────────────────
echo "Waiting for Postgres to start..."
for i in $(seq 1 30); do
  STATUS=$(curl -fsSL "${API}/postgres.one?postgresId=${PG_ID}" "${AUTH[@]}" \
    | python3 -c "import sys,json; print(json.load(sys.stdin).get('applicationStatus','unknown'))")
  echo "  [${i}/30] status=${STATUS}"
  if [ "$STATUS" = "running" ] || [ "$STATUS" = "done" ] || [ "$STATUS" = "idle" ]; then
    echo "  Postgres is running."
    break
  fi
  sleep 5
done

# ── 5. Build the ROCKET_DATABASES env var ─────────────────────────────────────
# Within Dokploy's Docker network, the host is the appName of the DB service.
DATABASE_URL="postgres://${DB_USER}:${DB_PASS}@${DB_APP_NAME}:5432/${DB_NAME}"
ROCKET_DB="ROCKET_DATABASES={sunshine_db={url=\"${DATABASE_URL}\"}}"
echo ""
echo "ROCKET_DATABASES: ${ROCKET_DB}"

# ── 6. Set ROCKET_DATABASES on the application ───────────────────────────────
echo ""
echo "Saving ROCKET_DATABASES to app environment..."

# Fetch existing env so we don't overwrite it
EXISTING_ENV=$(curl -fsSL "${API}/application.one?applicationId=${DOKPLOY_APP_ID}" "${AUTH[@]}" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('env','') or '')")

NEW_ENV="${EXISTING_ENV}
${ROCKET_DB}"

curl -fsSL -X POST "${API}/application.saveEnvironment" "${AUTH[@]}" \
  -d "{
    \"applicationId\": \"${DOKPLOY_APP_ID}\",
    \"env\": $(python3 -c "import json,sys; print(json.dumps(sys.stdin.read()))" <<< "$NEW_ENV")
  }" > /dev/null

echo "  Environment saved."

# ── 7. Redeploy the app ───────────────────────────────────────────────────────
echo "Redeploying application..."
curl -fsSL -X POST "${API}/application.redeploy" "${AUTH[@]}" \
  -d "{\"applicationId\": \"${DOKPLOY_APP_ID}\"}" > /dev/null

echo ""
echo "Done. Postgres is live and ROCKET_DATABASES is set."
echo ""
echo "Save these somewhere safe:"
echo "  postgresId:       ${PG_ID}"
echo "  DATABASE_URL:     ${DATABASE_URL}"
echo "  ROCKET_DATABASES: ${ROCKET_DB}"
