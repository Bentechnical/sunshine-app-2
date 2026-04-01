//! Session management.
//!
//! A session token is a random 32-byte value, hex-encoded, stored in an
//! encrypted cookie. The database stores a SHA-256 hash of the token
//! (so a DB breach doesn't expose live tokens).
//!
//! Sessions roll their expiry on every authenticated request.

use crate::auth::clerk::{ClerkAuth, CLERK_SESSION_COOKIE};
use crate::config::AppConfig;
use crate::errors::{AppError, AppResult};
use crate::models::user::{User, UserRole};
use crate::Db;
use chrono::{Duration, Utc};
use rand::RngCore;
use rocket::http::{Cookie, CookieJar, SameSite};
use rocket::request::{FromRequest, Outcome};
use rocket::time::OffsetDateTime;
use rocket::Request;
use sha2::{Digest, Sha256};
use uuid::Uuid;

const SESSION_COOKIE: &str = "sunshine_session";
pub const IMPERSONATE_COOKIE: &str = "sunshine_impersonate";

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ImpersonatePayload {
    pub user_id: Uuid,
    pub display_name: String,
    pub role: String,
}

// ─── Session creation ─────────────────────────────────────────────────────────

pub struct SessionToken(String);

impl SessionToken {
    pub fn generate() -> Self {
        let mut bytes = [0u8; 32];
        rand::thread_rng().fill_bytes(&mut bytes);
        Self(hex::encode(bytes))
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }

    pub fn hash(&self) -> String {
        let mut hasher = Sha256::new();
        hasher.update(self.0.as_bytes());
        hex::encode(hasher.finalize())
    }
}

/// Create a new session in the database and set the session cookie.
pub async fn create_session(
    db: &Db,
    user_id: Uuid,
    jar: &CookieJar<'_>,
    ttl_days: i64,
    ip: Option<std::net::IpAddr>,
    user_agent: Option<&str>,
) -> AppResult<()> {
    let token = SessionToken::generate();
    let token_hash = token.hash();
    let expires_at = Utc::now() + Duration::days(ttl_days);

    sqlx::query(
        "INSERT INTO sessions (user_id, token_hash, ip_address, user_agent, expires_at)
         VALUES ($1, $2, $3::inet, $4, $5)",
    )
    .bind(user_id)
    .bind(&token_hash)
    .bind(ip.map(|ip| ip.to_string()))
    .bind(user_agent)
    .bind(expires_at)
    .execute(&**db)
    .await?;

    // Set secure, HTTP-only, SameSite=Strict cookie
    let mut cookie = Cookie::new(SESSION_COOKIE, token.0);
    cookie.set_http_only(true);
    cookie.set_same_site(SameSite::Strict);
    cookie.set_secure(true);
    cookie.set_path("/");
    cookie.set_expires(OffsetDateTime::from_unix_timestamp(expires_at.timestamp()).ok());
    jar.add_private(cookie);

    Ok(())
}

pub async fn destroy_session(db: &Db, jar: &CookieJar<'_>) -> AppResult<()> {
    if let Some(cookie) = jar.get_private(SESSION_COOKIE) {
        let token = SessionToken(cookie.value().to_string());
        let token_hash = token.hash();
        sqlx::query("DELETE FROM sessions WHERE token_hash = $1")
            .bind(&token_hash)
            .execute(&**db)
            .await?;
        
        let mut remove_cookie = Cookie::from(SESSION_COOKIE);
        remove_cookie.set_path("/");
        jar.remove_private(remove_cookie);
    }

    // Always clear impersonation cookie on logout
    let mut remove_imp = Cookie::from(IMPERSONATE_COOKIE);
    remove_imp.set_path("/");
    jar.remove_private(remove_imp);

    Ok(())
}

// ─── Shared session resolver ──────────────────────────────────────────────────

/// Resolve the real session user from the session cookie. Shared by both
/// `AuthUser` and `AdminUser` guards.
async fn resolve_session_user<'r>(req: &'r Request<'_>) -> Outcome<User, AppError> {
    let jar = req.cookies();
    let token_value = match jar.get_private(SESSION_COOKIE) {
        Some(c) => c.value().to_string(),
        None => return Outcome::Error((rocket::http::Status::Unauthorized, AppError::Unauthorized)),
    };

    let token_hash = {
        let mut hasher = Sha256::new();
        hasher.update(token_value.as_bytes());
        hex::encode(hasher.finalize())
    };

    let db = match req.guard::<&Db>().await {
        Outcome::Success(db) => db,
        _ => return Outcome::Error((rocket::http::Status::InternalServerError, AppError::Unauthorized)),
    };

    let row = sqlx::query_as::<_, User>(
        "SELECT u.id, u.email, u.role, u.display_name, u.is_active, u.theme_preference, u.created_at, u.updated_at
         FROM sessions s
         JOIN users u ON u.id = s.user_id
         WHERE s.token_hash = $1
           AND s.expires_at > now()
           AND u.is_active = true",
    )
    .bind(&token_hash)
    .fetch_optional(&**db)
    .await;

    match row {
        Ok(Some(user)) => {
            let pool = (**db).clone();
            let hash_clone = token_hash.clone();
            tokio::spawn(async move {
                let _ = sqlx::query(
                    "UPDATE sessions
                     SET last_active_at = now(),
                         expires_at = now() + INTERVAL '60 days'
                     WHERE token_hash = $1",
                )
                .bind(&hash_clone)
                .execute(&pool)
                .await;
            });
            Outcome::Success(user)
        }
        Ok(None) => {
            jar.remove_private(Cookie::from(SESSION_COOKIE));
            Outcome::Error((rocket::http::Status::Unauthorized, AppError::Unauthorized))
        }
        Err(e) => {
            tracing::error!(error = %e, "Session lookup failed");
            Outcome::Error((rocket::http::Status::InternalServerError, AppError::Unauthorized))
        }
    }
}

/// Resolve the authenticated user from a Clerk `__session` JWT cookie or
/// an `Authorization: Bearer <token>` header (for API / non-browser clients).
async fn resolve_clerk_user<'r>(req: &'r Request<'_>) -> Outcome<User, AppError> {
    let jar = req.cookies();

    // Prefer the cookie (browser); fall back to Authorization header (API clients).
    let token = if let Some(c) = jar.get(CLERK_SESSION_COOKIE) {
        c.value().to_string()
    } else if let Some(header) = req.headers().get_one("Authorization") {
        if let Some(stripped) = header.strip_prefix("Bearer ") {
            stripped.to_string()
        } else {
            return Outcome::Error((rocket::http::Status::Unauthorized, AppError::Unauthorized));
        }
    } else {
        return Outcome::Error((rocket::http::Status::Unauthorized, AppError::Unauthorized));
    };

    let clerk_auth = match req.rocket().state::<ClerkAuth>() {
        Some(a) => a,
        None => {
            tracing::error!("ClerkAuth not in Rocket state");
            return Outcome::Error((
                rocket::http::Status::InternalServerError,
                AppError::Unauthorized,
            ));
        }
    };

    let claims = match clerk_auth.verify_session_token(&token).await {
        Ok(c) => c,
        Err(e) => {
            tracing::debug!(error = %e, "Clerk session verification failed");
            return Outcome::Error((rocket::http::Status::Unauthorized, AppError::Unauthorized));
        }
    };

    let db = match req.guard::<&Db>().await {
        Outcome::Success(db) => db,
        _ => {
            return Outcome::Error((
                rocket::http::Status::InternalServerError,
                AppError::Unauthorized,
            ))
        }
    };

    let user = sqlx::query_as::<_, User>(
        "SELECT id, email, role, display_name, is_active, theme_preference, created_at, updated_at
         FROM users WHERE clerk_id = $1 AND is_active = true",
    )
    .bind(&claims.sub)
    .fetch_optional(&**db)
    .await;

    match user {
        Ok(Some(u)) => Outcome::Success(u),
        Ok(None) => {
            tracing::warn!(clerk_id = %claims.sub, "Authenticated Clerk user has no matching local account");
            Outcome::Error((rocket::http::Status::Unauthorized, AppError::Unauthorized))
        }
        Err(e) => {
            tracing::error!(error = %e, "DB error during Clerk user resolution");
            Outcome::Error((
                rocket::http::Status::InternalServerError,
                AppError::Unauthorized,
            ))
        }
    }
}

/// Dispatch to Clerk or session auth based on config.
async fn resolve_user<'r>(req: &'r Request<'_>) -> Outcome<User, AppError> {
    let clerk_enabled = req
        .rocket()
        .state::<AppConfig>()
        .map(|c| c.clerk_enabled())
        .unwrap_or(false);

    if clerk_enabled {
        // Try Clerk first; fall back to local session (covers dev-login and
        // any user with an existing sunshine_session cookie).
        let outcome = resolve_clerk_user(req).await;
        if outcome.is_error() {
            resolve_session_user(req).await
        } else {
            outcome
        }
    } else {
        resolve_session_user(req).await
    }
}

// ─── Theme cookie helper ───────────────────────────────────────────────────────

/// Refreshes the non-HttpOnly `theme` cookie to match the effective user's
/// saved preference. Called after impersonation is resolved so the cookie
/// always reflects the user whose perspective is being viewed.
fn sync_theme_cookie(jar: &CookieJar<'_>, theme: &str) {
    let mut cookie = Cookie::new("theme", theme.to_string());
    cookie.set_http_only(false);
    cookie.set_same_site(SameSite::Lax);
    cookie.set_secure(false);
    cookie.set_path("/");
    cookie.set_max_age(rocket::time::Duration::days(365));
    jar.add(cookie);
}

// ─── Authenticated User guard ─────────────────────────────────────────────────

/// Request guard: resolves to the authenticated user.
/// If the real user is an admin and the impersonation cookie is set,
/// resolves to the impersonated target user instead.
pub struct AuthUser(pub User);

impl AuthUser {
    pub fn id(&self) -> Uuid { self.0.id }
    pub fn role(&self) -> &UserRole { &self.0.role }
    pub fn is_admin(&self) -> bool { matches!(self.0.role, UserRole::Admin) }
}

#[rocket::async_trait]
impl<'r> FromRequest<'r> for AuthUser {
    type Error = AppError;

    async fn from_request(req: &'r Request<'_>) -> Outcome<Self, Self::Error> {
        let real_user = match resolve_user(req).await {
            Outcome::Success(u) => u,
            Outcome::Error(e) => return Outcome::Error(e),
            Outcome::Forward(f) => return Outcome::Forward(f),
        };

        // If the real user is an admin, check for impersonation cookie
        if matches!(real_user.role, UserRole::Admin) {
            if let Some(cookie) = req.cookies().get_private(IMPERSONATE_COOKIE) {
                if let Ok(payload) = serde_json::from_str::<ImpersonatePayload>(cookie.value()) {
                    // Fetch the target user from DB
                    let db = match req.guard::<&Db>().await {
                        Outcome::Success(db) => db,
                        _ => return Outcome::Success(AuthUser(real_user)),
                    };

                    let target = sqlx::query_as::<_, User>(
                        "SELECT id, email, role, display_name, is_active, theme_preference, created_at, updated_at
                         FROM users WHERE id = $1 AND is_active = true",
                    )
                    .bind(payload.user_id)
                    .fetch_optional(&**db)
                    .await;

                    if let Ok(Some(target_user)) = target {
                        sync_theme_cookie(req.cookies(), &target_user.theme_preference);
                        return Outcome::Success(AuthUser(target_user));
                    }
                    // If target not found, clear stale cookie and fall through
                    req.cookies().remove_private(Cookie::from(IMPERSONATE_COOKIE));
                }
            }
        }

        sync_theme_cookie(req.cookies(), &real_user.theme_preference);
        Outcome::Success(AuthUser(real_user))
    }
}

/// Optional auth guard — succeeds even when unauthenticated (returns None).
pub struct MaybeAuthUser(pub Option<User>);

#[rocket::async_trait]
impl<'r> FromRequest<'r> for MaybeAuthUser {
    type Error = std::convert::Infallible;

    async fn from_request(req: &'r Request<'_>) -> Outcome<Self, Self::Error> {
        match AuthUser::from_request(req).await {
            Outcome::Success(AuthUser(user)) => Outcome::Success(MaybeAuthUser(Some(user))),
            _ => Outcome::Success(MaybeAuthUser(None)),
        }
    }
}

/// Admin-only guard. Always resolves the REAL session user (ignores
/// impersonation), so admins retain access to `/admin/*` while impersonating.
pub struct AdminUser(pub User);

#[rocket::async_trait]
impl<'r> FromRequest<'r> for AdminUser {
    type Error = AppError;

    async fn from_request(req: &'r Request<'_>) -> Outcome<Self, Self::Error> {
        match resolve_user(req).await {
            Outcome::Success(user) if matches!(user.role, UserRole::Admin) => {
                Outcome::Success(AdminUser(user))
            }
            Outcome::Success(_) => {
                Outcome::Error((rocket::http::Status::Forbidden, AppError::Forbidden))
            }
            Outcome::Error(e) => Outcome::Error(e),
            Outcome::Forward(f) => Outcome::Forward(f),
        }
    }
}

/// Agency Contact-only guard.
pub struct AgencyUser {
    pub user: User,
    pub agency_id: Uuid,
}

#[rocket::async_trait]
impl<'r> FromRequest<'r> for AgencyUser {
    type Error = AppError;

    async fn from_request(req: &'r Request<'_>) -> Outcome<Self, Self::Error> {
        // We use AuthUser because we WANT to allow admin impersonation
        // for agency contacts to test their dashboard.
        let user = match AuthUser::from_request(req).await {
            Outcome::Success(au) => au.0,
            Outcome::Error(e) => return Outcome::Error(e),
            Outcome::Forward(f) => return Outcome::Forward(f),
        };

        if !matches!(user.role, UserRole::AgencyContact) {
            return Outcome::Error((rocket::http::Status::Forbidden, AppError::Forbidden));
        }

        let db = match req.guard::<&Db>().await {
            Outcome::Success(db) => db,
            _ => return Outcome::Error((rocket::http::Status::InternalServerError, AppError::Unauthorized)),
        };

        // Find associated agency ID via contacts table
        let agency_id: Option<Uuid> = sqlx::query_scalar(
            "SELECT agency_id FROM contacts WHERE user_id = $1 AND is_active = true"
        )
        .bind(user.id)
        .fetch_optional(&**db)
        .await
        .unwrap_or(None);

        match agency_id {
            Some(aid) => Outcome::Success(AgencyUser { user, agency_id: aid }),
            None => Outcome::Error((rocket::http::Status::Forbidden, AppError::Forbidden)),
        }
    }
}
