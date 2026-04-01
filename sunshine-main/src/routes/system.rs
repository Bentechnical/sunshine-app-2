//! Admin system metrics & site administration.
//!
//! GET  /admin/system          — system metrics (live polling)
//! GET  /admin/system/metrics  — HTMX partial, polled every 5 s
//! GET  /admin/site            — site admin page (users, DB tools, seeding)
//! POST /admin/site/create-admin
//! POST /admin/site/users/<id>/toggle
//! POST /admin/site/users/<id>/promote
//! POST /admin/site/users/<id>/demote
//! GET  /admin/site/backup
//! POST /admin/site/restore
//! POST /admin/site/seed

use rocket::data::{Data, ToByteUnit};
use rocket::form::Form;
use rocket::http::ContentType;
use rocket::response::{Flash, Redirect};
use rocket::{get, post, routes, Route};
use rocket_dyn_templates::{context, Template};
use serde::Serialize;
use sqlx::FromRow;
use sysinfo::{Disks, System};
use uuid::Uuid;

use crate::auth::session::AdminUser;
use crate::Db;
use crate::config::AppConfig;
use crate::email::EmailService;
use crate::jobs::survey_trigger::process_pending_surveys;

pub fn routes() -> Vec<Route> {
    routes![
        system_page,
        system_metrics,
        site_admin_page,
        site_create_admin,
        site_user_toggle,
        site_user_promote,
        site_user_demote,
        site_backup,
        site_restore,
        site_seed,
        check_missing_surveys,
    ]
}

// ─── Metrics snapshot ─────────────────────────────────────────────────────────

#[derive(Serialize)]
struct DiskInfo {
    name: String,
    used_gb: f64,
    total_gb: f64,
    used_pct: f64,
}

#[derive(Serialize)]
struct SystemMetrics {
    cpu_pct: f64,
    ram_used_gb: f64,
    ram_total_gb: f64,
    ram_pct: f64,
    ram_avail_gb: f64,
    load_1: f64,
    load_5: f64,
    load_15: f64,
    uptime_days: u64,
    uptime_hours: u64,
    uptime_mins: u64,
    disks: Vec<DiskInfo>,
    active_sessions: i64,
}

async fn collect_metrics(db: &Db) -> SystemMetrics {
    let mut sys = System::new_all();
    sys.refresh_all();

    let cpus = sys.cpus();
    let cpu_pct = if cpus.is_empty() {
        0.0
    } else {
        cpus.iter().map(|c| c.cpu_usage() as f64).sum::<f64>() / cpus.len() as f64
    };
    let ram_used = sys.used_memory();
    let ram_total = sys.total_memory();
    let ram_avail = sys.available_memory();
    let load = System::load_average();
    let uptime_secs = System::uptime();

    let disks = Disks::new_with_refreshed_list()
        .iter()
        .map(|d| {
            let total = d.total_space();
            let avail = d.available_space();
            let used = total.saturating_sub(avail);
            let used_pct = if total > 0 {
                used as f64 / total as f64 * 100.0
            } else {
                0.0
            };
            DiskInfo {
                name: d.mount_point().to_string_lossy().to_string(),
                used_gb: used as f64 / 1_073_741_824.0,
                total_gb: total as f64 / 1_073_741_824.0,
                used_pct,
            }
        })
        .collect();

    let active_sessions: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM sessions WHERE expires_at > NOW()",
    )
    .fetch_one(&**db)
    .await
    .unwrap_or(0);

    SystemMetrics {
        cpu_pct,
        ram_used_gb: ram_used as f64 / 1_073_741_824.0,
        ram_total_gb: ram_total as f64 / 1_073_741_824.0,
        ram_pct: if ram_total > 0 {
            ram_used as f64 / ram_total as f64 * 100.0
        } else {
            0.0
        },
        ram_avail_gb: ram_avail as f64 / 1_073_741_824.0,
        load_1: load.one,
        load_5: load.five,
        load_15: load.fifteen,
        uptime_days: uptime_secs / 86400,
        uptime_hours: (uptime_secs % 86400) / 3600,
        uptime_mins: (uptime_secs % 3600) / 60,
        active_sessions,
        disks,
    }
}

// ─── Event log row ─────────────────────────────────────────────────────────────

#[derive(Serialize, sqlx::FromRow)]
struct EventLogRow {
    event_type: String,
    volunteer_name: Option<String>,
    created_at: chrono::DateTime<chrono::Utc>,
}

// ─── Route handlers ───────────────────────────────────────────────────────────

#[get("/system")]
pub async fn system_page(db: &Db, admin: AdminUser) -> Template {
    let metrics = collect_metrics(db).await;

    let events: Vec<EventLogRow> = sqlx::query_as(
        r#"SELECT
            ve.event_type,
            COALESCE(v.display_name, u.email) AS volunteer_name,
            ve.created_at
           FROM volunteer_events ve
           JOIN users u ON u.id = ve.user_id
           LEFT JOIN volunteers v ON v.user_id = ve.user_id
           ORDER BY ve.created_at DESC
           LIMIT 20"#,
    )
    .fetch_all(&**db)
    .await
    .unwrap_or_default();

    Template::render(
        "admin/system",
        context! {
            user: &admin.0,
            metrics,
            events,
        },
    )
}

#[get("/system/metrics")]
pub async fn system_metrics(db: &Db, _admin: AdminUser) -> Template {
    let metrics = collect_metrics(db).await;
    Template::render(
        "admin/system_metrics",
        context! { metrics },
    )
}

// ─── Site administration ─────────────────────────────────────────────────────

#[derive(Serialize, FromRow)]
struct AccountRow {
    id: Uuid,
    email: String,
    role: String,
    display_name: Option<String>,
    is_active: bool,
    created_at: chrono::DateTime<chrono::Utc>,
}

#[get("/site?<user_search>&<user_role>")]
async fn site_admin_page(
    user_search: Option<&str>,
    user_role: Option<&str>,
    db: &Db,
    admin: AdminUser,
) -> Template {
    let search = user_search.unwrap_or("").trim();
    let role_filter = user_role.unwrap_or("");

    let accounts: Vec<AccountRow> = if !search.is_empty() && !role_filter.is_empty() {
        sqlx::query_as(
            "SELECT id, email, role::TEXT, display_name, is_active, created_at
             FROM users
             WHERE (email ILIKE '%' || $1 || '%' OR display_name ILIKE '%' || $1 || '%')
               AND role::TEXT = $2
             ORDER BY created_at DESC LIMIT 50",
        )
        .bind(search)
        .bind(role_filter)
        .fetch_all(&**db)
        .await
        .unwrap_or_default()
    } else if !search.is_empty() {
        sqlx::query_as(
            "SELECT id, email, role::TEXT, display_name, is_active, created_at
             FROM users
             WHERE email ILIKE '%' || $1 || '%' OR display_name ILIKE '%' || $1 || '%'
             ORDER BY created_at DESC LIMIT 50",
        )
        .bind(search)
        .fetch_all(&**db)
        .await
        .unwrap_or_default()
    } else if !role_filter.is_empty() {
        sqlx::query_as(
            "SELECT id, email, role::TEXT, display_name, is_active, created_at
             FROM users
             WHERE role::TEXT = $1
             ORDER BY created_at DESC LIMIT 50",
        )
        .bind(role_filter)
        .fetch_all(&**db)
        .await
        .unwrap_or_default()
    } else {
        sqlx::query_as(
            "SELECT id, email, role::TEXT, display_name, is_active, created_at
             FROM users
             ORDER BY created_at DESC LIMIT 50",
        )
        .fetch_all(&**db)
        .await
        .unwrap_or_default()
    };

    let has_more_users = accounts.len() == 50;

    Template::render(
        "admin/site_admin",
        context! {
            user: &admin.0,
            accounts,
            has_more_users,
            user_search: search,
            user_role: role_filter,
            admin_id: admin.0.id,
        },
    )
}

#[derive(rocket::form::FromForm)]
struct CreateAdminForm<'r> {
    email: &'r str,
    display_name: &'r str,
}

#[post("/site/create-admin", data = "<form>")]
async fn site_create_admin(
    form: Form<CreateAdminForm<'_>>,
    db: &Db,
    _admin: AdminUser,
) -> Flash<Redirect> {
    let email = form.email.trim().to_lowercase();
    if email.is_empty() || !email.contains('@') {
        return Flash::error(Redirect::to("/admin/site"), "Invalid email address.");
    }

    let display_name = if form.display_name.trim().is_empty() {
        None
    } else {
        Some(form.display_name.trim().to_string())
    };

    // Check if user already exists
    let existing: Option<(Uuid, String)> = sqlx::query_as(
        "SELECT id, role::TEXT FROM users WHERE email = $1",
    )
    .bind(&email)
    .fetch_optional(&**db)
    .await
    .unwrap_or(None);

    if let Some((id, role)) = existing {
        if role == "admin" {
            return Flash::error(
                Redirect::to("/admin/site"),
                format!("{email} is already an admin."),
            );
        }
        let _ = sqlx::query(
            "UPDATE users SET role = 'admin', is_active = true, display_name = COALESCE($2, display_name), updated_at = now() WHERE id = $1",
        )
        .bind(id)
        .bind(&display_name)
        .execute(&**db)
        .await;
        Flash::success(
            Redirect::to("/admin/site"),
            format!("Promoted {email} to admin."),
        )
    } else {
        let _ = sqlx::query(
            "INSERT INTO users (email, role, display_name, is_active)
             VALUES ($1, 'admin', $2, true)",
        )
        .bind(&email)
        .bind(&display_name)
        .execute(&**db)
        .await;
        Flash::success(
            Redirect::to("/admin/site"),
            format!("Created admin account for {email}."),
        )
    }
}

#[post("/site/users/<id>/toggle")]
async fn site_user_toggle(id: &str, db: &Db, admin: AdminUser) -> Flash<Redirect> {
    let user_id = match Uuid::parse_str(id) {
        Ok(u) => u,
        Err(_) => return Flash::error(Redirect::to("/admin/site"), "Invalid user ID."),
    };
    if user_id == admin.0.id {
        return Flash::error(Redirect::to("/admin/site"), "You cannot disable your own account.");
    }

    let mut tx = match db.begin().await {
        Ok(tx) => tx,
        Err(e) => {
            tracing::error!(error = %e, "Failed to start transaction");
            return Flash::error(Redirect::to("/admin/site"), "Internal error");
        }
    };

    // Get current status
    let current: Option<(bool,)> = sqlx::query_as("SELECT is_active FROM users WHERE id = $1")
        .bind(user_id)
        .fetch_optional(&mut *tx)
        .await
        .unwrap_or(None);

    let (was_active, new_status) = match current {
        Some((is_active,)) => (is_active, !is_active),
        None => return Flash::error(Redirect::to("/admin/site"), "User not found"),
    };

    if let Err(e) = sqlx::query("UPDATE users SET is_active = $2, updated_at = now() WHERE id = $1")
        .bind(user_id)
        .bind(new_status)
        .execute(&mut *tx)
        .await
    {
        tracing::error!("Failed to toggle user status: {}", e);
        return Flash::error(Redirect::to("/admin/site"), "Update failed");
    }

    // Handle deactivation cascade
    if was_active && !new_status {
        // Find and cancel upcoming shifts
        let upcoming: Vec<(Uuid, String, String, Option<Uuid>, Option<String>, String)> = match sqlx::query_as(
            r#"
            SELECT s.id, s.title, a.name, d.id, d.name, vp.volunteer_names
            FROM shift_assignments sa
            JOIN shifts s ON s.id = sa.shift_id
            JOIN agencies a ON a.id = s.agency_id
            JOIN volunteer_profiles vp ON vp.user_id = sa.volunteer_id
            LEFT JOIN dogs d ON d.id = sa.dog_ids[1]
            WHERE sa.volunteer_id = $1
              AND s.start_at > now()
              AND sa.status IN ('confirmed', 'waitlisted', 'pending_confirmation')
            "#
        )
        .bind(user_id)
        .fetch_all(&mut *tx)
        .await {
            Ok(list) => list,
            Err(_) => vec![],
        };

        for (sid, st, an, di, dn, vn) in upcoming {
            let _ = sqlx::query(
                "UPDATE shift_assignments SET status = 'cancelled', cancellation_reason = 'User account deactivated', cancelled_at = now() WHERE shift_id = $1 AND volunteer_id = $2"
            )
            .bind(sid)
            .bind(user_id)
            .execute(&mut *tx)
            .await;

            let _ = crate::models::event_log::EventLog::shift_cancelled(
                &mut *tx, 
                user_id, 
                sid, 
                di, 
                &st, 
                &an, 
                &vn, 
                dn.as_deref(), 
                "User account deactivated"
            ).await;
        }
        
        let _ = crate::models::event_log::EventLog::profile_deactivated(&mut *tx, user_id, Some(admin.0.id)).await;
    } else if !was_active && new_status {
        let _ = crate::models::event_log::EventLog::profile_reactivated(&mut *tx, user_id, Some(admin.0.id)).await;
    }

    if let Err(e) = tx.commit().await {
        tracing::error!(error = %e, "Failed to commit user toggle");
        return Flash::error(Redirect::to("/admin/site"), "Failed to save update");
    }

    Flash::success(Redirect::to("/admin/site"), "Account status updated.")
}

#[post("/site/users/<id>/promote")]
async fn site_user_promote(id: &str, db: &Db, _admin: AdminUser) -> Flash<Redirect> {
    let user_id = match Uuid::parse_str(id) {
        Ok(u) => u,
        Err(_) => return Flash::error(Redirect::to("/admin/site"), "Invalid user ID."),
    };

    let _ = sqlx::query(
        "UPDATE users SET role = 'admin', updated_at = now() WHERE id = $1",
    )
    .bind(user_id)
    .execute(&**db)
    .await;

    Flash::success(Redirect::to("/admin/site"), "User promoted to admin.")
}

#[post("/site/users/<id>/demote")]
async fn site_user_demote(id: &str, db: &Db, admin: AdminUser) -> Flash<Redirect> {
    let user_id = match Uuid::parse_str(id) {
        Ok(u) => u,
        Err(_) => return Flash::error(Redirect::to("/admin/site"), "Invalid user ID."),
    };
    if user_id == admin.0.id {
        return Flash::error(Redirect::to("/admin/site"), "You cannot demote yourself.");
    }

    let _ = sqlx::query(
        "UPDATE users SET role = 'volunteer', updated_at = now() WHERE id = $1",
    )
    .bind(user_id)
    .execute(&**db)
    .await;

    Flash::success(Redirect::to("/admin/site"), "Admin privileges removed.")
}

// ─── Database backup ─────────────────────────────────────────────────────────

fn get_db_url() -> Option<String> {
    if let Ok(url) = std::env::var("DATABASE_URL") {
        if !url.is_empty() {
            return Some(url);
        }
    }
    if let Ok(rocket_db) = std::env::var("ROCKET_DATABASES") {
        if let Some(start) = rocket_db.find("url=\"") {
            let rest = &rocket_db[start + 5..];
            if let Some(end) = rest.find('"') {
                return Some(rest[..end].to_string());
            }
        }
    }
    None
}

struct BackupDownload {
    filename: String,
    data: Vec<u8>,
}

impl<'r> rocket::response::Responder<'r, 'static> for BackupDownload {
    fn respond_to(self, _req: &'r rocket::Request<'_>) -> rocket::response::Result<'static> {
        rocket::Response::build()
            .header(ContentType::new("application", "gzip"))
            .raw_header(
                "Content-Disposition",
                format!("attachment; filename=\"{}\"", self.filename),
            )
            .sized_body(self.data.len(), std::io::Cursor::new(self.data))
            .ok()
    }
}

#[get("/site/backup")]
async fn site_backup(
    _admin: AdminUser,
) -> Result<BackupDownload, Flash<Redirect>> {
    let db_url = get_db_url()
        .ok_or_else(|| Flash::error(Redirect::to("/admin/site"), "Database URL not configured."))?;

    let output = tokio::process::Command::new("pg_dump")
        .arg(&db_url)
        .arg("--no-owner")
        .arg("--no-acl")
        .output()
        .await
        .map_err(|e| Flash::error(Redirect::to("/admin/site"), format!("pg_dump failed: {e}")))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(Flash::error(
            Redirect::to("/admin/site"),
            format!("pg_dump error: {}", stderr.chars().take(200).collect::<String>()),
        ));
    }

    // Gzip compress
    use std::io::Write;
    let mut encoder = flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::default());
    encoder.write_all(&output.stdout)
        .map_err(|e| Flash::error(Redirect::to("/admin/site"), format!("Compression failed: {e}")))?;
    let compressed = encoder.finish()
        .map_err(|e| Flash::error(Redirect::to("/admin/site"), format!("Compression failed: {e}")))?;

    Ok(BackupDownload {
        filename: format!("sunshine-backup-{}.sql.gz", chrono::Utc::now().format("%Y%m%d-%H%M%S")),
        data: compressed,
    })
}

// ─── Database restore ────────────────────────────────────────────────────────

#[post("/site/restore", data = "<data>")]
async fn site_restore(
    data: Data<'_>,
    content_type: &ContentType,
    _admin: AdminUser,
) -> Flash<Redirect> {
    let db_url = match get_db_url() {
        Some(url) => url,
        None => return Flash::error(Redirect::to("/admin/site"), "Database URL not configured."),
    };

    // Read upload (limit 500 MB)
    let bytes = match data.open(500.mebibytes()).into_bytes().await {
        Ok(b) if b.is_complete() => b.into_inner(),
        Ok(_) => return Flash::error(Redirect::to("/admin/site"), "Upload too large (max 500 MB)."),
        Err(e) => return Flash::error(Redirect::to("/admin/site"), format!("Upload failed: {e}")),
    };

    // Decompress if gzip
    let sql = if content_type.to_string().contains("gzip")
        || bytes.get(0..2) == Some(&[0x1f, 0x8b])
    {
        use std::io::Read;
        let mut decoder = flate2::read::GzDecoder::new(&bytes[..]);
        let mut decompressed = Vec::new();
        match decoder.read_to_end(&mut decompressed) {
            Ok(_) => decompressed,
            Err(e) => return Flash::error(Redirect::to("/admin/site"), format!("Decompression failed: {e}")),
        }
    } else {
        bytes
    };

    // Run psql
    use tokio::io::AsyncWriteExt;
    let mut child = match tokio::process::Command::new("psql")
        .arg(&db_url)
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
    {
        Ok(c) => c,
        Err(e) => return Flash::error(Redirect::to("/admin/site"), format!("Failed to run psql: {e}")),
    };

    if let Some(mut stdin) = child.stdin.take() {
        let _ = stdin.write_all(&sql).await;
        let _ = stdin.shutdown().await;
    }

    match child.wait().await {
        Ok(status) if status.success() => {
            Flash::success(Redirect::to("/admin/site"), "Database restored successfully.")
        }
        Ok(_) => Flash::error(Redirect::to("/admin/site"), "psql returned an error during restore."),
        Err(e) => Flash::error(Redirect::to("/admin/site"), format!("Restore failed: {e}")),
    }
}

// ─── Seed data ───────────────────────────────────────────────────────────────

#[derive(rocket::form::FromForm)]
struct SeedForm {
    #[field(default = false)]
    seed_taxonomy: bool,
    #[field(default = false)]
    seed_regions: bool,
    #[field(default = false)]
    seed_mock: bool,
}

#[post("/site/seed", data = "<form>")]
async fn site_seed(
    form: Form<SeedForm>,
    _admin: AdminUser,
) -> Flash<Redirect> {
    let f = form.into_inner();
    if !f.seed_taxonomy && !f.seed_regions && !f.seed_mock {
        return Flash::error(Redirect::to("/admin/site"), "Select at least one seed option.");
    }

    let db_url = match get_db_url() {
        Some(url) => url,
        None => return Flash::error(Redirect::to("/admin/site"), "Database URL not configured."),
    };

    let mut args = Vec::new();
    if f.seed_taxonomy { args.push("--taxonomy"); }
    if f.seed_regions { args.push("--regions"); }
    if f.seed_mock { args.push("--mock"); }

    let output = tokio::process::Command::new("./seed")
        .args(&args)
        .env("DATABASE_URL", &db_url)
        .output()
        .await;

    match output {
        Ok(o) if o.status.success() => {
            let stdout = String::from_utf8_lossy(&o.stdout);
            let summary = stdout.lines().filter(|l| l.contains('✓')).collect::<Vec<_>>().join(", ");
            Flash::success(
                Redirect::to("/admin/site"),
                format!("Seed complete. {summary}"),
            )
        }
        Ok(o) => {
            let stderr = String::from_utf8_lossy(&o.stderr);
            Flash::error(
                Redirect::to("/admin/site"),
                format!("Seed failed: {}", stderr.chars().take(300).collect::<String>()),
            )
        }
        Err(e) => Flash::error(Redirect::to("/admin/site"), format!("Failed to run seed: {e}")),
    }
}

/// POST /admin/site/check-missing-surveys
/// Manually trigger the survey prompt checker.
#[post("/site/check-missing-surveys")]
async fn check_missing_surveys(
    db: &Db,
    _admin: AdminUser,
    email: &rocket::State<EmailService>,
    cfg: &rocket::State<AppConfig>,
) -> crate::errors::AppResult<Template> {
    let processed = process_pending_surveys(&**db, email, &cfg.app_url).await?;
    
    Ok(Template::render(
        "admin/partials/survey_check_results",
        context! {
            count: processed.len(),
            processed,
        }
    ))
}
