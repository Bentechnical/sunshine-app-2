//! Background task worker — processes the `task_queue` table.
//!
//! Launched as a tokio background task on server liftoff via [`WorkerFairing`].
//! The worker claims tasks with `SELECT … FOR UPDATE SKIP LOCKED` so a future
//! move to a separate worker process requires no schema changes.

pub mod handlers;
pub mod runner;

pub use runner::enqueue;

use rocket::{fairing, Rocket};

pub struct WorkerFairing;

#[rocket::async_trait]
impl fairing::Fairing for WorkerFairing {
    fn info(&self) -> fairing::Info {
        fairing::Info {
            name: "Task Queue Worker",
            kind: fairing::Kind::Liftoff,
        }
    }

    async fn on_liftoff(&self, rocket: &Rocket<rocket::Orbit>) {
        use crate::{config::AppConfig, email::EmailService, storage::StorageBackend, Db};
        use rocket_db_pools::Database;

        let pool = match Db::fetch(rocket) {
            Some(db) => (**db).clone(),
            None => {
                tracing::error!("worker: DB pool not available at liftoff");
                return;
            }
        };

        let cfg = match rocket.state::<AppConfig>() {
            Some(c) => c.clone(),
            None => {
                tracing::error!("worker: AppConfig not available at liftoff");
                return;
            }
        };

        let email_svc = match rocket.state::<EmailService>() {
            Some(e) => e.clone(),
            None => {
                tracing::error!("worker: EmailService not available at liftoff");
                return;
            }
        };

        let storage = match rocket.state::<StorageBackend>() {
            Some(s) => s.clone(),
            None => {
                tracing::error!("worker: StorageBackend not available at liftoff");
                return;
            }
        };

        let ctx = runner::WorkerContext {
            pool,
            email: email_svc,
            storage,
            app_url: cfg.app_url.clone(),
            is_dev: cfg.environment.is_dev(),
        };

        tokio::spawn(async move {
            runner::run(ctx).await;
        });

        tracing::info!("Task queue worker started");
    }
}
