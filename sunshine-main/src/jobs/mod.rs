pub mod calendar_refresh;
pub mod survey_trigger;

use rocket::{fairing, Rocket};

// ─── CalendarRefreshFairing ───────────────────────────────────────────────────

pub struct CalendarRefreshFairing;

#[rocket::async_trait]
impl fairing::Fairing for CalendarRefreshFairing {
    fn info(&self) -> fairing::Info {
        fairing::Info {
            name: "Calendar Refresh Job",
            kind: fairing::Kind::Liftoff,
        }
    }

    async fn on_liftoff(&self, rocket: &Rocket<rocket::Orbit>) {
        use crate::{config::AppConfig, Db};
        use rocket_db_pools::Database;

        let pool = match Db::fetch(rocket) {
            Some(db) => (**db).clone(),
            None => {
                tracing::error!("Calendar refresh: DB pool not available");
                return;
            }
        };

        let cfg = match rocket.state::<AppConfig>() {
            Some(c) => c,
            None => {
                tracing::error!("Calendar refresh: AppConfig not in state");
                return;
            }
        };

        let config = rocket.config();
        let scheme = if config.tls_enabled() { "https" } else { "http" };
        let host = &config.address;
        let port = config.port;

        let app_url = if cfg.app_url.contains("localhost") || cfg.app_url.contains("127.0.0.1") {
            format!("{}://{}:{}", scheme, host, port)
        } else {
            cfg.app_url.clone()
        };

        tokio::spawn(async move {
            calendar_refresh::run(pool, app_url).await;
        });

        tracing::info!("Calendar refresh job started");
    }
}

// ─── SurveyTriggerFairing ─────────────────────────────────────────────────────

pub struct SurveyTriggerFairing;

#[rocket::async_trait]
impl fairing::Fairing for SurveyTriggerFairing {
    fn info(&self) -> fairing::Info {
        fairing::Info {
            name: "Survey Trigger Job",
            kind: fairing::Kind::Liftoff,
        }
    }

    async fn on_liftoff(&self, rocket: &Rocket<rocket::Orbit>) {
        use crate::{config::AppConfig, email::EmailService, Db};
        use rocket_db_pools::Database;

        let pool = match Db::fetch(rocket) {
            Some(db) => (**db).clone(),
            None => {
                tracing::error!("Survey trigger: DB pool not available");
                return;
            }
        };

        let cfg = match rocket.state::<AppConfig>() {
            Some(c) => c,
            None => {
                tracing::error!("Survey trigger: AppConfig not in state");
                return;
            }
        };

        let email_svc = match rocket.state::<EmailService>() {
            Some(e) => e.clone(),
            None => {
                tracing::error!("Survey trigger: EmailService not in state");
                return;
            }
        };

        // Determine actual URL including the bound port
        let config = rocket.config();
        let scheme = if config.tls_enabled() { "https" } else { "http" };
        let host = &config.address;
        let port = config.port;
        
        let app_url = if cfg.app_url.contains("localhost") || cfg.app_url.contains("127.0.0.1") {
            format!("{}://{}:{}", scheme, host, port)
        } else {
            cfg.app_url.clone()
        };

        tokio::spawn(async move {
            survey_trigger::run(pool, email_svc, app_url).await;
        });

        tracing::info!("Survey trigger job started");
    }
}
