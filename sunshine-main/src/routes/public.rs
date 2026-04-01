use rocket::{get, http::Status, response::Redirect, routes, serde::json::Json, Route, fs::NamedFile, Either};
use rocket_dyn_templates::{context, Template};
use serde::Serialize;
use std::path::Path;

use crate::auth::session::MaybeAuthUser;
use crate::models::user::UserRole;
use crate::Db;

pub fn routes() -> Vec<Route> {
    routes![
        index,
        who_we_are,
        meet_our_dogs,
        book_a_visit,
        research,
        contact,
        donate,
        health,
        favicon,
        service_worker,
    ]
}

#[get("/")]
async fn index(db: &Db, user: MaybeAuthUser) -> Template {
    Template::render(
        "public/index",
        context! {
            user: &user.0,
        },
    )
}


#[get("/who-we-are")]
async fn who_we_are(user: MaybeAuthUser) -> Template {
    Template::render(
        "public/who_we_are",
        context! {
            user: &user.0,
        },
    )
}

#[get("/meet-our-dogs")]
async fn meet_our_dogs(db: &Db, user: MaybeAuthUser) -> Template {
    // We'll eventually fetch approved dogs here
    Template::render(
        "public/meet_our_dogs",
        context! {
            user: &user.0,
        },
    )
}

#[get("/book-a-visit")]
async fn book_a_visit(user: MaybeAuthUser) -> Template {
    Template::render(
        "public/book_a_visit",
        context! {
            user: &user.0,
        },
    )
}

#[get("/research")]
async fn research(user: MaybeAuthUser) -> Template {
    Template::render(
        "public/research",
        context! {
            user: &user.0,
        },
    )
}

#[get("/contact")]
async fn contact(user: MaybeAuthUser) -> Template {
    Template::render(
        "public/contact",
        context! {
            user: &user.0,
        },
    )
}

#[get("/donate")]
async fn donate(user: MaybeAuthUser) -> Template {
    Template::render(
        "public/donate",
        context! {
            user: &user.0,
        },
    )
}

/// GET /favicon.ico
#[get("/favicon.ico")]
async fn favicon() -> Option<NamedFile> {
    NamedFile::open(Path::new("static/favicon.ico")).await.ok()
}

struct ServiceWorkerJs(Vec<u8>);

impl<'r> rocket::response::Responder<'r, 'static> for ServiceWorkerJs {
    fn respond_to(self, _req: &'r rocket::Request<'_>) -> rocket::response::Result<'static> {
        rocket::Response::build()
            .header(rocket::http::ContentType::new("application", "javascript"))
            .raw_header("Service-Worker-Allowed", "/")
            .sized_body(self.0.len(), std::io::Cursor::new(self.0))
            .ok()
    }
}

/// GET /sw.js — Service worker served from root so its scope covers the whole app.
/// The `Service-Worker-Allowed: /` header lets the SW control paths above its URL.
#[get("/sw.js")]
async fn service_worker() -> Option<ServiceWorkerJs> {
    let bytes = tokio::fs::read("static/sw.js").await.ok()?;
    Some(ServiceWorkerJs(bytes))
}

#[derive(Serialize)]
struct HealthResponse {
    status: &'static str,
    db: &'static str,
    version: &'static str,
}

/// Health check — used by Dokploy smoke tests and uptime monitors.
/// Returns 200 + JSON when the app and DB are reachable, 503 if the DB is down.
#[get("/health")]
async fn health(db: &Db) -> (Status, Json<HealthResponse>) {
    let db_ok = sqlx::query_scalar::<_, i32>("SELECT 1")
        .fetch_one(&**db)
        .await
        .is_ok();

    if db_ok {
        (
            Status::Ok,
            Json(HealthResponse {
                status: "ok",
                db: "ok",
                version: env!("CARGO_PKG_VERSION"),
            }),
        )
    } else {
        (
            Status::ServiceUnavailable,
            Json(HealthResponse {
                status: "degraded",
                db: "error",
                version: env!("CARGO_PKG_VERSION"),
            }),
        )
    }
}
