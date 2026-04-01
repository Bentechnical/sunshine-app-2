# Sunshine ☀️

**Volunteer Shift Management Platform for Therapy Dog Programs**

Sunshine is a modern, high-performance volunteer management system built with **Rust**, **Rocket**, **SQLx (PostgreSQL)**, and **HTMX**. It streamlines the coordination between therapy dog volunteers and client agencies (hospitals, schools, care homes).

---

## 🚀 Getting Started

### Prerequisites

- **Rust** (latest stable) - [Install via rustup](https://rustup.rs/)
- **Docker & Docker Compose** (for local Postgres) OR **PostgreSQL 16+** with PostGIS extension
- **OpenSSL** (usually pre-installed on macOS/Linux)
- **sqlx-cli** for database migrations

### Quick Start (Recommended)

Use the automated setup script which handles port conflicts, credential checks, and auto-configuration:

```bash
# 1. Clone the repository
git clone <repo-url>
cd sunshine

# 2. Run the development setup script
./scripts/dev-start.sh

# 3. Start the development server
cargo run --bin sunshine
```

The server will be available at **http://localhost:8000**

**What the script does:**
- Checks if PostgreSQL is already running on port 5437
- If occupied, finds and uses an available port automatically
- Generates `ROCKET_SECRET_KEY` and `MAGIC_LINK_SECRET` in `.env`
- Creates the database and runs migrations
- Seeds with mock data

**Script options:**
```bash
./scripts/dev-start.sh --help      # Show all options
./scripts/dev-start.sh --skip-seed # Skip database seeding
./scripts/dev-start.sh --stop      # Stop the database
./scripts/dev-start.sh --status    # Check database status
```

### Manual Setup (If you prefer full control)

If you prefer to set things up manually or the script doesn't work for your environment:

```bash
# 1. Install sqlx-cli
cargo install sqlx-cli --no-default-features --features native-tls,postgres

# 2. Start PostgreSQL in Docker (or use local Postgres)
docker compose up postgres -d

# 3. Set up environment
cp .env.example .env
# Generate secrets:
#   ROCKET_SECRET_KEY=$(openssl rand -base64 32)
#   MAGIC_LINK_SECRET=$(openssl rand -hex 32)

# 4. Create database and run migrations
export DATABASE_URL=postgres://sunshine:sunshine@localhost:5437/sunshine
sqlx database create
sqlx migrate run

# 5. Seed the database
cargo run --bin seed -- --all

# 6. Start the development server
cargo run --bin sunshine
```

---

## 🛠️ Local Development Guide

### Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
# Required: Generate these secrets
ROCKET_SECRET_KEY=$(openssl rand -base64 32)
MAGIC_LINK_SECRET=$(openssl rand -hex 32)

# Required: App configuration
APP_URL=http://localhost:8000

# Database (matches docker-compose.yml defaults)
DATABASE_URL=postgres://sunshine:sunshine@localhost:5437/sunshine

# Optional: Email (for testing magic links)
# If not configured, use the dev-login bypass (see below)
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_USERNAME=your-username
SMTP_PASSWORD=your-password
EMAIL_FROM=noreply@localhost
```

### Database Options

The `dev-start.sh` script automatically handles database setup with port failover. If you prefer manual control:

#### Option A: Docker Compose (Recommended)
Uses the provided `docker-compose.yml` (port 5437 to avoid conflicts):

```bash
# Start PostgreSQL with PostGIS
docker compose up postgres -d

# View logs
docker compose logs -f postgres

# Stop database
docker compose down

# Reset database (destructive!)
docker compose down -v && docker compose up postgres -d
```

**Connection details:**
- Host: `localhost:5437` (mapped to avoid conflicts with local Postgres)
- User: `sunshine`
- Password: `sunshine`
- Database: `sunshine`

If port 5437 is occupied, the script will automatically find an available port (5438, 5439, etc.).

#### Option B: Local PostgreSQL
If you prefer running Postgres directly:

```bash
# macOS with Homebrew
brew install postgresql postgis
brew services start postgresql

# Create database
createdb sunshine
psql sunshine -c "CREATE EXTENSION IF NOT EXISTS postgis;"
psql sunshine -c "CREATE EXTENSION IF NOT EXISTS ltree;"

# Update .env
echo "DATABASE_URL=postgres://$(whoami)@localhost/sunshine" >> .env
```

### Development Workflow

#### Daily Development Commands

```bash
# Start database (if not running)
docker compose up postgres -d

# Run the app (auto-reloads on file changes with cargo-watch)
cargo watch -x "run --bin sunshine"

# Or run without watch
cargo run --bin sunshine

# Run with dev-routes feature (includes extra debugging endpoints)
cargo run --bin sunshine --features dev-routes
```

#### Database Migrations

```bash
# Create a new migration
sqlx migrate add <description>

# Run pending migrations
sqlx migrate run

# Revert last migration
sqlx migrate revert

# Check migration status
sqlx migrate info
```

#### Seeding & Data Management

```bash
# Full seed (taxonomy + regions + mock data)
cargo run --bin seed -- --all

# Individual seed commands
cargo run --bin seed -- --taxonomy    # Agency types, dog breeds
cargo run --bin seed -- --regions     # Toronto neighbourhoods from Open Data
cargo run --bin seed -- --mock        # 5 admins, 45 volunteers, 15 agencies, 15 shifts

# Management utilities
cargo run --bin manage -- --help      # User management, password resets, etc.
```

### 🔑 Development Auth Bypass

Since email may not be configured locally, use the dev login endpoint:

```
http://localhost:8000/auth/dev-login?email=[target-email]
```

**Mock accounts available after seeding:**

| Role | Email | Access |
|------|-------|--------|
| Super Admin | `superadmin@sunshine.dev` | Full system access |
| Admin | `admin-1@sunshine.dev` | Admin dashboard |
| Volunteer | `v01@sunshine.dev` | Volunteer portal (v01-v45) |
| Agency Contact | `k.whitfield@sunnybrook.dev` | Agency portal |

### Troubleshooting Local Development

| Issue | Solution |
|-------|----------|
| Port 5437 already in use | Run `./scripts/dev-start.sh` - it auto-detects and uses a free port |
| `connection refused` on port 5437 | Check: `./scripts/dev-start.sh --status` or `docker compose ps` |
| `database "sunshine" does not exist` | Run: `sqlx database create && sqlx migrate run` |
| Port 8000 already in use | The app auto-scans for an available port (8001, 8002, etc.) |
| SQLX compile errors | Ensure `DATABASE_URL` is exported: `export DATABASE_URL=...` |
| Template not found errors | Verify you're running from project root |
| Static assets 404 | Check that `static/` directory exists |

### Full Environment Reset

To start completely fresh (⚠️ destroys all local data):

**Quick way (using the script):**
```bash
./scripts/dev-start.sh --stop  # Stop existing containers
docker compose down -v         # Remove volumes
./scripts/dev-start.sh         # Fresh start
```

**Manual way:**
```bash
# Stop and remove containers/volumes
docker compose down -v

# Remove compiled artifacts
cargo clean

# Restart fresh
docker compose up postgres -d
export DATABASE_URL=postgres://sunshine:sunshine@localhost:5437/sunshine
sqlx database create
sqlx migrate run
cargo run --bin seed -- --all
cargo run --bin sunshine
```

---

## 🧪 Testing & Code Quality

### Run Tests
```bash
# Run all tests
cargo test

# Run tests with all features enabled
cargo test --all-features
```

### Linting and Formatting
```bash
# Check code formatting
cargo fmt -- --check

# Format code
cargo fmt

# Run Clippy lints
cargo clippy --all-targets --all-features -- -D warnings
```

### Pre-commit Checklist
Before committing, ensure:
```bash
cargo fmt -- --check && cargo clippy --all-targets --all-features -- -D warnings && cargo test
```

---

## 🚀 Deployment

See [docs/deployment.md](docs/deployment.md) for complete deployment documentation, including:

- CI/CD pipeline architecture
- Environment setup
- Deployment procedures
- Troubleshooting guides

### Quick Deploy Summary

The project uses GitHub Actions for CI/CD with automatic deployments to **Dokploy**:

| Branch | Deployment |
|--------|------------|
| `main` | Auto-deploys to Staging |
| Manual | Production deploy requires approval |

---

## ✨ Features Integrated

### 🔐 Authentication & Identity
- **Passwordless Login**: Magic links via email (JWT-backed).
- **Passkeys (WebAuthn)**: Biometric and hardware key support for secure, passwordless entry.
- **Role-Based Access Control**: Admins, Agency Contacts, and Volunteers.
- **Admin Impersonation**: Admins can "View As" any user to troubleshoot or verify configurations.

### 🏢 Agency & Site Management
- **Multi-Site Support**: Agencies can manage multiple physical locations.
- **Contact Management**: Associate multiple contacts with an agency.
- **Agency Portal**: Dedicated dashboard for agencies to view upcoming visits and request new ones.
- **Taxonomy**: Hierarchical agency types (e.g., Healthcare > Hospital).

### 🐕 Volunteer & Dog Profiles
- **Dog Management**: Volunteers can manage multiple dogs, tracking breeds, sizes, and personalities.
- **Compliance Tracking**: Integrated support for Police Checks and Vulnerable Sector Checks.
- **Geographic Routing**: Volunteers are assigned to home "Zones" for better local matching.

### 📅 Shift Coordination
- **Recurring Shifts**: Support for weekly, bi-weekly, and monthly recurrence patterns.
- **Waitlist System**: Automated waitlisting when slots are full.
- **Promotion Workflow**: Admins can promote volunteers from waitlist to confirmed spots.
- **Change Detection**: Highlights updated shift details since the volunteer's last view.

### 🔔 Notifications & Automation
- **In-App Notifications**: Real-time alerts for shift updates and waitlist promotions.
- **Background Jobs**: Automated post-shift survey triggers for volunteers and agencies.

---

## 🗺️ Roadmap

- [ ] **Volunteer Mobile App**: Native/PWA experience for on-the-go shift signups.
- [ ] **Advanced Analytics**: Interactive charts for volunteer hours, impact metrics, and regional coverage.
- [ ] **Asset Management**: S3-integrated gallery for therapy dog photos and agency logos.
- [ ] **External Calendar Sync**: iCal/ICS feeds for volunteers to sync shifts to their personal calendars.
- [ ] **Broadcast Alerts**: SMS/Email broadcasts for urgent last-minute shift needs.
- [ ] **Regional Expansion**: Scripted ingestion for more GTA/Ontario municipal boundaries.

---

## 🛠️ Tech Stack
- **Backend**: Rust (Rocket 0.5)
- **Database**: PostgreSQL + PostGIS + ltree
- **Frontend**: Tera Templates + HTMX + Alpine.js + Tailwind CSS
- **Migrations**: SQLx
- **Async**: Tokio
