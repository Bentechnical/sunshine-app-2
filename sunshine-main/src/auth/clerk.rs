//! Clerk JWT verification and JWKS caching.
//!
//! Clerk issues RS256 JWTs in the `__session` cookie. We verify them against
//! Clerk's public keys (JWKS endpoint) and resolve the local User record
//! via `clerk_id`.
//!
//! # Session token TTL
//! Set your Clerk JWT template TTL to 24h in the Clerk dashboard
//! (JWT Templates → Customize → Lifetime: 86400). Without Clerk.js
//! auto-refresh this is the session length for SSR apps.
//!
//! # Required Clerk session token customization
//! In the Clerk dashboard, add `email` to the session token template:
//! ```json
//! { "email": "{{user.primary_email_address.email_address}}" }
//! ```

use anyhow::{anyhow, Result};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use jsonwebtoken::{decode, decode_header, Algorithm, DecodingKey, Validation};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::RwLock;

pub const CLERK_SESSION_COOKIE: &str = "__session";
const JWKS_CACHE_TTL: Duration = Duration::from_secs(12 * 3600); // 12 hours

/// Claims from a verified Clerk session JWT.
#[derive(Debug, Serialize, Deserialize)]
pub struct ClerkClaims {
    /// Clerk user ID (format: "user_...")
    pub sub: String,
    /// Expiry (unix timestamp)
    pub exp: u64,
    /// Issued at (unix timestamp)
    pub iat: u64,
    /// Email — only present if configured in Clerk's JWT template
    #[serde(default)]
    pub email: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
struct JwksKey {
    pub kid: String,
    pub kty: String,
    #[serde(default)]
    pub alg: Option<String>,
    // RSA
    #[serde(default)]
    pub n: Option<String>,
    #[serde(default)]
    pub e: Option<String>,
    // OKP (EdDSA)
    #[serde(default)]
    pub x: Option<String>,
}

#[derive(Debug, Deserialize)]
struct Jwks {
    keys: Vec<JwksKey>,
}

struct CachedJwks {
    keys: Vec<JwksKey>,
    fetched_at: Instant,
}

pub struct ClerkAuth {
    jwks_url: String,
    cache: Arc<RwLock<Option<CachedJwks>>>,
}

impl ClerkAuth {
    pub fn new(jwks_url: String) -> Self {
        Self {
            jwks_url,
            cache: Arc::new(RwLock::new(None)),
        }
    }

    /// Derive the JWKS URL from a Clerk publishable key.
    ///
    /// Publishable keys: `pk_test_<base64url>$` or `pk_live_<base64url>$`
    /// The base64url segment decodes to the Clerk Frontend API hostname.
    pub fn jwks_url_from_publishable_key(pk: &str) -> Option<String> {
        let encoded = pk
            .strip_prefix("pk_test_")
            .or_else(|| pk.strip_prefix("pk_live_"))?
            .trim_end_matches('$');
        let decoded = URL_SAFE_NO_PAD.decode(encoded).ok()?;
        let frontend_api = String::from_utf8(decoded).ok()?;
        let frontend_api = frontend_api.trim_end_matches('/');
        Some(format!("https://{}/.well-known/jwks.json", frontend_api))
    }

    /// Derive the Clerk JS script URL from a publishable key.
    ///
    /// Returns the URL to load Clerk's browser JS bundle from their CDN,
    /// which is needed for client-side session refresh.
    pub fn js_url_from_publishable_key(pk: &str) -> Option<String> {
        let jwks_url = Self::jwks_url_from_publishable_key(pk)?;
        // Extract hostname from JWKS URL: https://hostname/.well-known/jwks.json
        let host = jwks_url
            .trim_start_matches("https://")
            .split('/')
            .next()
            .unwrap_or("")
            .to_string();
        if host.is_empty() {
            return None;
        }
        Some(format!(
            "https://{}/npm/@clerk/clerk-js@latest/dist/clerk.browser.js",
            host
        ))
    }

    async fn fetch_jwks(&self) -> Result<Vec<JwksKey>> {
        tracing::debug!(url = %self.jwks_url, "Fetching Clerk JWKS");
        let resp = reqwest::get(&self.jwks_url)
            .await
            .map_err(|e| anyhow!("JWKS fetch failed: {e}"))?
            .json::<Jwks>()
            .await
            .map_err(|e| anyhow!("JWKS parse failed: {e}"))?;
        tracing::debug!(count = resp.keys.len(), "Clerk JWKS fetched");
        Ok(resp.keys)
    }

    async fn get_keys(&self, force_refresh: bool) -> Result<Vec<JwksKey>> {
        if !force_refresh {
            let cache = self.cache.read().await;
            if let Some(ref c) = *cache {
                if c.fetched_at.elapsed() < JWKS_CACHE_TTL {
                    return Ok(c.keys.clone());
                }
            }
        }
        let mut cache = self.cache.write().await;
        // Double-check under write lock
        if !force_refresh {
            if let Some(ref c) = *cache {
                if c.fetched_at.elapsed() < JWKS_CACHE_TTL {
                    return Ok(c.keys.clone());
                }
            }
        }
        let keys = self.fetch_jwks().await?;
        *cache = Some(CachedJwks {
            keys: keys.clone(),
            fetched_at: Instant::now(),
        });
        Ok(keys)
    }

    /// Verify a Clerk `__session` JWT, returning its claims on success.
    ///
    /// Automatically retries once with a refreshed JWKS if the key ID is not
    /// found (handles Clerk key rotation).
    pub async fn verify_session_token(&self, token: &str) -> Result<ClerkClaims> {
        let header =
            decode_header(token).map_err(|e| anyhow!("Invalid JWT header: {e}"))?;
        let kid = header.kid.as_deref().unwrap_or("");

        // Try cached keys first, then refresh once on miss (key rotation)
        let key = {
            let keys = self.get_keys(false).await?;
            match keys.into_iter().find(|k| k.kid == kid) {
                Some(k) => k,
                None => {
                    let fresh = self.get_keys(true).await?;
                    fresh
                        .into_iter()
                        .find(|k| k.kid == kid)
                        .ok_or_else(|| anyhow!("JWT kid '{}' not found in JWKS", kid))?
                }
            }
        };

        let decoding_key = build_decoding_key(&key)?;
        let alg = detect_algorithm(&key)?;

        let mut validation = Validation::new(alg);
        validation.validate_exp = true;
        validation.validate_nbf = false;

        let data = decode::<ClerkClaims>(token, &decoding_key, &validation)
            .map_err(|e| anyhow!("JWT verification failed: {e}"))?;

        Ok(data.claims)
    }

    /// Pre-warm the JWKS cache on application startup.
    pub async fn warm_cache(&self) {
        match self.get_keys(true).await {
            Ok(k) => tracing::info!(count = k.len(), "Clerk JWKS cache warmed"),
            Err(e) => tracing::warn!(
                error = %e,
                "Failed to warm Clerk JWKS cache — Clerk auth may not work"
            ),
        }
    }
}

fn build_decoding_key(key: &JwksKey) -> Result<DecodingKey> {
    match key.kty.as_str() {
        "RSA" => {
            let n = key
                .n
                .as_deref()
                .ok_or_else(|| anyhow!("RSA key missing 'n'"))?;
            let e = key
                .e
                .as_deref()
                .ok_or_else(|| anyhow!("RSA key missing 'e'"))?;
            DecodingKey::from_rsa_components(n, e)
                .map_err(|e| anyhow!("RSA decoding key error: {e}"))
        }
        "OKP" => {
            let x = key
                .x
                .as_deref()
                .ok_or_else(|| anyhow!("OKP key missing 'x'"))?;
            DecodingKey::from_ed_components(x)
                .map_err(|e| anyhow!("EdDSA decoding key error: {e}"))
        }
        kty => Err(anyhow!("Unsupported key type: {kty}")),
    }
}

fn detect_algorithm(key: &JwksKey) -> Result<Algorithm> {
    match key.alg.as_deref() {
        Some("RS256") => Ok(Algorithm::RS256),
        Some("RS384") => Ok(Algorithm::RS384),
        Some("RS512") => Ok(Algorithm::RS512),
        Some("EdDSA") => Ok(Algorithm::EdDSA),
        Some(a) => Err(anyhow!("Unsupported algorithm: {a}")),
        None => match key.kty.as_str() {
            "RSA" => Ok(Algorithm::RS256),
            "OKP" => Ok(Algorithm::EdDSA),
            kty => Err(anyhow!("Cannot infer algorithm for key type: {kty}")),
        },
    }
}
