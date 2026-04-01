//! Handler: email task types for waitlist promotion and unfilled slot alerts.

use super::super::runner::WorkerContext;

/// Email sent to a volunteer when they are promoted from the waitlist.
/// Payload: { to_email, volunteer_name, shift_title, agency_name, shift_date,
///            confirm_url, decline_url, deadline_formatted }
pub async fn send_waitlist_promoted(ctx: &WorkerContext, payload: &serde_json::Value) -> anyhow::Result<()> {
    let to_email = payload["to_email"].as_str()
        .ok_or_else(|| anyhow::anyhow!("send_email_waitlist_promoted: missing to_email"))?;

    let volunteer_name  = payload["volunteer_name"].as_str().unwrap_or("Volunteer");
    let shift_title     = payload["shift_title"].as_str().unwrap_or("your shift");
    let agency_name     = payload["agency_name"].as_str().unwrap_or("");
    let shift_date      = payload["shift_date"].as_str().unwrap_or("");
    let confirm_url     = payload["confirm_url"].as_str().unwrap_or("");
    let decline_url     = payload["decline_url"].as_str().unwrap_or("");
    let deadline_fmt    = payload["deadline_formatted"].as_str().unwrap_or("soon");

    ctx.email
        .send_waitlist_promoted(
            to_email,
            volunteer_name,
            shift_title,
            agency_name,
            shift_date,
            confirm_url,
            decline_url,
            deadline_fmt,
        )
        .await
        .map_err(|e| anyhow::anyhow!("waitlist promoted email failed: {}", e))?;

    Ok(())
}

/// Email sent to volunteer admins when a slot is unfilled with no waitlist.
/// Payload: { shift_id, shift_title, agency_name, shift_date, manage_url }
pub async fn send_shift_unfilled(ctx: &WorkerContext, payload: &serde_json::Value) -> anyhow::Result<()> {
    let shift_title  = payload["shift_title"].as_str().unwrap_or("a shift");
    let agency_name  = payload["agency_name"].as_str().unwrap_or("");
    let shift_date   = payload["shift_date"].as_str().unwrap_or("");
    let manage_url   = payload["manage_url"].as_str().unwrap_or("");

    // Get all admin emails
    let admin_emails: Vec<(String,)> = sqlx::query_as(
        "SELECT u.email FROM users u WHERE u.role = 'admin' AND u.is_active = true",
    )
    .fetch_all(&ctx.pool)
    .await?;

    for (email,) in admin_emails {
        if let Err(e) = ctx.email
            .send_shift_slot_unfilled(&email, shift_title, agency_name, shift_date, manage_url)
            .await
        {
            tracing::warn!(to = %email, error = %e, "shift unfilled admin email failed");
        }
    }

    Ok(())
}
