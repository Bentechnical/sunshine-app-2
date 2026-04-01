//! Migrate local asset files to S3 / Cloudflare R2.
//!
//! Usage:
//!   cargo run --bin migrate_to_s3 -- [--dry-run] [--batch-size <N>]
//!
//! The binary reads all assets with storage_backend = 'local', uploads the
//! original + thumbnail to S3 using the same storage keys, then updates the
//! row to storage_backend = 's3'.

use anyhow::{Context, Result};
use aws_credential_types::Credentials;
use aws_sdk_s3::{
    config::{Builder as S3Builder, Region},
    primitives::ByteStream,
    Client,
};
use sqlx::postgres::PgPoolOptions;
use sqlx::Row;
use std::path::{Path, PathBuf};
use uuid::Uuid;

// ─── CLI args ─────────────────────────────────────────────────────────────────

struct Args {
    dry_run: bool,
    batch_size: usize,
}

fn parse_args() -> Args {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let dry_run = args.iter().any(|a| a == "--dry-run");
    let batch_size = args
        .windows(2)
        .find(|w| w[0] == "--batch-size")
        .and_then(|w| w[1].parse().ok())
        .unwrap_or(50usize);
    Args { dry_run, batch_size }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

#[tokio::main]
async fn main() -> Result<()> {
    dotenvy::dotenv().ok();
    tracing_subscriber::fmt()
        .with_env_filter("migrate_to_s3=info,warn")
        .init();

    let args = parse_args();

    if args.dry_run {
        tracing::info!("DRY RUN — no files will be uploaded or DB rows updated");
    }

    // ── Config ────────────────────────────────────────────────────────────────
    let database_url = std::env::var("DATABASE_URL").context("DATABASE_URL not set")?;
    let upload_dir = std::env::var("UPLOAD_DIR").unwrap_or_else(|_| "./uploads".into());
    let s3_endpoint = std::env::var("S3_ENDPOINT").context("S3_ENDPOINT not set")?;
    let s3_bucket = std::env::var("S3_BUCKET").context("S3_BUCKET not set")?;
    let s3_access_key = std::env::var("S3_ACCESS_KEY_ID").context("S3_ACCESS_KEY_ID not set")?;
    let s3_secret_key =
        std::env::var("S3_SECRET_ACCESS_KEY").context("S3_SECRET_ACCESS_KEY not set")?;

    // ── DB pool ───────────────────────────────────────────────────────────────
    let pool = PgPoolOptions::new()
        .max_connections(4)
        .connect(&database_url)
        .await
        .context("Connect to database")?;

    // ── S3 client ─────────────────────────────────────────────────────────────
    let credentials = Credentials::new(
        &s3_access_key,
        &s3_secret_key,
        None,
        None,
        "migrate_to_s3",
    );
    let config = S3Builder::new()
        .region(Region::new("auto"))
        .endpoint_url(&s3_endpoint)
        .credentials_provider(credentials)
        .force_path_style(true)
        .build();
    let client = Client::from_conf(config);

    // ── Fetch local assets ────────────────────────────────────────────────────
    let rows = sqlx::query(
        "SELECT id, storage_key, thumb_key FROM assets WHERE storage_backend = 'local'",
    )
    .fetch_all(&pool)
    .await
    .context("Fetch local assets")?;

    let total = rows.len();
    tracing::info!(total, "Found local assets to migrate");

    let mut uploaded_files: usize = 0;
    let mut uploaded_bytes: u64 = 0;
    let mut errors: usize = 0;
    let mut migrated_rows: usize = 0;

    for (i, row) in rows.iter().enumerate() {
        let id: Uuid = row.try_get("id").unwrap();
        let storage_key: String = row.try_get("storage_key").unwrap();
        let thumb_key: Option<String> = row.try_get("thumb_key").unwrap_or(None);

        tracing::info!(
            "{}/{} — asset {} ({})",
            i + 1,
            total,
            id,
            &storage_key
        );

        // Upload original
        match upload_file(&client, &s3_bucket, &upload_dir, &storage_key, args.dry_run).await {
            Ok(bytes) => {
                uploaded_files += 1;
                uploaded_bytes += bytes;
            }
            Err(e) => {
                tracing::error!(
                    asset_id = %id, key = %storage_key, error = %e,
                    "Failed to upload original"
                );
                errors += 1;
                continue;
            }
        }

        // Upload thumbnail
        if let Some(tk) = &thumb_key {
            match upload_file(&client, &s3_bucket, &upload_dir, tk, args.dry_run).await {
                Ok(bytes) => {
                    uploaded_files += 1;
                    uploaded_bytes += bytes;
                }
                Err(e) => {
                    tracing::warn!(asset_id = %id, key = %tk, error = %e, "Failed to upload thumbnail");
                }
            }
        }

        // Update DB
        if !args.dry_run {
            sqlx::query("UPDATE assets SET storage_backend = 's3' WHERE id = $1")
                .bind(id)
                .execute(&pool)
                .await
                .with_context(|| format!("DB update for asset {id}"))?;
            migrated_rows += 1;
        }

        // Batch pause
        if (i + 1) % args.batch_size == 0 {
            tokio::time::sleep(std::time::Duration::from_millis(500)).await;
        }
    }

    tracing::info!(
        uploaded_files,
        uploaded_bytes,
        migrated_rows,
        errors,
        "Migration complete"
    );

    if errors > 0 {
        tracing::warn!("{errors} asset(s) had errors and were NOT migrated");
    }

    Ok(())
}

// ─── Upload helper ────────────────────────────────────────────────────────────

async fn upload_file(
    client: &Client,
    bucket: &str,
    upload_dir: &str,
    key: &str,
    dry_run: bool,
) -> Result<u64> {
    let path = PathBuf::from(upload_dir).join(key);

    let bytes = tokio::fs::read(&path)
        .await
        .with_context(|| format!("read {:?}", path))?;

    let size = bytes.len() as u64;
    let mime = mime_from_key(key);

    tracing::debug!(key, bytes = size, mime, dry_run, "upload_file");

    if !dry_run {
        client
            .put_object()
            .bucket(bucket)
            .key(key)
            .body(ByteStream::from(bytes))
            .content_type(mime)
            .send()
            .await
            .with_context(|| format!("S3 put {key}"))?;
    }

    Ok(size)
}

fn mime_from_key(key: &str) -> &'static str {
    let ext = Path::new(key)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("");
    match ext {
        "jpg" | "jpeg" => "image/jpeg",
        "png" => "image/png",
        "webp" => "image/webp",
        "gif" => "image/gif",
        _ => "application/octet-stream",
    }
}
