//! Calendar feed models: saved querysets, calendar tokens, iCal generation.
//!
//! # iCalendar generation
//! We hand-roll RFC 5545 iCal output rather than pulling in an extra crate.
//! Key rules we follow:
//!   - CRLF (\r\n) line endings
//!   - Lines > 75 octets are folded (continuation line starts with a single SPACE)
//!   - Values that contain backslash, semicolon, comma, or newline are escaped
//!   - All timestamps are UTC, formatted YYYYMMDDTHHMMSSZ

use chrono::{DateTime, Datelike, Timelike, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, PgPool};
use uuid::Uuid;

// ─── Saved Querysets ─────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct SavedQueryset {
    pub id: Uuid,
    pub volunteer_id: Uuid,
    pub name: String,
    pub region: Option<String>,
    pub agency_type: Option<String>,
    pub open_only: bool,
    pub match_preferences: bool,
    pub location_id: Option<Uuid>,
    pub preferred_distance_km: Option<f64>,
    pub is_default: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

// All saved_querysets and calendar_tokens queries use the runtime (`query_as::<_, T>()`)
// form rather than the compile-time macro form (`query_as!()`) because these tables are
// created by new migrations (0059/0060) and may not exist in the developer DB yet.
// The runtime form is equivalent — it just skips the compile-time type check.

pub async fn list_querysets(pool: &PgPool, volunteer_id: Uuid) -> sqlx::Result<Vec<SavedQueryset>> {
    sqlx::query_as::<_, SavedQueryset>(
        r#"SELECT id, volunteer_id, name, region, agency_type, open_only,
                  match_preferences, location_id, preferred_distance_km::float8,
                  is_default, created_at, updated_at
           FROM saved_querysets
           WHERE volunteer_id = $1
           ORDER BY is_default DESC, created_at ASC"#,
    )
    .bind(volunteer_id)
    .fetch_all(pool)
    .await
}

pub async fn count_querysets(pool: &PgPool, volunteer_id: Uuid) -> sqlx::Result<i64> {
    let row: (i64,) = sqlx::query_as(
        "SELECT COUNT(*) FROM saved_querysets WHERE volunteer_id = $1",
    )
    .bind(volunteer_id)
    .fetch_one(pool)
    .await?;
    Ok(row.0)
}

pub async fn insert_queryset(
    pool: &PgPool,
    volunteer_id: Uuid,
    name: &str,
    region: Option<&str>,
    agency_type: Option<&str>,
    open_only: bool,
    match_preferences: bool,
    location_id: Option<Uuid>,
    preferred_distance_km: Option<f64>,
) -> sqlx::Result<SavedQueryset> {
    sqlx::query_as::<_, SavedQueryset>(
        r#"INSERT INTO saved_querysets
               (volunteer_id, name, region, agency_type, open_only,
                match_preferences, location_id, preferred_distance_km)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           RETURNING id, volunteer_id, name, region, agency_type, open_only,
                     match_preferences, location_id, preferred_distance_km::float8,
                     is_default, created_at, updated_at"#,
    )
    .bind(volunteer_id)
    .bind(name)
    .bind(region)
    .bind(agency_type)
    .bind(open_only)
    .bind(match_preferences)
    .bind(location_id)
    .bind(preferred_distance_km)
    .fetch_one(pool)
    .await
}

pub async fn delete_queryset(
    pool: &PgPool,
    id: Uuid,
    volunteer_id: Uuid,
) -> sqlx::Result<bool> {
    let result = sqlx::query(
        "DELETE FROM saved_querysets WHERE id = $1 AND volunteer_id = $2",
    )
    .bind(id)
    .bind(volunteer_id)
    .execute(pool)
    .await?;
    Ok(result.rows_affected() > 0)
}

/// Sets one queryset as default, clearing any other default for this volunteer.
pub async fn set_default_queryset(
    pool: &PgPool,
    id: Uuid,
    volunteer_id: Uuid,
) -> sqlx::Result<()> {
    let mut tx = pool.begin().await?;
    sqlx::query("UPDATE saved_querysets SET is_default = false WHERE volunteer_id = $1")
        .bind(volunteer_id)
        .execute(&mut *tx)
        .await?;
    sqlx::query(
        "UPDATE saved_querysets SET is_default = true WHERE id = $1 AND volunteer_id = $2",
    )
    .bind(id)
    .bind(volunteer_id)
    .execute(&mut *tx)
    .await?;
    tx.commit().await
}

pub async fn clear_default_queryset(pool: &PgPool, volunteer_id: Uuid) -> sqlx::Result<()> {
    sqlx::query("UPDATE saved_querysets SET is_default = false WHERE volunteer_id = $1")
        .bind(volunteer_id)
        .execute(pool)
        .await?;
    Ok(())
}

// ─── Calendar Tokens ─────────────────────────────────────────────────────────

/// Logical feed type. Stored as a postgres ENUM (`calendar_feed_type`).
/// We parse it from the text representation in runtime queries.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum CalendarFeedType {
    VolunteerConfirmed,
    VolunteerAvailable,
    AgencyShifts,
    AdminGlobal,
}

impl CalendarFeedType {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::VolunteerConfirmed => "volunteer_confirmed",
            Self::VolunteerAvailable => "volunteer_available",
            Self::AgencyShifts => "agency_shifts",
            Self::AdminGlobal => "admin_global",
        }
    }
}

impl TryFrom<String> for CalendarFeedType {
    type Error = String;
    fn try_from(s: String) -> Result<Self, Self::Error> {
        match s.as_str() {
            "volunteer_confirmed" => Ok(Self::VolunteerConfirmed),
            "volunteer_available" => Ok(Self::VolunteerAvailable),
            "agency_shifts" => Ok(Self::AgencyShifts),
            "admin_global" => Ok(Self::AdminGlobal),
            other => Err(format!("Unknown calendar feed type: {}", other)),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct CalendarToken {
    pub id: Uuid,
    pub user_id: Uuid,
    /// Decoded from the `calendar_feed_type` postgres enum via `TryFrom<String>`.
    #[sqlx(try_from = "String")]
    pub feed_type: CalendarFeedType,
    pub token: String,
    pub queryset_id: Option<Uuid>,
    pub follow_queryset: bool,
    pub follow_preferred_times: bool,
    pub cached_ical: Option<String>,
    pub cache_generated_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub last_accessed_at: Option<DateTime<Utc>>,
    pub revoked_at: Option<DateTime<Utc>>,
}

const TOKEN_SELECT: &str = r#"
    SELECT id, user_id, feed_type::text AS feed_type,
           token, queryset_id, follow_queryset, follow_preferred_times,
           cached_ical, cache_generated_at,
           created_at, last_accessed_at, revoked_at
    FROM calendar_tokens
"#;

/// Generate a cryptographically random 64-char hex token.
pub fn generate_token() -> String {
    use rand::RngCore;
    let mut bytes = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut bytes);
    hex::encode(bytes)
}

/// Fetch the active (non-revoked) token for a user+feed, creating it if absent.
pub async fn get_or_create_token(
    pool: &PgPool,
    user_id: Uuid,
    feed_type: CalendarFeedType,
) -> sqlx::Result<CalendarToken> {
    let sql = format!(
        "{} WHERE user_id = $1 AND feed_type = $2::calendar_feed_type AND revoked_at IS NULL",
        TOKEN_SELECT
    );
    let existing = sqlx::query_as::<_, CalendarToken>(&sql)
        .bind(user_id)
        .bind(feed_type.as_str())
        .fetch_optional(pool)
        .await?;

    if let Some(t) = existing {
        return Ok(t);
    }

    let token = generate_token();
    let insert_sql = format!(
        r#"INSERT INTO calendar_tokens (user_id, feed_type, token)
           VALUES ($1, $2::calendar_feed_type, $3)
           RETURNING id, user_id, feed_type::text AS feed_type,
                     token, queryset_id, follow_queryset, follow_preferred_times,
                     cached_ical, cache_generated_at,
                     created_at, last_accessed_at, revoked_at"#
    );
    sqlx::query_as::<_, CalendarToken>(&insert_sql)
        .bind(user_id)
        .bind(feed_type.as_str())
        .bind(&token)
        .fetch_one(pool)
        .await
}

/// Fetch a token by its hex string (for serving .ics requests).
pub async fn get_token_by_value(
    pool: &PgPool,
    token: &str,
) -> sqlx::Result<Option<CalendarToken>> {
    let sql = format!("{} WHERE token = $1", TOKEN_SELECT);
    sqlx::query_as::<_, CalendarToken>(&sql)
        .bind(token)
        .fetch_optional(pool)
        .await
}

/// Touch last_accessed_at on every request that serves a feed.
pub async fn touch_token(pool: &PgPool, token_id: Uuid) -> sqlx::Result<()> {
    sqlx::query("UPDATE calendar_tokens SET last_accessed_at = now() WHERE id = $1")
        .bind(token_id)
        .execute(pool)
        .await?;
    Ok(())
}

/// Revoke the current active token and issue a new one.
pub async fn regenerate_token(
    pool: &PgPool,
    user_id: Uuid,
    feed_type: CalendarFeedType,
) -> sqlx::Result<CalendarToken> {
    let mut tx = pool.begin().await?;
    sqlx::query(
        "UPDATE calendar_tokens SET revoked_at = now()
         WHERE user_id = $1 AND feed_type = $2::calendar_feed_type AND revoked_at IS NULL",
    )
    .bind(user_id)
    .bind(feed_type.as_str())
    .execute(&mut *tx)
    .await?;
    let new_token = generate_token();
    let row = sqlx::query_as::<_, CalendarToken>(
        r#"INSERT INTO calendar_tokens (user_id, feed_type, token)
           VALUES ($1, $2::calendar_feed_type, $3)
           RETURNING id, user_id, feed_type::text AS feed_type,
                     token, queryset_id, follow_queryset, follow_preferred_times,
                     cached_ical, cache_generated_at,
                     created_at, last_accessed_at, revoked_at"#,
    )
    .bind(user_id)
    .bind(feed_type.as_str())
    .bind(&new_token)
    .fetch_one(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok(row)
}

/// Update the available-shifts feed config for a volunteer.
pub async fn update_available_config(
    pool: &PgPool,
    token_id: Uuid,
    queryset_id: Option<Uuid>,
    follow_queryset: bool,
    follow_preferred_times: bool,
) -> sqlx::Result<()> {
    sqlx::query(
        "UPDATE calendar_tokens
         SET queryset_id = $2, follow_queryset = $3, follow_preferred_times = $4,
             cached_ical = NULL, cache_generated_at = NULL
         WHERE id = $1",
    )
    .bind(token_id)
    .bind(queryset_id)
    .bind(follow_queryset)
    .bind(follow_preferred_times)
    .execute(pool)
    .await?;
    Ok(())
}

/// Write freshly-generated iCal content into the cache columns.
pub async fn write_cache(
    pool: &PgPool,
    token_id: Uuid,
    ical: &str,
) -> sqlx::Result<()> {
    sqlx::query(
        "UPDATE calendar_tokens SET cached_ical = $2, cache_generated_at = now() WHERE id = $1",
    )
    .bind(token_id)
    .bind(ical)
    .execute(pool)
    .await?;
    Ok(())
}

// ─── Rich query structs for feed generation ──────────────────────────────────

/// One row per confirmed assignment on a shift, with all data needed to build a
/// rich calendar event DESCRIPTION.
#[derive(Debug, Clone, FromRow)]
pub struct ConfirmedShiftEvent {
    pub shift_id: Uuid,
    pub title: String,
    pub description: Option<String>,
    pub specific_requests: Option<String>,
    pub parking_notes: Option<String>,
    pub meeting_notes: Option<String>,
    pub start_at: DateTime<Utc>,
    pub end_at: DateTime<Utc>,
    pub slots_requested: i32,
    pub requires_police_check: bool,
    pub requires_vulnerable_check: bool,
    pub agency_name: String,
    pub site_name: String,
    pub site_address: Option<String>,
    pub region_name: Option<String>,
    // Contact info (visibility already resolved to plain text; NULL = not shown)
    pub contact_name: Option<String>,
    pub contact_title: Option<String>,
    pub contact_phone: Option<String>,
    pub contact_email: Option<String>,
    // This volunteer's own assignment
    pub assignment_id: Uuid,
    pub volunteer_id: Uuid,
    pub assignment_status: String,
    // Aggregate: all confirmed teammates as "Name (Dog, Dog)" — built in SQL via agg
    pub teammates: Option<String>,
    // Recurrence indicator
    pub recurrence_seq: Option<i32>,
    pub inherited_from_shift_id: Option<Uuid>,
}

/// Fetch all confirmed (and pending_confirmation) shifts for a volunteer,
/// going back at most 3 weeks, with rich joined data.
pub async fn fetch_confirmed_events(
    pool: &PgPool,
    volunteer_id: Uuid,
) -> sqlx::Result<Vec<ConfirmedShiftEvent>> {
    sqlx::query_as::<_, ConfirmedShiftEvent>(
        r#"
        SELECT
            s.id            AS shift_id,
            s.title,
            s.description,
            s.specific_requests,
            s.parking_notes,
            s.meeting_notes,
            s.start_at,
            s.end_at,
            s.slots_requested,
            s.requires_police_check,
            s.requires_vulnerable_check,
            a.name          AS agency_name,
            si.name         AS site_name,
            si.address      AS site_address,
            r.name          AS region_name,
            c.name          AS contact_name,
            c.title         AS contact_title,
            CASE WHEN c.phone_visibility = 'visible' THEN c.phone ELSE NULL END AS contact_phone,
            CASE WHEN c.email_visibility = 'visible' THEN c.email ELSE NULL END AS contact_email,
            sa.id           AS assignment_id,
            sa.volunteer_id,
            sa.status::text AS assignment_status,
            s.recurrence_seq,
            s.inherited_from_shift_id,
            (
                SELECT string_agg(
                    vp.volunteer_names || ' (' ||
                    COALESCE(
                        (SELECT string_agg(d.name, ', ' ORDER BY d.name)
                         FROM unnest(sa2.dog_ids) did
                         JOIN dogs d ON d.id = did),
                        'no dog listed'
                    ) || ')',
                    '; ' ORDER BY vp.volunteer_names
                )
                FROM shift_assignments sa2
                JOIN volunteer_profiles vp ON vp.user_id = sa2.volunteer_id
                WHERE sa2.shift_id = s.id
                  AND sa2.status IN ('confirmed', 'pending_confirmation')
                  AND sa2.volunteer_id <> $1
            ) AS teammates
        FROM shift_assignments sa
        JOIN shifts s           ON s.id = sa.shift_id
        JOIN agencies a         ON a.id = s.agency_id
        JOIN sites si           ON si.id = s.site_id
        LEFT JOIN regions r     ON r.id = si.region_id
        LEFT JOIN contacts c    ON c.id = s.contact_id
        WHERE sa.volunteer_id = $1
          AND sa.status IN ('confirmed', 'pending_confirmation')
          AND s.end_at > (now() - INTERVAL '21 days')
        ORDER BY s.start_at ASC
        "#,
    )
    .bind(volunteer_id)
    .fetch_all(pool)
    .await
}

/// One row per available shift (open slots, published state) for feed generation.
#[derive(Debug, Clone, FromRow)]
pub struct AvailableShiftEvent {
    pub shift_id: Uuid,
    pub title: String,
    pub description: Option<String>,
    pub specific_requests: Option<String>,
    pub meeting_notes: Option<String>,
    pub parking_notes: Option<String>,
    pub start_at: DateTime<Utc>,
    pub end_at: DateTime<Utc>,
    pub slots_requested: i32,
    pub slots_confirmed: i64,
    pub requires_police_check: bool,
    pub requires_vulnerable_check: bool,
    pub agency_name: String,
    pub agency_type_name: Option<String>,
    pub site_name: String,
    pub site_address: Option<String>,
    pub region_name: Option<String>,
    pub region_slug: Option<String>,
    pub agency_type_slug: Option<String>,
    pub distance_km: Option<f64>,
}

/// Fetch available shifts applying the optional queryset + time-preference filters.
/// `location_geom` is passed as a WKT string when distance filtering is active.
pub async fn fetch_available_events(
    pool: &PgPool,
    follow_queryset: bool,
    queryset: Option<&SavedQueryset>,
    follow_preferred_times: bool,
    volunteer_id: Uuid,
) -> sqlx::Result<Vec<AvailableShiftEvent>> {
    // Build filter clauses dynamically. sqlx macro can't handle dynamic SQL so
    // we use query_as with runtime binding instead.

    // Resolve location for distance filtering
    let (loc_id, dist_km) = if follow_queryset {
        queryset
            .and_then(|q| q.location_id.zip(q.preferred_distance_km))
            .map(|(l, d)| (Some(l), Some(d)))
            .unwrap_or((None, None))
    } else {
        (None, None)
    };

    let region_filter = if follow_queryset {
        queryset.and_then(|q| q.region.as_deref())
    } else {
        None
    };

    let agency_type_filter = if follow_queryset {
        queryset.and_then(|q| q.agency_type.as_deref())
    } else {
        None
    };

    let open_only = follow_queryset && queryset.map(|q| q.open_only).unwrap_or(false);

    // We build this with a raw query because the filter set is dynamic.
    // Distance join is only included when a location is provided.
    let sql = format!(
        r#"
        SELECT
            s.id            AS shift_id,
            s.title,
            s.description,
            s.specific_requests,
            s.meeting_notes,
            s.parking_notes,
            s.start_at,
            s.end_at,
            s.slots_requested,
            COUNT(sa.id) FILTER (WHERE sa.status = 'confirmed') AS slots_confirmed,
            s.requires_police_check,
            s.requires_vulnerable_check,
            a.name          AS agency_name,
            at.name         AS agency_type_name,
            si.name         AS site_name,
            si.address      AS site_address,
            r.name          AS region_name,
            r.slug          AS region_slug,
            at.slug         AS agency_type_slug,
            {dist_expr}     AS distance_km
        FROM shifts s
        JOIN agencies a         ON a.id = s.agency_id
        LEFT JOIN agency_types at ON at.id = a.agency_type_id
        JOIN sites si           ON si.id = s.site_id
        LEFT JOIN regions r     ON r.id = si.region_id
        LEFT JOIN shift_assignments sa ON sa.shift_id = s.id AND sa.status = 'confirmed'
        {loc_join}
        WHERE s.state IN ('published', 'invite_only')
          AND s.end_at > (now() - INTERVAL '21 days')
          -- Exclude shifts the volunteer is already on
          AND NOT EXISTS (
              SELECT 1 FROM shift_assignments xa
              WHERE xa.shift_id = s.id AND xa.volunteer_id = $1
                AND xa.status NOT IN ('cancelled')
          )
          {region_clause}
          {agency_type_clause}
          {open_only_clause}
          {dist_clause}
          {time_pref_clause}
        GROUP BY s.id, a.name, at.name, at.slug, si.name, si.address, r.name, r.slug{dist_group}
        ORDER BY s.start_at ASC
        "#,
        dist_expr = if loc_id.is_some() {
            "ST_Distance(si.geom::geography, loc.geom::geography) / 1000.0"
        } else {
            "NULL::float8"
        },
        loc_join = if loc_id.is_some() {
            "JOIN volunteer_locations loc ON loc.id = $4"
        } else {
            ""
        },
        region_clause = if region_filter.is_some() {
            "AND r.slug = $2"
        } else {
            ""
        },
        agency_type_clause = if agency_type_filter.is_some() {
            "AND at.slug = $3"
        } else {
            ""
        },
        open_only_clause = if open_only {
            "AND (SELECT COUNT(*) FROM shift_assignments ox WHERE ox.shift_id = s.id AND ox.status = 'confirmed') < s.slots_requested"
        } else {
            ""
        },
        dist_clause = if loc_id.is_some() && dist_km.is_some() {
            "AND ST_Distance(si.geom::geography, loc.geom::geography) / 1000.0 <= $5"
        } else {
            ""
        },
        time_pref_clause = if follow_preferred_times {
            r#"AND EXISTS (
                SELECT 1 FROM volunteer_shift_time_preferences tp
                WHERE tp.user_id = $1
                  AND tp.is_preferred = true
                  AND tp.day_of_week = EXTRACT(DOW FROM s.start_at AT TIME ZONE 'America/Toronto')::int
                  AND tp.time_slot = CASE
                      WHEN EXTRACT(HOUR FROM s.start_at AT TIME ZONE 'America/Toronto') < 12 THEN 'morning'
                      WHEN EXTRACT(HOUR FROM s.start_at AT TIME ZONE 'America/Toronto') < 17 THEN 'afternoon'
                      ELSE 'evening'
                  END
            )"#
        } else {
            ""
        },
        dist_group = if loc_id.is_some() { ", loc.geom" } else { "" },
    );

    let mut q = sqlx::query_as::<_, AvailableShiftEvent>(&sql).bind(volunteer_id);

    if region_filter.is_some() {
        q = q.bind(region_filter.unwrap_or(""));
    }
    if agency_type_filter.is_some() {
        q = q.bind(agency_type_filter.unwrap_or(""));
    }
    if let Some(lid) = loc_id {
        q = q.bind(lid);
    }
    if let (Some(_), Some(d)) = (loc_id, dist_km) {
        q = q.bind(d);
    }

    q.fetch_all(pool).await
}

/// One row per shift for an agency contact's calendar.
#[derive(Debug, Clone, FromRow)]
pub struct AgencyShiftEvent {
    pub shift_id: Uuid,
    pub title: String,
    pub description: Option<String>,
    pub specific_requests: Option<String>,
    pub parking_notes: Option<String>,
    pub meeting_notes: Option<String>,
    pub start_at: DateTime<Utc>,
    pub end_at: DateTime<Utc>,
    pub slots_requested: i32,
    pub slots_confirmed: i64,
    pub slots_waitlisted: i64,
    pub state: String,
    pub agency_name: String,
    pub site_name: String,
    pub site_address: Option<String>,
    pub region_name: Option<String>,
    pub requires_police_check: bool,
    pub requires_vulnerable_check: bool,
    pub inherited_from_shift_id: Option<Uuid>,
    /// All confirmed volunteers as "Name (Dog, Dog)" aggregated in SQL
    pub confirmed_volunteers: Option<String>,
}

pub async fn fetch_agency_events(
    pool: &PgPool,
    user_id: Uuid,
) -> sqlx::Result<Vec<AgencyShiftEvent>> {
    sqlx::query_as::<_, AgencyShiftEvent>(
        r#"
        SELECT
            s.id            AS shift_id,
            s.title,
            s.description,
            s.specific_requests,
            s.parking_notes,
            s.meeting_notes,
            s.start_at,
            s.end_at,
            s.slots_requested,
            COALESCE(COUNT(sa.id) FILTER (WHERE sa.status = 'confirmed'), 0)   AS slots_confirmed,
            COALESCE(COUNT(sa.id) FILTER (WHERE sa.status = 'waitlisted'), 0)  AS slots_waitlisted,
            s.state::text   AS state,
            a.name          AS agency_name,
            si.name         AS site_name,
            si.address      AS site_address,
            r.name          AS region_name,
            s.requires_police_check,
            s.requires_vulnerable_check,
            s.inherited_from_shift_id,
            (
                SELECT string_agg(
                    vp.volunteer_names || ' (' ||
                    COALESCE(
                        (SELECT string_agg(d.name, ', ' ORDER BY d.name)
                         FROM unnest(sa2.dog_ids) did
                         JOIN dogs d ON d.id = did),
                        'no dog listed'
                    ) || ')',
                    '; ' ORDER BY vp.volunteer_names
                )
                FROM shift_assignments sa2
                JOIN volunteer_profiles vp ON vp.user_id = sa2.volunteer_id
                WHERE sa2.shift_id = s.id AND sa2.status IN ('confirmed', 'pending_confirmation')
            ) AS confirmed_volunteers
        FROM contacts c
        JOIN agencies a ON a.id = c.agency_id
        JOIN shifts s ON s.agency_id = a.id
        JOIN sites si ON si.id = s.site_id
        LEFT JOIN regions r ON r.id = si.region_id
        LEFT JOIN shift_assignments sa ON sa.shift_id = s.id
        WHERE c.user_id = $1
          AND s.state IN ('published', 'invite_only', 'hidden', 'archived')
          AND s.end_at > (now() - INTERVAL '21 days')
        GROUP BY s.id, a.name, si.name, si.address, r.name
        ORDER BY s.start_at ASC
        "#,
    )
    .bind(user_id)
    .fetch_all(pool)
    .await
}

/// One row per shift for the admin global calendar.
#[derive(Debug, Clone, FromRow)]
pub struct AdminShiftEvent {
    pub shift_id: Uuid,
    pub title: String,
    pub description: Option<String>,
    pub specific_requests: Option<String>,
    pub parking_notes: Option<String>,
    pub meeting_notes: Option<String>,
    pub start_at: DateTime<Utc>,
    pub end_at: DateTime<Utc>,
    pub slots_requested: i32,
    pub slots_confirmed: i64,
    pub slots_waitlisted: i64,
    pub state: String,
    pub agency_name: String,
    pub agency_type_name: Option<String>,
    pub site_name: String,
    pub site_address: Option<String>,
    pub region_name: Option<String>,
    pub requires_police_check: bool,
    pub requires_vulnerable_check: bool,
    pub inherited_from_shift_id: Option<Uuid>,
    pub contact_name: Option<String>,
    pub contact_phone: Option<String>,
    pub contact_email: Option<String>,
    pub confirmed_volunteers: Option<String>,
}

pub async fn fetch_admin_events(pool: &PgPool) -> sqlx::Result<Vec<AdminShiftEvent>> {
    sqlx::query_as::<_, AdminShiftEvent>(
        r#"
        SELECT
            s.id            AS shift_id,
            s.title,
            s.description,
            s.specific_requests,
            s.parking_notes,
            s.meeting_notes,
            s.start_at,
            s.end_at,
            s.slots_requested,
            COALESCE(COUNT(sa.id) FILTER (WHERE sa.status = 'confirmed'), 0)   AS slots_confirmed,
            COALESCE(COUNT(sa.id) FILTER (WHERE sa.status = 'waitlisted'), 0)  AS slots_waitlisted,
            s.state::text   AS state,
            a.name          AS agency_name,
            at.name         AS agency_type_name,
            si.name         AS site_name,
            si.address      AS site_address,
            r.name          AS region_name,
            s.requires_police_check,
            s.requires_vulnerable_check,
            s.inherited_from_shift_id,
            c.name          AS contact_name,
            c.phone         AS contact_phone,
            c.email         AS contact_email,
            (
                SELECT string_agg(
                    vp.volunteer_names || ' (' ||
                    COALESCE(
                        (SELECT string_agg(d.name, ', ' ORDER BY d.name)
                         FROM unnest(sa2.dog_ids) did
                         JOIN dogs d ON d.id = did),
                        'no dog listed'
                    ) || ')',
                    '; ' ORDER BY vp.volunteer_names
                )
                FROM shift_assignments sa2
                JOIN volunteer_profiles vp ON vp.user_id = sa2.volunteer_id
                WHERE sa2.shift_id = s.id AND sa2.status IN ('confirmed', 'pending_confirmation')
            ) AS confirmed_volunteers
        FROM shifts s
        JOIN agencies a         ON a.id = s.agency_id
        LEFT JOIN agency_types at ON at.id = a.agency_type_id
        JOIN sites si           ON si.id = s.site_id
        LEFT JOIN regions r     ON r.id = si.region_id
        LEFT JOIN contacts c    ON c.id = s.contact_id
        LEFT JOIN shift_assignments sa ON sa.shift_id = s.id
        WHERE s.state IN ('published', 'invite_only', 'hidden', 'archived', 'pending_approval')
          AND s.end_at > (now() - INTERVAL '21 days')
        GROUP BY s.id, a.name, at.name, at.slug, si.name, si.address, r.name, c.name, c.phone, c.email
        ORDER BY s.start_at ASC
        "#,
    )
    .fetch_all(pool)
    .await
}

// ─── iCal builder ────────────────────────────────────────────────────────────

/// RFC 5545–compliant iCalendar builder.
/// Handles line folding, value escaping, and CRLF line endings.
pub struct IcalBuilder {
    lines: Vec<String>,
}

impl IcalBuilder {
    pub fn new(cal_name: &str, cal_desc: &str) -> Self {
        let mut b = IcalBuilder { lines: Vec::new() };
        b.raw("BEGIN:VCALENDAR");
        b.raw("VERSION:2.0");
        b.raw("PRODID:-//Sunshine//Sunshine Volunteer Platform//EN");
        b.raw("CALSCALE:GREGORIAN");
        b.raw("METHOD:PUBLISH");
        b.prop("X-WR-CALNAME", cal_name);
        b.prop("X-WR-CALDESC", cal_desc);
        b.raw("X-WR-TIMEZONE:America/Toronto");
        b
    }

    /// Append a raw unfolded line (caller must ensure ≤75 octets or use `prop`).
    fn raw(&mut self, s: &str) {
        self.lines.push(s.to_string());
    }

    /// Append a property line, escaping the value and folding if needed.
    pub fn prop(&mut self, name: &str, value: &str) {
        let escaped = ical_escape(value);
        let line = format!("{}:{}", name, escaped);
        self.lines.push(fold_line(&line));
    }

    /// Append a DTSTART or DTEND in UTC format.
    pub fn dt(&mut self, name: &str, dt: DateTime<Utc>) {
        self.lines.push(format!(
            "{}:{:04}{:02}{:02}T{:02}{:02}{:02}Z",
            name,
            dt.year(), dt.month(), dt.day(),
            dt.hour(), dt.minute(), dt.second(),
        ));
    }

    pub fn begin_event(&mut self) {
        self.raw("BEGIN:VEVENT");
    }

    pub fn end_event(&mut self) {
        self.raw("END:VEVENT");
    }

    /// Render the full calendar as a CRLF-terminated string.
    pub fn finish(mut self) -> String {
        self.raw("END:VCALENDAR");
        // RFC 5545 mandates CRLF line endings
        self.lines.join("\r\n") + "\r\n"
    }
}

/// Escape special characters in iCal property values per RFC 5545 §3.3.11.
fn ical_escape(s: &str) -> String {
    s.replace('\\', "\\\\")
        .replace(';', "\\;")
        .replace(',', "\\,")
        .replace('\n', "\\n")
        .replace('\r', "")
}

/// Fold a line that exceeds 75 octets per RFC 5545 §3.1.
/// Continuation lines start with a single SPACE.
fn fold_line(line: &str) -> String {
    let bytes = line.as_bytes();
    if bytes.len() <= 75 {
        return line.to_string();
    }
    let mut result = String::new();
    let mut pos = 0usize;
    let mut first = true;
    while pos < bytes.len() {
        let limit = if first { 75 } else { 74 }; // 74 + leading space = 75
        // Find a safe UTF-8 boundary within limit bytes
        let end = (pos + limit).min(bytes.len());
        let mut split = end;
        while split > pos && !line.is_char_boundary(split) {
            split -= 1;
        }
        if !first {
            result.push(' ');
        }
        result.push_str(&line[pos..split]);
        result.push_str("\r\n");
        pos = split;
        first = false;
    }
    // Remove the trailing CRLF — IcalBuilder.finish() adds them via join
    if result.ends_with("\r\n") {
        result.truncate(result.len() - 2);
    }
    result
}

/// Build a Google Maps navigation URL for an address string.
pub fn maps_url(address: &str) -> String {
    let encoded = address
        .replace(' ', "+")
        .replace(',', "%2C")
        .replace('&', "%26");
    format!("https://maps.google.com/maps?q={}", encoded)
}

// ─── Per-feed iCal generators ─────────────────────────────────────────────────

pub fn build_confirmed_ical(
    events: &[ConfirmedShiftEvent],
    volunteer_name: &str,
    app_url: &str,
) -> String {
    let mut cal = IcalBuilder::new(
        &format!("{}'s Confirmed Shifts", volunteer_name),
        "Your confirmed Sunshine volunteer shifts",
    );

    for ev in events {
        cal.begin_event();
        cal.prop(
            "UID",
            &format!("confirmed-{}@sunshine", ev.assignment_id),
        );
        cal.dt("DTSTART", ev.start_at);
        cal.dt("DTEND", ev.end_at);
        cal.prop("SUMMARY", &format!("{} — {}", ev.agency_name, ev.title));
        cal.prop("STATUS", "CONFIRMED");
        cal.prop(
            "CATEGORIES",
            if ev.assignment_status == "pending_confirmation" {
                "Pending Confirmation"
            } else {
                "Confirmed Shift"
            },
        );
        // LOCATION
        if let Some(addr) = &ev.site_address {
            cal.prop("LOCATION", addr);
        }
        // URL to shift detail page
        cal.prop("URL", &format!("{}/volunteer/shifts/{}", app_url, ev.shift_id));
        // Rich DESCRIPTION
        cal.prop("DESCRIPTION", &build_confirmed_description(ev, app_url));

        // DTSTAMP (required by RFC 5545)
        cal.dt("DTSTAMP", Utc::now());
        cal.end_event();
    }

    cal.finish()
}

fn build_confirmed_description(ev: &ConfirmedShiftEvent, app_url: &str) -> String {
    let mut parts: Vec<String> = Vec::new();

    parts.push(format!("Agency: {}", ev.agency_name));
    parts.push(format!("Site: {}", ev.site_name));

    if let Some(addr) = &ev.site_address {
        parts.push(format!("Address: {}", addr));
        parts.push(format!("Directions: {}", maps_url(addr)));
    }
    if let Some(r) = &ev.region_name {
        parts.push(format!("Region: {}", r));
    }

    parts.push(String::new()); // blank line

    if let Some(notes) = &ev.meeting_notes {
        if !notes.trim().is_empty() {
            parts.push(format!("Meeting instructions: {}", notes));
        }
    }
    if let Some(notes) = &ev.parking_notes {
        if !notes.trim().is_empty() {
            parts.push(format!("Parking: {}", notes));
        }
    }
    if let Some(req) = &ev.specific_requests {
        if !req.trim().is_empty() {
            parts.push(format!("Special requests: {}", req));
        }
    }
    if let Some(desc) = &ev.description {
        if !desc.trim().is_empty() {
            parts.push(format!("Notes: {}", desc));
        }
    }

    // Compliance flags
    let mut flags: Vec<&str> = Vec::new();
    if ev.requires_police_check { flags.push("Police check required"); }
    if ev.requires_vulnerable_check { flags.push("Vulnerable sector check required"); }
    if !flags.is_empty() {
        parts.push(String::new());
        parts.push(format!("Requirements: {}", flags.join(", ")));
    }

    // Contact info
    parts.push(String::new());
    if ev.contact_name.is_some() || ev.contact_phone.is_some() || ev.contact_email.is_some() {
        parts.push("Agency contact:".to_string());
        if let Some(n) = &ev.contact_name {
            let title_suffix = ev.contact_title.as_deref()
                .map(|t| format!(", {}", t))
                .unwrap_or_default();
            parts.push(format!("  {}{}", n, title_suffix));
        }
        if let Some(p) = &ev.contact_phone {
            parts.push(format!("  Phone: {}", p));
        }
        if let Some(e) = &ev.contact_email {
            parts.push(format!("  Email: {}", e));
        }
    }

    // Team
    parts.push(String::new());
    if let Some(teammates) = &ev.teammates {
        if !teammates.trim().is_empty() {
            parts.push(format!("Your team:\n  {}", teammates.replace("; ", "\n  ")));
        }
    } else {
        parts.push("Team: You are the only confirmed volunteer so far.".to_string());
    }

    parts.push(String::new());
    parts.push(format!("View shift: {}/volunteer/shifts/{}", app_url, ev.shift_id));

    parts.join("\n")
}

pub fn build_available_ical(
    events: &[AvailableShiftEvent],
    volunteer_name: &str,
    app_url: &str,
    follow_queryset: bool,
    queryset_name: Option<&str>,
    follow_preferred_times: bool,
) -> String {
    // Build a subtitle describing which filters are active
    let filter_note = match (follow_queryset && queryset_name.is_some(), follow_preferred_times) {
        (true, true) => format!(
            "Filtered by queryset \"{}\" and your preferred times",
            queryset_name.unwrap()
        ),
        (true, false) => format!("Filtered by queryset \"{}\"", queryset_name.unwrap()),
        (false, true) => "Filtered by your preferred times".to_string(),
        (false, false) => "All open published shifts".to_string(),
    };

    let mut cal = IcalBuilder::new(
        &format!("{}'s Available Shifts", volunteer_name),
        &format!("Open Sunshine volunteer shifts. {}", filter_note),
    );

    for ev in events {
        let open_slots = ev.slots_requested - ev.slots_confirmed as i32;
        cal.begin_event();
        cal.prop("UID", &format!("available-{}@sunshine", ev.shift_id));
        cal.dt("DTSTART", ev.start_at);
        cal.dt("DTEND", ev.end_at);
        cal.prop(
            "SUMMARY",
            &format!(
                "[OPEN] {} — {} ({} spot{})",
                ev.agency_name,
                ev.title,
                open_slots,
                if open_slots == 1 { "" } else { "s" }
            ),
        );
        cal.prop("STATUS", "TENTATIVE");
        cal.prop("CATEGORIES", "Available Shift");
        if let Some(addr) = &ev.site_address {
            cal.prop("LOCATION", addr);
        }
        cal.prop("URL", &format!("{}/volunteer/shifts/{}", app_url, ev.shift_id));
        cal.prop("DESCRIPTION", &build_available_description(ev, app_url));
        cal.dt("DTSTAMP", Utc::now());
        cal.end_event();
    }

    cal.finish()
}

fn build_available_description(ev: &AvailableShiftEvent, app_url: &str) -> String {
    let mut parts: Vec<String> = Vec::new();
    let open = ev.slots_requested - ev.slots_confirmed as i32;

    parts.push(format!(
        "{} of {} spot{} remaining",
        open,
        ev.slots_requested,
        if ev.slots_requested == 1 { "" } else { "s" }
    ));
    if let Some(t) = &ev.agency_type_name {
        parts.push(format!("Type: {}", t));
    }
    parts.push(format!("Site: {}", ev.site_name));
    if let Some(addr) = &ev.site_address {
        parts.push(format!("Address: {}", addr));
        parts.push(format!("Directions: {}", maps_url(addr)));
    }
    if let Some(r) = &ev.region_name {
        parts.push(format!("Region: {}", r));
    }
    if let Some(d) = ev.distance_km {
        parts.push(format!("Distance: {:.1} km from your location", d));
    }

    parts.push(String::new());

    if let Some(notes) = &ev.meeting_notes {
        if !notes.trim().is_empty() {
            parts.push(format!("Meeting instructions: {}", notes));
        }
    }
    if let Some(notes) = &ev.parking_notes {
        if !notes.trim().is_empty() {
            parts.push(format!("Parking: {}", notes));
        }
    }
    if let Some(req) = &ev.specific_requests {
        if !req.trim().is_empty() {
            parts.push(format!("Special requests: {}", req));
        }
    }
    if let Some(desc) = &ev.description {
        if !desc.trim().is_empty() {
            parts.push(format!("Notes: {}", desc));
        }
    }

    let mut flags: Vec<&str> = Vec::new();
    if ev.requires_police_check { flags.push("Police check required"); }
    if ev.requires_vulnerable_check { flags.push("Vulnerable sector check required"); }
    if !flags.is_empty() {
        parts.push(String::new());
        parts.push(format!("Requirements: {}", flags.join(", ")));
    }

    parts.push(String::new());
    parts.push(format!("Sign up: {}/volunteer/shifts/{}", app_url, ev.shift_id));

    parts.join("\n")
}

pub fn build_agency_ical(
    events: &[AgencyShiftEvent],
    agency_name: &str,
    app_url: &str,
) -> String {
    let mut cal = IcalBuilder::new(
        &format!("{} — Upcoming Shifts", agency_name),
        &format!("Scheduled volunteer shifts for {}", agency_name),
    );

    for ev in events {
        let open_slots = ev.slots_requested - ev.slots_confirmed as i32;
        let is_filled = open_slots <= 0;
        let has_pending_changes = ev.inherited_from_shift_id.is_some();

        let status_tag = if has_pending_changes {
            "⚠ Needs Review"
        } else if is_filled {
            "✓ Filled"
        } else {
            "○ Open"
        };

        cal.begin_event();
        cal.prop("UID", &format!("agency-shift-{}@sunshine", ev.shift_id));
        cal.dt("DTSTART", ev.start_at);
        cal.dt("DTEND", ev.end_at);
        cal.prop(
            "SUMMARY",
            &format!(
                "[{}] {} ({}/{})",
                status_tag, ev.title, ev.slots_confirmed, ev.slots_requested
            ),
        );
        cal.prop("STATUS", "CONFIRMED");
        cal.prop(
            "CATEGORIES",
            if has_pending_changes {
                "Needs Review"
            } else if is_filled {
                "Filled"
            } else {
                "Open"
            },
        );
        if let Some(addr) = &ev.site_address {
            cal.prop("LOCATION", addr);
        }
        cal.prop("URL", &format!("{}/agency/shifts/{}", app_url, ev.shift_id));
        cal.prop("DESCRIPTION", &build_agency_description(ev, app_url));
        cal.dt("DTSTAMP", Utc::now());
        cal.end_event();
    }

    cal.finish()
}

fn build_agency_description(ev: &AgencyShiftEvent, app_url: &str) -> String {
    let mut parts: Vec<String> = Vec::new();

    let open = ev.slots_requested - ev.slots_confirmed as i32;
    parts.push(format!(
        "Fill status: {}/{} confirmed{}",
        ev.slots_confirmed,
        ev.slots_requested,
        if ev.slots_waitlisted > 0 {
            format!(", {} on waitlist", ev.slots_waitlisted)
        } else {
            String::new()
        }
    ));
    if ev.inherited_from_shift_id.is_some() {
        parts.push("⚠ This shift has pending change requests that need review.".to_string());
    }
    if open > 0 {
        parts.push(format!("{} open spot{}", open, if open == 1 { "" } else { "s" }));
    }

    parts.push(String::new());
    parts.push(format!("Site: {}", ev.site_name));
    if let Some(addr) = &ev.site_address {
        parts.push(format!("Address: {}", addr));
        parts.push(format!("Directions: {}", maps_url(addr)));
    }
    if let Some(r) = &ev.region_name {
        parts.push(format!("Region: {}", r));
    }

    parts.push(String::new());
    if let Some(notes) = &ev.meeting_notes {
        if !notes.trim().is_empty() {
            parts.push(format!("Meeting instructions: {}", notes));
        }
    }
    if let Some(notes) = &ev.parking_notes {
        if !notes.trim().is_empty() {
            parts.push(format!("Parking: {}", notes));
        }
    }
    if let Some(req) = &ev.specific_requests {
        if !req.trim().is_empty() {
            parts.push(format!("Special requests: {}", req));
        }
    }
    if let Some(desc) = &ev.description {
        if !desc.trim().is_empty() {
            parts.push(format!("Notes: {}", desc));
        }
    }

    let mut flags: Vec<&str> = Vec::new();
    if ev.requires_police_check { flags.push("Police check required"); }
    if ev.requires_vulnerable_check { flags.push("Vulnerable sector check required"); }
    if !flags.is_empty() {
        parts.push(String::new());
        parts.push(format!("Requirements: {}", flags.join(", ")));
    }

    // Confirmed volunteers
    parts.push(String::new());
    if let Some(vols) = &ev.confirmed_volunteers {
        if !vols.trim().is_empty() {
            parts.push("Confirmed volunteers:".to_string());
            for line in vols.split("; ") {
                parts.push(format!("  • {}", line));
            }
        }
    } else {
        parts.push("No confirmed volunteers yet.".to_string());
    }

    parts.push(String::new());
    parts.push(format!("View shift: {}/agency/shifts/{}", app_url, ev.shift_id));

    parts.join("\n")
}

pub fn build_admin_ical(events: &[AdminShiftEvent], app_url: &str) -> String {
    let mut cal = IcalBuilder::new(
        "Sunshine — All Shifts",
        "Global Sunshine shift calendar. ✓ Filled | ○ Open | ⚠ Needs Attention",
    );

    for ev in events {
        let open_slots = ev.slots_requested - ev.slots_confirmed as i32;
        let needs_attention =
            ev.inherited_from_shift_id.is_some() || ev.state == "pending_approval";
        let is_filled = open_slots <= 0;

        let (status_tag, category, color) = if needs_attention {
            ("⚠", "Needs Attention", "#F59E0B") // amber
        } else if is_filled {
            ("✓", "Filled", "#10B981") // green
        } else {
            ("○", "Unfilled", "#6366F1") // indigo
        };

        cal.begin_event();
        cal.prop("UID", &format!("admin-shift-{}@sunshine", ev.shift_id));
        cal.dt("DTSTART", ev.start_at);
        cal.dt("DTEND", ev.end_at);
        cal.prop(
            "SUMMARY",
            &format!(
                "[{}] {} — {} ({}/{})",
                status_tag, ev.agency_name, ev.title,
                ev.slots_confirmed, ev.slots_requested
            ),
        );
        cal.prop("STATUS", "CONFIRMED");
        cal.prop("CATEGORIES", category);
        // RFC 7986 COLOR property — supported by Apple Calendar and some others
        cal.prop("COLOR", color);
        // Apple-specific colour hint
        cal.prop("X-APPLE-CALENDAR-COLOR", color);
        if let Some(addr) = &ev.site_address {
            cal.prop("LOCATION", addr);
        }
        cal.prop("URL", &format!("{}/admin/shifts/{}", app_url, ev.shift_id));
        cal.prop("DESCRIPTION", &build_admin_description(ev, app_url));
        cal.dt("DTSTAMP", Utc::now());
        cal.end_event();
    }

    cal.finish()
}

fn build_admin_description(ev: &AdminShiftEvent, app_url: &str) -> String {
    let mut parts: Vec<String> = Vec::new();

    let open = ev.slots_requested - ev.slots_confirmed as i32;
    parts.push(format!(
        "Fill status: {}/{} confirmed{}",
        ev.slots_confirmed,
        ev.slots_requested,
        if ev.slots_waitlisted > 0 {
            format!(", {} on waitlist", ev.slots_waitlisted)
        } else {
            String::new()
        }
    ));
    if ev.state == "pending_approval" {
        parts.push("⚠ Awaiting admin approval".to_string());
    }
    if ev.inherited_from_shift_id.is_some() {
        parts.push("⚠ Has pending change request".to_string());
    }
    if let Some(t) = &ev.agency_type_name {
        parts.push(format!("Agency type: {}", t));
    }

    parts.push(String::new());
    parts.push(format!("Site: {}", ev.site_name));
    if let Some(addr) = &ev.site_address {
        parts.push(format!("Address: {}", addr));
        parts.push(format!("Directions: {}", maps_url(addr)));
    }
    if let Some(r) = &ev.region_name {
        parts.push(format!("Region: {}", r));
    }

    parts.push(String::new());
    if let Some(notes) = &ev.meeting_notes {
        if !notes.trim().is_empty() {
            parts.push(format!("Meeting instructions: {}", notes));
        }
    }
    if let Some(notes) = &ev.parking_notes {
        if !notes.trim().is_empty() {
            parts.push(format!("Parking: {}", notes));
        }
    }
    if let Some(req) = &ev.specific_requests {
        if !req.trim().is_empty() {
            parts.push(format!("Special requests: {}", req));
        }
    }
    if let Some(desc) = &ev.description {
        if !desc.trim().is_empty() {
            parts.push(format!("Notes: {}", desc));
        }
    }

    // Agency contact (admins always see everything)
    parts.push(String::new());
    if let Some(n) = &ev.contact_name {
        parts.push(format!("Agency contact: {}", n));
        if let Some(p) = &ev.contact_phone {
            parts.push(format!("  Phone: {}", p));
        }
        if let Some(e) = &ev.contact_email {
            parts.push(format!("  Email: {}", e));
        }
    }

    let mut flags: Vec<&str> = Vec::new();
    if ev.requires_police_check { flags.push("Police check"); }
    if ev.requires_vulnerable_check { flags.push("Vulnerable sector check"); }
    if !flags.is_empty() {
        parts.push(String::new());
        parts.push(format!("Requirements: {}", flags.join(", ")));
    }

    // Confirmed volunteers
    parts.push(String::new());
    if let Some(vols) = &ev.confirmed_volunteers {
        if !vols.trim().is_empty() {
            parts.push("Confirmed volunteers:".to_string());
            for line in vols.split("; ") {
                parts.push(format!("  • {}", line));
            }
        }
    } else {
        parts.push("No confirmed volunteers yet.".to_string());
    }

    parts.push(String::new());
    parts.push(format!("Admin view: {}/admin/shifts/{}", app_url, ev.shift_id));

    parts.join("\n")
}
