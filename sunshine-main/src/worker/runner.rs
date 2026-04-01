//! Task claim loop and dispatch.

use chrono::Utc;
use sqlx::PgPool;
use tokio::time::{sleep, Duration};
use uuid::Uuid;

use crate::email::EmailService;
use crate::storage::StorageBackend;

#[derive(Clone)]
pub struct WorkerContext {
    pub pool: PgPool,
    pub email: EmailService,
    pub storage: StorageBackend,
    pub app_url: String,
    pub is_dev: bool,
}

#[derive(sqlx::FromRow)]
pub struct TaskRow {
    pub id: Uuid,
    pub task_type: String,
    pub payload: serde_json::Value,
    pub attempts: i32,
}

/// Main worker loop. Runs forever, polling for tasks.
pub async fn run(ctx: WorkerContext) {
    loop {
        match claim_and_run(&ctx).await {
            Ok(true) => {}                                      // ran a task, poll again immediately
            Ok(false) => sleep(Duration::from_secs(5)).await,  // idle, back off
            Err(e) => {
                tracing::error!(error = %e, "worker: task processing error");
                sleep(Duration::from_secs(10)).await;
            }
        }
    }
}

/// Claims the next runnable task and executes it.
/// Returns `Ok(true)` if a task was processed, `Ok(false)` if the queue was empty.
async fn claim_and_run(ctx: &WorkerContext) -> anyhow::Result<bool> {
    // Dev/test: purge tasks older than 72 hours
    if ctx.is_dev {
        let _ = sqlx::query(
            "DELETE FROM task_queue
             WHERE created_at < now() - INTERVAL '72 hours'
               AND status IN ('completed', 'failed')",
        )
        .execute(&ctx.pool)
        .await;
    }

    // Claim the next runnable task atomically.
    // Includes lease-timeout recovery: reclaim `processing` tasks whose
    // `locked_until` has expired (i.e. the worker crashed mid-execution).
    let task: Option<TaskRow> = sqlx::query_as(
        r#"
        UPDATE task_queue
        SET    status       = 'processing',
               started_at   = now(),
               locked_until = now() + INTERVAL '5 minutes',
               attempts     = attempts + 1
        WHERE  id = (
            SELECT id FROM task_queue
            WHERE  (
                       status = 'pending'
                    OR (status = 'processing' AND locked_until < now())
                   )
              AND  scheduled_at <= now()
              AND  attempts < max_attempts
            ORDER BY priority DESC, scheduled_at ASC
            LIMIT  1
            FOR UPDATE SKIP LOCKED
        )
        RETURNING id, task_type, payload, attempts
        "#,
    )
    .fetch_optional(&ctx.pool)
    .await?;

    let Some(task) = task else {
        return Ok(false);
    };

    tracing::debug!(task_id = %task.id, task_type = %task.task_type, "worker: running task");

    let result = super::handlers::dispatch(ctx, &task).await;

    match result {
        Ok(()) => {
            sqlx::query(
                "UPDATE task_queue SET status = 'completed', completed_at = now() WHERE id = $1",
            )
            .bind(task.id)
            .execute(&ctx.pool)
            .await?;
        }
        Err(e) => {
            tracing::error!(task_id = %task.id, task_type = %task.task_type, error = %e, "worker: task failed");

            // Retry up to max_attempts, then mark permanently failed
            sqlx::query(
                r#"
                UPDATE task_queue
                SET status     = CASE WHEN attempts >= max_attempts THEN 'failed' ELSE 'pending' END,
                    last_error = $2,
                    -- back off: 1 min * attempts^2
                    scheduled_at = CASE
                        WHEN attempts < max_attempts
                        THEN now() + (INTERVAL '1 minute' * (attempts * attempts))
                        ELSE scheduled_at
                    END
                WHERE id = $1
                "#,
            )
            .bind(task.id)
            .bind(e.to_string())
            .execute(&ctx.pool)
            .await?;
        }
    }

    Ok(true)
}

/// Enqueue a task. Convenience wrapper used by routes and model functions.
pub async fn enqueue(
    pool: &PgPool,
    task_type: &str,
    payload: serde_json::Value,
    scheduled_at: chrono::DateTime<Utc>,
    priority: i32,
) -> Result<Uuid, sqlx::Error> {
    let id: Uuid = sqlx::query_scalar(
        r#"
        INSERT INTO task_queue (task_type, payload, scheduled_at, priority)
        VALUES ($1, $2, $3, $4)
        RETURNING id
        "#,
    )
    .bind(task_type)
    .bind(payload)
    .bind(scheduled_at)
    .bind(priority)
    .fetch_one(pool)
    .await?;
    Ok(id)
}
