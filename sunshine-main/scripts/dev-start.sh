#!/usr/bin/env bash
# Sunshine Development Startup Script
# Handles port conflicts, credential verification, and automatic failover

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

cd "$PROJECT_ROOT"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default configuration
DEFAULT_PORT=5437
DEFAULT_USER=sunshine
DEFAULT_PASS=sunshine
DEFAULT_DB=sunshine

# Function to print colored output
info() { echo -e "${BLUE}ℹ${NC} $1"; }
success() { echo -e "${GREEN}✔${NC} $1"; }
warn() { echo -e "${YELLOW}⚠${NC} $1"; }
error() { echo -e "${RED}✖${NC} $1"; }

# Find an available port starting from the given port
find_free_port() {
    local start_port=$1
    local port=$start_port
    local max_port=$((start_port + 20))
    
    while [ $port -le $max_port ]; do
        # Check if port is in use using multiple methods
        local in_use=false
        
        # Method 1: Check using /dev/tcp (fastest, built into bash)
        if timeout 1 bash -c "exec 3<>/dev/tcp/localhost/$port" 2>/dev/null; then
            in_use=true
        fi 2>/dev/null
        
        # Method 2: lsof if available
        if [ "$in_use" = false ] && command -v lsof >/dev/null 2>&1; then
            if lsof -i :$port >/dev/null 2>&1; then
                in_use=true
            fi
        fi
        
        # Method 3: netstat/ss if available
        if [ "$in_use" = false ] && (command -v ss >/dev/null 2>&1 || command -v netstat >/dev/null 2>&1); then
            if (ss -tln 2>/dev/null || netstat -tln 2>/dev/null) | grep -q ":$port "; then
                in_use=true
            fi
        fi
        
        if [ "$in_use" = false ]; then
            echo $port
            return 0
        fi
        
        port=$((port + 1))
    done
    
    return 1
}

# Check if postgres is responding with given connection string
test_postgres() {
    local conn_str=$1
    local timeout_sec=${2:-3}
    
    if command -v pg_isready >/dev/null 2>&1; then
        # Extract host and port from connection string
        local host=$(echo "$conn_str" | sed -n 's/.*@\([^:/]*\).*/\1/p')
        local port=$(echo "$conn_str" | sed -n 's/.*:\([0-9]*\)\/.*/\1/p')
        [ -z "$port" ] && port=5432
        [ -z "$host" ] && host=localhost
        
        # Use timeout if available (Linux), otherwise use gtimeout (macOS with coreutils) or just run with -t
        if command -v timeout >/dev/null 2>&1; then
            timeout $timeout_sec pg_isready -h "$host" -p "$port" -t 1 >/dev/null 2>&1
        elif command -v gtimeout >/dev/null 2>&1; then
            gtimeout $timeout_sec pg_isready -h "$host" -p "$port" -t 1 >/dev/null 2>&1
        else
            # Fallback: just try with short timeout flag to pg_isready itself
            pg_isready -h "$host" -p "$port" -t 1 >/dev/null 2>&1
        fi
        return $?
    else
        # Fallback: try psql if available
        if command -v psql >/dev/null 2>&1; then
            PGPASSWORD="$DEFAULT_PASS" psql "$conn_str" -c "SELECT 1" >/dev/null 2>&1
            return $?
        fi
    fi
    return 1
}

# Check if we can connect and have proper permissions
test_postgres_credentials() {
    local conn_str=$1
    
    if command -v psql >/dev/null 2>&1; then
        # Test basic connection and permissions
        local result
        result=$(PGPASSWORD="$DEFAULT_PASS" psql "$conn_str" -tAc "SELECT 1" 2>/dev/null) && [ "$result" = "1" ]
        return $?
    fi
    
    # If we can't test deeply, assume pg_isready passing is good enough for dev
    return 0
}

# Check if required extensions are installed
check_extensions() {
    local conn_str=$1
    
    if command -v psql >/dev/null 2>&1; then
        local missing=()
        
        if ! PGPASSWORD="$DEFAULT_PASS" psql "$conn_str" -tAc "SELECT 1 FROM pg_extension WHERE extname = 'postgis'" 2>/dev/null | grep -q "1"; then
            missing+=("postgis")
        fi
        
        if ! PGPASSWORD="$DEFAULT_PASS" psql "$conn_str" -tAc "SELECT 1 FROM pg_extension WHERE extname = 'ltree'" 2>/dev/null | grep -q "1"; then
            missing+=("ltree")
        fi
        
        if [ ${#missing[@]} -gt 0 ]; then
            warn "Missing PostgreSQL extensions: ${missing[*]}"
            return 1
        fi
    fi
    
    return 0
}

# Start postgres in Docker with given port
start_docker_postgres() {
    local port=$1
    local container_name="sunshine-postgres-${port}"
    
    info "Starting PostgreSQL on port $port..."
    
    # Check if a sunshine postgres container is already running
    local existing_container
    existing_container=$(docker ps -q --filter "name=sunshine-postgres" --filter "status=running" 2>/dev/null || true)
    
    if [ -n "$existing_container" ]; then
        local existing_port
        existing_port=$(docker port "$existing_container" 5432/tcp 2>/dev/null | head -1 | cut -d: -f2 || echo "unknown")
        if [ "$existing_port" = "$port" ]; then
            success "PostgreSQL already running on port $port"
            return 0
        else
            warn "Another sunshine-postgres container is running on port $existing_port"
        fi
    fi
    
    # Stop any existing sunshine postgres containers
    docker ps -aq --filter "name=sunshine-postgres" 2>/dev/null | xargs -r docker stop >/dev/null 2>&1 || true
    docker ps -aq --filter "name=sunshine-postgres" 2>/dev/null | xargs -r docker rm >/dev/null 2>&1 || true
    
    # Start new container
    if ! docker run -d \
        --name "$container_name" \
        -e POSTGRES_USER="$DEFAULT_USER" \
        -e POSTGRES_PASSWORD="$DEFAULT_PASS" \
        -e POSTGRES_DB="$DEFAULT_DB" \
        -p "${port}:5432" \
        -v "sunshine_postgres_${port}:/var/lib/postgresql/data" \
        --health-cmd="pg_isready -U $DEFAULT_USER" \
        --health-interval=5s \
        --health-timeout=5s \
        --health-retries=5 \
        postgis/postgis:16-3.4-alpine >/dev/null 2>&1; then
        error "Failed to start PostgreSQL container"
        return 1
    fi
    
    # Wait for postgres to be ready
    info "Waiting for PostgreSQL to be ready..."
    local attempts=0
    local max_attempts=30
    
    while [ $attempts -lt $max_attempts ]; do
        if docker exec "$container_name" pg_isready -U "$DEFAULT_USER" -t 1 >/dev/null 2>&1; then
            success "PostgreSQL is ready on port $port"
            return 0
        fi
        ((attempts++))
        sleep 1
    done
    
    error "PostgreSQL failed to start within ${max_attempts} seconds"
    docker logs "$container_name" 2>&1 | tail -20 || true
    return 1
}

# Setup database (create + migrate)
setup_database() {
    local conn_str=$1
    
    info "Setting up database..."
    
    # Check if sqlx-cli is installed
    if ! command -v sqlx >/dev/null 2>&1; then
        warn "sqlx-cli not found. Installing..."
        cargo install sqlx-cli --no-default-features --features native-tls,postgres
    fi
    
    # Create database if it doesn't exist
    if ! sqlx database create --database-url "$conn_str" 2>/dev/null; then
        info "Database already exists or creation failed (this is usually OK)"
    fi
    
    # Run migrations
    if sqlx migrate run --database-url "$conn_str"; then
        success "Database migrations complete"
    else
        error "Database migrations failed"
        return 1
    fi
    
    return 0
}

# Seed the database
seed_database() {
    local conn_str=$1
    local seed_arg=${2:---all}

    info "Seeding database with: $seed_arg"

    # Set DATABASE_URL so the seed binary can use it
    export DATABASE_URL="$conn_str"

    # Pipe through awk to collapse per-address geocoding cache-hit lines into
    # a single summary (e.g. "📍 64 addresses from geocoding cache").
    cargo run --bin seed -- "$seed_arg" 2>&1 | awk '
        /cache hit:/ { hits++; next }
        { print }
        END { if (hits > 0) printf "      \033[0;34m📍\033[0m %d address%s from geocoding cache\n", hits, (hits==1?"":"es") }
    '
    local seed_status=${PIPESTATUS[0]}

    if [ "$seed_status" -eq 0 ]; then
        success "Database seeded successfully"
    else
        warn "Database seeding had issues (may already be seeded)"
    fi
}

# Generate secrets for .env
generate_secrets() {
    local env_file=$1
    
    if [ ! -f "$env_file" ]; then
        info "Creating $env_file from template..."
        cp .env.example "$env_file"
    fi
    
    local updated=0
    
    # Check and generate ROCKET_SECRET_KEY
    if ! grep -q "^ROCKET_SECRET_KEY=" "$env_file" || \
       grep -q "^ROCKET_SECRET_KEY=$" "$env_file" || \
       grep -q "^ROCKET_SECRET_KEY=#" "$env_file" 2>/dev/null; then
        local secret_key
        secret_key=$(openssl rand -base64 32 2>/dev/null || echo "")
        if [ -n "$secret_key" ]; then
            # Remove empty or commented ROCKET_SECRET_KEY lines
            sed -i.bak '/^ROCKET_SECRET_KEY=/d' "$env_file" 2>/dev/null || true
            echo "ROCKET_SECRET_KEY=$secret_key" >> "$env_file"
            success "Generated ROCKET_SECRET_KEY"
            updated=1
        fi
    fi
    
    # Check and generate MAGIC_LINK_SECRET
    if ! grep -q "^MAGIC_LINK_SECRET=" "$env_file" || \
       grep -q "^MAGIC_LINK_SECRET=$" "$env_file" || \
       grep -q "^MAGIC_LINK_SECRET=#" "$env_file" 2>/dev/null; then
        local magic_secret
        magic_secret=$(openssl rand -hex 32 2>/dev/null || echo "")
        if [ -n "$magic_secret" ]; then
            # Remove empty or commented MAGIC_LINK_SECRET lines
            sed -i.bak '/^MAGIC_LINK_SECRET=/d' "$env_file" 2>/dev/null || true
            echo "MAGIC_LINK_SECRET=$magic_secret" >> "$env_file"
            success "Generated MAGIC_LINK_SECRET"
            updated=1
        fi
    fi
    
    if [ $updated -eq 1 ]; then
        info "Please review $env_file and configure any other required settings"
    fi
}

# Update DATABASE_URL in .env (used by sqlx-cli and seed binary)
# ROCKET_DATABASES is set at runtime by start_server, not stored in .env
update_database_url() {
    local env_file=$1
    local port=$2
    local conn_str="postgres://${DEFAULT_USER}:${DEFAULT_PASS}@localhost:${port}/${DEFAULT_DB}"

    # Remove existing DATABASE_URL and any stale ROCKET_DATABASES lines
    sed -i.bak '/^DATABASE_URL=/d;/^ROCKET_DATABASES=/d' "$env_file" 2>/dev/null || true

    # Add new DATABASE_URL at the top
    local temp_file="${env_file}.tmp"
    echo "DATABASE_URL=${conn_str}" > "$temp_file"
    cat "$env_file" >> "$temp_file"
    mv "$temp_file" "$env_file"

    success "Updated DATABASE_URL in $env_file (port $port)"
}

# Print launch banner and start the server
start_server() {
    local db_port=$1
    local has_email=${2:-false}

    echo ""
    echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
    success "Database ready — starting server..."
    echo ""
    echo -e "${BLUE}Database:${NC}    postgres://${DEFAULT_USER}:****@localhost:${db_port}/${DEFAULT_DB}"

    if [ "$has_email" = false ]; then
        warn "Email not configured - use dev-login URLs for authentication"
    fi

    echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
    echo ""

    local conn_str="postgres://${DEFAULT_USER}:${DEFAULT_PASS}@localhost:${db_port}/${DEFAULT_DB}"
    export ROCKET_DATABASES="{sunshine_db={url=\"${conn_str}\"}}"

    # Suppress per-address geocoding cache-hit noise; keep all other debug output.
    export RUST_LOG="${RUST_LOG:-debug,sunshine::geocoding=info}"

    exec cargo run --bin sunshine
}

# Main function
main() {
    local seed_arg="${1:---all}"
    local env_file=".env"
    
    echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}           Sunshine Development Environment Setup${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
    echo ""
    
    # Check prerequisites
    if ! command -v docker >/dev/null 2>&1; then
        error "Docker is required but not installed"
        exit 1
    fi
    
    if ! command -v cargo >/dev/null 2>&1; then
        error "Rust/Cargo is required but not installed"
        exit 1
    fi
    
    # Generate/update secrets
    generate_secrets "$env_file"
    
    # Determine port and connection strategy
    local port=$DEFAULT_PORT
    local conn_str="postgres://${DEFAULT_USER}:${DEFAULT_PASS}@localhost:${port}/${DEFAULT_DB}"
    local use_existing=false

    # Check if .env already has a DATABASE_URL pointing to a working postgres
    if [ -f "$env_file" ]; then
        local env_db_url
        env_db_url=$(grep "^DATABASE_URL=" "$env_file" | head -1 | cut -d= -f2-)
        if [ -n "$env_db_url" ]; then
            local env_port
            env_port=$(echo "$env_db_url" | sed -n 's/.*:\([0-9]*\)\/.*/\1/p')
            if [ -n "$env_port" ] && [ "$env_port" != "$DEFAULT_PORT" ]; then
                info "Found DATABASE_URL in .env pointing to port $env_port, checking..."
                if test_postgres "$env_db_url" 2 && test_postgres_credentials "$env_db_url" && check_extensions "$env_db_url"; then
                    success "Existing PostgreSQL on port $env_port (from .env) is working!"
                    port=$env_port
                    conn_str=$env_db_url
                    use_existing=true
                else
                    info "PostgreSQL on port $env_port from .env is not usable, continuing search..."
                fi
            fi
        fi
    fi

    # Check if postgres is already running on default port
    if [ "$use_existing" = false ]; then
        info "Checking for existing PostgreSQL on port $port..."
        if test_postgres "$conn_str" 2; then
            info "PostgreSQL detected on port $port"

            if test_postgres_credentials "$conn_str"; then
                success "Existing PostgreSQL credentials work!"

                if check_extensions "$conn_str"; then
                    use_existing=true
                else
                    warn "Existing PostgreSQL missing required extensions"
                    warn "Will start a new container on a different port"
                fi
            else
                warn "Existing PostgreSQL on port $port has different credentials"
                warn "Will start a new container on a different port"
            fi
        else
            info "No PostgreSQL detected on port $port"
        fi
    fi
    
    # Find available port if needed
    if [ "$use_existing" = false ]; then
        info "Looking for available port starting from $DEFAULT_PORT..."
        port=$(find_free_port $DEFAULT_PORT)
        local find_result=$?
        if [ $find_result -ne 0 ]; then
            error "Could not find an available port between $DEFAULT_PORT and $((DEFAULT_PORT + 20))"
            exit 1
        fi
        
        if [ "$port" -ne "$DEFAULT_PORT" ]; then
            warn "Port $DEFAULT_PORT is occupied, using port $port instead"
        else
            info "Port $port is available"
        fi
        
        # Update connection string with new port
        conn_str="postgres://${DEFAULT_USER}:${DEFAULT_PASS}@localhost:${port}/${DEFAULT_DB}"
        
        # Start postgres in Docker
        if ! start_docker_postgres "$port"; then
            exit 1
        fi
        
        # Update .env with the correct port
        update_database_url "$env_file" "$port"
    else
        # Update .env to use existing postgres
        update_database_url "$env_file" "$port"
    fi
    
    # Export DATABASE_URL for subsequent commands
    export DATABASE_URL="$conn_str"
    
    # Setup database (create + migrate)
    if ! setup_database "$conn_str"; then
        error "Database setup failed"
        exit 1
    fi
    
    # Seed database
    seed_database "$conn_str" "$seed_arg"
    
    # Check if email is configured
    local has_email=false
    if grep -q "^SMTP_PASSWORD=" "$env_file" 2>/dev/null && \
       ! grep -q "^SMTP_PASSWORD=$" "$env_file" 2>/dev/null; then
        has_email=true
    fi
    
    # Start the server (exec replaces the shell process)
    if [ "${SUNSHINE_DB_SETUP_ONLY:-}" != "1" ]; then
        start_server "$port" "$has_email"
    else
        echo ""
        echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
        success "Database ready. Run the server with:"
        echo "  cargo run --bin sunshine"
        echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
    fi
}

# Handle script arguments
case "${1:-}" in
    --help|-h)
        echo "Sunshine Development Startup Script"
        echo ""
        echo "Usage: $0 [options]"
        echo ""
        echo "Options:"
        echo "  --help, -h          Show this help message"
        echo "  --skip-seed         Don't seed the database"
        echo "  --seed-only <type>  Only run specific seed (taxonomy, regions, mock)"
        echo "  --no-server         Set up DB only, don't start the server"
        echo "  --stop              Stop the development database"
        echo "  --status            Check if database is running"
        echo ""
        echo "Examples:"
        echo "  $0                  # Full setup + start server"
        echo "  $0 --skip-seed      # Setup without seeding, then start server"
        echo "  $0 --seed-only mock # Only seed mock data, then start server"
        echo "  $0 --no-server      # Set up DB only (SUNSHINE_DB_SETUP_ONLY=1)"
        echo "  $0 --stop           # Stop the database"
        exit 0
        ;;
    --skip-seed)
        main ""
        ;;
    --seed-only)
        main "--${2:-all}"
        ;;
    --no-server)
        SUNSHINE_DB_SETUP_ONLY=1 main ""
        ;;
    --stop)
        info "Stopping development database..."
        docker ps -q --filter "name=sunshine-postgres" | xargs -r docker stop >/dev/null 2>&1 || true
        success "Database stopped"
        exit 0
        ;;
    --status)
        if docker ps --filter "name=sunshine-postgres" --filter "status=running" | grep -q sunshine-postgres; then
            local running_port
            running_port=$(docker port "$(docker ps -q --filter "name=sunshine-postgres")" 5432/tcp 2>/dev/null | head -1 | cut -d: -f2 || echo "unknown")
            success "PostgreSQL is running on port $running_port"
            docker ps --filter "name=sunshine-postgres" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
        else
            warn "No sunshine-postgres container is running"
        fi
        exit 0
        ;;
    *)
        main "$@"
        ;;
esac
