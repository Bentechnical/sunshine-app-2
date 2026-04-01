//! Background job: send post-shift survey prompts.
//!
//! Runs every 15 minutes. For each shift that ended more than
//! `post_shift_trigger_hours` ago and hasn't had survey notifications sent:
//!   • INSERT a `survey_prompt` notification per confirmed volunteer
//!   • Send each volunteer a survey-prompt email
//!   • Do the same for the agency contact after `agency_survey_trigger_hours`
//!
//! The notification stays unread until the volunteer either submits the survey
//! or explicitly dismisses it from the dashboard.

use chrono::{DateTime, Utc};
use sqlx::PgPool;
use tokio::time::{interval, Duration};
use uuid::Uuid;

use crate::email::EmailService;

#[derive(serde::Serialize, Clone)]
pub struct ProcessedShift {
    pub id: Uuid,
    pub title: String,
    pub target_type: String, // "volunteer" or "agency"
}

pub async fn run(pool: PgPool, email: EmailService, app_url: String) {
    let mut tick = interval(Duration::from_secs(15 * 60));

    loop {
        tick.tick().await;

        if let Err(e) = process_pending_surveys(&pool, &email, &app_url).await {
            tracing::error!(error = %e, "Survey trigger job error");
        }
    }
}

// ─── Core logic ───────────────────────────────────────────────────────────────

pub async fn process_pending_surveys(
    pool: &PgPool,
    email: &EmailService,
    app_url: &str,
) -> anyhow::Result<Vec<ProcessedShift>> {
    let mut processed = Vec::new();
    
    let trigger_hours: i64 = sqlx::query_scalar(
        "SELECT value::bigint FROM system_settings WHERE key = 'post_shift_trigger_hours'",
    )
    .fetch_optional(pool)
    .await?
    .unwrap_or(2);

    let agency_trigger_hours: i64 = sqlx::query_scalar(
        "SELECT value::bigint FROM system_settings WHERE key = 'agency_survey_trigger_hours'",
    )
    .fetch_optional(pool)
    .await?
    .unwrap_or(24);

    // ── Volunteer survey prompts ──────────────────────────────────────────────
    let vol_shifts: Vec<(Uuid, String, DateTime<Utc>)> = sqlx::query_as(
        r#"
        SELECT s.id, s.title, s.end_at
        FROM shifts s
        WHERE s.state IN ('published', 'invite_only', 'hidden', 'archived')
          AND s.end_at + ($1 || ' hours')::interval < now()
          AND s.volunteer_survey_sent_at IS NULL
          AND EXISTS (
              SELECT 1 FROM shift_assignments sa
              WHERE sa.shift_id = s.id AND sa.status = 'confirmed'
          )
        "#,
    )
    .bind(trigger_hours)
    .fetch_all(pool)
    .await?;

    for (shift_id, title, _end_at) in &vol_shifts {
        if let Err(e) = send_volunteer_prompts(pool, email, app_url, *shift_id, title).await {
            tracing::error!(shift_id = %shift_id, error = %e, "Failed volunteer survey prompts");
        } else {
            processed.push(ProcessedShift {
                id: *shift_id,
                title: title.clone(),
                target_type: "volunteer".to_string(),
            });
        }
        sqlx::query("UPDATE shifts SET volunteer_survey_sent_at = now() WHERE id = $1")
            .bind(shift_id)
            .execute(pool)
            .await?;
    }

    // ── Agency survey prompts ─────────────────────────────────────────────────
    let agency_shifts: Vec<(Uuid, String)> = sqlx::query_as(
        r#"
        SELECT s.id, s.title
        FROM shifts s
        WHERE s.state IN ('published', 'invite_only', 'hidden', 'archived')
          AND s.end_at + ($1 || ' hours')::interval < now()
          AND s.agency_survey_sent_at IS NULL
          AND s.contact_id IS NOT NULL
        "#,
    )
    .bind(agency_trigger_hours)
    .fetch_all(pool)
    .await?;

    for (shift_id, title) in &agency_shifts {
        if let Err(e) = send_agency_prompt(pool, email, app_url, *shift_id, title).await {
            tracing::error!(shift_id = %shift_id, error = %e, "Failed agency survey prompt");
        } else {
            processed.push(ProcessedShift {
                id: *shift_id,
                title: title.clone(),
                target_type: "agency".to_string(),
            });
        }
        sqlx::query("UPDATE shifts SET agency_survey_sent_at = now() WHERE id = $1")
            .bind(shift_id)
            .execute(pool)
            .await?;
    }

    let v = vol_shifts.len();
    let a = agency_shifts.len();
    if v > 0 || a > 0 {
        tracing::info!(volunteer_shifts = v, agency_shifts = a, "Survey prompts dispatched");
    }

    Ok(processed)
}

// ─── Volunteer prompts ────────────────────────────────────────────────────────

#[derive(sqlx::FromRow)]
struct VolunteerTarget {
    volunteer_id: Uuid,
    email: String,
    #[allow(dead_code)]
    display_name: Option<String>,
    already_submitted: bool,
}

async fn send_volunteer_prompts(
    pool: &PgPool,
    email_svc: &EmailService,
    app_url: &str,
    shift_id: Uuid,
    shift_title: &str,
) -> anyhow::Result<()> {
    let targets: Vec<VolunteerTarget> = sqlx::query_as(
        r#"
        SELECT
            sa.volunteer_id,
            u.email,
            u.display_name,
            EXISTS (
                SELECT 1 FROM volunteer_surveys vs
                WHERE vs.shift_id = $1 AND vs.volunteer_id = sa.volunteer_id
            ) AS already_submitted
        FROM shift_assignments sa
        JOIN users u ON u.id = sa.volunteer_id
        WHERE sa.shift_id = $1 AND sa.status = 'confirmed'
        "#,
    )
    .bind(shift_id)
    .fetch_all(pool)
    .await?;

    let survey_url = format!("{}/volunteer/survey/{}", app_url, shift_id);

    for t in &targets {
        if t.already_submitted {
            continue; // survey already done — no prompt needed
        }

        // In-app notification (dismissable login alert)
        sqlx::query(
            r#"
            INSERT INTO notifications
                (user_id, type, title, body, payload)
            VALUES
                ($1, 'survey_prompt',
                 'How did your visit go?',
                 $2,
                 $3)
            ON CONFLICT DO NOTHING
            "#,
        )
        .bind(t.volunteer_id)
        .bind(format!("Please share your feedback for the \"{}\" shift.", shift_title))
        .bind(serde_json::json!({
            "shift_id": shift_id,
            "survey_url": survey_url,
        }))
        .execute(pool)
        .await?;

        // Email
        if let Err(e) = email_svc
            .send_survey_prompt(&t.email, shift_title, &survey_url)
            .await
        {
            tracing::warn!(
                volunteer_id = %t.volunteer_id,
                error = %e,
                "Survey prompt email failed — notification still created"
            );
        }
    }

    Ok(())
}

// ─── Agency contact prompt ────────────────────────────────────────────────────

#[derive(sqlx::FromRow)]
struct AgencyTarget {
    user_id: Uuid,
    email: String,
    agency_name: String,
    already_submitted: bool,
}

async fn send_agency_prompt(
    pool: &PgPool,
    email_svc: &EmailService,
    app_url: &str,
    shift_id: Uuid,
    shift_title: &str,
) -> anyhow::Result<()> {
    let target: Option<AgencyTarget> = sqlx::query_as(
        r#"
        SELECT
            c.user_id,
            u.email,
            ag.name AS agency_name,
            EXISTS (
                SELECT 1 FROM agency_surveys ags
                WHERE ags.shift_id = $1 AND ags.contact_id = c.id
            ) AS already_submitted
        FROM shifts s
        JOIN contacts c  ON c.id  = s.contact_id
        JOIN users u     ON u.id  = c.user_id
        JOIN agencies ag ON ag.id = s.agency_id
        WHERE s.id = $1 AND c.user_id IS NOT NULL
        "#,
    )
    .bind(shift_id)
    .fetch_optional(pool)
    .await?;

    let Some(t) = target else { return Ok(()) };
    if t.already_submitted {
        return Ok(());
    }

    let survey_url = format!("{}/agency/survey/{}", app_url, shift_id);

    sqlx::query(
        r#"
        INSERT INTO notifications
            (user_id, type, title, body, payload)
        VALUES
            ($1, 'survey_prompt',
             'Tell us about your therapy dog visit!',
             $2,
             $3)
        ON CONFLICT DO NOTHING
        "#,
    )
    .bind(t.user_id)
    .bind(format!(
        "Please share your feedback for the \"{}\" visit.",
        shift_title
    ))
    .bind(serde_json::json!({
        "shift_id": shift_id,
        "survey_url": survey_url,
    }))
    .execute(pool)
    .await?;

    if let Err(e) = email_svc
        .send_survey_prompt(&t.email, shift_title, &survey_url)
        .await
    {
        tracing::warn!(
            agency = %t.agency_name,
            error = %e,
            "Agency survey prompt email failed"
        );
    }

    Ok(())
}
