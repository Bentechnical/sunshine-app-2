# syntax=docker/dockerfile:1

# ─── Stage 1: Chef planner ───────────────────────────────────────────────────
FROM rust:1.91-bookworm AS chef
RUN cargo install cargo-chef
WORKDIR /app

# ─── Stage 2: Prepare dependency recipe ──────────────────────────────────────
FROM chef AS planner
COPY Cargo.toml Cargo.lock ./
COPY src/ ./src/
RUN cargo chef prepare --recipe-path recipe.json

# ─── Stage 3: Build dependencies (cached unless Cargo.toml/Cargo.lock change)
FROM chef AS builder

# Build arg: extra cargo features (e.g. "dev-routes" for staging)
ARG CARGO_FEATURES=""

# System deps for sqlx (libpq) and TLS
RUN apt-get update && apt-get install -y \
    pkg-config \
    libssl-dev \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Cook dependencies — this layer is cached as long as recipe.json is unchanged
COPY --from=planner /app/recipe.json recipe.json
ENV SQLX_OFFLINE=true
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/app/target \
    cargo chef cook --release --recipe-path recipe.json

# Copy full source and build — only your code recompiles here
COPY . .
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/app/target \
    cargo build --release --bin sunshine --bin manage --bin seed \
    $([ -n "$CARGO_FEATURES" ] && echo "--features $CARGO_FEATURES") \
    && cp /app/target/release/sunshine /app/sunshine \
    && cp /app/target/release/manage /app/manage \
    && cp /app/target/release/seed /app/seed

# ─── Stage 4: Runtime ────────────────────────────────────────────────────────
FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y \
    ca-certificates \
    curl \
    libpq5 \
    libssl3 \
    postgresql-client \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy the compiled binaries
COPY --from=builder /app/sunshine ./sunshine
COPY --from=builder /app/manage ./manage
COPY --from=builder /app/seed ./seed

# Copy runtime assets
COPY templates/ ./templates/
COPY migrations/ ./migrations/
COPY seed/ ./seed/
COPY scripts/entrypoint.sh ./entrypoint.sh

# Placeholder for uploads volume mount
RUN mkdir -p uploads && touch uploads/.keep

EXPOSE 8080

ENV ROCKET_ENV=release

HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:8080/health || exit 1

ENTRYPOINT ["./entrypoint.sh"]
