use rocket::{fairing, Build, Rocket};

/// Fairing that runs sqlx migrations on startup.
pub struct MigrationsFairing;

#[rocket::async_trait]
impl fairing::Fairing for MigrationsFairing {
    fn info(&self) -> fairing::Info {
        fairing::Info {
            name: "SQLx Migrations",
            kind: fairing::Kind::Ignite,
        }
    }

    async fn on_ignite(&self, rocket: Rocket<Build>) -> fairing::Result {
        use crate::Db;
        use rocket_db_pools::Database;

        if std::env::var("SKIP_MIGRATIONS").map_or(false, |v| v == "true" || v == "1") {
            tracing::info!("SKIP_MIGRATIONS is set — skipping database migrations");
            return Ok(rocket);
        }

        let db = match Db::fetch(&rocket) {
            Some(db) => db,
            None => {
                tracing::error!("No database pool found — cannot run migrations");
                return Err(rocket);
            }
        };

        match sqlx::migrate!("./migrations").run(&**db).await {
            Ok(()) => {
                tracing::info!("Database migrations applied successfully");
                Ok(rocket)
            }
            Err(e) => {
                tracing::error!(error = %e, "Migration failed");
                Err(rocket)
            }
        }
    }
}
