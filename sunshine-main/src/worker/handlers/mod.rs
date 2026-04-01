//! Task handler dispatch and individual handler modules.

pub mod check_deadline;
pub mod notify;
pub mod email;
pub mod gallery;

use super::runner::{TaskRow, WorkerContext};

/// Dispatch a claimed task to its handler.
pub async fn dispatch(ctx: &WorkerContext, task: &TaskRow) -> anyhow::Result<()> {
    match task.task_type.as_str() {
        "check_confirmation_deadline" => check_deadline::run(ctx, &task.payload).await,
        "send_in_app_notification"    => notify::run(ctx, &task.payload).await,
        "send_email_waitlist_promoted" => email::send_waitlist_promoted(ctx, &task.payload).await,
        "send_email_shift_unfilled"   => email::send_shift_unfilled(ctx, &task.payload).await,
        "generate_thumbnail"          => gallery::generate_thumbnail(ctx, &task.payload).await,
        unknown => {
            tracing::warn!(task_type = %unknown, "worker: unknown task type — marking completed");
            Ok(())
        }
    }
}
