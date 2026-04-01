# Sunshine Deployment Guide

This document covers the CI/CD pipeline, deployment architecture, and operational procedures for the Sunshine application.

---

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [CI/CD Pipeline](#cicd-pipeline)
- [Environment Setup](#environment-setup)
- [Deployment Procedures](#deployment-procedures)
- [Scripts Reference](#scripts-reference)
- [Troubleshooting](#troubleshooting)

---

## Architecture Overview

Sunshine uses a containerized deployment architecture with the following components:

```
┌─────────────────┐     ┌──────────────┐     ┌─────────────────┐
│   GitHub Repo   │────▶│  GitHub      │────▶│  GHCR Registry  │
│                 │     │  Actions     │     │                 │
└─────────────────┘     └──────────────┘     └─────────────────┘
                                                      │
                         ┌────────────────────────────┘
                         ▼
                ┌─────────────────┐
                │    Dokploy      │
                │  (Docker Host)  │
                └─────────────────┘
                         │
          ┌──────────────┼──────────────┐
          ▼              ▼              ▼
   ┌────────────┐ ┌────────────┐ ┌────────────┐
   │  Staging   │ │ Production │ │  Postgres  │
   │    App     │ │    App     │ │    DB      │
   └────────────┘ └────────────┘ └────────────┘
```

### Key Technologies

- **Container Registry**: GitHub Container Registry (GHCR)
- **Deployment Platform**: [Dokploy](https://dokploy.com/) (self-hosted PaaS)
- **Database**: PostgreSQL 16 with PostGIS extension
- **Reverse Proxy**: Traefik (managed by Dokploy)

---

## CI/CD Pipeline

The CI/CD pipeline is defined in `.github/workflows/deploy.yml` and consists of the following stages:

```
┌─────────┐   ┌─────────┐   ┌─────────┐   ┌─────────────┐   ┌─────────────┐   ┌────────────┐
│  Lint   │──▶│  Test   │──▶│  Build  │──▶│    Deploy   │──▶│ Smoke Test  │──▶│  Deploy    │
│ (fmt +  │   │ (cargo  │   │ (Docker │   │   Staging   │   │  (health +  │   │Production  │
│ clippy) │   │  test)  │   │ images) │   │             │   │  auth)      │   │(manual)    │
└─────────┘   └─────────┘   └─────────┘   └─────────────┘   └─────────────┘   └────────────┘
```

### Pipeline Stages

| Stage | Description | Runs On |
|-------|-------------|---------|
| **Lint** | `cargo fmt --check` and `cargo clippy` | All PRs and pushes to `main` |
| **Test** | Runs `cargo test` with PostgreSQL service | All PRs and pushes to `main` |
| **Build** | Builds Docker images for staging and production | All PRs and pushes to `main` |
| **Deploy Staging** | Deploys to staging environment automatically | Pushes to `main` only |
| **Smoke Test** | Health checks and basic functionality tests | After staging deploy |
| **Deploy Production** | Deploys to production (manual trigger) | Requires approval |

### Build Features

The CI builds two Docker image variants:

1. **Staging Image**: Includes `dev-routes` feature for debugging
   - Tag: `ghcr.io/<owner>/sunshine:staging-<sha>`
   - Has dev-only endpoints like `/auth/dev-login`

2. **Production Image**: Standard release build
   - Tag: `ghcr.io/<owner>/sunshine:sha-<sha>`
   - Promoted to `latest` tag on production deploy

### Workflow Triggers

| Event | Behavior |
|-------|----------|
| `push` to `main` | Full pipeline through staging deploy |
| `pull_request` to `main` | Lint, test, and build only (no deploy) |
| `workflow_dispatch` | Manual deploy with options (see below) |

### Manual Deployment Options

When triggering via `workflow_dispatch`, you can set:

| Option | Description |
|--------|-------------|
| `deploy_production` | Promote to production after staging passes |
| `hotfix` | Deploy straight to production (skip staging) |
| `skip_migrations` | Skip database migrations on deploy |

---

## Environment Setup

### Required GitHub Secrets

Configure these secrets in your GitHub repository settings:

| Secret | Description | Example |
|--------|-------------|---------|
| `DOKPLOY_URL` | Your Dokploy instance URL | `https://dokploy.example.com` |
| `DOKPLOY_API_TOKEN` | Dokploy API key | `dokploy_api_...` |
| `DOKPLOY_STAGING_APP_ID` | Staging application ID in Dokploy | `abc123...` |
| `DOKPLOY_PROD_APP_ID` | Production application ID in Dokploy | `def456...` |
| `STAGING_URL` | Staging app URL for smoke tests | `https://staging.example.com` |
| `PROD_URL` | Production app URL for health checks | `https://app.example.com` |

### Dokploy Application Configuration

Each environment (staging/production) needs:

1. **Application** created in Dokploy
2. **Postgres database** (auto-created by `ensure-db.sh`)
3. **Environment variables** (see below)

### Environment Variables

The following environment variables must be configured in Dokploy:

```bash
# Database (auto-set by ensure-db.sh)
ROCKET_DATABASES={sunshine_db={url="postgres://..."}}

# Required secrets
ROCKET_SECRET_KEY=          # openssl rand -base64 32
MAGIC_LINK_SECRET=          # openssl rand -hex 32

# Application
APP_URL=https://your-domain.com
APP_NAME=Sunshine

# Email (Brevo SMTP)
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_USERNAME=your-username
SMTP_PASSWORD=your-password
EMAIL_FROM=noreply@yourdomain.org
EMAIL_FROM_NAME="Sunshine Volunteers"

# Session
SESSION_TTL_DAYS=60

# Surveys
POST_SHIFT_TRIGGER_HOURS=2
AGENCY_SURVEY_TRIGGER_HOURS=24
SURVEY_WINDOW_DAYS=7

# Storage (Cloudflare R2)
S3_ENDPOINT=https://<account>.r2.cloudflarestorage.com
S3_BUCKET=sunshine-assets
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
S3_PUBLIC_URL=https://assets.yourdomain.org
```

---

## Deployment Procedures

### Standard Deployment Flow

1. **Merge to `main`** triggers automatic staging deployment
2. **Wait for smoke tests** to pass on staging
3. **Trigger production deploy** via GitHub Actions UI with `deploy_production: true`

### Hotfix Deployment (Emergency)

For critical fixes that need to bypass staging:

1. Go to GitHub Actions → Build, Test & Deploy
2. Click "Run workflow"
3. Select `hotfix: true`
4. This deploys directly to production (skips staging)

### Database Migrations

Migrations run automatically on application startup via `db::MigrationsFairing`. To skip migrations:

1. Set `skip_migrations: true` in workflow dispatch
2. Or manually set `SKIP_MIGRATIONS=true` in Dokploy environment

### First-Time Environment Setup

For brand new environments (staging or production):

1. Create application in Dokploy
2. Set required environment variables (except `ROCKET_DATABASES`)
3. Run CI/CD pipeline once - `ensure-db.sh` will:
   - Create Postgres database
   - Set `ROCKET_DATABASES` automatically
   - Deploy the application

---

## Scripts Reference

### `scripts/entrypoint.sh`

Container entrypoint script. Run automatically on container start:

```bash
# Parses ROCKET_DATABASES environment variable
# Waits for PostgreSQL to be ready (60s timeout)
# Starts the Sunshine application
```

**Usage**: Not called directly - set as `ENTRYPOINT` in Dockerfile.

### `scripts/ensure-db.sh`

Idempotent database provisioning for Dokploy:

```bash
export DOKPLOY_URL=https://your-dokploy-host
export DOKPLOY_API_TOKEN=your-token
export DOKPLOY_APP_ID=your-app-id
export DB_LABEL="Staging"  # or "Production"
./scripts/ensure-db.sh
```

**Features**:
- Skips if `ROCKET_DATABASES` already configured
- Creates Postgres with PostGIS
- Waits for database to be ready
- Sets `ROCKET_DATABASES` environment variable
- Uses `postgis/postgis:16-3.4-alpine` image

### `scripts/dokploy-setup-db.sh`

One-time database setup script (legacy):

```bash
export DOKPLOY_URL=https://your-dokploy-host
export DOKPLOY_API_TOKEN=your-token
export DOKPLOY_APP_ID=your-app-id
./scripts/dokploy-setup-db.sh
```

**Note**: Use `ensure-db.sh` instead - it's idempotent and used by CI/CD.

---

## Troubleshooting

### Deployment Failed

**Check application status in Dokploy**:
```bash
curl -s "${DOKPLOY_URL}/api/application.one?applicationId=${APP_ID}" \
  -H "x-api-key: ${TOKEN}" | python3 -m json.tool
```

**View application logs**:
Access via Dokploy dashboard or:
```bash
curl -s "${DOKPLOY_URL}/api/docker.logs?containerId=${APP_ID}" \
  -H "x-api-key: ${TOKEN}"
```

### Database Connection Issues

1. Verify `ROCKET_DATABASES` is set correctly
2. Check database is running:
   ```bash
   curl -s "${DOKPLOY_URL}/api/postgres.one?postgresId=${DB_ID}" \
     -H "x-api-key: ${TOKEN}"
   ```
3. Test connection from app container:
   ```bash
   # In Dokploy console or docker exec
   pg_isready -h <db-host> -p 5432
   ```

### Smoke Test Failures

Common causes:

| Error | Solution |
|-------|----------|
| Health check fails | Check app logs, verify database connection |
| DB check fails | Verify `ROCKET_DATABASES` and database status |
| Login page 404 | App may still be starting, check logs |

### Rollback Procedure

To rollback to a previous version:

1. Find the previous image tag in GHCR
2. Update Dokploy app to use previous image:
   ```bash
   curl -X POST "${DOKPLOY_URL}/api/application.update" \
     -H "Content-Type: application/json" \
     -H "x-api-key: ${TOKEN}" \
     -d "{\"applicationId\": \"${APP_ID}\", \"dockerImage\": \"ghcr.io/owner/sunshine:sha-OLD\"}"
   ```
3. Redeploy:
   ```bash
   curl -X POST "${DOKPLOY_URL}/api/application.deploy" \
     -H "x-api-key: ${TOKEN}" \
     -d "{\"applicationId\": \"${APP_ID}\"}"
   ```

---

## Local Testing of Deployment

Test the Docker build locally:

```bash
# Build the image
docker build -t sunshine:local .

# Run with local postgres
docker compose up postgres -d

# Run the app
docker run -p 8080:8080 \
  -e ROCKET_DATABASES='{sunshine_db={url="postgres://sunshine:sunshine@host.docker.internal:5437/sunshine"}}' \
  -e ROCKET_SECRET_KEY=$(openssl rand -base64 32) \
  -e MAGIC_LINK_SECRET=$(openssl rand -hex 32) \
  sunshine:local
```

---

## See Also

- [README.md](../README.md) - Development setup and feature overview
- [pwa-roadmap.md](./pwa-roadmap.md) - Mobile/PWA roadmap
