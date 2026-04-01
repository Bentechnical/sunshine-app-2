use chrono::{DateTime, Utc};
use rocket::{delete, fs::TempFile, get, post, routes, Route, form::Form, response::{Flash, Redirect}, request::FlashMessage};
use rocket_dyn_templates::{context, Template};
use serde::Serialize;
use uuid::Uuid;

use crate::auth::session::AgencyUser;
use crate::errors::{AppResult, AppError};
use crate::models::event_log::EventLog;
use crate::models::user::UserRole;
use crate::auth::magic_link::MagicLinkService;
use crate::config::AppConfig;
use crate::email::EmailService;
use crate::models::agency::ContactVisibility;
use crate::models::gallery::{AssetVisibility, get_agency_gallery, GalleryItem};
use crate::routes::gallery::handle_upload;
use crate::storage::StorageBackend;
use crate::Db;
use rocket::State;

pub fn routes() -> Vec<Route> {
    routes![
        dashboard,
        profile,
        profile_update,
        agency_team,
        agency_add_contact,
        invite_contact,
        archive_contact,
        check_contact_assignments,
        set_primary_contact,
        shift_detail,
        shift_update_minor,
        shift_add_contact,
        shift_message_volunteers,
        shift_request_change,
        shift_new,
        survey_form,
        survey_submit,
        agency_gallery,
        agency_upload,
        agency_survey_upload,
        dismiss_notification,
        // Calendar
        calendar_settings_page,
        calendar_token_regenerate,
    ]
}

#[derive(Debug, Serialize, sqlx::FromRow)]
struct AgencyProfileData {
    // Contact fields
    contact_name: String,
    contact_title: Option<String>,
    contact_phone: Option<String>,
    contact_phone_visibility: ContactVisibility,
    contact_email: Option<String>,
    contact_email_visibility: ContactVisibility,
    // Agency fields
    agency_name: String,
    agency_description: Option<String>,
}

/// GET /agency/profile
#[get("/profile")]
async fn profile(db: &Db, au: AgencyUser) -> AppResult<Template> {
    let profile: Option<AgencyProfileData> = sqlx::query_as(
        r#"
        SELECT 
            c.name AS contact_name, c.title AS contact_title, 
            c.phone AS contact_phone, c.phone_visibility AS contact_phone_visibility,
            c.email AS contact_email, c.email_visibility AS contact_email_visibility,
            a.name AS agency_name, a.description AS agency_description
        FROM contacts c
        JOIN agencies a ON a.id = c.agency_id
        WHERE c.user_id = $1 AND c.agency_id = $2
        "#
    )
    .bind(au.user.id)
    .bind(au.agency_id)
    .fetch_optional(&**db)
    .await?;

    let profile = profile.ok_or(AppError::NotFound)?;

    Ok(Template::render(
        "agency/profile",
        context! {
            user: au.user.clone(),
            profile,
        },
    ))
}

#[derive(rocket::form::FromForm)]
struct AgencyProfileForm<'r> {
    contact_name: &'r str,
    contact_title: &'r str,
    contact_phone: &'r str,
    contact_phone_visibility: &'r str,
    contact_email_visibility: &'r str,
}

#[post("/profile", data = "<form>")]
async fn profile_update(
    form: Form<AgencyProfileForm<'_>>,
    db: &Db,
    au: AgencyUser,
) -> Flash<Redirect> {
    let f = form.into_inner();
    
    let phone_vis = match f.contact_phone_visibility {
        "visible" => ContactVisibility::Visible,
        "lead_up" => ContactVisibility::LeadUp,
        _ => ContactVisibility::Hidden,
    };

    let email_vis = match f.contact_email_visibility {
        "visible" => ContactVisibility::Visible,
        "lead_up" => ContactVisibility::LeadUp,
        _ => ContactVisibility::Hidden,
    };

    match sqlx::query(
        "UPDATE contacts SET name = $1, title = $2, phone = $3, 
                phone_visibility = $4, email_visibility = $5, updated_at = now() 
         WHERE user_id = $6 AND agency_id = $7"
    )
    .bind(f.contact_name)
    .bind(if f.contact_title.is_empty() { None } else { Some(f.contact_title) })
    .bind(if f.contact_phone.is_empty() { None } else { Some(f.contact_phone) })
    .bind(phone_vis)
    .bind(email_vis)
    .bind(au.user.id)
    .bind(au.agency_id)
    .execute(&**db)
    .await
    {
        Ok(_) => Flash::success(Redirect::to("/agency/profile"), "Profile updated"),
        Err(e) => {
            tracing::error!(error = %e, "Failed to update agency contact profile");
            Flash::error(Redirect::to("/agency/profile"), "Failed to update profile")
        }
    }
}

#[derive(Debug, Serialize, sqlx::FromRow)]
struct AgencyTeamMember {
    id: Uuid,
    name: String,
    title: Option<String>,
    email: Option<String>,
    phone: Option<String>,
    is_primary: bool,
    is_active: bool,
    user_id: Option<Uuid>,
    email_verified_at: Option<DateTime<Utc>>,
}

/// GET /agency/team
#[get("/team")]
async fn agency_team(db: &Db, au: AgencyUser, flash: Option<rocket::request::FlashMessage<'_>>) -> AppResult<Template> {
    let members: Vec<AgencyTeamMember> = sqlx::query_as(
        r#"
        SELECT 
            c.id, c.name, c.title, c.email, c.phone, 
            c.is_primary, c.is_active, COALESCE(c.user_id, u.id) as user_id,
            u.email_verified_at
        FROM contacts c
        LEFT JOIN users u ON (u.id = c.user_id OR (c.user_id IS NULL AND c.email IS NOT NULL AND LOWER(c.email) = LOWER(u.email)))
        WHERE c.agency_id = $1
        ORDER BY c.is_active DESC, c.is_primary DESC, c.name ASC
        "#
    )
    .bind(au.agency_id)
    .fetch_all(&**db)
    .await?;

    // Proactively fix missing links if we found users by email but user_id is null in DB
    for m in &members {
        if m.user_id.is_some() {
            // Check if it was a COALESCE match (i.e. if the contact record itself has no user_id)
            let db_user_id: Option<Uuid> = sqlx::query_scalar("SELECT user_id FROM contacts WHERE id = $1")
                .bind(m.id)
                .fetch_one(&**db)
                .await
                .unwrap_or(None);
            
            if db_user_id.is_none() {
                let _ = sqlx::query("UPDATE contacts SET user_id = $1 WHERE id = $2")
                    .bind(m.user_id)
                    .bind(m.id)
                    .execute(&**db)
                    .await;
            }
        }
    }

    Ok(Template::render(
        "agency/team",
        context! {
            user: au.user.clone(),
            members,
            agency_id: au.agency_id,
            flash: flash.map(|f| {
                serde_json::json!({
                    "kind": f.kind().to_string(),
                    "message": f.message().to_string()
                })
            }),
        },
    ))
}

#[post("/team/new", data = "<form>")]
async fn agency_add_contact(
    form: Form<NewContactForm<'_>>,
    db: &Db,
    au: AgencyUser,
    config: &State<AppConfig>,
    email_svc: &State<EmailService>,
) -> AppResult<Flash<Redirect>> {
    let f = form.into_inner();
    let redirect = Redirect::to("/agency/team");
    let email_normalized = f.email.trim().to_lowercase();

    let mut tx = db.begin().await?;

    // 1. Create user if email is provided and doesn't exist
    let mut user_id = None;
    let mut sent_invite = false;

    if !email_normalized.is_empty() {
        let existing: Option<Uuid> = sqlx::query_scalar("SELECT id FROM users WHERE email = $1")
            .bind(&email_normalized)
            .fetch_optional(&mut *tx)
            .await?;

        if let Some(uid) = existing {
            user_id = Some(uid);
        } else {
            let uid: Uuid = sqlx::query_scalar(
                "INSERT INTO users (email, role, display_name, is_active) VALUES ($1, $2, $3, true) RETURNING id"
            )
            .bind(&email_normalized)
            .bind(UserRole::AgencyContact)
            .bind(f.name)
            .fetch_one(&mut *tx)
            .await?;
            user_id = Some(uid);
            sent_invite = true;
        }
    }

    // 2. Create contact
    let _contact_id: Uuid = sqlx::query_scalar(
        "INSERT INTO contacts (agency_id, user_id, name, title, phone, email, is_primary, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, false, true)
         RETURNING id"
    )
    .bind(au.agency_id)
    .bind(user_id)
    .bind(f.name)
    .bind(if f.title.is_empty() { None } else { Some(f.title) })
    .bind(if f.phone.is_empty() { None } else { Some(f.phone) })
    .bind(if email_normalized.is_empty() { None } else { Some(&email_normalized) })
    .fetch_one(&mut *tx)
    .await?;

    tx.commit().await?;

    // 3. Send Invitation if new user created
    if sent_invite && !email_normalized.is_empty() {
        let ml_svc = MagicLinkService::new(config.inner());
        if let Ok(token) = ml_svc.create(db, &email_normalized).await {
            let _ = email_svc.send_magic_link(&email_normalized, &token).await;
        }
    }

    Ok(Flash::success(redirect, format!("Contact {} added to your team", f.name)))
}

#[post("/team/<contact_id>/invite")]
async fn invite_contact(
    contact_id: Uuid,
    db: &Db,
    au: AgencyUser,
    config: &State<AppConfig>,
    email_svc: &State<EmailService>,
) -> AppResult<Flash<Redirect>> {
    let redirect = Redirect::to("/agency/team");

    // Get contact email and verify it belongs to this agency
    let contact_info: Option<(Option<String>, Option<Uuid>, String)> = sqlx::query_as(
        "SELECT email, user_id, name FROM contacts WHERE id = $1 AND agency_id = $2 AND is_active = true"
    )
    .bind(contact_id)
    .bind(au.agency_id)
    .fetch_optional(&**db)
    .await?;

    let (email_opt, mut user_id, name) = match contact_info {
        Some(info) => info,
        None => return Ok(Flash::error(redirect, "Contact not found")),
    };

    let email = match email_opt {
        Some(e) if !e.is_empty() => e,
        _ => return Ok(Flash::error(redirect, "Contact has no email address")),
    };

    // Ensure they have a user account
    if user_id.is_none() {
        // 1. Check if a user already exists with this email (e.g. from another agency or role)
        let existing_id: Option<Uuid> = sqlx::query_scalar("SELECT id FROM users WHERE email = $1")
            .bind(&email)
            .fetch_optional(&**db)
            .await?;

        if let Some(uid) = existing_id {
            user_id = Some(uid);
            // Link the existing user to this contact record
            sqlx::query("UPDATE contacts SET user_id = $1 WHERE id = $2")
                .bind(uid)
                .bind(contact_id)
                .execute(&**db)
                .await?;
        } else {
            // 2. Create account on the fly
            let uid: Uuid = sqlx::query_scalar(
                "INSERT INTO users (email, role, display_name, is_active) VALUES ($1, 'agency_contact', $2, true) RETURNING id"
            )
            .bind(&email)
            .bind(&name)
            .fetch_one(&**db)
            .await?;
            
            sqlx::query("UPDATE contacts SET user_id = $1 WHERE id = $2")
                .bind(uid)
                .bind(contact_id)
                .execute(&**db)
                .await?;
                
            user_id = Some(uid);
        }
    }

    // Double check if already verified before sending
    let is_verified: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM users WHERE id = $1 AND email_verified_at IS NOT NULL)")
        .bind(user_id)
        .fetch_one(&**db)
        .await?;

    if is_verified {
        return Ok(Flash::success(redirect, format!("{} is already verified", email)));
    }

    let ml_svc = MagicLinkService::new(config.inner());
    let token = ml_svc.create(db, &email).await?;
    let _ = email_svc.send_magic_link(&email, &token).await;

    Ok(Flash::success(redirect, format!("Invitation sent to {}", email)))
}

#[derive(Serialize)]
struct AssignmentCheck {
    shifts: Vec<crate::routes::api::UpcomingAssignment>,
}

#[get("/team/<contact_id>/assignments")]
async fn check_contact_assignments(
    contact_id: Uuid,
    db: &Db,
    au: AgencyUser,
) -> AppResult<rocket::serde::json::Json<AssignmentCheck>> {
    // Verify contact belongs to agency
    let exists: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM contacts WHERE id = $1 AND agency_id = $2)")
        .bind(contact_id)
        .bind(au.agency_id)
        .fetch_one(&**db)
        .await?;

    if !exists {
        return Err(AppError::NotFound);
    }

    let shifts = sqlx::query_as!(
        crate::routes::api::UpcomingAssignment,
        r#"
        SELECT s.id as shift_id, s.title, s.start_at, a.name as agency_name
        FROM shifts s
        JOIN agencies a ON a.id = s.agency_id
        WHERE s.contact_id = $1 AND s.start_at > now()
        ORDER BY s.start_at ASC
        "#,
        contact_id
    )
    .fetch_all(&**db)
    .await?;

    Ok(rocket::serde::json::Json(AssignmentCheck { shifts }))
}

#[post("/team/<contact_id>/archive")]
async fn archive_contact(
    contact_id: Uuid,
    db: &Db,
    au: AgencyUser,
) -> AppResult<Flash<Redirect>> {
    let redirect = Redirect::to("/agency/team");

    // 1. Verify it's not the primary contact being archived
    let contact: Option<(String, bool)> = sqlx::query_as("SELECT name, is_primary FROM contacts WHERE id = $1 AND agency_id = $2")
        .bind(contact_id)
        .bind(au.agency_id)
        .fetch_optional(&**db)
        .await?;

    let (name, is_primary) = match contact {
        Some(c) => c,
        None => return Ok(Flash::error(redirect, "Contact not found")),
    };

    if is_primary {
        return Ok(Flash::error(redirect, "Cannot archive the primary contact. Please designate a new primary first."));
    }

    // 2. Verify we aren't archiving ourselves
    let target_user_id: Option<Uuid> = sqlx::query_scalar("SELECT user_id FROM contacts WHERE id = $1")
        .bind(contact_id)
        .fetch_one(&**db)
        .await?;

    if let Some(uid) = target_user_id {
        if uid == au.user.id {
            return Ok(Flash::error(redirect, "You cannot archive your own contact record while logged in."));
        }
    }

    // 3. Find our own (primary) contact ID for reassignment
    let my_contact_id: Uuid = sqlx::query_scalar("SELECT id FROM contacts WHERE user_id = $1 AND agency_id = $2")
        .bind(au.user.id)
        .bind(au.agency_id)
        .fetch_one(&**db)
        .await?;

    let mut tx = db.begin().await?;

    // 3. Reassign all future shifts
    sqlx::query("UPDATE shifts SET contact_id = $1 WHERE contact_id = $2 AND start_at > now()")
        .bind(my_contact_id)
        .bind(contact_id)
        .execute(&mut *tx)
        .await?;

    // 4. Archive the contact
    sqlx::query("UPDATE contacts SET is_active = false, is_primary = false, updated_at = now() WHERE id = $1")
        .bind(contact_id)
        .execute(&mut *tx)
        .await?;

    tx.commit().await?;

    Ok(Flash::success(redirect, format!("Contact {} has been archived. Any upcoming shifts were reassigned to you.", name)))
}

#[derive(rocket::form::FromForm)]
struct SetPrimaryForm {
    contact_id: Uuid,
}

#[post("/team/set-primary", data = "<form>")]
async fn set_primary_contact(
    form: Form<SetPrimaryForm>,
    db: &Db,
    au: AgencyUser,
) -> AppResult<Flash<Redirect>> {
    let contact_id = form.into_inner().contact_id;
    let redirect = Redirect::to("/agency/team");

    // 1. Verify contact belongs to agency and has verified email
    let contact_info: Option<(Uuid, Option<DateTime<Utc>>)> = sqlx::query_as(
        "SELECT c.id, u.email_verified_at 
         FROM contacts c 
         LEFT JOIN users u ON u.id = c.user_id
         WHERE c.id = $1 AND c.agency_id = $2 AND c.is_active = true"
    )
    .bind(contact_id)
    .bind(au.agency_id)
    .fetch_optional(&**db)
    .await?;

    let (_, verified_at) = match contact_info {
        Some(info) => info,
        None => return Ok(Flash::error(redirect, "Contact not found")),
    };

    if verified_at.is_none() {
        return Ok(Flash::error(redirect, "Contact must verify their email before becoming Primary"));
    }

    let mut tx = db.begin().await?;

    // 2. Clear old primary
    sqlx::query("UPDATE contacts SET is_primary = false WHERE agency_id = $1")
        .bind(au.agency_id)
        .execute(&mut *tx)
        .await?;

    // 3. Set new primary
    sqlx::query("UPDATE contacts SET is_primary = true WHERE id = $1")
        .bind(contact_id)
        .execute(&mut *tx)
        .await?;

    // 4. Update agency table
    sqlx::query("UPDATE agencies SET primary_contact_id = $1 WHERE id = $2")
        .bind(contact_id)
        .bind(au.agency_id)
        .execute(&mut *tx)
        .await?;

    tx.commit().await?;

    Ok(Flash::success(redirect, "Primary contact updated successfully"))
}

#[derive(Debug, Serialize, sqlx::FromRow)]
struct AgencyShiftTeamMember {
    user_id: Uuid,
    volunteer_names: String,
    dog_name: Option<String>,
    dog_breed: Option<String>,
    dog_size: Option<String>,
    dog_gender: Option<String>,
    status: String,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
struct AgencyShiftRow {
    id: Uuid,
    title: String,
    description: Option<String>,
    start_at: DateTime<Utc>,
    end_at: DateTime<Utc>,
    state: String,
    slots_requested: i32,
    slots_confirmed: i64,
    site_id: Uuid,
    site_name: String,
    site_address: Option<String>,
    contact_id: Option<Uuid>,
    contact_name: Option<String>,
    parking_notes: Option<String>,
    meeting_notes: Option<String>,
    dog_names: Option<String>,
    teams: serde_json::Value,
    pending_change_request: Option<serde_json::Value>,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
struct AgencyStats {
    total_upcoming: i64,
    total_confirmed: i64,
}

/// GET /agency/dashboard
#[get("/dashboard")]
async fn dashboard(
    db: &Db,
    au: AgencyUser,
    flash: Option<FlashMessage<'_>>,
) -> AppResult<Template> {
    let flash_msg = flash.map(|f| context! { kind: f.kind().to_string(), message: f.message().to_string() });
    let stats: AgencyStats = sqlx::query_as(
        r#"
        SELECT
            COUNT(s.id) AS total_upcoming,
            COALESCE(SUM(sa.confirmed_count), 0)::BIGINT AS total_confirmed
        FROM shifts s
        LEFT JOIN (
            SELECT shift_id, COUNT(*) AS confirmed_count
            FROM shift_assignments
            WHERE status = 'confirmed'
            GROUP BY shift_id
        ) sa ON sa.shift_id = s.id
        WHERE s.agency_id = $1 AND s.start_at > now()
        "#
    )
    .bind(au.agency_id)
    .fetch_one(&**db)
    .await?;

    let shifts: Vec<AgencyShiftRow> = sqlx::query_as(
        r#"
        SELECT
            s.id, s.title, s.description, s.start_at, s.end_at,
            s.state::text AS state,
            s.slots_requested,
            COALESCE(COUNT(sa.id) FILTER (WHERE sa.status = 'confirmed'), 0) AS slots_confirmed,
            s.site_id,
            si.name AS site_name,
            si.address AS site_address,
            s.contact_id,
            c.name AS contact_name,
            s.parking_notes,
            s.meeting_notes,
            (
                SELECT STRING_AGG(d.name, ', ')
                FROM shift_assignments sa2
                JOIN dogs d ON d.id = sa2.dog_ids[1]
                WHERE sa2.shift_id = s.id AND sa2.status = 'confirmed'
            ) AS dog_names,
            COALESCE((
                SELECT JSON_AGG(JSON_BUILD_OBJECT(
                    'user_id', sa2.volunteer_id,
                    'volunteer_names', vp.volunteer_names,
                    'dog_name', d.name,
                    'profile_pic_asset_id', vp.profile_pic_asset_id
                ))
                FROM shift_assignments sa2
                JOIN volunteer_profiles vp ON vp.user_id = sa2.volunteer_id
                LEFT JOIN dogs d ON d.id = sa2.dog_ids[1]
                WHERE sa2.shift_id = s.id AND sa2.status = 'confirmed'
            ), '[]'::json) AS teams,
            (
                SELECT JSON_BUILD_OBJECT('id', scr.id, 'changes', scr.requested_changes, 'created_at', scr.created_at)
                FROM shift_change_requests scr
                WHERE scr.shift_id = s.id AND scr.status = 'pending'
                ORDER BY scr.created_at DESC
                LIMIT 1
            ) AS pending_change_request
        FROM shifts s
        JOIN sites si ON si.id = s.site_id
        LEFT JOIN contacts c ON c.id = s.contact_id
        LEFT JOIN shift_assignments sa ON sa.shift_id = s.id
        WHERE s.agency_id = $1
        GROUP BY s.id, si.name, si.address, c.name
        ORDER BY s.start_at DESC
        LIMIT 20
        "#
    )
    .bind(au.agency_id)
    .fetch_all(&**db)
    .await?;

    // Unread survey prompts — shown as dismissable login alerts
    let survey_prompts = sqlx::query_as::<_, (Uuid, String, String, serde_json::Value)>(
        "SELECT id, title, body, payload FROM notifications
         WHERE user_id = $1 AND read_at IS NULL AND archived_at IS NULL AND type = 'survey_prompt'"
    )
    .bind(au.user.id)
    .fetch_all(&**db)
    .await
    .unwrap_or_default();

    Ok(Template::render(
        "agency/dashboard",
        context! {
            user: au.user.clone(),
            stats,
            shifts,
            agency_id: au.agency_id,
            survey_prompts,
            flash: flash_msg,
        },
    ))
}

/// GET /agency/shifts/<id>
#[get("/shifts/<id>")]
async fn shift_detail(id: &str, db: &Db, au: AgencyUser) -> AppResult<Template> {
    let sid = id.parse::<Uuid>().map_err(|_| AppError::NotFound)?;
    
    // Ensure the shift belongs to this agency
    let shift: AgencyShiftRow = sqlx::query_as(
        r#"
        SELECT
            s.id, s.title, s.description, s.start_at, s.end_at,
            s.state::text AS state,
            s.slots_requested,
            COALESCE(COUNT(sa.id) FILTER (WHERE sa.status = 'confirmed'), 0) AS slots_confirmed,
            s.site_id,
            si.name AS site_name,
            si.address AS site_address,
            s.contact_id,
            c.name AS contact_name,
            s.parking_notes,
            s.meeting_notes,
            (
                SELECT STRING_AGG(d.name, ', ')
                FROM shift_assignments sa2
                JOIN dogs d ON d.id = sa2.dog_ids[1]
                WHERE sa2.shift_id = s.id AND sa2.status = 'confirmed'
            ) AS dog_names,
            COALESCE((
                SELECT JSON_AGG(JSON_BUILD_OBJECT(
                    'user_id', sa2.volunteer_id,
                    'volunteer_names', vp.volunteer_names,
                    'dog_name', d.name,
                    'profile_pic_asset_id', vp.profile_pic_asset_id
                ))
                FROM shift_assignments sa2
                JOIN volunteer_profiles vp ON vp.user_id = sa2.volunteer_id
                LEFT JOIN dogs d ON d.id = sa2.dog_ids[1]
                WHERE sa2.shift_id = s.id AND sa2.status = 'confirmed'
            ), '[]'::json) AS teams,
            (
                SELECT JSON_BUILD_OBJECT('id', scr.id, 'changes', scr.requested_changes, 'created_at', scr.created_at)
                FROM shift_change_requests scr
                WHERE scr.shift_id = s.id AND scr.status = 'pending'
                ORDER BY scr.created_at DESC
                LIMIT 1
            ) AS pending_change_request
        FROM shifts s
        JOIN sites si ON si.id = s.site_id
        LEFT JOIN contacts c ON c.id = s.contact_id
        LEFT JOIN shift_assignments sa ON sa.shift_id = s.id
        WHERE s.id = $1 AND s.agency_id = $2
        GROUP BY s.id, si.name, si.address, c.name
        "#
    )
    .bind(sid)
    .bind(au.agency_id)
    .fetch_optional(&**db)
    .await?
    .ok_or(AppError::NotFound)?;

    let team: Vec<AgencyShiftTeamMember> = sqlx::query_as(
        r#"
        SELECT
            sa.volunteer_id as user_id,
            vp.volunteer_names,
            d.name AS dog_name,
            dt.name AS dog_breed,
            d.size::text AS dog_size,
            d.gender::text AS dog_gender,
            sa.status::text
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
    .await?;

    // Fetch all sites for the agency
    let sites: Vec<(Uuid, String)> = sqlx::query_as("SELECT id, name FROM sites WHERE agency_id = $1 ORDER BY name")
        .bind(au.agency_id)
        .fetch_all(&**db)
        .await?;

    // Fetch all contacts for the agency
    let contacts: Vec<(Uuid, String)> = sqlx::query_as("SELECT id, name FROM contacts WHERE agency_id = $1 AND is_active = true ORDER BY name")
        .bind(au.agency_id)
        .fetch_all(&**db)
        .await?;

    // Get shift history
    let history: Vec<crate::models::volunteer::VolunteerEventDetail> = sqlx::query_as(
        r#"
        SELECT 
            ve.id, ve.event_type::text, ve.metadata, ve.created_at,
            ve.shift_id, ve.dog_id,
            COALESCE(u_cb.display_name, u_cb.email) AS created_by_name,
            s.title AS shift_title, s.start_at AS shift_start_at,
            a.name AS agency_name,
            si.name AS site_name,
            d.name AS dog_name,
            vp_fv.volunteer_names AS from_volunteer_name
        FROM volunteer_events ve
        LEFT JOIN shifts s ON s.id = ve.shift_id
        LEFT JOIN agencies a ON a.id = s.agency_id
        LEFT JOIN sites si ON si.id = s.site_id
        LEFT JOIN dogs d ON d.id = ve.dog_id
        LEFT JOIN users u_cb ON u_cb.id = ve.created_by
        LEFT JOIN volunteer_profiles vp_fv ON vp_fv.user_id = ve.related_user_id
        WHERE ve.shift_id = $1
        ORDER BY ve.created_at DESC
        "#
    )
    .bind(sid)
    .fetch_all(&**db)
    .await?;

    Ok(Template::render("agency/shift_detail", context! { user: au.user.clone(), shift, team, sites, contacts, history }))
}

#[derive(rocket::form::FromForm)]
struct MinorUpdateForm<'r> {
    parking_notes: &'r str,
    meeting_notes: &'r str,
    contact_id: Option<Uuid>,
}

#[post("/shifts/<id>/update-minor", data = "<form>")]
async fn shift_update_minor(
    id: Uuid,
    form: Form<MinorUpdateForm<'_>>,
    db: &Db,
    au: AgencyUser,
) -> AppResult<Flash<Redirect>> {
    let f = form.into_inner();

    // Get current state for diffing and title for logging
    let current: Option<(String, Option<String>, Option<String>, Option<Uuid>)> = sqlx::query_as(
        "SELECT title, parking_notes, meeting_notes, contact_id FROM shifts WHERE id = $1 AND agency_id = $2"
    )
    .bind(id)
    .bind(au.agency_id)
    .fetch_optional(&**db)
    .await?;

    let (title, old_parking, old_meeting, old_contact) = match current {
        Some(c) => c,
        None => return Ok(Flash::error(Redirect::to("/agency/dashboard"), "Shift not found")),
    };
    
    let res = sqlx::query(
        "UPDATE shifts SET parking_notes = $1, meeting_notes = $2, contact_id = $3, updated_at = now()
         WHERE id = $4 AND agency_id = $5"
    )
    .bind(f.parking_notes)
    .bind(f.meeting_notes)
    .bind(f.contact_id)
    .bind(id)
    .bind(au.agency_id)
    .execute(&**db)
    .await?;

    if res.rows_affected() > 0 {
        let mut changed = Vec::new();
        if old_parking.as_deref().unwrap_or("") != f.parking_notes { changed.push("parking_notes".to_string()); }
        if old_meeting.as_deref().unwrap_or("") != f.meeting_notes { changed.push("meeting_notes".to_string()); }
        if old_contact != f.contact_id { changed.push("contact".to_string()); }

        if !changed.is_empty() {
            let _ = EventLog::shift_updated(&**db, au.user.id, id, &title, changed).await;
        }
    }

    Ok(Flash::success(Redirect::to(format!("/agency/shifts/{}", id)), "Shift details updated"))
}

#[derive(rocket::form::FromForm)]
struct NewContactForm<'r> {
    name: &'r str,
    email: &'r str,
    phone: &'r str,
    title: &'r str,
}

#[post("/shifts/<id>/contact/new", data = "<form>")]
async fn shift_add_contact(
    id: Uuid,
    form: Form<NewContactForm<'_>>,
    db: &Db,
    au: AgencyUser,
    config: &State<AppConfig>,
    email_svc: &State<EmailService>,
) -> AppResult<Flash<Redirect>> {
    let f = form.into_inner();
    let redirect = Redirect::to(format!("/agency/shifts/{}", id));
    let email_normalized = f.email.trim().to_lowercase();

    let mut tx = db.begin().await?;

    // 1. Create user if email is provided and doesn't exist
    let mut user_id = None;
    let mut sent_invite = false;

    if !email_normalized.is_empty() {
        let existing: Option<Uuid> = sqlx::query_scalar("SELECT id FROM users WHERE email = $1")
            .bind(&email_normalized)
            .fetch_optional(&mut *tx)
            .await?;

        if let Some(uid) = existing {
            user_id = Some(uid);
        } else {
            let uid: Uuid = sqlx::query_scalar(
                "INSERT INTO users (email, role, display_name, is_active) VALUES ($1, $2, $3, true) RETURNING id"
            )
            .bind(&email_normalized)
            .bind(UserRole::AgencyContact)
            .bind(f.name)
            .fetch_one(&mut *tx)
            .await?;
            user_id = Some(uid);
            sent_invite = true;
        }
    }

    // 2. Create contact
    let contact_id: Uuid = sqlx::query_scalar(
        "INSERT INTO contacts (agency_id, user_id, name, title, phone, email, is_primary, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, false, true)
         RETURNING id"
    )
    .bind(au.agency_id)
    .bind(user_id)
    .bind(f.name)
    .bind(if f.title.is_empty() { None } else { Some(f.title) })
    .bind(if f.phone.is_empty() { None } else { Some(f.phone) })
    .bind(if email_normalized.is_empty() { None } else { Some(&email_normalized) })
    .fetch_one(&mut *tx)
    .await?;

    // 3. Update shift
    let res = sqlx::query(
        "UPDATE shifts SET contact_id = $1, updated_at = now() WHERE id = $2 AND agency_id = $3"
    )
    .bind(contact_id)
    .bind(id)
    .bind(au.agency_id)
    .execute(&mut *tx)
    .await?;

    if res.rows_affected() == 0 {
        return Ok(Flash::error(redirect, "Shift not found or access denied"));
    }

    tx.commit().await?;

    // 4. Send Invitation if new user created
    if sent_invite && !email_normalized.is_empty() {
        let ml_svc = MagicLinkService::new(config.inner());
        if let Ok(token) = ml_svc.create(db, &email_normalized).await {
            let _ = email_svc.send_magic_link(&email_normalized, &token).await;
        }
    }

    let _ = EventLog::contact_added(&**db, au.user.id, id, f.name).await;

    Ok(Flash::success(redirect, format!("Contact {} added and assigned to visit", f.name)))
}

#[derive(rocket::form::FromForm)]
struct MessageVolunteersForm<'r> {
    message: &'r str,
}

#[post("/shifts/<id>/message", data = "<form>")]
async fn shift_message_volunteers(
    id: Uuid,
    form: Form<MessageVolunteersForm<'_>>,
    db: &Db,
    au: AgencyUser,
) -> AppResult<Flash<Redirect>> {
    let f = form.into_inner();
    
    // Get shift and agency info
    let shift_info: Option<(String, String)> = sqlx::query_as(
        "SELECT s.title, a.name FROM shifts s JOIN agencies a ON a.id = s.agency_id WHERE s.id = $1 AND s.agency_id = $2"
    )
    .bind(id)
    .bind(au.agency_id)
    .fetch_optional(&**db)
    .await?;

    let (shift_title, agency_name) = match shift_info {
        Some(info) => info,
        None => return Ok(Flash::error(Redirect::to("/agency/dashboard"), "Shift not found")),
    };

    // Get all confirmed volunteers
    let volunteer_ids: Vec<Uuid> = sqlx::query_scalar(
        "SELECT volunteer_id FROM shift_assignments WHERE shift_id = $1 AND status = 'confirmed'"
    )
    .bind(id)
    .fetch_all(&**db)
    .await?;

    let redirect = Redirect::to(format!("/agency/shifts/{}", id));

    if volunteer_ids.is_empty() {
        return Ok(Flash::error(redirect, "No confirmed volunteers to message"));
    }

    let count = volunteer_ids.len();
    for vid in volunteer_ids {
        let _ = sqlx::query(
            "INSERT INTO notifications (user_id, type, title, body, payload)
             VALUES ($1, 'agency_message', $2, $3, $4)"
        )
        .bind(vid)
        .bind(format!("Message regarding {}", shift_title))
        .bind(format!("Message from {}: {}", agency_name, f.message))
        .bind(serde_json::json!({ "shift_id": id }))
        .execute(&**db)
        .await;
    }

    Ok(Flash::success(redirect, format!("Message sent to {} confirmed volunteer{}", count, if count == 1 { "" } else { "s" })))
}


#[derive(rocket::form::FromForm)]
struct ChangeRequestForm<'r> {
    date: &'r str,
    start_time: &'r str,
    end_time: &'r str,
    site_id: Uuid,
    slots_requested: i32,
    reason: &'r str,
}

#[post("/shifts/<id>/request-change", data = "<form>")]
async fn shift_request_change(
    id: Uuid,
    form: Form<ChangeRequestForm<'_>>,
    db: &Db,
    au: AgencyUser,
) -> AppResult<Flash<Redirect>> {
    let f = form.into_inner();
    
    // Validate shift belongs to agency
    let exists: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM shifts WHERE id = $1 AND agency_id = $2)")
        .bind(id)
        .bind(au.agency_id)
        .fetch_one(&**db)
        .await?;

    if !exists {
        return Ok(Flash::error(Redirect::to("/agency/dashboard"), "Shift not found"));
    }

    // Build requested changes JSON
    let start_at = format!("{}T{}:00Z", f.date, f.start_time);
    let end_at = format!("{}T{}:00Z", f.date, f.end_time);
    
    let requested_changes = serde_json::json!({
        "start_at": start_at,
        "end_at": end_at,
        "site_id": f.site_id,
        "slots_requested": f.slots_requested
    });

    let mut tx = db.begin().await?;

    // Insert change request
    let request_id: Uuid = sqlx::query_scalar(
        "INSERT INTO shift_change_requests (shift_id, requested_by, requested_changes, reason)
         VALUES ($1, $2, $3, $4)
         RETURNING id"
    )
    .bind(id)
    .bind(au.user.id)
    .bind(requested_changes)
    .bind(f.reason)
    .fetch_one(&mut *tx)
    .await?;

    // Create admin alert
    let _ = sqlx::query(
        "INSERT INTO admin_alerts (alert_type, shift_id, resolved_at)
         VALUES ('shift_change_request', $1, NULL)"
    )
    .bind(id)
    .execute(&mut *tx)
    .await?;

    // Get shift title for logging
    let title: String = sqlx::query_scalar("SELECT title FROM shifts WHERE id = $1")
        .bind(id)
        .fetch_one(&mut *tx)
        .await?;

    tx.commit().await?;

    let _ = EventLog::shift_change_requested(&**db, au.user.id, id, &title, f.reason).await;

    Ok(Flash::success(Redirect::to(format!("/agency/shifts/{}", id)), "Change request submitted for admin review"))
}

/// GET /agency/shifts/new — only when can_create_request = true
#[get("/shifts/new")]
async fn shift_new(db: &Db, au: AgencyUser) -> AppResult<Template> {
    // Check if agency can create requests
    let can_create: bool = sqlx::query_scalar("SELECT can_create_request FROM agencies WHERE id = $1")
        .bind(au.agency_id)
        .fetch_one(&**db)
        .await?;

    if !can_create {
        return Err(AppError::Forbidden);
    }

    Ok(Template::render("agency/shift_new", context! { user: au.user.clone(), agency_id: au.agency_id }))
}

/// GET /agency/survey/<shift_id>
#[get("/survey/<shift_id>")]
async fn survey_form(db: &Db, au: AgencyUser, shift_id: &str) -> AppResult<Template> {
    let shift_id: Uuid = shift_id.parse().map_err(|_| AppError::NotFound)?;

    // 1. Verify shift belongs to agency
    let shift_info: Option<(String, DateTime<Utc>)> = sqlx::query_as(
        "SELECT title, start_at FROM shifts WHERE id = $1 AND agency_id = $2"
    )
    .bind(shift_id)
    .bind(au.agency_id)
    .fetch_optional(&**db)
    .await?;

    let (shift_title, _start_at) = shift_info.ok_or(AppError::Forbidden)?;

    // 2. Check if already submitted
    let already_submitted: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM agency_surveys WHERE shift_id = $1 AND contact_id IN (SELECT id FROM contacts WHERE user_id = $2))"
    )
    .bind(shift_id)
    .bind(au.user.id)
    .fetch_one(&**db)
    .await?;

    // 3. Fetch taggable entities
    let taggables: Vec<crate::routes::volunteer::TaggableEntity> = sqlx::query_as(
        r#"
        SELECT vp.user_id AS id, vp.volunteer_names AS name, 'volunteer' AS type_name
        FROM shift_assignments sa
        JOIN volunteer_profiles vp ON vp.user_id = sa.volunteer_id
        WHERE sa.shift_id = $1 AND sa.status = 'confirmed'
        UNION ALL
        SELECT d.id, d.name, 'dog' AS type_name
        FROM shift_assignments sa
        JOIN dogs d ON d.id = ANY(sa.dog_ids)
        WHERE sa.shift_id = $1 AND sa.status = 'confirmed'
        ORDER BY type_name DESC, name ASC
        "#
    )
    .bind(shift_id)
    .fetch_all(&**db)
    .await?;

    Ok(Template::render(
        "agency/survey",
        context! {
            user: au.user.clone(),
            shift_id,
            shift_title,
            taggables,
            already_submitted,
        },
    ))
}

#[derive(rocket::form::FromForm)]
struct AgencySurveyForm<'r> {
    pub rating: i16,
    pub notes: &'r str,
    pub actual_clients_served: Option<i32>,
}

/// POST /agency/survey/<shift_id>
#[post("/survey/<shift_id>", data = "<form>")]
async fn survey_submit(
    db: &Db,
    au: AgencyUser,
    shift_id: &str,
    form: rocket::form::Form<AgencySurveyForm<'_>>,
) -> AppResult<Flash<Redirect>> {
    let shift_id: Uuid = shift_id.parse().map_err(|_| AppError::NotFound)?;
    let f = form.into_inner();

    // 1. Find the contact record for this user
    let contact_id: Uuid = sqlx::query_scalar(
        "SELECT id FROM contacts WHERE user_id = $1 AND agency_id = $2 AND is_active = true"
    )
    .bind(au.user.id)
    .bind(au.agency_id)
    .fetch_one(&**db)
    .await?;

    let mut tx = db.begin().await?;

    // 2. Save survey
    sqlx::query(
        r#"
        INSERT INTO agency_surveys (shift_id, contact_id, rating, notes, actual_clients_served)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (shift_id, contact_id) DO UPDATE SET
            rating = $3, notes = $4, actual_clients_served = $5, submitted_at = now()
        "#
    )
    .bind(shift_id)
    .bind(contact_id)
    .bind(f.rating)
    .bind(f.notes)
    .bind(f.actual_clients_served)
    .execute(&mut *tx)
    .await?;

    // 3. Clear prompt notification
    sqlx::query(
        "UPDATE notifications SET read_at = now(), archived_at = now() 
         WHERE user_id = $1 AND type = 'survey_prompt' AND payload->>'shift_id' = $2"
    )
    .bind(au.user.id)
    .bind(shift_id.to_string())
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;

    Ok(Flash::success(Redirect::to("/agency/dashboard"), "Thank you for your feedback! ✨"))
}

// ─── Gallery ──────────────────────────────────────────────────────────────────

/// GET /agency/gallery
#[get("/gallery")]
async fn agency_gallery(db: &Db, au: AgencyUser) -> AppResult<Template> {
    let groups = get_agency_gallery(db, au.agency_id, au.user.id).await?;
    Ok(Template::render(
        "agency/gallery",
        context! { user: au.user.clone(), groups, agency_id: au.agency_id },
    ))
}

/// POST /agency/gallery/upload
#[post("/gallery/upload", data = "<form>")]
async fn agency_upload(
    form: Form<AgencySurveyUploadForm<'_>>,
    au: AgencyUser,
    db: &Db,
    storage: &rocket::State<StorageBackend>,
) -> AppResult<Flash<Redirect>> {
    let result = handle_upload(
        form.into_inner().photo,
        None, // General upload, not linked to a specific shift
        au.user.id,
        AssetVisibility::Agency, // Visible to the whole agency
        storage,
        db,
    )
    .await?;

    // Link asset to agency specifically if needed, but get_agency_gallery 
    // already finds assets uploaded by users belonging to that agency.
    // However, we should ensure the asset has the agency_id set.
    sqlx::query("UPDATE assets SET agency_id = $1 WHERE id = $2")
        .bind(au.agency_id)
        .bind(result.asset.id)
        .execute(&**db)
        .await?;

    Ok(Flash::success(Redirect::to("/agency/gallery"), "Photo uploaded successfully"))
}

#[derive(rocket::form::FromForm)]
struct AgencySurveyUploadForm<'r> {
    photo: TempFile<'r>,
    #[allow(dead_code)]
    caption: Option<String>,
}

/// POST /agency/shifts/<id>/survey/upload
#[post("/shifts/<shift_id>/survey/upload", data = "<form>")]
async fn agency_survey_upload(
    shift_id: Uuid,
    form: Form<AgencySurveyUploadForm<'_>>,
    au: AgencyUser,
    db: &Db,
    storage: &rocket::State<StorageBackend>,
) -> AppResult<Template> {
    // Ensure the shift belongs to this agency
    let belongs: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM shifts WHERE id = $1 AND agency_id = $2)",
    )
    .bind(shift_id)
    .bind(au.agency_id)
    .fetch_one(&**db)
    .await?;

    if !belongs {
        return Err(crate::errors::AppError::Forbidden);
    }

    let contact_id: Uuid = sqlx::query_scalar(
        "SELECT id FROM contacts WHERE user_id = $1 AND agency_id = $2 AND is_active = true"
    )
    .bind(au.user.id)
    .bind(au.agency_id)
    .fetch_one(&**db)
    .await?;

    let result = handle_upload(
        form.into_inner().photo,
        Some(shift_id),
        au.user.id,
        AssetVisibility::Unverified,
        storage,
        db,
    )
    .await?;

    // 2. Ensure a survey record exists and append the photo ID
    let _ = sqlx::query(
        r#"
        INSERT INTO agency_surveys (shift_id, contact_id, photo_asset_ids)
        VALUES ($1, $2, ARRAY[$3]::uuid[])
        ON CONFLICT (shift_id, contact_id) DO UPDATE SET
            photo_asset_ids = array_append(agency_surveys.photo_asset_ids, $3)
        "#,
    )
    .bind(shift_id)
    .bind(contact_id)
    .bind(result.asset.id)
    .execute(&**db)
    .await;

    Ok(Template::render(
        "partials/survey_asset_card",
        context! {
            result,
            viewer_id: au.user.id,
            is_admin: au.user.role == crate::models::user::UserRole::Admin,
            tags: Vec::<serde_json::Value>::new(),
        },
    ))
    }


// ─── Calendar settings ────────────────────────────────────────────────────────

#[get("/calendar")]
async fn calendar_settings_page(
    db: &Db,
    au: AgencyUser,
    cfg: &State<AppConfig>,
) -> AppResult<Template> {
    use crate::models::calendar::{get_or_create_token, CalendarFeedType};

    let token =
        get_or_create_token(&**db, au.user.id, CalendarFeedType::AgencyShifts).await?;
    let base_url = &cfg.app_url;

    let agency_name: String = sqlx::query_scalar!(
        "SELECT name FROM agencies WHERE id = $1",
        au.agency_id,
    )
    .fetch_optional(&**db)
    .await?
    .unwrap_or_else(|| "Agency".to_string());

    Ok(Template::render(
        "agency/calendar",
        context! {
            user: &au.user,
            agency_name: &agency_name,
            token: &token.token,
            base_url,
            feed_url: format!("{}/calendar/agency/shifts.ics?token={}", base_url, token.token),
        },
    ))
}

#[post("/calendar/tokens/regenerate")]
async fn calendar_token_regenerate(
    db: &Db,
    au: AgencyUser,
) -> AppResult<Redirect> {
    use crate::models::calendar::{regenerate_token, CalendarFeedType};

    regenerate_token(&**db, au.user.id, CalendarFeedType::AgencyShifts).await?;
    Ok(Redirect::to("/agency/calendar"))
}

// ─── Notification dismiss ─────────────────────────────────────────────────────

#[post("/notifications/<id>/dismiss")]
async fn dismiss_notification(
    id: Uuid,
    au: AgencyUser,
    db: &Db,
) -> AppResult<rocket::http::Status> {
    sqlx::query(
        "UPDATE notifications SET read_at = now()
         WHERE id = $1 AND user_id = $2 AND read_at IS NULL",
    )
    .bind(id)
    .bind(au.user.id)
    .execute(&**db)
    .await?;

    Ok(rocket::http::Status::NoContent)
}
