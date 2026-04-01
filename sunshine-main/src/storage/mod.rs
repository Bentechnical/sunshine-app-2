pub mod local;
pub mod s3;

use crate::config::AppConfig;
use crate::errors::AppResult;
use async_trait::async_trait;

pub use local::LocalStorage;
pub use s3::S3Storage;

/// Minimal async storage interface.
#[async_trait]
pub trait Storage: Send + Sync {
    async fn put(&self, key: &str, data: &[u8], mime: &str) -> AppResult<()>;
    async fn get(&self, key: &str) -> AppResult<Vec<u8>>;
    async fn delete(&self, key: &str) -> AppResult<()>;
    fn url(&self, key: &str) -> String;
}

/// Rocket-managed enum that dispatches to the active backend.
#[derive(Clone)]
pub enum StorageBackend {
    Local(LocalStorage),
    S3(S3Storage),
}

impl StorageBackend {
    /// Auto-detect backend: S3 when `s3_endpoint` and credentials are non-empty, else local.
    pub fn from_config(cfg: &AppConfig) -> Self {
        if cfg.s3_endpoint.is_empty() || cfg.s3_access_key_id.is_empty() || cfg.s3_secret_access_key.is_empty() {
            tracing::info!(upload_dir = %cfg.upload_dir, "Storage: local filesystem");
            Self::Local(LocalStorage::new(&cfg.upload_dir))
        } else {
            tracing::info!(endpoint = %cfg.s3_endpoint, bucket = %cfg.s3_bucket, "Storage: S3 / R2");
            Self::S3(S3Storage::new(
                &cfg.s3_endpoint,
                &cfg.s3_bucket,
                &cfg.s3_access_key_id,
                &cfg.s3_secret_access_key,
                &cfg.s3_public_url,
            ))
        }
    }

    pub async fn put(&self, key: &str, data: &[u8], mime: &str) -> AppResult<()> {
        match self {
            Self::Local(s) => s.put(key, data, mime).await,
            Self::S3(s) => s.put(key, data, mime).await,
        }
    }

    pub async fn get(&self, key: &str) -> AppResult<Vec<u8>> {
        match self {
            Self::Local(s) => s.get(key).await,
            Self::S3(s) => s.get(key).await,
        }
    }

    pub async fn delete(&self, key: &str) -> AppResult<()> {
        match self {
            Self::Local(s) => s.delete(key, ).await,
            Self::S3(s) => s.delete(key).await,
        }
    }

    pub fn url(&self, key: &str) -> String {
        match self {
            Self::Local(s) => s.url(key),
            Self::S3(s) => s.url(key),
        }
    }

    pub fn is_local(&self) -> bool {
        matches!(self, Self::Local(_))
    }
}
