//! Magic link authentication.
//!
//! Flow:
//!   1. User submits email → POST /auth/magic-link
//!   2. We create a signed JWT (jti stored in DB for single-use revocation)
//!   3. User clicks link → GET /auth/verify?token=<jwt>
//!   4. Token verified, jti marked used, session created

use crate::config::AppConfig;
use crate::errors::{AppError, AppResult};
use crate::Db;
use chrono::Utc;
use jsonwebtoken::{decode, encode, Algorithm, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize)]
pub struct MagicLinkClaims {
    /// Subject = email address
    pub sub: String,
    /// JWT ID — stored in DB for single-use enforcement
    pub jti: String,
    /// Issued at (unix timestamp)
    pub iat: i64,
    /// Expiry (unix timestamp)
    pub exp: i64,
}

pub struct MagicLinkService {
    secret: String,
    ttl_minutes: u64,
}

impl MagicLinkService {
    pub fn new(cfg: &AppConfig) -> Self {
        Self {
            secret: cfg.magic_link_secret.clone(),
            ttl_minutes: cfg.magic_link_ttl_minutes,
        }
    }

    /// Generate a signed JWT magic link token and store the jti in the database.
    pub async fn create(&self, db: &Db, email: &str) -> AppResult<String> {
        let jti = Uuid::new_v4().to_string();
        let now = Utc::now();
        let exp = now + chrono::Duration::minutes(self.ttl_minutes as i64);

        let claims = MagicLinkClaims {
            sub: email.to_lowercase(),
            jti: jti.clone(),
            iat: now.timestamp(),
            exp: exp.timestamp(),
        };

        let token = encode(
            &Header::new(Algorithm::HS256),
            &claims,
            &EncodingKey::from_secret(self.secret.as_bytes()),
        )
        .map_err(|e| AppError::Internal(anyhow::anyhow!("JWT encode error: {e}")))?;

        // Invalidate any previous unused tokens for this email before inserting a new one.
        self.invalidate_for_email(db, email).await?;

        sqlx::query(
            "INSERT INTO magic_links (email, jti, expires_at)
             VALUES ($1, $2, $3)",
        )
        .bind(email.to_lowercase())
        .bind(&jti)
        .bind(exp)
        .execute(&**db)
        .await?;

        Ok(token)
    }

    /// Invalidate all unused, unexpired tokens for this email before issuing a new one.
    pub async fn invalidate_for_email(&self, db: &Db, email: &str) -> AppResult<()> {
        sqlx::query(
            "UPDATE magic_links
             SET used_at = now()
             WHERE email = $1
               AND used_at IS NULL
               AND expires_at > now()",
        )
        .bind(email)
        .execute(&**db)
        .await?;
        Ok(())
    }

    /// Delete tokens that have been used or expired for more than a day.
    /// Call periodically (e.g. on login, or via a background job).
    pub async fn purge_expired(&self, db: &Db) -> AppResult<()> {
        sqlx::query(
            "DELETE FROM magic_links
             WHERE used_at IS NOT NULL
                OR expires_at < now() - INTERVAL '1 day'",
        )
        .execute(&**db)
        .await?;
        Ok(())
    }

    /// Verify a magic link token. Returns the email on success.
    /// Marks the token as used (single-use).
    pub async fn verify(&self, db: &Db, token: &str) -> AppResult<String> {
        let mut validation = Validation::new(Algorithm::HS256);
        validation.validate_exp = true;

        let data = decode::<MagicLinkClaims>(
            token,
            &DecodingKey::from_secret(self.secret.as_bytes()),
            &validation,
        )
        .map_err(|_| AppError::Unauthorized)?;

        let claims = data.claims;

        // Mark as used — returns 0 rows if already used or expired
        let result = sqlx::query(
            "UPDATE magic_links
             SET used_at = now()
             WHERE jti = $1
               AND used_at IS NULL
               AND expires_at > now()
             RETURNING id",
        )
        .bind(&claims.jti)
        .fetch_optional(&**db)
        .await?;

        if result.is_none() {
            return Err(AppError::Unauthorized);
        }

        Ok(claims.sub)
    }
}
