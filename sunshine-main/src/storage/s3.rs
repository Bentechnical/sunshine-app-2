use crate::errors::{AppError, AppResult};
use anyhow::Context as _;
use async_trait::async_trait;
use aws_credential_types::Credentials;
use aws_sdk_s3::{
    config::{Builder as S3Builder, Region},
    primitives::ByteStream,
    Client,
};

#[derive(Clone)]
pub struct S3Storage {
    client: Client,
    bucket: String,
    public_url: String,
}

impl S3Storage {
    pub fn new(
        endpoint: &str,
        bucket_name: &str,
        access_key: &str,
        secret_key: &str,
        public_url: &str,
    ) -> Self {
        let credentials = Credentials::new(
            access_key,
            secret_key,
            None,
            None,
            "sunshine-static",
        );

        let config = S3Builder::new()
            .region(Region::new("auto"))
            .endpoint_url(endpoint)
            .credentials_provider(credentials)
            .force_path_style(true) // R2 requires path-style
            .build();

        Self {
            client: Client::from_conf(config),
            bucket: bucket_name.to_string(),
            public_url: public_url.trim_end_matches('/').to_string(),
        }
    }
}

#[async_trait]
impl super::Storage for S3Storage {
    async fn put(&self, key: &str, data: &[u8], mime: &str) -> AppResult<()> {
        self.client
            .put_object()
            .bucket(&self.bucket)
            .key(key)
            .body(ByteStream::from(data.to_vec()))
            .content_type(mime)
            .send()
            .await
            .with_context(|| format!("S3 put {key}"))
            .map_err(AppError::Internal)?;
        Ok(())
    }

    async fn get(&self, key: &str) -> AppResult<Vec<u8>> {
        let resp = self.client
            .get_object()
            .bucket(&self.bucket)
            .key(key)
            .send()
            .await
            .with_context(|| format!("S3 get {key}"))
            .map_err(AppError::Internal)?;
        
        let data = resp.body.collect()
            .await
            .with_context(|| format!("S3 read body {key}"))
            .map_err(AppError::Internal)?;
        
        Ok(data.into_bytes().to_vec())
    }

    async fn delete(&self, key: &str) -> AppResult<()> {
        self.client
            .delete_object()
            .bucket(&self.bucket)
            .key(key)
            .send()
            .await
            .with_context(|| format!("S3 delete {key}"))
            .map_err(AppError::Internal)?;
        Ok(())
    }

    fn url(&self, key: &str) -> String {
        format!("{}/{}", self.public_url, key)
    }
}
