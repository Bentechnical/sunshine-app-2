//! Background job: refresh cached iCal content for volunteer_available feeds.
//!
//! Runs every 8 hours. For each active (non-revoked) volunteer_available token,
//! rebuilds the .ics body using the token's current queryset / preference settings
//! and stores it in `calendar_tokens.cached_ical`.
//!
//! The route handler serves from cache, so calendar-app polling (which may
//! happen every 15 min) never hits the database with an expensive filtered query.

use sqlx::PgPool;
use tokio::time::{interval, Duration};

use crate::models::calendar::CalendarToken;
use crate::routes::calendar::build_available_feed;

/// Run the calendar refresh loop forever. Intended to be spawned as a tokio task.
pub async fn run(pool: PgPool, app_url: String) {
    // First tick fires after the initial delay, giving the server time to warm up.
    let mut tick = interval(Duration::from_secs(8 * 3600));

    loop {
        tick.tick().await;

        if let Err(e) = refresh_all(&pool, &app_url).await {
            tracing::error!(error = %e, "Calendar refresh job error");
        }
    }
}

/// Refresh all active volunteer_available calendar caches. Exported so that the
/// route handler can call it on-demand after a config change.
pub async fn refresh_all(pool: &PgPool, app_url: &str) -> anyhow::Result<()> {
    let tokens: Vec<CalendarToken> = sqlx::query_as::<_, CalendarToken>(
        r#"SELECT id, user_id, feed_type::text AS feed_type,
                  token, queryset_id, follow_queryset, follow_preferred_times,
                  cached_ical, cache_generated_at,
                  created_at, last_accessed_at, revoked_at
           FROM calendar_tokens
           WHERE feed_type = 'volunteer_available'
             AND revoked_at IS NULL"#,
    )
    .fetch_all(pool)
    .await?;

    let total = tokens.len();
    let mut refreshed = 0usize;
    let mut errors = 0usize;

    for token in &tokens {
        match refresh_one(pool, token, app_url).await {
            Ok(()) => refreshed += 1,
            Err(e) => {
                errors += 1;
                tracing::warn!(
                    token_id = %token.id,
                    user_id = %token.user_id,
                    error = %e,
                    "Failed to refresh calendar cache"
                );
            }
        }
    }

    if total > 0 {
        tracing::info!(total, refreshed, errors, "Calendar refresh complete");
    }

    Ok(())
}

/// Rebuild the cached iCal for a single volunteer_available token.
pub async fn refresh_one(
    pool: &PgPool,
    token: &CalendarToken,
    app_url: &str,
) -> anyhow::Result<()> {
    let ical = build_available_feed(pool, token, app_url).await?;
    crate::models::calendar::write_cache(pool, token.id, &ical).await?;
    Ok(())
}
