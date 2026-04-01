//! Handler: `send_in_app_notification`
//!
//! Inserts a notification row for the target user.

use uuid::Uuid;

use super::super::runner::WorkerContext;

pub async fn run(_ctx: &WorkerContext, payload: &serde_json::Value) -> anyhow::Result<()> {
    let user_id: Uuid = payload["user_id"]
        .as_str()
        .and_then(|s| s.parse().ok())
        .ok_or_else(|| anyhow::anyhow!("send_in_app_notification: missing user_id"))?;

    let notification_type = payload["type"]
        .as_str()
        .ok_or_else(|| anyhow::anyhow!("send_in_app_notification: missing type"))?;

    let title = payload["title"].as_str().unwrap_or("Notification");
    let body  = payload["body"].as_str().unwrap_or("");
    let data  = payload.get("data").cloned().unwrap_or(serde_json::Value::Null);

    // Map string type to the notification_type enum used by the DB
    let type_str = match notification_type {
        "waitlist_promoted" => "waitlist_promoted",
        "booking_cancelled" => "booking_cancelled",
        "shift_slot_unfilled" => "booking_cancelled", // closest existing enum value for admin alerts
        other => other,
    };

    sqlx::query(
        r#"
        INSERT INTO notifications (user_id, type, title, body, payload)
        VALUES ($1, $2::notification_type, $3, $4, $5)
        "#,
    )
    .bind(user_id)
    .bind(type_str)
    .bind(title)
    .bind(body)
    .bind(data)
    .execute(&_ctx.pool)
    .await?;

    Ok(())
}
