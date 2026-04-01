//! Handler: `check_confirmation_deadline`
//!
//! Fires at `confirmation_deadline_at`. If the assignment is still
//! `pending_confirmation`, cancels it and promotes the next waitlisted volunteer.

use chrono::Utc;
use uuid::Uuid;

use crate::models::shift::promote_next_waitlisted;

use super::super::runner::WorkerContext;

pub async fn run(ctx: &WorkerContext, payload: &serde_json::Value) -> anyhow::Result<()> {
    let assignment_id: Uuid = payload["assignment_id"]
        .as_str()
        .and_then(|s| s.parse().ok())
        .ok_or_else(|| anyhow::anyhow!("check_deadline: missing or invalid assignment_id in payload"))?;

    // Load the assignment — check it's still pending and the deadline has passed
    let row: Option<(Uuid, String, Option<chrono::DateTime<Utc>>)> = sqlx::query_as(
        "SELECT shift_id, status::text, confirmation_deadline_at
         FROM shift_assignments WHERE id = $1",
    )
    .bind(assignment_id)
    .fetch_optional(&ctx.pool)
    .await?;

    let Some((shift_id, status, deadline_at)) = row else {
        tracing::warn!(assignment_id = %assignment_id, "check_deadline: assignment not found");
        return Ok(());
    };

    if status != "pending_confirmation" {
        tracing::debug!(assignment_id = %assignment_id, status = %status, "check_deadline: already resolved, skipping");
        return Ok(());
    }

    let Some(deadline) = deadline_at else {
        tracing::warn!(assignment_id = %assignment_id, "check_deadline: no deadline set, skipping");
        return Ok(());
    };

    if deadline > Utc::now() {
        tracing::debug!(assignment_id = %assignment_id, "check_deadline: deadline not yet reached, skipping");
        return Ok(());
    }

    // Deadline has passed — cancel the assignment
    let cancelled = sqlx::query(
        r#"
        UPDATE shift_assignments
        SET status              = 'cancelled',
            cancelled_at        = now(),
            cancellation_reason = 'Confirmation window expired',
            confirmation_token  = NULL,
            updated_at          = now()
        WHERE id = $1 AND status = 'pending_confirmation'
        "#,
    )
    .bind(assignment_id)
    .execute(&ctx.pool)
    .await?;

    if cancelled.rows_affected() == 0 {
        // Raced with another update — already resolved
        return Ok(());
    }

    tracing::info!(
        assignment_id = %assignment_id,
        shift_id = %shift_id,
        "check_deadline: confirmation window expired, promoting next volunteer"
    );

    // Log the expiry event
    let _: Option<(Uuid, String, String, String, Option<Uuid>, Option<String>)> = sqlx::query_as(
        r#"
        SELECT sa.volunteer_id, s.title, a.name, vp.volunteer_names, d.id, d.name
        FROM shift_assignments sa
        JOIN shifts s ON s.id = sa.shift_id
        JOIN agencies a ON a.id = s.agency_id
        LEFT JOIN volunteer_profiles vp ON vp.user_id = sa.volunteer_id
        LEFT JOIN dogs d ON d.id = sa.dog_ids[1]
        WHERE sa.id = $1
        "#,
    )
    .bind(assignment_id)
    .fetch_optional(&ctx.pool)
    .await
    .ok()
    .flatten();

    // Promote the next waitlisted volunteer
    promote_next_waitlisted(&ctx.pool, shift_id, &ctx.app_url).await?;

    Ok(())
}
