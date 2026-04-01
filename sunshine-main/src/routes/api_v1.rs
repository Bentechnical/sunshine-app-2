use rocket::{get, post, serde::json::Json, http::{Cookie, CookieJar, SameSite}};
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use chrono::{DateTime, Utc};
use crate::Db;
use crate::auth::session::AuthUser;
use crate::errors::{AppError, AppResult};

#[derive(Debug, Serialize)]
pub struct SyncResponse {
    pub volunteer: Option<VolunteerProfileSync>,
    pub shifts: Vec<ShiftSync>,
    pub agencies: Vec<AgencySync>,
    pub dogs: Vec<DogSync>,
    pub assets: Vec<AssetSync>,
    pub server_time: i64,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct VolunteerProfileSync {
    pub id: Uuid,
    pub volunteer_names: String,
    pub bio: Option<String>,
    pub joined_at: chrono::NaiveDate,
    pub profile_pic_asset_id: Option<Uuid>,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct ShiftSync {
    pub id: Uuid,
    pub agency_id: Uuid,
    pub site_id: Uuid,
    pub title: String,
    pub description: Option<String>,
    pub start_at: DateTime<Utc>,
    pub end_at: DateTime<Utc>,
    pub state: String,
    pub slots_requested: i32,
    pub slots_filled: i64,
    pub status: Option<String>, // 'confirmed', 'waitlisted', etc. for the current user
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct AgencySync {
    pub id: Uuid,
    pub name: String,
    pub address: Option<String>,
    pub lat: Option<f64>,
    pub lng: Option<f64>,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct DogSync {
    pub id: Uuid,
    pub volunteer_id: Uuid,
    pub name: String,
    pub breed_id: Option<Uuid>,
    pub breed_name: Option<String>,
    pub photo_asset_id: Option<Uuid>,
    pub is_active: bool,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct AssetSync {
    pub id: Uuid,
    pub shift_id: Option<Uuid>,
    pub mime_type: String,
    pub visibility: String,
}

/// GET /api/v1/volunteer/sync?since=<unix_timestamp>
#[get("/volunteer/sync?<since>")]
pub async fn volunteer_sync(
    since: Option<i64>,
    db: &Db,
    user: AuthUser,
) -> AppResult<Json<SyncResponse>> {
    let user_id = user.id();
    let _since_dt = since.map(|s| DateTime::<Utc>::from_naive_utc_and_offset(chrono::NaiveDateTime::from_timestamp_opt(s, 0).unwrap_or_default(), Utc));

    // 1. Get volunteer profile
    let volunteer: Option<VolunteerProfileSync> = sqlx::query_as(
        r#"
        SELECT user_id as id, volunteer_names, bio, joined_at, profile_pic_asset_id
        FROM volunteer_profiles
        WHERE user_id = $1
        "#
    )
    .bind(user_id)
    .fetch_optional(&**db)
    .await?;

    // 2. Get shifts (assigned to user OR available for sign-up)
    // For now, we'll get all published shifts + user's own assignments
    let shifts: Vec<ShiftSync> = sqlx::query_as(
        r#"
        SELECT 
            s.id, s.agency_id, s.site_id, s.title, s.description, s.start_at, s.end_at, 
            s.state::text as state, s.slots_requested,
            (SELECT COUNT(*) FROM shift_assignments sa2 WHERE sa2.shift_id = s.id AND sa2.status = 'confirmed') as slots_filled,
            sa.status::text as status
        FROM shifts s
        LEFT JOIN shift_assignments sa ON sa.shift_id = s.id AND sa.volunteer_id = $1
        WHERE s.state = 'published' OR sa.id IS NOT NULL
        ORDER BY s.start_at ASC
        "#
    )
    .bind(user_id)
    .fetch_all(&**db)
    .await?;

    // 3. Get agencies associated with these shifts (address/coords from first active site)
    let agencies: Vec<AgencySync> = sqlx::query_as(
        r#"
        SELECT DISTINCT ON (a.id)
            a.id,
            a.name,
            si.address,
            ST_Y(si.geom::geometry) AS lat,
            ST_X(si.geom::geometry) AS lng
        FROM agencies a
        JOIN shifts s ON s.agency_id = a.id
        LEFT JOIN shift_assignments sa ON sa.shift_id = s.id AND sa.volunteer_id = $1
        LEFT JOIN sites si ON si.agency_id = a.id AND si.is_active = true
        WHERE s.state = 'published' OR sa.id IS NOT NULL
        "#
    )
    .bind(user_id)
    .fetch_all(&**db)
    .await?;

    // 4. Get volunteer's dogs
    let dogs: Vec<DogSync> = sqlx::query_as(
        r#"
        SELECT d.id, d.volunteer_id, d.name, d.breed_id, dt.name as breed_name, d.photo_asset_id, d.is_active
        FROM dogs d
        LEFT JOIN dog_types dt ON dt.id = d.breed_id
        WHERE d.volunteer_id = $1
        "#
    )
    .bind(user_id)
    .fetch_all(&**db)
    .await?;

    // 5. Get recent assets (gallery)
    // For now, just a few recent curated assets
    let assets: Vec<AssetSync> = sqlx::query_as(
        r#"
        SELECT id, shift_id, mime_type, visibility::text
        FROM assets
        WHERE visibility = 'curated'
        ORDER BY uploaded_at DESC
        LIMIT 50
        "#
    )
    .fetch_all(&**db)
    .await?;

    Ok(Json(SyncResponse {
        volunteer,
        shifts,
        agencies,
        dogs,
        assets,
        server_time: Utc::now().timestamp(),
    }))
}

#[derive(Deserialize)]
pub struct ThemePreferenceRequest {
    pub theme: String,
}

/// POST /api/v1/preferences/theme
/// Persists the user's theme preference to the DB and refreshes the cookie.
#[post("/preferences/theme", data = "<body>")]
pub async fn set_theme_preference(
    body: Json<ThemePreferenceRequest>,
    db: &Db,
    user: AuthUser,
    jar: &CookieJar<'_>,
) -> AppResult<rocket::http::Status> {
    let theme = body.theme.as_str();
    if !matches!(theme, "light" | "dark" | "system") {
        return Err(AppError::BadRequest("Invalid theme value".into()));
    }

    sqlx::query("UPDATE users SET theme_preference = $1, updated_at = now() WHERE id = $2")
        .bind(theme)
        .bind(user.id())
        .execute(&**db)
        .await?;

    let mut cookie = Cookie::new("theme", theme.to_string());
    cookie.set_http_only(false);
    cookie.set_same_site(SameSite::Lax);
    cookie.set_path("/");
    cookie.set_max_age(rocket::time::Duration::days(365));
    jar.add(cookie);

    Ok(rocket::http::Status::Ok)
}

pub fn routes() -> Vec<rocket::Route> {
    rocket::routes![volunteer_sync, set_theme_preference]
}
