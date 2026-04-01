use rocket::{
    form::{Form, FromForm},
    get,
    http::CookieJar,
    post,
    response::{Flash, Redirect},
    routes, Route, State,
};
use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};
use rocket_dyn_templates::{context, Template};
use serde::Serialize;

use crate::{
    auth::{magic_link::MagicLinkService, session},
    config::AppConfig,
    email::EmailService,
    errors::{AppError, AppResult},
    models::user::{User, UserRole},
    Db,
};

// ─── Magic link rate limiter ──────────────────────────────────────────────────

/// Per-email rate limiter for magic link requests.
/// Allows up to 5 requests per email address per hour.
pub struct MagicLinkRateLimiter {
    map: Mutex<HashMap<String, (u8, Instant)>>,
}

impl MagicLinkRateLimiter {
    pub fn new() -> Self {
        Self { map: Mutex::new(HashMap::new()) }
    }

    /// Returns `true` if the request is allowed, `false` if rate-limited.
    pub fn check(&self, email: &str) -> bool {
        const MAX: u8 = 5;
        const WINDOW: Duration = Duration::from_secs(3600);
        let mut map = self.map.lock().unwrap_or_else(|e| e.into_inner());
        let now = Instant::now();
        let entry = map.entry(email.to_string()).or_insert((0, now));
        if now.duration_since(entry.1) > WINDOW {
            *entry = (1, now);
            true
        } else if entry.0 < MAX {
            entry.0 += 1;
            true
        } else {
            false
        }
    }
}

pub fn routes() -> Vec<Route> {
    let mut r = routes![
        login_page,
        magic_link_send,
        magic_link_verify,
        magic_link_sent,
        account_not_found,
        logout,
        passkey_register_start,
        passkey_register_finish,
        passkey_login_start,
        passkey_login_finish,
        clerk_callback,
    ];

    // Dev-only: instant login without magic link email
    #[cfg(any(debug_assertions, feature = "dev-routes"))]
    {
        r.append(&mut routes![dev_login_query]);
    }

    r.append(&mut routes![setup_page, setup_submit]);

    r
}

// ─── Login page ───────────────────────────────────────────────────────────────

#[get("/login")]
pub async fn login_page(
    config: &State<AppConfig>,
    flash: Option<rocket::request::FlashMessage<'_>>,
) -> AppResult<rocket::Either<Redirect, Template>> {
    use rocket::Either;
    if config.clerk_enabled() {
        if let Some(url) = config.clerk_sign_in_url(&config.app_url) {
            return Ok(Either::Left(Redirect::to(url)));
        }
    }
    Ok(Either::Right(Template::render(
        "auth/login",
        context! {
            flash: flash.map(|f| FlashCtx { kind: f.kind().to_string(), message: f.message().to_string() }),
        },
    )))
}

#[get("/magic-link-sent?<email>")]
pub async fn magic_link_sent(email: Option<&str>) -> AppResult<Template> {
    Ok(Template::render("auth/magic_link_sent", context! { 
        email: email.unwrap_or("your inbox"),
        debug: cfg!(any(debug_assertions, feature = "dev-routes"))
    }))
}

// ─── Account not found ────────────────────────────────────────────────────────

#[get("/account-not-found?<email>")]
pub async fn account_not_found(email: Option<&str>) -> AppResult<Template> {
    Ok(Template::render("auth/account_not_found", context! { 
        email: email.unwrap_or(""),
    }))
}

// ─── Magic link send ──────────────────────────────────────────────────────────

#[derive(FromForm)]
pub struct MagicLinkRequest<'r> {
    pub email: &'r str,
}

#[post("/magic-link", data = "<form>")]
pub async fn magic_link_send(
    form: Form<MagicLinkRequest<'_>>,
    db: &Db,
    config: &State<AppConfig>,
    email_svc: &State<EmailService>,
    rate_limiter: &State<MagicLinkRateLimiter>,
) -> Flash<Redirect> {
    let email = form.email.trim().to_lowercase();

    if email.is_empty() || !email.contains('@') {
        return Flash::error(Redirect::to("/auth/login"), "Please enter a valid email address.");
    }

    // Rate limit: 5 requests per email per hour
    if !rate_limiter.check(&email) {
        tracing::warn!(email = %email, "Magic link rate limit exceeded");
        // Return the same success-looking response to avoid leaking rate limit status
        return Flash::success(
            Redirect::to(format!("/auth/magic-link-sent?email={}", urlencoding::encode(&email))),
            "Magic link sent!",
        );
    }

    // Check if user exists - do NOT auto-create for login
    let user = match sqlx::query_as::<_, User>(
        "SELECT id, email, role, display_name, is_active, theme_preference, created_at, updated_at
         FROM users WHERE email = $1",
    )
    .bind(&email)
    .fetch_optional(&**db)
    .await
    {
        Ok(Some(u)) => u,
        Ok(None) => {
            // User not found - redirect to account not found page
            tracing::info!(email = %email, "Login attempted for non-existent account");
            return Flash::error(
                Redirect::to(format!("/auth/account-not-found?email={}", urlencoding::encode(&email))),
                "Account not found",
            );
        }
        Err(e) => {
            tracing::error!(error = %e, "Failed to lookup user for magic link");
            return Flash::error(Redirect::to("/auth/login"), "Something went wrong. Please try again.");
        }
    };

    // For inactive accounts: return success response without sending a link.
    // This prevents enumeration of account status via different error messages.
    if !user.is_active {
        tracing::info!(email = %email, "Magic link requested for inactive account — silently suppressed");
        return Flash::success(
            Redirect::to(format!("/auth/magic-link-sent?email={}", urlencoding::encode(&email))),
            "Magic link sent!",
        );
    }

    // Create magic link token (invalidates any previous ones for this email)
    let svc = MagicLinkService::new(config.inner());
    let token = match svc.create(db, &email).await {
        Ok(t) => t,
        Err(e) => {
            tracing::error!(error = %e, "Failed to create magic link");
            return Flash::error(Redirect::to("/auth/login"), "Could not generate login link. Please try again.");
        }
    };

    // Send email (falls back to logging in dev when SMTP not configured)
    if let Err(e) = email_svc.send_magic_link(&email, &token).await {
        tracing::warn!(error = %e, email = %email, "Magic link email failed");
    }

    Flash::success(
        Redirect::to(format!("/auth/magic-link-sent?email={}", urlencoding::encode(&email))),
        "Magic link sent!",
    )
}

// ─── Magic link verify ────────────────────────────────────────────────────────

#[get("/verify?<token>")]
pub async fn magic_link_verify(
    token: &str,
    db: &Db,
    config: &State<AppConfig>,
    jar: &CookieJar<'_>,
) -> Result<Redirect, Flash<Redirect>> {
    let err_redirect = || {
        Flash::error(
            Redirect::to("/auth/login"),
            "This link has expired or already been used. Please request a new one.",
        )
    };

    let svc = MagicLinkService::new(config.inner());
    let email = svc.verify(db, token).await.map_err(|_| err_redirect())?;

    let user = sqlx::query_as::<_, User>(
        "SELECT id, email, role, display_name, is_active, theme_preference, created_at, updated_at
         FROM users WHERE email = $1 AND is_active = true",
    )
    .bind(&email)
    .fetch_optional(&**db)
    .await
    .map_err(|e| {
        tracing::error!(error = %e, "DB error during magic link verify");
        err_redirect()
    })?
    .ok_or_else(err_redirect)?;

    session::create_session(
        db,
        user.id,
        jar,
        config.session_ttl_days as i64,
        None,
        None,
    )
    .await
    .map_err(|e| {
        tracing::error!(error = %e, "Failed to create session");
        err_redirect()
    })?;

    // Carry forward any theme the user toggled before authenticating.
    // Only applies when the DB still holds the default ('light'), so we don't
    // clobber a preference the user set from a previous logged-in session.
    if let Some(cookie_theme) = jar.get("theme").map(|c| c.value().to_string()) {
        if ["dark", "system"].contains(&cookie_theme.as_str())
            && user.theme_preference == "light"
        {
            let _ = sqlx::query(
                "UPDATE users SET theme_preference = $1, updated_at = now() WHERE id = $2",
            )
            .bind(&cookie_theme)
            .bind(user.id)
            .execute(&**db)
            .await;
        }
    }

    // Mark email as verified (first successful magic link verification)
    let _ = sqlx::query(
        "UPDATE users SET email_verified_at = now() WHERE id = $1 AND email_verified_at IS NULL",
    )
    .bind(user.id)
    .execute(&**db)
    .await;

    Ok(Redirect::to(get_login_redirect(db, &user).await))
}

async fn get_login_redirect(db: &Db, user: &User) -> String {
    match user.role {
        UserRole::Admin => "/admin/dashboard".to_string(),
        UserRole::AgencyContact => "/agency/dashboard".to_string(),
        UserRole::Volunteer => {
            // Check for incomplete application
            let status = sqlx::query_scalar::<_, crate::models::volunteer_application::VolunteerApplicationStatus>(
                "SELECT status FROM volunteer_applications 
                 WHERE user_id = $1 AND status NOT IN ('approved', 'rejected', 'withdrawn')
                 ORDER BY created_at DESC LIMIT 1"
            )
            .bind(user.id)
            .fetch_optional(&**db)
            .await
            .unwrap_or(None);


            if let Some(s) = status {
                s.redirect_url()
            } else {
                "/volunteer/shifts".to_string()
            }
        }
    }
}

// ─── Logout ───────────────────────────────────────────────────────────────────

#[post("/logout")]
pub async fn logout(
    db: &Db,
    config: &State<AppConfig>,
    jar: &CookieJar<'_>,
) -> Flash<Redirect> {
    if config.clerk_enabled() {
        // Clear impersonation cookie
        let mut imp = rocket::http::Cookie::from(session::IMPERSONATE_COOKIE);
        imp.set_path("/");
        jar.remove_private(imp);
        // Clear pending apply cookie if present
        jar.remove_private(rocket::http::Cookie::from("pending_apply_user_id"));

        if let Some(ref account_url) = config.clerk_account_url {
            let return_url = format!("{}/", config.app_url);
            return Flash::success(
                Redirect::to(format!(
                    "{}/sign-out?redirect_url={}",
                    account_url,
                    urlencoding::encode(&return_url)
                )),
                "You've been signed out.",
            );
        }
        return Flash::success(Redirect::to("/"), "You've been signed out.");
    }

    let _ = session::destroy_session(db, jar).await;
    Flash::success(Redirect::to("/auth/login"), "You've been signed out.")
}

// ─── Clerk callback ───────────────────────────────────────────────────────────
// Called by Clerk after sign-in or sign-up.
// The `__session` cookie is already set by Clerk at this point.

#[get("/clerk-callback?<return_to>")]
pub async fn clerk_callback(
    return_to: Option<String>,
    db: &Db,
    config: &State<AppConfig>,
    clerk_auth: &State<crate::auth::clerk::ClerkAuth>,
    jar: &CookieJar<'_>,
) -> Result<Redirect, Flash<Redirect>> {
    let auth_err =
        || Flash::error(Redirect::to("/auth/login"), "Authentication failed. Please try again.");

    let token = jar
        .get(crate::auth::clerk::CLERK_SESSION_COOKIE)
        .map(|c| c.value().to_string())
        .ok_or_else(auth_err)?;

    let claims = clerk_auth
        .verify_session_token(&token)
        .await
        .map_err(|e| {
            tracing::warn!(error = %e, "Clerk callback: JWT verification failed");
            auth_err()
        })?;

    // Pending apply user: pre-created by email before Clerk sign-up (Option 2 flow).
    let pending_user_id = jar
        .get_private("pending_apply_user_id")
        .and_then(|c| uuid::Uuid::parse_str(c.value()).ok());

    if let Some(uid) = pending_user_id {
        // Link this Clerk ID to the pre-created user.
        // Use WHERE clerk_id IS NULL to prevent accidental re-linking.
        let linked: Option<bool> = sqlx::query_scalar(
            "UPDATE users
             SET clerk_id = $1, email_verified_at = COALESCE(email_verified_at, now())
             WHERE id = $2 AND clerk_id IS NULL
             RETURNING true",
        )
        .bind(&claims.sub)
        .bind(uid)
        .fetch_optional(&**db)
        .await
        .unwrap_or(None);

        jar.remove_private(rocket::http::Cookie::from("pending_apply_user_id"));

        if linked.is_some() {
            let dest = return_to.as_deref().unwrap_or("/apply/step/1");
            return Ok(Redirect::to(dest.to_string()));
        }
        // Fall through — the pending user may already have a clerk_id (re-attempt)
    }

    // Look up by Clerk ID (returning user).
    let user = sqlx::query_as::<_, User>(
        "SELECT id, email, role, display_name, is_active, theme_preference, created_at, updated_at
         FROM users WHERE clerk_id = $1 AND is_active = true",
    )
    .bind(&claims.sub)
    .fetch_optional(&**db)
    .await
    .map_err(|_| auth_err())?;

    if let Some(ref u) = user {
        let dest = return_to
            .as_deref()
            .map(|s| s.to_string())
            .unwrap_or_else(|| get_dashboard_url(&u.role));
        return Ok(Redirect::to(dest));
    }

    // No clerk_id match — try linking by email (first Clerk login for existing account).
    if let Some(ref email) = claims.email {
        let linked: Option<bool> = sqlx::query_scalar(
            "UPDATE users
             SET clerk_id = $1, email_verified_at = COALESCE(email_verified_at, now())
             WHERE email = $2 AND clerk_id IS NULL AND is_active = true
             RETURNING true",
        )
        .bind(&claims.sub)
        .bind(email)
        .fetch_optional(&**db)
        .await
        .unwrap_or(None);

        if linked.is_some() {
            // Re-query to get the now-linked user
            let linked_user = sqlx::query_as::<_, User>(
                "SELECT id, email, role, display_name, is_active, theme_preference, created_at, updated_at
                 FROM users WHERE clerk_id = $1",
            )
            .bind(&claims.sub)
            .fetch_optional(&**db)
            .await
            .ok()
            .flatten();

            if let Some(ref u) = linked_user {
                let dest = return_to
                    .as_deref()
                    .map(|s| s.to_string())
                    .unwrap_or_else(|| get_dashboard_url(&u.role));
                return Ok(Redirect::to(dest));
            }
        }
    }

    // New Clerk account with no matching local record.
    Err(Flash::error(
        Redirect::to("/apply"),
        "No account found. Start an application or contact support.",
    ))
}

fn get_dashboard_url(role: &UserRole) -> String {
    match role {
        UserRole::Admin => "/admin/dashboard".to_string(),
        UserRole::AgencyContact => "/agency/dashboard".to_string(),
        UserRole::Volunteer => "/volunteer/shifts".to_string(),
    }
}

// ─── Passkey stubs (Phase 2) ──────────────────────────────────────────────────

#[post("/passkey/register/start")]
pub async fn passkey_register_start() -> &'static str { "passkey register start" }

#[post("/passkey/register/finish")]
pub async fn passkey_register_finish() -> &'static str { "passkey register finish" }

#[post("/passkey/login/start")]
pub async fn passkey_login_start() -> &'static str { "passkey login start" }

#[post("/passkey/login/finish")]
pub async fn passkey_login_finish() -> &'static str { "passkey login finish" }

// ─── Dev-only instant login ──────────────────────────────────────────────────

#[cfg(any(debug_assertions, feature = "dev-routes"))]
#[derive(FromForm)]
pub struct DevLoginParams<'v> {
    role: Option<&'v str>,
    email: Option<&'v str>,
}

#[cfg(any(debug_assertions, feature = "dev-routes"))]
#[get("/dev-login?<params..>")]
pub async fn dev_login_query(
    params: DevLoginParams<'_>,
    db: &Db,
    config: &State<AppConfig>,
    jar: &CookieJar<'_>,
) -> Result<Redirect, Flash<Redirect>> {
    let target_email = if let Some(r) = params.role {
        match r {
            "super_admin" => "superadmin@sunshine.dev",
            "admin" => "admin-1@sunshine.dev",
            "volunteer" => "v01@sunshine.dev",
            "agency" => "n.fournier@camh.dev",
            _ => return Err(Flash::error(Redirect::to("/auth/login"), "Invalid dev role")),
        }
    } else if let Some(e) = params.email {
        e
    } else {
        return Err(Flash::error(Redirect::to("/auth/login"), "Role or Email required for dev login"));
    };

    dev_login(target_email, db, config, jar).await
}

pub async fn dev_login(
    email: &str,
    db: &Db,
    config: &State<AppConfig>,
    jar: &CookieJar<'_>,
) -> Result<Redirect, Flash<Redirect>> {
    let login_err = |msg: &str| Flash::error(Redirect::to("/auth/login"), msg.to_string());
    let normalized = email.trim().to_lowercase();

    tracing::info!(email = %normalized, "⚡ DEV LOGIN attempt");

    let user = match sqlx::query_as::<_, User>(
        "SELECT id, email, role, display_name, is_active, theme_preference, created_at, updated_at
         FROM users WHERE email = $1 AND is_active = true",
    )
    .bind(&normalized)
    .fetch_optional(&**db)
    .await
    {
        Ok(Some(u)) => u,
        Ok(None) => {
            // In dev mode, if user doesn't exist yet (e.g. bypass for brand new application),
            // attempt to create them as a volunteer.
            match get_or_create_volunteer(&**db, &normalized).await {
                Ok(u) => u,
                Err(e) => {
                    tracing::warn!(email = %normalized, error = ?e, "DEV LOGIN — failed to create user on fly");
                    return Err(login_err("Dev login failed — could not create user."));
                }
            }
        }
        Err(e) => {
            tracing::error!(error = %e, email = %normalized, "DEV LOGIN — DB error");
            return Err(login_err(&format!("Dev login DB error: {e}")));
        }
    };

    if let Err(e) = session::create_session(db, user.id, jar, config.session_ttl_days as i64, None, None).await {
        tracing::error!(error = %e, "DEV LOGIN — session creation failed");
        return Err(login_err(&format!("Session error: {e}")));
    }

    tracing::warn!(email = %normalized, role = ?user.role, "⚡ DEV LOGIN — bypassed magic link");

    Ok(Redirect::to(get_login_redirect(db, &user).await))
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/// Get existing user by email, or create a new Volunteer account.
pub async fn get_or_create_volunteer(pool: &sqlx::PgPool, email: &str) -> Result<User, AppError> {
    // Try to find existing user first
    if let Some(user) = sqlx::query_as::<_, User>(
        "SELECT id, email, role, display_name, is_active, theme_preference, created_at, updated_at
         FROM users WHERE email = $1",
    )
    .bind(email)
    .fetch_optional(pool)
    .await?
    {
        return Ok(user);
    }

    // Create new volunteer
    let user = sqlx::query_as::<_, User>(
        "INSERT INTO users (email, role, display_name)
         VALUES ($1, 'volunteer', $2)
         RETURNING id, email, role, display_name, is_active, theme_preference, created_at, updated_at",
    )
    .bind(email)
    .bind(email.split('@').next().unwrap_or("Volunteer")) // Friendly initial name
    .fetch_one(pool)
    .await?;

    // Create empty volunteer profile and notification preferences
    sqlx::query(
        "INSERT INTO volunteer_profiles (user_id) VALUES ($1) ON CONFLICT DO NOTHING",
    )
    .bind(user.id)
    .execute(pool)
    .await?;

    sqlx::query(
        "INSERT INTO notification_preferences (user_id) VALUES ($1) ON CONFLICT DO NOTHING",
    )
    .bind(user.id)
    .execute(pool)
    .await?;

    tracing::info!(user_id = %user.id, email = %email, "New volunteer account created");
    Ok(user)
}

// ─── One-time Super Admin Setup ──────────────────────────────────────────────

#[get("/setup/<token>")]
pub async fn setup_page(token: &str, db: &Db) -> AppResult<Template> {
    // Verify token
    let valid: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM one_time_tokens WHERE token = $1 AND purpose = 'super_admin_setup' AND used_at IS NULL AND expires_at > now())")
        .bind(token)
        .fetch_one(&**db)
        .await?;

    if !valid {
        return Err(AppError::NotFound);
    }

    Ok(Template::render("auth/setup", context! { token }))
}

#[derive(FromForm)]
pub struct SetupForm<'r> {
    pub email: &'r str,
    pub display_name: &'r str,
}

#[post("/setup/<token>", data = "<form>")]
pub async fn setup_submit(
    token: &str,
    form: Form<SetupForm<'_>>,
    db: &Db,
    config: &State<AppConfig>,
    jar: &CookieJar<'_>,
) -> AppResult<Flash<Redirect>> {
    let f = form.into_inner();
    let email = f.email.trim().to_lowercase();
    let redirect_to_setup = Redirect::to(format!("/auth/setup/{}", token));

    // 1. Verify token again within transaction
    let mut tx = db.begin().await?;
    
    let token_info: Option<(String,)> = sqlx::query_as("SELECT purpose FROM one_time_tokens WHERE token = $1 AND used_at IS NULL AND expires_at > now() FOR UPDATE")
        .bind(token)
        .fetch_optional(&mut *tx)
        .await?;

    if token_info.is_none() {
        return Ok(Flash::error(Redirect::to("/auth/login"), "Invalid or expired setup link."));
    }

    // 2. Double check no active admin exists
    let has_super: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM users WHERE role = 'admin' AND is_active = true)")
        .fetch_one(&mut *tx)
        .await?;

    if has_super {
        return Ok(Flash::error(Redirect::to("/auth/login"), "Super Admin already exists."));
    }

    // 3. Create Super Admin
    let user: User = sqlx::query_as(
        "INSERT INTO users (email, role, display_name, is_active, email_verified_at)
         VALUES ($1, 'admin', $2, true, now())
         RETURNING id, email, role, display_name, is_active, theme_preference, created_at, updated_at"
    )
    .bind(&email)
    .bind(f.display_name)
    .fetch_one(&mut *tx)
    .await?;

    // 4. Mark token as used
    sqlx::query("UPDATE one_time_tokens SET used_at = now() WHERE token = $1")
        .bind(token)
        .execute(&mut *tx)
        .await?;

    tx.commit().await?;

    // 5. If Clerk is configured, set pending link cookie and redirect to Clerk sign-up
    if config.clerk_enabled() {
        let mut cookie = rocket::http::Cookie::new("pending_apply_user_id", user.id.to_string());
        cookie.set_http_only(true);
        cookie.set_same_site(rocket::http::SameSite::Lax);
        cookie.set_path("/");
        cookie.set_max_age(rocket::time::Duration::minutes(30));
        jar.add_private(cookie);

        if let Some(sign_up_url) = config.clerk_sign_up_url(&config.app_url, "/admin/profile") {
            return Ok(Flash::success(
                Redirect::to(sign_up_url),
                "Admin account created. Complete Clerk sign-up to access the dashboard.",
            ));
        }
    }

    // Session-based (dev): create session and redirect to profile
    session::create_session(db, user.id, jar, config.session_ttl_days as i64, None, None).await?;

    Ok(Flash::success(Redirect::to("/admin/profile"), "Welcome! Your Super Admin account has been created. Please set up a Passkey for secure access."))
}

// ─── Template context helpers ─────────────────────────────────────────────────

#[derive(Serialize)]
struct FlashCtx {
    kind: String,
    message: String,
}

// Tiny URL encoding helper (avoids adding a full dep just for this)
pub mod urlencoding {
    pub fn encode(s: &str) -> String {
        s.chars()
            .flat_map(|c| match c {
                'A'..='Z' | 'a'..='z' | '0'..='9' | '-' | '_' | '.' | '~' => {
                    vec![c]
                }
                c => format!("%{:02X}", c as u32).chars().collect(),
            })
            .collect()
    }
}
