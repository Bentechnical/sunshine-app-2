use rocket::{get, post, serde::json::Json, State};
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use crate::Db;
use crate::auth::session::{AuthUser, AdminUser};
use crate::models::event_log::EventLog;

use crate::models::shift::{AssignmentStatus, ShiftAssignment};

#[derive(Debug, Deserialize)]
pub struct InviteRequest {
    pub volunteer_ids: Vec<Uuid>,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct VolunteerSearchRow {
    pub id: Uuid,
    pub name: String,
    pub primary_dog: Option<String>,
}

/// GET /api/volunteers/search?q=...
#[get("/volunteers/search?<q>")]
pub async fn volunteer_search(q: Option<&str>, db: &Db, _admin: AdminUser) -> Json<Vec<VolunteerSearchRow>> {
    let query = q.unwrap_or("").trim();
    
    let results = if query.is_empty() {
        // Return 10 active volunteers by default
        sqlx::query_as::<_, VolunteerSearchRow>(
            r#"
            SELECT vp.user_id as id, vp.volunteer_names as name, d.name as primary_dog
            FROM volunteer_profiles vp
            JOIN users u ON u.id = vp.user_id
            LEFT JOIN dogs d ON d.volunteer_id = vp.user_id AND d.is_primary = true AND d.is_active = true
            WHERE u.is_active = true
            ORDER BY vp.volunteer_names ASC
            LIMIT 10
            "#
        )
        .fetch_all(&**db)
        .await
    } else {
        sqlx::query_as::<_, VolunteerSearchRow>(
            r#"
            SELECT vp.user_id as id, vp.volunteer_names as name, d.name as primary_dog
            FROM volunteer_profiles vp
            JOIN users u ON u.id = vp.user_id
            LEFT JOIN dogs d ON d.volunteer_id = vp.user_id AND d.is_primary = true AND d.is_active = true
            WHERE u.is_active = true AND (vp.volunteer_names ILIKE $1 OR d.name ILIKE $1)
            ORDER BY vp.volunteer_names ASC
            LIMIT 10
            "#
        )
        .bind(format!("%{}%", query))
        .fetch_all(&**db)
        .await
    }
    .unwrap_or_default();

    Json(results)
}

/// POST /api/shifts/<id>/invite
#[post("/shifts/<id>/invite", data = "<input>")]
async fn shift_invite(
    id: &str,
    input: Json<InviteRequest>,
    db: &Db,
    admin: AdminUser,
) -> Json<bool> {
    let shift_id = match id.parse::<Uuid>() {
        Ok(u) => u,
        Err(_) => return Json(false),
    };

    // Get shift info for notification and event log
    let shift_info: Option<(i32, i64, String, String)> = match sqlx::query_as(
        r#"
        SELECT s.slots_requested,
               COUNT(sa.id) FILTER (WHERE sa.status IN ('confirmed', 'pending_confirmation')),
               s.title,
               a.name
        FROM shifts s
        JOIN agencies a ON a.id = s.agency_id
        LEFT JOIN shift_assignments sa ON sa.shift_id = s.id
        WHERE s.id = $1
        GROUP BY s.slots_requested, s.title, a.name
        "#
    )
    .bind(shift_id)
    .fetch_optional(&**db)
    .await {
        Ok(res) => res,
        Err(_) => return Json(false),
    };

    let (slots_requested, mut slots_filled, shift_title, agency_name) = match shift_info {
        Some(info) => info,
        None => return Json(false),
    };

    for vid in &input.volunteer_ids {
        let mut tx = match db.begin().await {
            Ok(tx) => tx,
            Err(_) => continue,
        };

        // Determine status based on current capacity
        let status = if slots_filled < slots_requested as i64 {
            AssignmentStatus::PendingConfirmation
        } else {
            AssignmentStatus::Waitlisted
        };

        // Get volunteer's primary dog
        let dog_id: Option<Uuid> = sqlx::query_scalar(
            "SELECT id FROM dogs WHERE volunteer_id = $1 AND is_primary = true AND is_active = true"
        )
        .bind(vid)
        .fetch_optional(&mut *tx)
        .await
        .unwrap_or(None);

        // Get waitlist position if needed
        let waitlist_pos: Option<i32> = if status == AssignmentStatus::Waitlisted {
            sqlx::query_scalar(
                "SELECT COALESCE(MAX(waitlist_position), 0) + 1 FROM shift_assignments WHERE shift_id = $1 AND status = 'waitlisted'"
            )
            .bind(shift_id)
            .fetch_optional(&mut *tx)
            .await
            .unwrap_or(Some(1))
        } else {
            None
        };

        // Create assignment
        let res = sqlx::query(
            r#"
            INSERT INTO shift_assignments (shift_id, volunteer_id, dog_ids, status, waitlist_position, assigned_at)
            VALUES ($1, $2, $3, $4, $5, now())
            ON CONFLICT (shift_id, volunteer_id) 
            DO UPDATE SET 
                status = EXCLUDED.status, 
                waitlist_position = EXCLUDED.waitlist_position,
                updated_at = now()
            "#
        )
        .bind(shift_id)
        .bind(vid)
        .bind(dog_id.map(|id| vec![id]).unwrap_or_default())
        .bind(&status)
        .bind(waitlist_pos)
        .execute(&mut *tx)
        .await;

        if res.is_err() { continue; }

        // Update local counter if we took a spot
        if status == AssignmentStatus::PendingConfirmation {
            slots_filled += 1;
        }

        // Get volunteer and dog names for enriched logging
        let names: Option<(String, Option<String>)> = sqlx::query_as(
            "SELECT vp.volunteer_names, d.name FROM volunteer_profiles vp LEFT JOIN dogs d ON d.id = $2 WHERE vp.user_id = $1"
        )
        .bind(vid)
        .bind(dog_id)
        .fetch_optional(&mut *tx)
        .await
        .unwrap_or(None);

        let (volunteer_name, dog_name) = match names {
            Some((vn, dn)) => (vn, dn),
            None => ("A volunteer".to_string(), None),
        };

        // Create notification
        let (notif_type, title, body) = if status == AssignmentStatus::PendingConfirmation {
            (
                "shift_invite",
                format!("Invite: {}", shift_title),
                format!("You've been invited to join the shift '{}' at {}. Tap to view and confirm.", shift_title, agency_name)
            )
        } else {
            (
                "waitlist_invite",
                format!("Waitlist: {}", shift_title),
                format!("You've been added to the waitlist for the shift '{}' at {}. We'll notify you if a spot opens up!", shift_title, agency_name)
            )
        };

        let _ = sqlx::query(
            r#"
            INSERT INTO notifications (user_id, type, title, body, payload)
            VALUES ($1, $2, $3, $4, $5)
            "#
        )
        .bind(vid)
        .bind(notif_type)
        .bind(title)
        .bind(body)
        .bind(serde_json::json!({ "shift_id": shift_id }))
        .execute(&mut *tx)
        .await;

        // Log event
        if status == AssignmentStatus::PendingConfirmation {
            let _ = EventLog::shift_invited(
                &mut *tx, 
                *vid, 
                shift_id, 
                dog_id, 
                &shift_title, 
                &agency_name, 
                &volunteer_name, 
                dog_name.as_deref(), 
                admin.0.id
            ).await;
        } else {
            let _ = EventLog::shift_joined(
                &mut *tx,
                *vid,
                shift_id,
                dog_id,
                &shift_title,
                &agency_name,
                &volunteer_name,
                dog_name.as_deref(),
                true // waitlisted
            ).await;
        }

        let _ = tx.commit().await;
    }

    Json(true)
}

/// GET /api/shifts — paginated/filtered shift list (HTMX partial)
#[get("/shifts?<page>&<region>&<distance_km>&<agency_type>")]
async fn shifts_list(
    page: Option<u32>,
    region: Option<&str>,
    distance_km: Option<f64>,
    agency_type: Option<&str>,
) -> &'static str {
    let _ = (page, region, distance_km, agency_type);
    "[]"
}

/// GET /api/shifts/<id>/hover — hover card partial (HTMX, loaded on first hover)
#[get("/shifts/<id>/hover")]
async fn shift_hover_card(
    id: &str,
    db: &crate::Db,
    _user: AuthUser,
) -> rocket_dyn_templates::Template {
    use rocket_dyn_templates::context;
    use uuid::Uuid;

    let shift_id = id.parse::<Uuid>().ok();

    let team: Vec<(String, Option<String>, Option<String>)> = if let Some(sid) = shift_id {
        sqlx::query_as(
            r#"
            SELECT vp.volunteer_names, d.name, dt.name
            FROM shift_assignments sa
            JOIN volunteer_profiles vp ON vp.user_id = sa.volunteer_id
            LEFT JOIN dogs d ON d.id = sa.dog_ids[1]
            LEFT JOIN dog_types dt ON dt.id = d.breed_id
            WHERE sa.shift_id = $1 AND sa.status = 'confirmed'
            ORDER BY sa.assigned_at ASC
            "#
        )
        .bind(sid)
        .fetch_all(&**db)
        .await
        .unwrap_or_default()
    } else {
        vec![]
    };

    rocket_dyn_templates::Template::render("partials/shift_hover_card", context! { team })
}

/// GET /api/volunteers/<id>/hover — hover card partial (HTMX)
#[get("/volunteers/<id>/hover")]
async fn volunteer_hover_card(
    id: &str,
    db: &crate::Db,
    _user: AuthUser,
) -> rocket_dyn_templates::Template {
    use rocket_dyn_templates::context;
    use uuid::Uuid;

    let user_id = id.parse::<Uuid>().ok();

    #[derive(Debug, serde::Serialize, sqlx::FromRow)]
    struct HoverData {
        volunteer_names: String,
        joined_at: chrono::NaiveDate,
        profile_pic_asset_id: Option<Uuid>,
        total_shifts: i64,
        dog_name: Option<String>,
        dog_breed: Option<String>,
        dog_size: Option<String>,
        dog_gender: Option<String>,
        dog_bio: Option<String>,
    }

    let team: Option<HoverData> = if let Some(uid) = user_id {
        sqlx::query_as(
            r#"
            SELECT 
                vp.volunteer_names, vp.joined_at, vp.profile_pic_asset_id,
                (SELECT COUNT(*) FROM shift_assignments sa WHERE sa.volunteer_id = vp.user_id AND sa.status = 'confirmed') as total_shifts,
                d.name as dog_name, dt.name as dog_breed, d.size::text as dog_size, d.gender::text as dog_gender, d.personality_desc as dog_bio
            FROM volunteer_profiles vp
            LEFT JOIN dogs d ON d.volunteer_id = vp.user_id AND d.is_primary = true
            LEFT JOIN dog_types dt ON dt.id = d.breed_id
            WHERE vp.user_id = $1
            "#
        )
        .bind(uid)
        .fetch_optional(&**db)
        .await
        .unwrap_or(None)
    } else {
        None
    };

    rocket_dyn_templates::Template::render("partials/volunteer_hover_card", context! { team })
}

#[derive(Debug, Serialize)]
pub struct UpcomingAssignment {
    pub shift_id: Uuid,
    pub title: String,
    pub start_at: chrono::DateTime<chrono::Utc>,
    pub agency_name: String,
}

#[derive(Debug, Serialize)]
pub struct DogAssignmentsResponse {
    pub dog_name: String,
    pub assignments: Vec<UpcomingAssignment>,
}

/// GET /api/dogs/<id>/upcoming-assignments
#[get("/dogs/<id>/upcoming-assignments")]
pub async fn dog_upcoming_assignments(id: &str, db: &Db, _user: AuthUser) -> Json<DogAssignmentsResponse> {
    let dog_id = match id.parse::<Uuid>() {
        Ok(u) => u,
        Err(_) => return Json(DogAssignmentsResponse { dog_name: "Unknown".to_string(), assignments: vec![] }),
    };

    let dog_name: String = sqlx::query_scalar("SELECT name FROM dogs WHERE id = $1")
        .bind(dog_id)
        .fetch_one(&**db)
        .await
        .unwrap_or_else(|_| "Unknown".to_string());

    let assignments = sqlx::query_as!(
        UpcomingAssignment,
        r#"
        SELECT s.id as shift_id, s.title, s.start_at, a.name as agency_name
        FROM shift_assignments sa
        JOIN shifts s ON s.id = sa.shift_id
        JOIN agencies a ON a.id = s.agency_id
        WHERE $1 = ANY(sa.dog_ids)
          AND s.start_at > now()
          AND sa.status IN ('confirmed', 'waitlisted', 'pending_confirmation')
        ORDER BY s.start_at ASC
        "#,
        dog_id
    )
    .fetch_all(&**db)
    .await
    .unwrap_or_default();

    Json(DogAssignmentsResponse { dog_name, assignments })
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct UserShift {
    pub shift_id: Uuid,
    pub title: String,
    pub start_at: chrono::DateTime<chrono::Utc>,
    pub agency_name: String,
    pub status: String,
}

/// GET /api/users/<id>/upcoming-shifts
#[get("/users/<id>/upcoming-shifts")]
pub async fn user_upcoming_shifts(id: &str, db: &Db, _admin: AdminUser) -> Json<Vec<UserShift>> {
    let user_id = match id.parse::<Uuid>() {
        Ok(u) => u,
        Err(_) => return Json(vec![]),
    };

    let assignments = sqlx::query_as!(
        UserShift,
        r#"
        SELECT s.id as shift_id, s.title, s.start_at, a.name as agency_name, sa.status::text as "status!"
        FROM shift_assignments sa
        JOIN shifts s ON s.id = sa.shift_id
        JOIN agencies a ON a.id = s.agency_id
        WHERE sa.volunteer_id = $1
          AND s.start_at > now()
          AND sa.status IN ('confirmed', 'waitlisted', 'pending_confirmation')
        ORDER BY s.start_at ASC
        "#,
        user_id
    )
    .fetch_all(&**db)
    .await
    .unwrap_or_default();

    Json(assignments)
}

/// GET /api/shifts/<id>/availability
/// Returns current slot fill state for pre-submit race-condition checks.
#[derive(Debug, Serialize)]
pub struct ShiftAvailability {
    pub slots_requested: i32,
    pub slots_filled: i64,
    pub is_full: bool,
}

#[get("/shifts/<id>/availability")]
async fn shift_availability(
    id: &str,
    db: &Db,
    _user: AuthUser,
) -> Json<ShiftAvailability> {
    let shift_id = match id.parse::<Uuid>() {
        Ok(u) => u,
        Err(_) => return Json(ShiftAvailability { slots_requested: 0, slots_filled: 0, is_full: true }),
    };

    let row: Option<(i32, i64)> = sqlx::query_as(
        r#"
        SELECT s.slots_requested,
               COUNT(sa.id) FILTER (WHERE sa.status IN ('confirmed', 'pending_confirmation'))
        FROM shifts s
        LEFT JOIN shift_assignments sa ON sa.shift_id = s.id
        WHERE s.id = $1
        GROUP BY s.slots_requested
        "#,
    )
    .bind(shift_id)
    .fetch_optional(&**db)
    .await
    .unwrap_or(None);

    match row {
        Some((slots_requested, slots_filled)) => Json(ShiftAvailability {
            slots_requested,
            slots_filled,
            is_full: slots_filled >= slots_requested as i64,
        }),
        None => Json(ShiftAvailability { slots_requested: 0, slots_filled: 0, is_full: true }),
    }
}

pub fn routes() -> Vec<rocket::Route> {
    rocket::routes![
        volunteer_search,
        shift_invite,
        shifts_list,
        shift_hover_card,
        volunteer_hover_card,
        notification_unread_count,
        dog_upcoming_assignments,
        user_upcoming_shifts,
        shift_availability,
    ]
}

/// GET /api/notifications/unread-count
/// Returns an HTML fragment (the nav badge span) for HTMX outerHTML swap.
#[get("/notifications/unread-count")]
pub async fn notification_unread_count(
    user: Option<AuthUser>,
    db: &Db,
) -> rocket::response::content::RawHtml<String> {
    let count: i64 = if let Some(u) = user {
        sqlx::query_scalar(
            "SELECT COUNT(*) FROM notifications
             WHERE user_id = $1 AND read_at IS NULL AND archived_at IS NULL",
        )
        .bind(u.id())
        .fetch_one(&**db)
        .await
        .unwrap_or(0)
    } else {
        0
    };

    let label = if count > 99 {
        "99+".to_string()
    } else {
        count.to_string()
    };

    let html = if count > 0 {
        format!(
            r#"<span class="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[1.125rem] h-[1.125rem] flex items-center justify-center px-0.5"
                     hx-get="/api/notifications/unread-count"
                     hx-trigger="every 60s"
                     hx-swap="outerHTML">{label}</span>"#
        )
    } else {
        r#"<span class="hidden"
                  hx-get="/api/notifications/unread-count"
                  hx-trigger="every 60s"
                  hx-swap="outerHTML"></span>"#
            .to_string()
    };

    rocket::response::content::RawHtml(html)
}
