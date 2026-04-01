//! iCalendar feed endpoints.
//!
//! All four feeds are served as `text/calendar` with token-based auth
//! (no session required — the token IS the credential, embedded in the webcal:// URL).
//!
//! Routes:
//!   GET /calendar/volunteer/confirmed.ics?token=<hex>
//!   GET /calendar/volunteer/available.ics?token=<hex>
//!   GET /calendar/agency/shifts.ics?token=<hex>
//!   GET /calendar/admin/global.ics?token=<hex>

use rocket::{get, http::Status, routes, Route, State};
use uuid::Uuid;

use crate::{
    config::AppConfig,
    models::calendar::{
        self, build_admin_ical, build_agency_ical, build_available_ical,
        build_confirmed_ical, CalendarFeedType,
    },
    Db,
};

/// `text/calendar` response wrapper.
type IcalResponse = (Status, (rocket::http::ContentType, String));

fn ical_ok(body: String) -> IcalResponse {
    (
        Status::Ok,
        (
            rocket::http::ContentType::new("text", "calendar")
                .with_params([("charset", "utf-8")]),
            body,
        ),
    )
}

fn ical_gone() -> IcalResponse {
    (
        Status::Gone,
        (
            rocket::http::ContentType::Plain,
            "This calendar feed link has been revoked. Please generate a new link from your settings.".to_string(),
        ),
    )
}

fn ical_not_found() -> IcalResponse {
    (
        Status::NotFound,
        (
            rocket::http::ContentType::Plain,
            "Calendar feed not found.".to_string(),
        ),
    )
}

pub fn routes() -> Vec<Route> {
    routes![
        volunteer_confirmed,
        volunteer_available,
        agency_shifts,
        admin_global,
    ]
}

// ─── Volunteer: confirmed shifts ─────────────────────────────────────────────

#[get("/volunteer/confirmed.ics?<token>")]
pub async fn volunteer_confirmed(
    token: &str,
    db: &Db,
    cfg: &State<AppConfig>,
) -> IcalResponse {
    let pool = &**db;

    let cal_token = match calendar::get_token_by_value(pool, token).await {
        Ok(Some(t)) => t,
        Ok(None) => return ical_not_found(),
        Err(e) => {
            tracing::error!(error = %e, "DB error fetching calendar token");
            return (Status::InternalServerError, (rocket::http::ContentType::Plain, "Internal error".to_string()));
        }
    };

    if cal_token.revoked_at.is_some() {
        return ical_gone();
    }
    if cal_token.feed_type != CalendarFeedType::VolunteerConfirmed {
        return ical_not_found();
    }

    let _ = calendar::touch_token(pool, cal_token.id).await;

    // Fetch the volunteer's display name
    let volunteer_name: String = sqlx::query_scalar!(
        "SELECT COALESCE(vp.volunteer_names, u.display_name, u.email)
         FROM users u
         LEFT JOIN volunteer_profiles vp ON vp.user_id = u.id
         WHERE u.id = $1",
        cal_token.user_id,
    )
    .fetch_optional(pool)
    .await
    .ok()
    .flatten()
    .flatten()
    .unwrap_or_else(|| "Volunteer".to_string());

    let events = match calendar::fetch_confirmed_events(pool, cal_token.user_id).await {
        Ok(e) => e,
        Err(e) => {
            tracing::error!(error = %e, "Error fetching confirmed events");
            return (Status::InternalServerError, (rocket::http::ContentType::Plain, "Internal error".to_string()));
        }
    };

    let ical = build_confirmed_ical(&events, &volunteer_name, &cfg.app_url);
    ical_ok(ical)
}

// ─── Volunteer: available shifts ─────────────────────────────────────────────

#[get("/volunteer/available.ics?<token>")]
pub async fn volunteer_available(
    token: &str,
    db: &Db,
    cfg: &State<AppConfig>,
) -> IcalResponse {
    let pool = &**db;

    let cal_token = match calendar::get_token_by_value(pool, token).await {
        Ok(Some(t)) => t,
        Ok(None) => return ical_not_found(),
        Err(e) => {
            tracing::error!(error = %e, "DB error fetching calendar token");
            return (Status::InternalServerError, (rocket::http::ContentType::Plain, "Internal error".to_string()));
        }
    };

    if cal_token.revoked_at.is_some() {
        return ical_gone();
    }
    if cal_token.feed_type != CalendarFeedType::VolunteerAvailable {
        return ical_not_found();
    }

    let _ = calendar::touch_token(pool, cal_token.id).await;

    // Return cached content if fresh (built by background job or last config change)
    if let Some(ref cached) = cal_token.cached_ical {
        return ical_ok(cached.clone());
    }

    // No cache yet — build on demand and store
    let ical = match build_available_feed(pool, &cal_token, &cfg.app_url).await {
        Ok(s) => s,
        Err(e) => {
            tracing::error!(error = %e, "Error building available-shifts feed");
            return (Status::InternalServerError, (rocket::http::ContentType::Plain, "Internal error".to_string()));
        }
    };

    let _ = calendar::write_cache(pool, cal_token.id, &ical).await;
    ical_ok(ical)
}

/// Build the available-shifts iCal string for a given token. Shared between
/// the on-demand route handler and the background refresh job.
pub async fn build_available_feed(
    pool: &sqlx::PgPool,
    cal_token: &calendar::CalendarToken,
    app_url: &str,
) -> anyhow::Result<String> {
    use crate::models::calendar::{fetch_available_events, list_querysets};

    let volunteer_name: String = sqlx::query_scalar!(
        "SELECT COALESCE(vp.volunteer_names, u.display_name, u.email)
         FROM users u
         LEFT JOIN volunteer_profiles vp ON vp.user_id = u.id
         WHERE u.id = $1",
        cal_token.user_id,
    )
    .fetch_optional(pool)
    .await?
    .flatten()
    .unwrap_or_else(|| "Volunteer".to_string());

    // Resolve the linked queryset (if any)
    let querysets = list_querysets(pool, cal_token.user_id).await?;
    let queryset = cal_token
        .queryset_id
        .and_then(|qid| querysets.iter().find(|q| q.id == qid));

    let events = fetch_available_events(
        pool,
        cal_token.follow_queryset,
        queryset,
        cal_token.follow_preferred_times,
        cal_token.user_id,
    )
    .await?;

    let queryset_name = queryset.map(|q| q.name.as_str());

    Ok(build_available_ical(
        &events,
        &volunteer_name,
        app_url,
        cal_token.follow_queryset,
        queryset_name,
        cal_token.follow_preferred_times,
    ))
}

// ─── Agency: all shifts ───────────────────────────────────────────────────────

#[get("/agency/shifts.ics?<token>")]
pub async fn agency_shifts(
    token: &str,
    db: &Db,
    cfg: &State<AppConfig>,
) -> IcalResponse {
    let pool = &**db;

    let cal_token = match calendar::get_token_by_value(pool, token).await {
        Ok(Some(t)) => t,
        Ok(None) => return ical_not_found(),
        Err(e) => {
            tracing::error!(error = %e, "DB error fetching calendar token");
            return (Status::InternalServerError, (rocket::http::ContentType::Plain, "Internal error".to_string()));
        }
    };

    if cal_token.revoked_at.is_some() {
        return ical_gone();
    }
    if cal_token.feed_type != CalendarFeedType::AgencyShifts {
        return ical_not_found();
    }

    let _ = calendar::touch_token(pool, cal_token.id).await;

    // Derive the agency name for the calendar title (use first agency the contact belongs to)
    let agency_name: String = sqlx::query_scalar!(
        "SELECT a.name FROM contacts c JOIN agencies a ON a.id = c.agency_id
         WHERE c.user_id = $1 AND c.is_active = true
         LIMIT 1",
        cal_token.user_id,
    )
    .fetch_optional(pool)
    .await
    .ok()
    .flatten()
    .unwrap_or_else(|| "Agency".to_string());

    let events = match calendar::fetch_agency_events(pool, cal_token.user_id).await {
        Ok(e) => e,
        Err(e) => {
            tracing::error!(error = %e, "Error fetching agency events");
            return (Status::InternalServerError, (rocket::http::ContentType::Plain, "Internal error".to_string()));
        }
    };

    let ical = build_agency_ical(&events, &agency_name, &cfg.app_url);
    ical_ok(ical)
}

// ─── Admin: global calendar ───────────────────────────────────────────────────

#[get("/admin/global.ics?<token>")]
pub async fn admin_global(
    token: &str,
    db: &Db,
    cfg: &State<AppConfig>,
) -> IcalResponse {
    let pool = &**db;

    let cal_token = match calendar::get_token_by_value(pool, token).await {
        Ok(Some(t)) => t,
        Ok(None) => return ical_not_found(),
        Err(e) => {
            tracing::error!(error = %e, "DB error fetching calendar token");
            return (Status::InternalServerError, (rocket::http::ContentType::Plain, "Internal error".to_string()));
        }
    };

    if cal_token.revoked_at.is_some() {
        return ical_gone();
    }
    if cal_token.feed_type != CalendarFeedType::AdminGlobal {
        return ical_not_found();
    }

    // Guard: only admins should hold admin_global tokens, but double-check
    let role: Option<String> = sqlx::query_scalar(
        "SELECT role::text FROM users WHERE id = $1",
    )
    .bind(cal_token.user_id)
    .fetch_optional(pool)
    .await
    .ok()
    .flatten();
    let is_admin = role.as_deref() == Some("admin");

    if !is_admin {
        return ical_not_found();
    }

    let _ = calendar::touch_token(pool, cal_token.id).await;

    let events = match calendar::fetch_admin_events(pool).await {
        Ok(e) => e,
        Err(e) => {
            tracing::error!(error = %e, "Error fetching admin events");
            return (Status::InternalServerError, (rocket::http::ContentType::Plain, "Internal error".to_string()));
        }
    };

    let ical = build_admin_ical(&events, &cfg.app_url);
    ical_ok(ical)
}
