use crate::errors::{AppError, AppResult};
use anyhow::Context as _;
use async_trait::async_trait;
use std::path::{Path, PathBuf};

#[derive(Clone)]
pub struct LocalStorage {
    base_dir: PathBuf,
}

impl LocalStorage {
    pub fn new(base_dir: &str) -> Self {
        Self {
            base_dir: PathBuf::from(base_dir),
        }
    }

    fn full_path(&self, key: &str) -> PathBuf {
        self.base_dir.join(key)
    }
}

#[async_trait]
impl super::Storage for LocalStorage {
    async fn put(&self, key: &str, data: &[u8], _mime: &str) -> AppResult<()> {
        let path = self.full_path(key);
        if let Some(parent) = path.parent() {
            tokio::fs::create_dir_all(parent)
                .await
                .with_context(|| format!("create_dir_all {:?}", parent))
                .map_err(AppError::Internal)?;
        }
        tokio::fs::write(&path, data)
            .await
            .with_context(|| format!("write {:?}", path))
            .map_err(AppError::Internal)?;
        Ok(())
    }

    async fn get(&self, key: &str) -> AppResult<Vec<u8>> {
        let path = self.full_path(key);
        tokio::fs::read(&path)
            .await
            .with_context(|| format!("read {:?}", path))
            .map_err(AppError::Internal)
    }

    async fn delete(&self, key: &str) -> AppResult<()> {
        let path = self.full_path(key);
        if path.exists() {
            tokio::fs::remove_file(&path)
                .await
                .with_context(|| format!("remove_file {:?}", path))
                .map_err(AppError::Internal)?;
        }
        Ok(())
    }

    fn url(&self, key: &str) -> String {
        format!("/uploads/{}", key)
    }
}
