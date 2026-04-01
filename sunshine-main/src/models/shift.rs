use chrono::{DateTime, Datelike, Duration, NaiveTime, TimeZone, Timelike, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, PgPool};
use uuid::Uuid;

#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::Type, PartialEq)]
#[sqlx(type_name = "shift_state", rename_all = "snake_case")]
#[serde(rename_all = "snake_case")]
pub enum ShiftState {
    Draft,
    PendingApproval,
    Published,
    InviteOnly,
    Hidden,
    Archived,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::Type, PartialEq)]
#[sqlx(type_name = "assignment_status", rename_all = "snake_case")]
#[serde(rename_all = "snake_case")]
pub enum AssignmentStatus {
    Confirmed,
    Waitlisted,
    PendingConfirmation,
    Cancelled,
}

#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Shift {
    pub id: Uuid,
    pub agency_id: Uuid,
    pub site_id: Uuid,
    pub contact_id: Option<Uuid>,
    pub title: String,
    pub description: Option<String>,
    pub specific_requests: Option<String>,
    pub parking_notes: Option<String>,
    pub meeting_notes: Option<String>,
    pub start_at: DateTime<Utc>,
    pub end_at: DateTime<Utc>,
    pub slots_requested: i32,
    pub estimated_clients: Option<i32>,
    pub state: ShiftState,
    pub requires_police_check: bool,
    pub requires_vulnerable_check: bool,
    pub recurrence_rule: Option<String>,
    pub recurrence_parent_id: Option<Uuid>,
    pub recurrence_seq: Option<i32>,
    pub inherited_from_shift_id: Option<Uuid>,
    pub created_by: Uuid,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// Enriched shift listing card (joined with agency, site, assignment counts).
#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct ShiftListItem {
    pub id: Uuid,
    pub title: String,
    pub start_at: DateTime<Utc>,
    pub end_at: DateTime<Utc>,
    pub slots_requested: i32,
    pub slots_confirmed: i64,
    pub state: ShiftState,
    pub requires_police_check: bool,
    pub requires_vulnerable_check: bool,
    // Agency
    pub agency_name: String,
    pub agency_type_name: Option<String>,
    // Site
    pub site_name: String,
    pub region_name: Option<String>,
    pub distance_km: Option<f64>,
}

#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct ShiftAssignment {
    pub id: Uuid,
    pub shift_id: Uuid,
    pub volunteer_id: Uuid,
    pub dog_ids: Vec<Uuid>,
    pub status: AssignmentStatus,
    pub waitlist_position: Option<i32>,
    pub confirmation_deadline_at: Option<DateTime<Utc>>,
    pub assigned_at: DateTime<Utc>,
}

// ─── Deadline utilities ───────────────────────────────────────────────────────

/// Business hours window: 08:00–19:00, 7 days a week.
const BIZ_START_HOUR: u32 = 8;
const BIZ_END_HOUR: u32 = 19;

/// Advance `from` by `minutes` of business time (08:00–19:00 in the system timezone).
/// Times outside the window are snapped forward to the next opening.
///
/// Returns a UTC timestamp.
pub fn add_business_minutes(from: DateTime<Utc>, minutes: i64, tz: chrono_tz::Tz) -> DateTime<Utc> {
    let biz_start = NaiveTime::from_hms_opt(BIZ_START_HOUR, 0, 0).unwrap();
    let biz_end   = NaiveTime::from_hms_opt(BIZ_END_HOUR, 0, 0).unwrap();
    let biz_mins_per_day = (BIZ_END_HOUR - BIZ_START_HOUR) as i64 * 60;

    // Work in the local timezone
    let local = from.with_timezone(&tz);
    let mut current = local;

    // Snap to the next business window if outside
    let time_of_day = current.time();
    if time_of_day < biz_start {
        // Before opening — jump to 08:00 today
        current = tz
            .from_local_datetime(&current.date_naive().and_time(biz_start))
            .earliest()
            .unwrap_or(current);
    } else if time_of_day >= biz_end {
        // After closing — jump to 08:00 tomorrow
        let next_date = current.date_naive() + Duration::days(1);
        current = tz
            .from_local_datetime(&next_date.and_time(biz_start))
            .earliest()
            .unwrap_or(current + Duration::days(1));
    }

    let mut remaining = minutes;
    loop {
        let mins_from_open = (current.hour() * 60 + current.minute()) as i64
            - (BIZ_START_HOUR * 60) as i64;
        let mins_left_today = biz_mins_per_day - mins_from_open;

        if remaining <= mins_left_today {
            return (current + Duration::minutes(remaining)).with_timezone(&Utc);
        }

        remaining -= mins_left_today;
        let next_date = current.date_naive() + Duration::days(1);
        current = tz
            .from_local_datetime(&next_date.and_time(biz_start))
            .earliest()
            .unwrap_or(current + Duration::days(1));
    }
}

/// Calculate the confirmation deadline for a waitlist promotion.
///
/// - If shift is ≥ 48 hours away: 12 wall-clock hours from now.
/// - If shift is < 48 hours away: 1 business hour (08:00–19:00 in system TZ).
pub fn confirmation_deadline(
    promoted_at: DateTime<Utc>,
    shift_start: DateTime<Utc>,
    tz: chrono_tz::Tz,
) -> DateTime<Utc> {
    if shift_start - promoted_at >= Duration::hours(48) {
        promoted_at + Duration::hours(12)
    } else {
        add_business_minutes(promoted_at, 60, tz)
    }
}

// ─── Waitlist promotion ───────────────────────────────────────────────────────

/// Promote the next waitlisted volunteer to `pending_confirmation`.
///
/// Uses a serializable transaction with row locking to prevent double-promotion.
/// Enqueues:
/// - A `check_confirmation_deadline` task at the deadline
/// - A `send_in_app_notification` task (immediate)
/// - A `send_email_waitlist_promoted` task (immediate)
///
/// Returns the promoted `assignment_id`, or `None` if the shift is full
/// or no one is waiting.
pub async fn promote_next_waitlisted(
    pool: &PgPool,
    shift_id: Uuid,
    app_url: &str,
) -> anyhow::Result<Option<Uuid>> {
    let mut tx = pool.begin().await?;

    // Lock the shift row to serialise concurrent promotions
    let shift_row: Option<(i32, String, String, DateTime<Utc>)> = sqlx::query_as(
        r#"
        SELECT s.slots_requested, s.title, a.name AS agency_name, s.start_at
        FROM shifts s
        JOIN agencies a ON a.id = s.agency_id
        WHERE s.id = $1
        FOR UPDATE
        "#,
    )
    .bind(shift_id)
    .fetch_optional(&mut *tx)
    .await?;

    let Some((slots_requested, shift_title, agency_name, shift_start)) = shift_row else {
        return Ok(None);
    };

    // Count currently filled slots (confirmed + pending_confirmation)
    let filled: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM shift_assignments
         WHERE shift_id = $1 AND status IN ('confirmed', 'pending_confirmation')",
    )
    .bind(shift_id)
    .fetch_one(&mut *tx)
    .await?;

    if filled >= slots_requested as i64 {
        return Ok(None); // no vacancy
    }

    // Find the next waitlisted volunteer
    let next: Option<(Uuid, Uuid)> = sqlx::query_as(
        r#"
        SELECT id, volunteer_id FROM shift_assignments
        WHERE shift_id = $1 AND status = 'waitlisted'
        ORDER BY waitlist_position ASC NULLS LAST, assigned_at ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
        "#,
    )
    .bind(shift_id)
    .fetch_optional(&mut *tx)
    .await?;

    let Some((assignment_id, volunteer_id)) = next else {
        // No one on waitlist — alert admins
        sqlx::query(
            "INSERT INTO admin_alerts (alert_type, shift_id)
             VALUES ('shift_slot_unfilled', $1)",
        )
        .bind(shift_id)
        .execute(&mut *tx)
        .await?;

        // Enqueue admin notifications
        let manage_url = format!("{}/admin/shifts/{}/assignments", app_url, shift_id);
        let shift_date = shift_start.format("%b %-d, %Y").to_string();

        let _: Uuid = sqlx::query_scalar(
            "INSERT INTO task_queue (task_type, payload, scheduled_at, priority)
             VALUES ('send_email_shift_unfilled', $1, now(), 5)
             RETURNING id",
        )
        .bind(serde_json::json!({
            "shift_id": shift_id,
            "shift_title": shift_title,
            "agency_name": agency_name,
            "shift_date": shift_date,
            "manage_url": manage_url,
        }))
        .fetch_one(&mut *tx)
        .await?;

        tx.commit().await?;
        return Ok(None);
    };

    // Compute deadline using system timezone
    let tz_str: String = sqlx::query_scalar(
        "SELECT value FROM system_settings WHERE key = 'timezone'",
    )
    .fetch_optional(&mut *tx)
    .await?
    .unwrap_or_else(|| "UTC".to_string());

    let tz: chrono_tz::Tz = tz_str.parse().unwrap_or(chrono_tz::UTC);
    let now = Utc::now();
    let deadline = confirmation_deadline(now, shift_start, tz);
    let token = Uuid::new_v4().to_string();

    // Promote
    sqlx::query(
        r#"
        UPDATE shift_assignments
        SET status                  = 'pending_confirmation',
            confirmation_token      = $2,
            confirmation_deadline_at = $3,
            waitlist_position       = NULL,
            updated_at              = now()
        WHERE id = $1
        "#,
    )
    .bind(assignment_id)
    .bind(&token)
    .bind(deadline)
    .execute(&mut *tx)
    .await?;

    // Update the oldest open vacancy for this shift (if any) to 'inviting'
    sqlx::query(
        r#"
        UPDATE shift_vacancies SET status = 'inviting',
            invited_volunteer_id = $2, invited_at = now()
        WHERE id = (
            SELECT id FROM shift_vacancies
            WHERE shift_id = $1 AND status = 'open'
            ORDER BY created_at ASC LIMIT 1
        )
        "#,
    )
    .bind(shift_id)
    .bind(volunteer_id)
    .execute(&mut *tx)
    .await
    .ok(); // non-fatal — vacancies may not exist

    // Get volunteer contact info for notifications
    let vol_info: Option<(String, String)> = sqlx::query_as(
        "SELECT vp.volunteer_names, u.email FROM volunteer_profiles vp
         JOIN users u ON u.id = vp.user_id
         WHERE vp.user_id = $1",
    )
    .bind(volunteer_id)
    .fetch_optional(&mut *tx)
    .await?;

    let (volunteer_name, vol_email) = vol_info
        .map(|(n, e)| (n, e))
        .unwrap_or_else(|| ("Volunteer".to_string(), String::new()));

    let confirm_url = format!("{}/waitlist/{}/confirm", app_url, token);
    let decline_url = format!("{}/waitlist/{}/decline", app_url, token);
    let shift_date  = shift_start.format("%b %-d, %Y at %-I:%M %p").to_string();
    let deadline_fmt = deadline
        .with_timezone(&tz)
        .format("%b %-d at %-I:%M %p")
        .to_string();

    // In-app notification (immediate)
    let _: Uuid = sqlx::query_scalar(
        "INSERT INTO task_queue (task_type, payload, scheduled_at, priority)
         VALUES ('send_in_app_notification', $1, now(), 10)
         RETURNING id",
    )
    .bind(serde_json::json!({
        "user_id": volunteer_id,
        "type": "waitlist_promoted",
        "title": format!("A spot opened up at {}!", agency_name),
        "body": format!("You've been moved off the waitlist for {}. Please confirm by {}.", shift_title, deadline_fmt),
        "data": {
            "shift_id": shift_id,
            "assignment_id": assignment_id,
            "confirm_url": confirm_url,
        }
    }))
    .fetch_one(&mut *tx)
    .await?;

    // Email notification (immediate)
    if !vol_email.is_empty() {
        let _: Uuid = sqlx::query_scalar(
            "INSERT INTO task_queue (task_type, payload, scheduled_at, priority)
             VALUES ('send_email_waitlist_promoted', $1, now(), 10)
             RETURNING id",
        )
        .bind(serde_json::json!({
            "to_email": vol_email,
            "volunteer_name": volunteer_name,
            "shift_title": shift_title,
            "agency_name": agency_name,
            "shift_date": shift_date,
            "confirm_url": confirm_url,
            "decline_url": decline_url,
            "deadline_formatted": deadline_fmt,
        }))
        .fetch_one(&mut *tx)
        .await?;
    }

    // Deadline enforcement task (fires at the deadline)
    let _: Uuid = sqlx::query_scalar(
        "INSERT INTO task_queue (task_type, payload, scheduled_at, priority)
         VALUES ('check_confirmation_deadline', $1, $2, 20)
         RETURNING id",
    )
    .bind(serde_json::json!({ "assignment_id": assignment_id }))
    .bind(deadline)
    .fetch_one(&mut *tx)
    .await?;

    // Log event
    let dog_info: Option<(Option<Uuid>, Option<String>)> = sqlx::query_as(
        "SELECT d.id, d.name FROM shift_assignments sa
         LEFT JOIN dogs d ON d.id = sa.dog_ids[1]
         WHERE sa.id = $1",
    )
    .bind(assignment_id)
    .fetch_optional(&mut *tx)
    .await
    .unwrap_or(None);

    let (dog_id, dog_name) = dog_info.map(|(i, n)| (i, n)).unwrap_or((None, None));

    let _ = crate::models::event_log::EventLog::waitlist_promoted(
        &mut *tx,
        volunteer_id,
        shift_id,
        dog_id,
        &shift_title,
        &agency_name,
        &volunteer_name,
        dog_name.as_deref(),
    )
    .await;

    tx.commit().await?;

    tracing::info!(
        shift_id = %shift_id,
        volunteer_id = %volunteer_id,
        assignment_id = %assignment_id,
        deadline = %deadline,
        "promote_next_waitlisted: promoted volunteer"
    );

    Ok(Some(assignment_id))
}
