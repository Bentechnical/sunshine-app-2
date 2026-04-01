//! Admin route handlers — shift management, alerts, agencies.

use chrono::{DateTime, Duration, NaiveDate, NaiveDateTime, NaiveTime, Utc};
use rocket::{
    form::Form,
    get, post, Either, FromForm,
    request::FlashMessage,
    response::{Flash, Redirect},
    routes, Route,
};
use rocket_dyn_templates::{context, Template};
use serde::Serialize;
use sqlx::FromRow;
use uuid::Uuid;

use crate::auth::session::{AdminUser, AuthUser, ImpersonatePayload, IMPERSONATE_COOKIE};
use crate::errors::{AppError, AppResult};
use crate::models::user::{User, UserRole};
use crate::models::volunteer::{
    DogDetail, VolunteerDetail, VolunteerEventDetail, VolunteerListRow,
};
use crate::routes::volunteer::ShiftTeamMember as VolunteerShiftTeamMember;
use crate::models::event_log::EventLog;
use crate::models::dog::{
    DogSize, DogGender, DogApplicationStatus, DogApplicationDetail, DogApplicationListItem,
    DogApplicationResponseTemplate, AssessmentSession
};
use crate::models::gallery::{AssetVisibility, GalleryFilter, get_gallery_items, get_agency_gallery};
use crate::models::shift::{AssignmentStatus, promote_next_waitlisted};
use crate::models::volunteer_application::VolunteerApplicationListItem;
use crate::routes::gallery::handle_upload;
use crate::storage::StorageBackend;
use rocket::State;
use crate::config::AppConfig;
use crate::Db;
use rocket::fs::TempFile;
use rocket::http::{Cookie, SameSite};
use rocket::request::{FromRequest, Outcome, Request};

pub struct Htmx(pub bool);

#[rocket::async_trait]
impl<'r> FromRequest<'r> for Htmx {
    type Error = std::convert::Infallible;

    async fn from_request(req: &'r Request<'_>) -> Outcome<Self, Self::Error> {
        let is_htmx = req.headers().get_one("HX-Request").is_some();
        Outcome::Success(Htmx(is_htmx))
    }
}

pub fn routes() -> Vec<Route> {
    routes![
        dashboard,
        profile,
        profile_update,
        shifts_list,
        shift_new_get,
        shift_edit_get,
        shift_validate_post,
        shift_detail_get,
        shift_publish_post,
        shift_archive_post,
        shift_cancel_post,
        shift_message_post,
        shift_hover_partial,
        shift_create_post,
        shift_update_post,
        shift_assignments_get,
        shift_assignment_add_post,
        shift_assignment_remove_post,
        shift_assignment_confirm_post,
        shift_vacancy_invite,
        agency_cascade_partial,
        alert_promote_post,
        shift_change_requests_list,
        shift_change_request_process,
        users_list,
        user_edit_get,
        user_update_post,
        impersonate_by_id_post,
        stop_impersonate_post,
        agencies_list,
        agency_new_get,
        agency_edit_get,
        agency_upsert_post,
        agency_upsert_post_with_id,
        site_upsert_post,
        contact_upsert_post,
        contact_delete,
        // Volunteer management
        volunteers_list,
        volunteers_list_csv,
        volunteer_new_get,
        volunteer_detail,
        volunteer_edit_get,
        volunteer_create_post,
        volunteer_update_post,
        volunteer_toggle_active,
        volunteer_dog_create_post,
        volunteer_dog_update_post,
        volunteer_dog_toggle_active,
        volunteer_dog_retire_post,
        volunteer_dog_photo_upload,
        volunteer_dog_photo_remove,
        volunteer_photo_upload,
        volunteer_photo_remove,
        volunteer_event_partial,
        volunteer_contact_post,
        // Dog Application management
        dog_applications_list,
        dog_application_detail,
        dog_application_review_post,
        dog_application_schedule_assessment,
        dog_application_approve_post,
        dog_application_reject_post,
        dog_application_templates,
        surveys_volunteer,
        surveys_agency,
        // Assessment management
        assessments_list,
        assessment_session_create,
        assessment_session_detail,
        assessment_session_message,
        assessment_roster_finalize,
        assessment_attendance_post,
        assessment_result_post,
        volunteer_survey_review_post,
        volunteer_survey_review_inline_post,
        agency_survey_review_post,
        agency_survey_review_inline_post,
        // Feedback summary + collection
        shift_feedback_get,
        feedback_collection_get,
        feedback_action_post,
        gallery_manage,
        gallery_agency_get,
        gallery_upload_post,
        gallery_curate_post,
        gallery_verify_post,
        gallery_hide_post,
        regions,
        // Volunteer Application management
        vol_applications_list,
        vol_application_detail,
        vol_application_advance_post,
        vol_application_reject_post,
        vol_application_note_post,
        // Invite Link management
        invite_links_list,
        invite_link_detail,
        invite_link_create_post,
        invite_link_toggle_post,
        // Calendar
        calendar_settings_page,
        calendar_token_regenerate,
    ]
}

// ... (existing code)

#[get("/invite-links/<id>")]
async fn invite_link_detail(
    id: &str,
    db: &Db,
    _admin: AdminUser,
    user: AuthUser,
    flash: Option<FlashMessage<'_>>,
) -> AppResult<Template> {
    let link_id = match id.parse::<Uuid>() {
        Ok(id) => id,
        Err(_) => return Err(AppError::BadRequest("Invalid Invite Link ID".to_string())),
    };

    let link: InviteLinkRow = sqlx::query_as(
        r#"
        SELECT vil.id, vil.slug, vil.label, vil.source_tag, vil.message,
               vil.auto_approve_vsc, vil.auto_approve_background, vil.auto_approve_dog_health,
               vil.use_count, vil.max_uses, vil.expires_at, vil.is_active, vil.created_at,
               COUNT(va.id)::bigint as application_count,
               COUNT(va.id) FILTER (WHERE va.status = 'approved')::bigint as approved_count
        FROM volunteer_invite_links vil
        LEFT JOIN volunteer_applications va ON va.invite_link_id = vil.id
        WHERE vil.id = $1
        GROUP BY vil.id
        "#,
    )
    .bind(link_id)
    .fetch_optional(&**db)
    .await?
    .ok_or(AppError::NotFound)?;

    let applicants: Vec<VolunteerApplicationListItem> = sqlx::query_as(
        r#"
        SELECT va.id, va.user_id, u.email as applicant_email, va.full_name,
               va.status, va.submitted_at, va.created_at,
               vil.label as invite_link_label, vil.source_tag
        FROM volunteer_applications va
        JOIN users u ON u.id = va.user_id
        LEFT JOIN volunteer_invite_links vil ON vil.id = va.invite_link_id
        WHERE va.invite_link_id = $1
        ORDER BY va.created_at DESC
        "#,
    )
    .bind(link_id)
    .fetch_all(&**db)
    .await?;

    Ok(Template::render(
        "admin/invite_link_detail",
        context! {
            user: &user.0,
            flash: take_flash(flash),
            link,
            applicants,
        },
    ))
}


// ─── Helpers ──────────────────────────────────────────────────────────────────

#[derive(Serialize)]
struct FlashCtx {
    kind: String,
    message: String,
}

fn take_flash(f: Option<FlashMessage<'_>>) -> Option<FlashCtx> {
    f.map(|f| FlashCtx {
        kind: f.kind().to_owned(),
        message: f.message().to_owned(),
    })
}

fn parse_dt(s: &str) -> Option<DateTime<Utc>> {
    NaiveDateTime::parse_from_str(s, "%Y-%m-%dT%H:%M")
        .ok()
        .map(|dt| dt.and_utc())
}

fn blank(s: &str) -> Option<String> {
    if s.trim().is_empty() {
        None
    } else {
        Some(s.to_owned())
    }
}

fn fmt_dt_input(dt: &DateTime<Utc>) -> String {
    dt.format("%Y-%m-%dT%H:%M").to_string()
}

// ─── Query structs ────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, sqlx::FromRow)]
struct AlertRow {
    id: Uuid,
    alert_type: String,
    shift_id: Option<Uuid>,
    shift_title: Option<String>,
    shift_start_at: Option<DateTime<Utc>>,
    agency_name: Option<String>,
    site_name: Option<String>,
    cancelled_volunteer: Option<String>,
    waitlist_count: Option<i64>,
    dog_application_id: Option<Uuid>,
    dog_name: Option<String>,
    created_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
struct VolunteerSurveyRow {
    id: Uuid,
    shift_id: Uuid,
    shift_title: String,
    shift_start_at: DateTime<Utc>,
    volunteer_id: Uuid,
    volunteer_names: String,
    dog_names: Option<String>,
    notes: Option<String>,
    rating: Option<i16>,
    submitted_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
struct AgencySurveyRow {
    id: Uuid,
    shift_id: Uuid,
    shift_title: String,
    shift_start_at: DateTime<Utc>,
    agency_name: String,
    contact_name: String,
    contact_user_id: Option<Uuid>,
    notes: Option<String>,
    rating: Option<i16>,
    submitted_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
struct AdminShiftRow {
    id: Uuid,
    title: String,
    start_at: DateTime<Utc>,
    end_at: DateTime<Utc>,
    state: String,
    slots_requested: i32,
    slots_confirmed: i64,
    slots_waitlisted: i64,
    agency_name: String,
    site_name: String,
    teams: serde_json::Value,
    requires_attention: bool,
    unviewed_volunteer_reports: bool,
    unviewed_agency_reports: bool,
    has_volunteer_reports: bool,
    has_agency_reports: bool,
    is_past: bool,
    missing_details: bool,
    underfilled: bool,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
struct AgencyOption {
    id: Uuid,
    name: String,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
struct SiteOption {
    id: Uuid,
    name: String,
    address: Option<String>,
    is_active: bool,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
struct ContactOption {
    id: Uuid,
    name: String,
    title: Option<String>,
    email: Option<String>,
    phone: Option<String>,
    is_primary: bool,
    is_active: bool,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
struct VolunteerOption {
    id: Uuid,
    name: String,
    primary_dog_name: Option<String>,
}

/// Used to fetch the shift row for the edit form.
#[derive(Debug, sqlx::FromRow)]
struct ShiftEditRow {
    id: Uuid,
    agency_id: Uuid,
    site_id: Uuid,
    contact_id: Option<Uuid>,
    title: String,
    description: Option<String>,
    specific_requests: Option<String>,
    parking_notes: Option<String>,
    meeting_notes: Option<String>,
    start_at: DateTime<Utc>,
    end_at: DateTime<Utc>,
    slots_requested: i32,
    estimated_clients: Option<i32>,
    state: String,
    requires_police_check: bool,
    requires_vulnerable_check: bool,
    recurrence_rule: Option<String>,
    assignee_count: i64,
}

/// Flat struct always passed to the shift editor template.
/// For new shifts all fields are defaults/empty; never None, so Tera can
/// safely access every field without null-checks.
#[derive(Debug, Serialize)]
struct ShiftFormValues {
    id: String,
    is_new: bool,
    agency_id: String,
    site_id: String,
    contact_id: String,
    title: String,
    description: String,
    specific_requests: String,
    parking_notes: String,
    meeting_notes: String,
    /// "YYYY-MM-DDTHH:MM" — the format datetime-local inputs expect.
    start_at_input: String,
    end_at_input: String,
    slots_requested: i32,
    estimated_clients: String,
    state: String,
    requires_police_check: bool,
    requires_vulnerable_check: bool,
    recurrence_rule: String,
    assignee_count: i64,
}

impl ShiftFormValues {
    fn new_empty() -> Self {
        Self {
            id: String::new(),
            is_new: true,
            agency_id: String::new(),
            site_id: String::new(),
            contact_id: String::new(),
            title: String::new(),
            description: String::new(),
            specific_requests: String::new(),
            parking_notes: String::new(),
            meeting_notes: String::new(),
            start_at_input: String::new(),
            end_at_input: String::new(),
            slots_requested: 1,
            estimated_clients: String::new(),
            state: "draft".to_owned(),
            requires_police_check: false,
            requires_vulnerable_check: false,
            recurrence_rule: String::new(),
            assignee_count: 0,
        }
    }
}

// ─── Form ─────────────────────────────────────────────────────────────────────

#[derive(rocket::form::FromForm, Debug)]
struct AgencyForm<'r> {
    name: &'r str,
    slug: &'r str,
    #[field(default = "")]
    agency_type_id: &'r str,
    #[field(default = "")]
    description: &'r str,
    #[field(default = false)]
    is_login_active: bool,
    #[field(default = false)]
    can_create_request: bool,
    #[field(default = "")]
    primary_contact_id: &'r str,
}

#[derive(rocket::form::FromForm, Debug)]
struct SiteForm<'r> {
    id: Option<&'r str>,
    name: &'r str,
    #[field(default = "")]
    address: &'r str,
    #[field(default = "")]
    region_id: &'r str,
    #[field(default = "")]
    default_parking_notes: &'r str,
    #[field(default = "")]
    default_meeting_notes: &'r str,
    #[field(default = true)]
    is_active: bool,
}

#[derive(rocket::form::FromForm, Debug)]
struct ContactForm<'r> {
    id: Option<&'r str>,
    name: &'r str,
    #[field(default = "")]
    title: &'r str,
    #[field(default = "")]
    phone: &'r str,
    #[field(default = "")]
    email: &'r str,
    #[field(default = false)]
    is_primary: bool,
    #[field(default = true)]
    is_active: bool,
}

#[derive(rocket::form::FromForm, Debug)]
struct ShiftForm<'r> {
    agency_id: &'r str,
    site_id: &'r str,
    #[field(default = "")]
    contact_id: &'r str,
    title: &'r str,
    #[field(default = "")]
    description: &'r str,
    #[field(default = "")]
    specific_requests: &'r str,
    #[field(default = "")]
    parking_notes: &'r str,
    #[field(default = "")]
    meeting_notes: &'r str,
    start_at: &'r str,
    end_at: &'r str,
    #[field(default = 1)]
    slots_requested: i32,
    estimated_clients: Option<i32>,
    #[field(default = "draft")]
    state: &'r str,
    #[field(default = false)]
    ignore_warnings: bool,
    #[field(default = false)]
    requires_police_check: bool,
    #[field(default = false)]
    requires_vulnerable_check: bool,
    /// "none" | "weekly" | "biweekly" | "monthly"
    #[field(default = "none")]
    recur_freq: &'r str,
    #[field(default = "")]
    recur_until: &'r str,
    recur_count: Option<i32>,
    #[field(default = false)]
    notify_assignees: bool,
    #[field(default = "")]
    notify_message: &'r str,
}

#[derive(Debug, Serialize)]
struct ShiftSuccessToast {
    id: Uuid,
    title: String,
    agency_name: String,
    site_name: String,
    start_at: DateTime<Utc>,
    child_count: i32,
}

#[post("/agencies", data = "<form>")]
async fn agency_upsert_post(
    form: Form<AgencyForm<'_>>,
    db: &Db,
    admin: AdminUser,
) -> Flash<Redirect> {
    let f = form.into_inner();
    let atid = f.agency_type_id.parse::<Uuid>().ok();

    match sqlx::query_scalar::<_, Uuid>(
        "INSERT INTO agencies (name, slug, agency_type_id, description, is_login_active, can_create_request)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id"
    )
    .bind(f.name)
    .bind(f.slug)
    .bind(atid)
    .bind(blank(f.description))
    .bind(f.is_login_active)
    .bind(f.can_create_request)
    .fetch_one(&**db)
    .await {
        Ok(id) => Flash::success(Redirect::to(format!("/admin/agencies/{}", id)), "Agency created"),
        Err(e) => {
            tracing::error!(error = %e, "Failed to create agency");
            Flash::error(Redirect::to("/admin/agencies/new"), "Failed to create agency")
        }
    }
}

#[post("/agencies/<id>", data = "<form>")]
async fn agency_upsert_post_with_id(
    id: &str,
    form: Form<AgencyForm<'_>>,
    db: &Db,
    admin: AdminUser,
) -> Flash<Redirect> {
    let agency_id = match id.parse::<Uuid>() {
        Ok(u) => u,
        Err(_) => return Flash::error(Redirect::to("/admin/agencies"), "Invalid ID"),
    };
    let f = form.into_inner();
    let atid = f.agency_type_id.parse::<Uuid>().ok();
    let pcid = f.primary_contact_id.parse::<Uuid>().ok();

    match sqlx::query(
        r#"
        UPDATE agencies SET
            name = $2,
            slug = $3,
            agency_type_id = $4,
            description = $5,
            is_login_active = $6,
            can_create_request = $7,
            primary_contact_id = $8,
            updated_at = now()
        WHERE id = $1
        "#
    )
    .bind(agency_id)
    .bind(f.name)
    .bind(f.slug)
    .bind(atid)
    .bind(blank(f.description))
    .bind(f.is_login_active)
    .bind(f.can_create_request)
    .bind(pcid)
    .execute(&**db)
    .await {
        Ok(_) => Flash::success(Redirect::to(format!("/admin/agencies/{}", agency_id)), "Agency updated"),
        Err(e) => {
            tracing::error!(error = %e, "Failed to update agency");
            Flash::error(Redirect::to(format!("/admin/agencies/{}", agency_id)), "Failed to update agency")
        }
    }
}

#[post("/agencies/<agency_id>/sites", data = "<form>")]
async fn site_upsert_post(
    agency_id: &str,
    form: Form<SiteForm<'_>>,
    db: &Db,
    admin: AdminUser,
) -> Flash<Redirect> {
    let aid = match agency_id.parse::<Uuid>() {
        Ok(u) => u,
        Err(_) => return Flash::error(Redirect::to("/admin/agencies"), "Invalid Agency ID"),
    };
    let f = form.into_inner();
    let rid = f.region_id.parse::<Uuid>().ok();
    let sid = f.id.and_then(|s| s.parse::<Uuid>().ok());

    let res = if let Some(id) = sid {
        sqlx::query(
            "UPDATE sites SET name = $2, address = $3, region_id = $4, default_parking_notes = $5, default_meeting_notes = $6, is_active = $7, updated_at = now() WHERE id = $1"
        )
        .bind(id)
        .bind(f.name)
        .bind(blank(f.address))
        .bind(rid)
        .bind(blank(f.default_parking_notes))
        .bind(blank(f.default_meeting_notes))
        .bind(f.is_active)
        .execute(&**db)
        .await
    } else {
        sqlx::query(
            "INSERT INTO sites (agency_id, name, address, region_id, default_parking_notes, default_meeting_notes, is_active) VALUES ($1, $2, $3, $4, $5, $6, $7)"
        )
        .bind(aid)
        .bind(f.name)
        .bind(blank(f.address))
        .bind(rid)
        .bind(blank(f.default_parking_notes))
        .bind(blank(f.default_meeting_notes))
        .bind(f.is_active)
        .execute(&**db)
        .await
    };

    match res {
        Ok(_) => Flash::success(Redirect::to(format!("/admin/agencies/{}", aid)), "Site saved"),
        Err(e) => {
            tracing::error!(error = %e, "Failed to save site");
            Flash::error(Redirect::to(format!("/admin/agencies/{}", aid)), "Failed to save site")
        }
    }
}

#[post("/agencies/<agency_id>/contacts", data = "<form>")]
async fn contact_upsert_post(
    agency_id: &str,
    form: Form<ContactForm<'_>>,
    db: &Db,
    admin: AdminUser,
) -> Flash<Redirect> {
    let aid = match agency_id.parse::<Uuid>() {
        Ok(u) => u,
        Err(_) => return Flash::error(Redirect::to("/admin/agencies"), "Invalid Agency ID"),
    };
    let f = form.into_inner();
    let cid = f.id.and_then(|s| s.parse::<Uuid>().ok());

    let mut tx = match db.begin().await {
        Ok(tx) => tx,
        Err(_) => return Flash::error(Redirect::to(format!("/admin/agencies/{}", aid)), "Internal Error"),
    };

    // If this is set as primary, unset others for this agency
    if f.is_primary {
        let _ = sqlx::query("UPDATE contacts SET is_primary = false WHERE agency_id = $1")
            .bind(aid)
            .execute(&mut *tx)
            .await;
    }

    let contact_id = if let Some(id) = cid {
        match sqlx::query(
            "UPDATE contacts SET name = $2, title = $3, phone = $4, email = $5, is_primary = $6, is_active = $7, updated_at = now() WHERE id = $1"
        )
        .bind(id)
        .bind(f.name)
        .bind(blank(f.title))
        .bind(blank(f.phone))
        .bind(blank(f.email))
        .bind(f.is_primary)
        .bind(f.is_active)
        .execute(&mut *tx)
        .await {
            Ok(_) => id,
            Err(e) => {
                tracing::error!(error = %e, "Failed to update contact");
                return Flash::error(Redirect::to(format!("/admin/agencies/{}", aid)), "Failed to update contact");
            }
        }
    } else {
        match sqlx::query_scalar::<_, Uuid>(
            "INSERT INTO contacts (agency_id, name, title, phone, email, is_primary, is_active) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id"
        )
        .bind(aid)
        .bind(f.name)
        .bind(blank(f.title))
        .bind(blank(f.phone))
        .bind(blank(f.email))
        .bind(f.is_primary)
        .bind(f.is_active)
        .fetch_one(&mut *tx)
        .await {
            Ok(id) => id,
            Err(e) => {
                tracing::error!(error = %e, "Failed to insert contact");
                return Flash::error(Redirect::to(format!("/admin/agencies/{}", aid)), "Failed to create contact");
            }
        }
    };

    // If it's primary, update the agency record
    if f.is_primary {
        let _ = sqlx::query("UPDATE agencies SET primary_contact_id = $1 WHERE id = $2")
            .bind(contact_id)
            .bind(aid)
            .execute(&mut *tx)
            .await;
    }

    if let Err(e) = tx.commit().await {
        tracing::error!(error = %e, "Failed to commit contact upsert transaction");
        return Flash::error(Redirect::to(format!("/admin/agencies/{}", aid)), "Failed to save contact");
    }

    Flash::success(Redirect::to(format!("/admin/agencies/{}", aid)), "Contact saved")
}

#[post("/agencies/<agency_id>/contacts/<contact_id>/delete")]
async fn contact_delete(
    agency_id: &str,
    contact_id: Uuid,
    db: &Db,
    _admin: AdminUser,
) -> Flash<Redirect> {
    let aid = match agency_id.parse::<Uuid>() {
        Ok(u) => u,
        Err(_) => return Flash::error(Redirect::to("/admin/agencies"), "Invalid Agency ID"),
    };
    let redirect = Redirect::to(format!("/admin/agencies/{}", aid));

    // 1. Verify contact exists, belongs to agency, and is NOT primary
    let contact: Option<(String, bool)> = sqlx::query_as(
        "SELECT name, is_primary FROM contacts WHERE id = $1 AND agency_id = $2"
    )
    .bind(contact_id)
    .bind(aid)
    .fetch_optional(&**db)
    .await
    .unwrap_or(None);

    let (name, is_primary) = match contact {
        Some(c) => c,
        None => return Flash::error(redirect, "Contact not found"),
    };

    if is_primary {
        return Flash::error(redirect, "Cannot delete the primary contact. Designate a new primary first.");
    }

    // 2. Find current primary contact for failover
    let primary_id: Option<Uuid> = sqlx::query_scalar("SELECT primary_contact_id FROM agencies WHERE id = $1")
        .bind(aid)
        .fetch_one(&**db)
        .await
        .ok();

    let primary_id = match primary_id {
        Some(id) => id,
        None => return Flash::error(redirect, "Agency must have a primary contact before deleting others."),
    };

    let mut tx = match db.begin().await {
        Ok(tx) => tx,
        Err(_) => return Flash::error(redirect, "Internal Error"),
    };

    // 3. Reassign ALL shifts (historical and future) to the primary contact
    if let Err(e) = sqlx::query("UPDATE shifts SET contact_id = $1 WHERE contact_id = $2")
        .bind(primary_id)
        .bind(contact_id)
        .execute(&mut *tx)
        .await {
            tracing::error!(error = %e, "Failed to reassign shifts during contact delete");
            return Flash::error(redirect, "Failed to reassign shifts");
        }

    // 4. Delete the contact record
    if let Err(e) = sqlx::query("DELETE FROM contacts WHERE id = $1")
        .bind(contact_id)
        .execute(&mut *tx)
        .await {
            tracing::error!(error = %e, "Failed to delete contact record");
            return Flash::error(redirect, "Failed to delete contact record");
        }

    if let Err(e) = tx.commit().await {
        tracing::error!(error = %e, "Failed to commit contact delete transaction");
        return Flash::error(redirect, "Failed to finalize deletion");
    }

    Flash::success(redirect, format!("Contact {} has been permanently removed and shifts reassigned.", name))
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

#[get("/dashboard")]
async fn dashboard(
    db: &Db,
    _admin: AdminUser,
    user: AuthUser,
    flash: Option<FlashMessage<'_>>,
) -> AppResult<Template> {

    let alerts: Vec<AlertRow> = sqlx::query_as(
        r#"
        SELECT
            aa.id,
            aa.alert_type::text AS alert_type,
            aa.shift_id,
            s.title            AS shift_title,
            s.start_at         AS shift_start_at,
            a.name             AS agency_name,
            si.name            AS site_name,
            vp.volunteer_names AS cancelled_volunteer,
            (SELECT COUNT(*) FROM shift_assignments sa2
             WHERE sa2.shift_id = s.id AND sa2.status = 'waitlisted') AS waitlist_count,
            aa.dog_application_id,
            da.dog_name,
            aa.created_at
        FROM admin_alerts aa
        LEFT JOIN shifts s   ON s.id  = aa.shift_id
        LEFT JOIN agencies a ON a.id  = s.agency_id
        LEFT JOIN sites si   ON si.id = s.site_id
        LEFT JOIN shift_assignments src ON src.id = aa.source_assignment_id
        LEFT JOIN volunteer_profiles vp ON vp.user_id = src.volunteer_id
        LEFT JOIN dog_applications da ON da.id = aa.dog_application_id
        WHERE aa.resolved_at IS NULL
          AND aa.alert_type IN ('waitlist_promote', 'shift_change_request', 'assessment_result_due')
        ORDER BY aa.created_at DESC
        LIMIT 20
        "#,
    )
    .fetch_all(&**db)
    .await
    .unwrap_or_default();

    let shifts_this_week: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM shifts \
         WHERE start_at >= date_trunc('week', now()) \
           AND start_at <  date_trunc('week', now()) + interval '7 days' \
           AND state IN ('published', 'invite_only')",
    )
    .fetch_one(&**db)
    .await
    .unwrap_or(0);

    let volunteers_this_week: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM shift_assignments sa \
         JOIN shifts s ON s.id = sa.shift_id \
         WHERE s.start_at >= date_trunc('week', now()) \
           AND s.start_at <  date_trunc('week', now()) + interval '7 days' \
           AND sa.status = 'confirmed'",
    )
    .fetch_one(&**db)
    .await
    .unwrap_or(0);

    let total_unresolved: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM admin_alerts WHERE resolved_at IS NULL")
            .fetch_one(&**db)
            .await
            .unwrap_or(0);

    Ok(Template::render(
        "admin/dashboard",
        context! {
            user: &user.0,
            flash: take_flash(flash),
            alerts,
            shifts_this_week,
            volunteers_this_week,
            total_unresolved,
        },
    ))
}

// ─── Profile ──────────────────────────────────────────────────────────────────

#[get("/profile")]
async fn profile(
    admin: AdminUser,
    user: AuthUser,
    flash: Option<FlashMessage<'_>>,
) -> AppResult<Template> {
    Ok(Template::render(
        "admin/profile",
        context! {
            user: &user.0,
            flash: take_flash(flash),
        },
    ))
}

#[derive(rocket::form::FromForm)]
struct AdminProfileForm<'r> {
    display_name: &'r str,
}

#[post("/profile", data = "<form>")]
async fn profile_update(
    form: Form<AdminProfileForm<'_>>,
    db: &Db,
    admin: AdminUser,
) -> Flash<Redirect> {
    let f = form.into_inner();
    
    match sqlx::query("UPDATE users SET display_name = $1 WHERE id = $2")
        .bind(blank(f.display_name))
        .bind(admin.0.id)
        .execute(&**db)
        .await
    {
        Ok(_) => Flash::success(Redirect::to("/admin/profile"), "Profile updated"),
        Err(e) => {
            tracing::error!(error = %e, "Failed to update admin profile");
            Flash::error(Redirect::to("/admin/profile"), "Failed to update profile")
        }
    }
}

// ─── Shift list ───────────────────────────────────────────────────────────────

#[get("/shifts?<state_filter>&<attention_only>&<view>&<page>&<partial>")]
async fn shifts_list(
    state_filter: Option<&str>,
    attention_only: Option<bool>,
    view: Option<&str>,
    page: Option<u32>,
    partial: Option<bool>,
    db: &Db,
    _admin: AdminUser,
    user: AuthUser,
    flash: Option<FlashMessage<'_>>,
) -> AppResult<Template> {
    let page_val = page.unwrap_or(0);
    let is_partial = partial.unwrap_or(false);
    let view_type = view.unwrap_or("list");
    let is_attention_only = attention_only.unwrap_or(false);
    
    // Better way to check for HTMX:
    // In a real app we'd check headers, but here we can just check if we want the full page or not.
    // Let's assume if view=calendar and page > 0, it's a lazy load request.

    let filter = state_filter.unwrap_or("active");
    let mut where_state = match filter {
        "draft"     => "s.state = 'draft'".to_string(),
        "pending"   => "s.state = 'pending_approval'".to_string(),
        "completed" => "s.end_at <= now()".to_string(),
        "hidden"    => "s.state = 'hidden'".to_string(),
        "archived"  => "s.state = 'archived'".to_string(),
        "all"       => "TRUE".to_string(),
        _           => "s.state IN ('published', 'invite_only') AND s.start_at > now()".to_string(),
    };

    if is_attention_only {
        where_state = format!("({}) AND (
            (SELECT COUNT(*) FROM shift_assignments sa2 WHERE sa2.shift_id = s.id AND sa2.status = 'confirmed') < s.slots_requested
            OR EXISTS (SELECT 1 FROM volunteer_surveys vs WHERE vs.shift_id = s.id AND vs.reviewed_at IS NULL)
            OR EXISTS (SELECT 1 FROM agency_surveys ags WHERE ags.shift_id = s.id AND ags.reviewed_at IS NULL)
            OR (
                (s.parking_notes IS NULL OR s.parking_notes = '' OR s.meeting_notes IS NULL OR s.meeting_notes = '' OR s.contact_id IS NULL)
                AND s.start_at < (now() + interval '3 days')
            )
        )", where_state);
    }

    let mut start_bound = None;
    let mut end_bound = None;

    if view_type == "calendar" {
        use chrono::Datelike;
        let now = Utc::now();
        let today = now.date_naive();
        
        let month_offset = page_val as i32;
        let target_month_start = if month_offset == 0 {
            NaiveDate::from_ymd_opt(today.year(), today.month(), 1).unwrap()
        } else {
            let mut y = today.year();
            let mut m = today.month() as i32 + month_offset;
            while m > 12 { m -= 12; y += 1; }
            while m < 1 { m += 12; y -= 1; }
            NaiveDate::from_ymd_opt(y, m as u32, 1).unwrap()
        };

        let mut start_date = target_month_start - chrono::Duration::days(target_month_start.weekday().num_days_from_sunday() as i64);
        
        // User rule: if month starts before 3rd business day (Mon=0, Tue=1, Wed=2), include preceding week
        if month_offset == 0 && target_month_start.weekday().num_days_from_monday() < 3 {
             start_date = start_date - chrono::Duration::weeks(1);
        }

        let next_month_start = if target_month_start.month() == 12 {
            NaiveDate::from_ymd_opt(target_month_start.year() + 1, 1, 1).unwrap()
        } else {
            NaiveDate::from_ymd_opt(target_month_start.year(), target_month_start.month() + 1, 1).unwrap()
        };
        let last_of_month = next_month_start - chrono::Duration::days(1);
        let mut end_date = last_of_month + chrono::Duration::days(6 - last_of_month.weekday().num_days_from_sunday() as i64);
        
        if month_offset == 0 && (last_of_month - today).num_days() < 7 {
            end_date = end_date + chrono::Duration::weeks(1);
        }

        start_bound = Some(start_date);
        end_bound = Some(end_date);
        where_state = format!("({}) AND s.start_at >= $1 AND s.start_at <= $2", where_state);
    }

    let sql = format!(
        r#"
        SELECT
            s.id, s.title, s.start_at, s.end_at,
            s.state::text AS state,
            s.slots_requested,
            COALESCE(COUNT(sa.id) FILTER (WHERE sa.status = 'confirmed'),  0) AS slots_confirmed,
            COALESCE(COUNT(sa.id) FILTER (WHERE sa.status = 'waitlisted'), 0) AS slots_waitlisted,
            a.name  AS agency_name,
            si.name AS site_name,
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
                (SELECT COUNT(*) FROM shift_assignments sa3 WHERE sa3.shift_id = s.id AND sa3.status = 'confirmed') < s.slots_requested
                OR EXISTS (SELECT 1 FROM volunteer_surveys vs WHERE vs.shift_id = s.id AND vs.reviewed_at IS NULL)
                OR EXISTS (SELECT 1 FROM agency_surveys ags WHERE ags.shift_id = s.id AND ags.reviewed_at IS NULL)
                OR (
                    (s.parking_notes IS NULL OR s.parking_notes = '' OR s.meeting_notes IS NULL OR s.meeting_notes = '' OR s.contact_id IS NULL)
                    AND s.start_at < (now() + interval '3 days')
                )
            ) AS requires_attention,
            EXISTS (SELECT 1 FROM volunteer_surveys vs WHERE vs.shift_id = s.id AND vs.reviewed_at IS NULL) AS unviewed_volunteer_reports,
            EXISTS (SELECT 1 FROM agency_surveys ags WHERE ags.shift_id = s.id AND ags.reviewed_at IS NULL) AS unviewed_agency_reports,
            EXISTS (SELECT 1 FROM volunteer_surveys vs WHERE vs.shift_id = s.id) AS has_volunteer_reports,
            EXISTS (SELECT 1 FROM agency_surveys ags WHERE ags.shift_id = s.id) AS has_agency_reports,
            (s.end_at < now()) AS is_past,
            (
                (s.parking_notes IS NULL OR s.parking_notes = '' OR s.meeting_notes IS NULL OR s.meeting_notes = '' OR s.contact_id IS NULL)
                AND s.start_at < (now() + interval '3 days')
            ) AS missing_details,
            (
                (SELECT COUNT(*) FROM shift_assignments sa4 WHERE sa4.shift_id = s.id AND sa4.status = 'confirmed') < s.slots_requested
            ) AS underfilled
        FROM shifts s
        JOIN agencies a  ON a.id  = s.agency_id
        JOIN sites si    ON si.id = s.site_id
        LEFT JOIN shift_assignments sa ON sa.shift_id = s.id
        WHERE {where_state}
        GROUP BY s.id, a.name, si.name
        ORDER BY s.start_at ASC
        "#,
    );

    let shifts: Vec<AdminShiftRow> = if view_type == "calendar" {
        sqlx::query_as(&sql)
            .bind(start_bound.unwrap().and_hms_opt(0, 0, 0).unwrap().and_utc())
            .bind(end_bound.unwrap().and_hms_opt(23, 59, 59).unwrap().and_utc())
            .fetch_all(&**db)
            .await?
    } else {
        sqlx::query_as(&format!("{} LIMIT 40 OFFSET $1", sql))
            .bind((page_val * 40) as i64)
            .fetch_all(&**db)
            .await?
    };

    if view_type == "calendar" {
        use chrono::Datelike;
        let today = Utc::now().date_naive();
        let start_date = start_bound.unwrap();
        let end_date = end_bound.unwrap();
        
        let mut weeks = vec![];
        let mut current_week_start = start_date;
        
        while current_week_start <= end_date {
            let mut days = vec![];
            for d in 0..7 {
                let current_date = current_week_start + chrono::Duration::days(d as i64);
                let day_shifts: Vec<AdminShiftRow> = shifts.iter()
                    .filter(|s| s.start_at.date_naive() == current_date)
                    .cloned()
                    .collect();
                
                days.push(context! {
                    date: current_date,
                    is_today: current_date == today,
                    shifts: day_shifts,
                });
            }
            weeks.push(context! { days });
            current_week_start = current_week_start + chrono::Duration::weeks(1);
        }

        // If it's a page > 0, we likely want just the partial for infinite scroll
        if is_partial {
            return Ok(Template::render(
                "admin/partials/calendar_weeks",
                context! {
                    user: &user.0,
                    weeks,
                    page: page_val,
                    current_filter: filter,
                    attention_only: is_attention_only,
                    view: "calendar",
                },
            ));
        }

        Ok(Template::render(
            "admin/shifts",
            context! {
                user: &user.0,
                flash: take_flash(flash),
                weeks,
                view: "calendar",
                current_filter: filter,
                attention_only: is_attention_only,
                page: page_val,
            },
        ))
    } else {
        let has_more = shifts.len() == 40;
        Ok(Template::render(
            "admin/shifts",
            context! {
                user: &user.0,
                flash: take_flash(flash),
                shifts,
                has_more,
                page: page_val,
                current_filter: filter,
                attention_only: is_attention_only,
                view: "list",
            },
        ))
    }
}

// ─── Shift editor — GET new ───────────────────────────────────────────────────

#[get("/shifts/new?<agency_id>")]
async fn shift_new_get(
    agency_id: Option<Uuid>,
    db: &Db,
    _admin: AdminUser,
    user: AuthUser,
    flash: Option<FlashMessage<'_>>,
) -> AppResult<Template> {

    let agencies: Vec<AgencyOption> =
        sqlx::query_as("SELECT id, name FROM agencies ORDER BY name")
            .fetch_all(&**db)
            .await?;

    let mut shift = ShiftFormValues::new_empty();
    let mut sites: Vec<SiteOption> = vec![];
    let mut contacts: Vec<ContactOption> = vec![];

    if let Some(aid) = agency_id {
        tracing::debug!(?aid, "Pre-filling shift for agency");
        shift.agency_id = aid.to_string();
        
        sites = sqlx::query_as(
            "SELECT id, name, address, is_active FROM sites \
             WHERE agency_id = $1 AND is_active = true ORDER BY name",
        )
        .bind(aid)
        .fetch_all(&**db)
        .await?;

        contacts = sqlx::query_as(
            "SELECT id, name, title, email, phone, is_primary, is_active FROM contacts \
             WHERE agency_id = $1 AND is_active = true ORDER BY name",
        )
        .bind(aid)
        .fetch_all(&**db)
        .await?;
    }

    Ok(Template::render(
        "admin/shift_edit",
        context! {
            user: &user.0,
            flash: take_flash(flash),
            shift,
            agencies,
            sites,
            contacts,
        },
    ))
}

// ─── Shift Details ───────────────────────────────────────────────────────────

#[post("/shifts/<id>/publish")]
async fn shift_publish_post(id: &str, db: &Db, admin: AdminUser) -> Flash<Redirect> {
    let shift_id = id.parse::<Uuid>().unwrap();
    
    let title: String = sqlx::query_scalar("SELECT title FROM shifts WHERE id = $1")
        .bind(shift_id)
        .fetch_one(&**db)
        .await
        .unwrap_or_default();

    let _ = sqlx::query("UPDATE shifts SET state = 'published' WHERE id = $1")
        .bind(shift_id)
        .execute(&**db).await;

    let _ = EventLog::shift_published(&**db, admin.0.id, shift_id, &title).await;

    Flash::success(Redirect::to(format!("/admin/shifts/{}", id)), "Shift published!")
}

#[post("/shifts/<id>/archive")]
async fn shift_archive_post(id: &str, db: &Db, admin: AdminUser) -> Flash<Redirect> {
    let shift_id = id.parse::<Uuid>().unwrap();

    let title: String = sqlx::query_scalar("SELECT title FROM shifts WHERE id = $1")
        .bind(shift_id)
        .fetch_one(&**db)
        .await
        .unwrap_or_default();

    let _ = sqlx::query("UPDATE shifts SET state = 'archived' WHERE id = $1")
        .bind(shift_id)
        .execute(&**db).await;

    let _ = EventLog::shift_archived(&**db, admin.0.id, shift_id, &title).await;

    Flash::success(Redirect::to(format!("/admin/shifts/{}", id)), "Shift archived")
}

#[post("/shifts/<id>/cancel")]
async fn shift_cancel_post(id: &str, db: &Db, admin: AdminUser) -> Flash<Redirect> {
    // In a real app we'd handle notify here
    let shift_id = id.parse::<Uuid>().unwrap();

    let title: String = sqlx::query_scalar("SELECT title FROM shifts WHERE id = $1")
        .bind(shift_id)
        .fetch_one(&**db)
        .await
        .unwrap_or_default();

    let _ = sqlx::query("UPDATE shifts SET state = 'archived', description = 'CANCELLED: ' || COALESCE(description, '') WHERE id = $1")
        .bind(shift_id)
        .execute(&**db).await;

    let _ = EventLog::shift_archived(&**db, admin.0.id, shift_id, &title).await;

    Flash::success(Redirect::to("/admin/shifts"), "Shift cancelled and archived")
}

#[derive(rocket::form::FromForm)]
struct ShiftMessageForm {
    message: String,
}

#[post("/shifts/<id>/message", data = "<form>")]
async fn shift_message_post(id: &str, form: Form<ShiftMessageForm>, db: &Db, admin: AdminUser) -> Flash<Redirect> {
    let shift_id = id.parse::<Uuid>().unwrap();
    let f = form.into_inner();
    let redirect = Redirect::to(format!("/admin/shifts/{}", id));

    let count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM shift_assignments WHERE shift_id = $1 AND status = 'confirmed'"
    )
    .bind(shift_id)
    .fetch_one(&**db)
    .await
    .unwrap_or(0);

    if count == 0 {
        return Flash::error(redirect, "No confirmed volunteers to message");
    }

    // Create notifications for all assigned
    let _ = sqlx::query(
        r#"
        INSERT INTO notifications (user_id, type, title, body, metadata)
        SELECT sa.volunteer_id, 'admin_message', 'Message regarding your visit', $2, JSON_BUILD_OBJECT('shift_id', $1)
        FROM shift_assignments sa
        WHERE sa.shift_id = $1 AND sa.status = 'confirmed'
        "#
    )
    .bind(shift_id)
    .bind(f.message)
    .execute(&**db).await;

    Flash::success(redirect, format!("Message sent to {} confirmed volunteer{}", count, if count == 1 { "" } else { "s" }))
}

// ─── Shift editor — GET edit ──────────────────────────────────────────────────

#[get("/shifts/<id>/edit")]
async fn shift_edit_get(
    id: &str,
    db: &Db,
    _admin: AdminUser,
    user: AuthUser,
    flash: Option<FlashMessage<'_>>,
) -> AppResult<Template> {
    let shift_id = id.parse::<Uuid>().map_err(|_| AppError::NotFound)?;

    let row: Option<ShiftEditRow> = sqlx::query_as(
        r#"
        SELECT
            s.id, s.agency_id, s.site_id, s.contact_id,
            s.title, s.description, s.specific_requests,
            s.parking_notes, s.meeting_notes,
            s.start_at, s.end_at, s.slots_requested, s.estimated_clients,
            s.state::text AS state,
            s.requires_police_check, s.requires_vulnerable_check,
            s.recurrence_rule,
            COALESCE(
              COUNT(sa.id) FILTER (WHERE sa.status != 'cancelled'),
              0
            ) AS assignee_count
        FROM shifts s
        LEFT JOIN shift_assignments sa ON sa.shift_id = s.id
        WHERE s.id = $1
        GROUP BY s.id
        "#,
    )
    .bind(shift_id)
    .fetch_optional(&**db)
    .await?;

    let row = row.ok_or(AppError::NotFound)?;

    let agencies: Vec<AgencyOption> =
        sqlx::query_as("SELECT id, name FROM agencies ORDER BY name")
            .fetch_all(&**db)
            .await
            .unwrap_or_default();

    let sites: Vec<SiteOption> = sqlx::query_as(
        "SELECT id, name, address, is_active FROM sites \
         WHERE agency_id = $1 AND is_active = true ORDER BY name",
    )
    .bind(row.agency_id)
    .fetch_all(&**db)
    .await
    .unwrap_or_default();

    let contacts: Vec<ContactOption> = sqlx::query_as(
        "SELECT id, name, title, email, phone, is_primary, is_active FROM contacts \
         WHERE agency_id = $1 AND is_active = true ORDER BY name",
    )
    .bind(row.agency_id)
    .fetch_all(&**db)
    .await
    .unwrap_or_default();

    let shift = ShiftFormValues {
        id: row.id.to_string(),
        is_new: false,
        agency_id: row.agency_id.to_string(),
        site_id: row.site_id.to_string(),
        contact_id: row.contact_id.map(|u| u.to_string()).unwrap_or_default(),
        title: row.title,
        description: row.description.unwrap_or_default(),
        specific_requests: row.specific_requests.unwrap_or_default(),
        parking_notes: row.parking_notes.unwrap_or_default(),
        meeting_notes: row.meeting_notes.unwrap_or_default(),
        start_at_input: fmt_dt_input(&row.start_at),
        end_at_input: fmt_dt_input(&row.end_at),
        slots_requested: row.slots_requested,
        estimated_clients: row.estimated_clients.map(|n| n.to_string()).unwrap_or_default(),
        state: row.state,
        requires_police_check: row.requires_police_check,
        requires_vulnerable_check: row.requires_vulnerable_check,
        recurrence_rule: row.recurrence_rule.unwrap_or_default(),
        assignee_count: row.assignee_count,
    };

    let team: Vec<AdminShiftTeamMember> = sqlx::query_as(
        r#"
        SELECT
            sa.volunteer_id as user_id,
            vp.volunteer_names,
            d.name AS dog_name,
            dt.name AS dog_breed,
            d.size::text AS dog_size,
            vp.profile_pic_asset_id
        FROM shift_assignments sa
        JOIN volunteer_profiles vp ON vp.user_id = sa.volunteer_id
        LEFT JOIN dogs d ON d.volunteer_id = sa.volunteer_id AND d.is_primary = true
        LEFT JOIN dog_types dt ON dt.id = d.breed_id
        WHERE sa.shift_id = $1 AND sa.status IN ('confirmed', 'waitlisted')
        ORDER BY sa.status ASC, sa.assigned_at ASC
        "#,
    )
    .bind(shift_id)
    .fetch_all(&**db)
    .await
    .unwrap_or_default();

    Ok(Template::render(
        "admin/shift_edit",
        context! {
            user: &user.0,
            flash: take_flash(flash),
            shift,
            agencies,
            sites,
            contacts,
            team,
        },
    ))
}

// ─── Shift detail (view-only) ─────────────────────────────────────────────────

#[derive(Serialize, sqlx::FromRow)]
struct ShiftDetailRow {
    id: Uuid,
    title: String,
    description: Option<String>,
    specific_requests: Option<String>,
    parking_notes: Option<String>,
    meeting_notes: Option<String>,
    start_at: DateTime<Utc>,
    end_at: DateTime<Utc>,
    slots_requested: i32,
    estimated_clients: Option<i32>,
    state: String,
    requires_police_check: bool,
    requires_vulnerable_check: bool,
    recurrence_rule: Option<String>,
    agency_id: Uuid,
    agency_name: String,
    site_id: Uuid,
    site_name: String,
    contact_id: Option<Uuid>,
    contact_name: Option<String>,
    contact_title: Option<String>,
    contact_email: Option<String>,
    contact_phone: Option<String>,
    assignee_count: i64,
}

#[derive(Serialize, sqlx::FromRow)]
struct AdminShiftTeamMember {
    user_id: Uuid,
    #[sqlx(rename = "volunteer_name")]
    volunteer_names: String,  // named volunteer_names so the detail template reuses the same field
    profile_pic_asset_id: Option<Uuid>,
    dog_name: Option<String>,
    dog_breed: Option<String>,
    dog_size: Option<String>,
    status: String,
    assignment_id: Uuid,
    survey_completed: bool,
    waitlist_position: Option<i32>,
    confirmation_deadline_at: Option<DateTime<Utc>>,
}

#[derive(Serialize, sqlx::FromRow)]
struct CancelledMember {
    user_id: Uuid,
    volunteer_name: String,
    profile_pic_asset_id: Option<Uuid>,
    dog_name: Option<String>,
    cancellation_reason: Option<String>,
    cancellation_note: Option<String>,
    cancelled_at: Option<DateTime<Utc>>,
}

#[derive(Serialize, sqlx::FromRow)]
struct OpenVacancy {
    id: Uuid,
    cancellation_reason: Option<String>,
    cancellation_note: Option<String>,
    created_at: DateTime<Utc>,
}

#[get("/shifts/<id>")]
async fn shift_detail_get(
    id: &str,
    db: &Db,
    _admin: AdminUser,
    user: AuthUser,
) -> AppResult<Template> {
    let shift_id = id.parse::<Uuid>().map_err(|_| AppError::NotFound)?;

    let row: Option<ShiftDetailRow> = sqlx::query_as(
        r#"
        SELECT
            s.id, s.title, s.description, s.specific_requests,
            s.parking_notes, s.meeting_notes,
            s.start_at, s.end_at, s.slots_requested, s.estimated_clients,
            s.state::text AS state,
            s.requires_police_check, s.requires_vulnerable_check,
            s.recurrence_rule,
            s.agency_id, a.name AS agency_name,
            s.site_id, si.name AS site_name,
            s.contact_id, c.name AS contact_name, c.title AS contact_title, c.email AS contact_email, c.phone AS contact_phone,
            (SELECT COUNT(*) FROM shift_assignments WHERE shift_id = s.id AND status IN ('confirmed', 'waitlisted')) as assignee_count
        FROM shifts s
        JOIN agencies a ON a.id = s.agency_id
        JOIN sites si ON si.id = s.site_id
        LEFT JOIN contacts c ON c.id = s.contact_id
        WHERE s.id = $1
        "#,
    )
    .bind(shift_id)
    .fetch_optional(&**db)
    .await?;

    let row = row.ok_or(AppError::NotFound)?;

    // Get team members
    let team: Vec<AdminShiftTeamMember> = sqlx::query_as(
        r#"
        SELECT
            sa.id AS assignment_id,
            sa.volunteer_id AS user_id,
            COALESCE(vp.volunteer_names, u.email) AS volunteer_name,
            vp.profile_pic_asset_id,
            d.name AS dog_name,
            dt.name AS dog_breed,
            d.size::text AS dog_size,
            sa.status::text AS status,
            sa.waitlist_position,
            sa.confirmation_deadline_at,
            EXISTS (
                SELECT 1 FROM volunteer_surveys vs
                WHERE vs.shift_id = sa.shift_id AND vs.volunteer_id = sa.volunteer_id
            ) AS survey_completed
        FROM shift_assignments sa
        JOIN users u ON u.id = sa.volunteer_id
        LEFT JOIN volunteer_profiles vp ON vp.user_id = sa.volunteer_id
        LEFT JOIN dogs d ON d.id = sa.dog_ids[1]
        LEFT JOIN dog_types dt ON dt.id = d.breed_id
        WHERE sa.shift_id = $1 AND sa.status IN ('confirmed', 'pending_confirmation', 'waitlisted')
        ORDER BY
            CASE sa.status WHEN 'confirmed' THEN 0 WHEN 'pending_confirmation' THEN 1 ELSE 2 END,
            sa.waitlist_position ASC NULLS LAST,
            sa.assigned_at ASC
        "#,
    )
    .bind(shift_id)
    .fetch_all(&**db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to fetch team members: {}", e);
        AppError::Database(e)
    })?;

    // Get cancelled members with reasons
    let cancelled: Vec<CancelledMember> = sqlx::query_as(
        r#"
        SELECT 
            sa.volunteer_id AS user_id,
            COALESCE(vp.volunteer_names, u.email) AS volunteer_name,
            vp.profile_pic_asset_id,
            d.name AS dog_name,
            sa.cancellation_reason,
            sa.cancellation_note,
            sa.cancelled_at
        FROM shift_assignments sa
        JOIN users u ON u.id = sa.volunteer_id
        LEFT JOIN volunteer_profiles vp ON vp.user_id = sa.volunteer_id
        LEFT JOIN dogs d ON d.volunteer_id = sa.volunteer_id AND d.is_primary = true
        WHERE sa.shift_id = $1 AND sa.status = 'cancelled'
        ORDER BY sa.cancelled_at DESC NULLS LAST
        "#,
    )
    .bind(shift_id)
    .fetch_all(&**db)
    .await
    .unwrap_or_default();

    // Get open vacancies
    let vacancies: Vec<OpenVacancy> = sqlx::query_as(
        r#"
        SELECT 
            id,
            cancellation_reason,
            cancellation_note,
            created_at
        FROM shift_vacancies
        WHERE shift_id = $1 AND status = 'open'
        ORDER BY created_at DESC
        "#,
    )
    .bind(shift_id)
    .fetch_all(&**db)
    .await
    .unwrap_or_default();

    // Get waitlist count
    let waitlist_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM shift_assignments WHERE shift_id = $1 AND status = 'waitlisted'"
    )
    .bind(shift_id)
    .fetch_one(&**db)
    .await
    .unwrap_or(0);

    // Get survey counts
    let volunteer_survey_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM volunteer_surveys WHERE shift_id = $1"
    )
    .bind(shift_id)
    .fetch_one(&**db)
    .await
    .unwrap_or(0);

    let agency_survey_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM agency_surveys WHERE shift_id = $1"
    )
    .bind(shift_id)
    .fetch_one(&**db)
    .await
    .unwrap_or(0);

    // Get available volunteers for vacancy invites
    let available_volunteers: Vec<(Uuid, String)> = sqlx::query_as(
        r#"
        SELECT vp.user_id, vp.volunteer_names
        FROM volunteer_profiles vp
        JOIN users u ON u.id = vp.user_id
        WHERE u.is_active = true
          AND NOT EXISTS (
              SELECT 1 FROM shift_assignments sa 
              WHERE sa.shift_id = $1 
              AND sa.volunteer_id = vp.user_id 
              AND sa.status IN ('confirmed', 'waitlisted')
          )
        ORDER BY vp.volunteer_names ASC
        LIMIT 50
        "#,
    )
    .bind(shift_id)
    .fetch_all(&**db)
    .await
    .unwrap_or_default();

    // Get shift history
    let history: Vec<VolunteerEventDetail> = sqlx::query_as(
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
    .bind(shift_id)
    .fetch_all(&**db)
    .await
    .unwrap_or_default();

    let slots_filled: i64 = team.iter().filter(|m| m.status == "confirmed").count() as i64;
    let slots_pending: i64 = team.iter().filter(|m| m.status == "pending_confirmation").count() as i64;

    Ok(Template::render(
        "admin/shift_detail",
        context! {
            user: &user.0,
            shift: row,
            team: team,
            slots_filled: slots_filled,
            slots_pending: slots_pending,
            cancelled: cancelled,
            vacancies: vacancies,
            waitlist_count: waitlist_count,
            volunteer_survey_count: volunteer_survey_count,
            agency_survey_count: agency_survey_count,
            available_volunteers: available_volunteers,
            history: history,
        },
    ))
}

// ─── Shift hover partial (for calendar hover cards) ───────────────────────────

#[get("/shifts/<id>/hover")]
async fn shift_hover_partial(
    id: &str,
    db: &Db,
    admin: AdminUser,
) -> AppResult<Template> {
    let shift_id = id.parse::<Uuid>().map_err(|_| AppError::NotFound)?;

    let row: (String, DateTime<Utc>, DateTime<Utc>, i32, i64, i64, String, String, Option<String>,) = sqlx::query_as(
        r#"
        SELECT 
            s.title,
            s.start_at,
            s.end_at,
            s.slots_requested,
            COALESCE(COUNT(sa.id) FILTER (WHERE sa.status = 'confirmed'), 0) AS confirmed,
            COALESCE(COUNT(sa.id) FILTER (WHERE sa.status = 'waitlisted'), 0) AS waitlisted,
            a.name AS agency_name,
            si.name AS site_name,
            c.name AS contact_name
        FROM shifts s
        JOIN agencies a ON a.id = s.agency_id
        JOIN sites si ON si.id = s.site_id
        LEFT JOIN contacts c ON c.id = s.contact_id
        LEFT JOIN shift_assignments sa ON sa.shift_id = s.id
        WHERE s.id = $1
        GROUP BY s.id, a.name, si.name, c.name
        "#,
    )
    .bind(shift_id)
    .fetch_optional(&**db)
    .await?
    .ok_or(AppError::NotFound)?;

    let teams: Vec<(String, Option<Uuid>)> = sqlx::query_as(
        r#"
        SELECT 
            COALESCE(d.name, 'No Dog'),
            vp.profile_pic_asset_id
        FROM shift_assignments sa
        LEFT JOIN dogs d ON d.id = ANY(sa.dog_ids) AND d.is_primary = true
        LEFT JOIN volunteer_profiles vp ON vp.user_id = sa.volunteer_id
        WHERE sa.shift_id = $1 AND sa.status = 'confirmed'
        ORDER BY sa.created_at ASC
        LIMIT 4
        "#,
    )
    .bind(shift_id)
    .fetch_all(&**db)
    .await?;

    Ok(Template::render(
        "admin/partials/shift_hover",
        context! {
            shift_id: shift_id,
            title: row.0,
            start_at: row.1,
            end_at: row.2,
            slots_requested: row.3,
            confirmed: row.4,
            waitlisted: row.5,
            agency_name: row.6,
            site_name: row.7,
            contact_name: row.8,
            teams: teams,
        },
    ))
}

// ─── Invite volunteer to fill vacancy ─────────────────────────────────────────

#[derive(rocket::form::FromForm)]
struct VacancyInviteForm {
    vacancy_id: Uuid,
    volunteer_id: Uuid,
}

#[post("/shifts/<id>/vacancies/invite", data = "<form>")]
async fn shift_vacancy_invite(
    id: &str,
    form: Form<VacancyInviteForm>,
    db: &Db,
    admin: AdminUser,
) -> Flash<Redirect> {
    let shift_id = match id.parse::<Uuid>() {
        Ok(u) => u,
        Err(_) => return Flash::error(Redirect::to("/admin/shifts"), "Invalid ID"),
    };
    let f = form.into_inner();
    let redirect = Redirect::to(format!("/admin/shifts/{}", shift_id));

    // Get vacancy info
    let vacancy: Option<(Uuid, String, String)> = sqlx::query_as(
        r#"
        SELECT sv.id, s.title, a.name
        FROM shift_vacancies sv
        JOIN shifts s ON s.id = sv.shift_id
        JOIN agencies a ON a.id = s.agency_id
        WHERE sv.id = $1 AND sv.shift_id = $2 AND sv.status = 'open'
        "#,
    )
    .bind(f.vacancy_id)
    .bind(shift_id)
    .fetch_optional(&**db)
    .await
    .unwrap_or(None);

    let (vacancy_id, shift_title, agency_name) = match vacancy {
        Some(v) => v,
        None => return Flash::error(redirect, "Vacancy not found or already filled"),
    };

    // Get volunteer info
    let volunteer: Option<(String, String)> = sqlx::query_as(
        r#"
        SELECT vp.volunteer_names, u.email
        FROM volunteer_profiles vp
        JOIN users u ON u.id = vp.user_id
        WHERE vp.user_id = $1
        "#,
    )
    .bind(f.volunteer_id)
    .fetch_optional(&**db)
    .await
    .unwrap_or(None);

    let (volunteer_name, _volunteer_email) = match volunteer {
        Some(v) => v,
        None => return Flash::error(redirect, "Volunteer not found"),
    };

    // Update vacancy status
    let _ = sqlx::query(
        r#"
        UPDATE shift_vacancies 
        SET status = 'inviting', 
            invited_volunteer_id = $1,
            invited_at = now()
        WHERE id = $2
        "#,
    )
    .bind(f.volunteer_id)
    .bind(vacancy_id)
    .execute(&**db)
    .await;

    // Create notification for volunteer
    let notification_body = format!(
        "You've been invited to fill an open spot for '{}' at {}. A volunteer had to cancel and we'd love to have you join! Tap to view details and confirm.",
        shift_title, agency_name
    );

    let payload = serde_json::json!({
        "shift_id": shift_id,
        "vacancy_id": vacancy_id,
        "invited_by": admin.0.id.to_string()
    });

    let _ = sqlx::query(
        r#"
        INSERT INTO notifications (user_id, type, title, body, payload)
        VALUES ($1, 'vacancy_invite', $2, $3, $4)
        "#,
    )
    .bind(f.volunteer_id)
    .bind(format!("Open spot at {}", agency_name))
    .bind(notification_body)
    .bind(payload)
    .execute(&**db)
    .await;

    // Log event
    let _ = EventLog::log(
        &**db,
        f.volunteer_id,
        crate::models::volunteer::VolunteerEventType::ShiftJoined,
        Some(shift_id),
        None,
        None,
        serde_json::json!({
            "shift_title": shift_title,
            "agency_name": agency_name,
            "note": format!("Invited by admin to fill vacancy"),
            "invited_by": admin.0.id.to_string()
        }),
        Some(admin.0.id),
    ).await;

    Flash::success(redirect, format!("Invitation sent to {}", volunteer_name))
}

// ─── HTMX: agency cascade partial (sites + contacts) ─────────────────────────

#[get("/agency-cascade?<agency_id>&<selected_site>&<selected_contact>")]
async fn agency_cascade_partial(
    agency_id: Option<Uuid>,
    selected_site: Option<&str>,
    selected_contact: Option<&str>,
    db: &Db,
    _admin: AdminUser,
    user: AuthUser,
) -> AppResult<Template> {
    let sites: Vec<SiteOption> = if let Some(aid) = agency_id {
        sqlx::query_as(
            "SELECT id, name, address, is_active FROM sites \
             WHERE agency_id = $1 AND is_active = true ORDER BY name",
        )
        .bind(aid)
        .fetch_all(&**db)
        .await?
    } else {
        vec![]
    };

    let contacts: Vec<ContactOption> = if let Some(aid) = agency_id {
        sqlx::query_as(
            "SELECT id, name, title, email, phone, is_primary, is_active FROM contacts \
             WHERE agency_id = $1 AND is_active = true ORDER BY name",
        )
        .bind(aid)
        .fetch_all(&**db)
        .await?
    } else {
        vec![]
    };

    Ok(Template::render(
        "admin/partials/cascade",
        context! {
            user: &user.0,
            sites,
            contacts,
            selected_site:    selected_site.unwrap_or(""),
            selected_contact: selected_contact.unwrap_or(""),
        },
    ))
}

// ─── Shift validation ─────────────────────────────────────────────────────────

#[derive(Serialize)]
struct ShiftWarnings {
    duration_warning: bool,
    past_warning: bool,
    has_any: bool,
}

fn validate_shift_logic(start_at: DateTime<Utc>, end_at: DateTime<Utc>) -> ShiftWarnings {
    let duration = end_at - start_at;
    let duration_warning = duration.num_minutes() > 180; // 3 hours
    let past_warning = start_at < Utc::now();
    
    ShiftWarnings {
        duration_warning,
        past_warning,
        has_any: duration_warning || past_warning,
    }
}

/// POST /admin/shifts/validate
/// HTMX validation endpoint. Returns modal if warnings, empty if OK.
#[post("/shifts/validate", data = "<form>")]
async fn shift_validate_post(
    form: Form<ShiftForm<'_>>,
    _admin: AdminUser,
) -> AppResult<Either<Template, &'static str>> {
    let f = form.into_inner();
    let start_at = parse_dt(f.start_at).unwrap_or_else(Utc::now);
    let end_at = parse_dt(f.end_at).unwrap_or_else(|| start_at + Duration::hours(1));

    let warnings = validate_shift_logic(start_at, end_at);
    
    if warnings.has_any {
        Ok(Either::Left(Template::render(
            "admin/partials/shift_warning_modal",
            context! {
                warnings,
                start_at,
                end_at,
            }
        )))
    } else {
        Ok(Either::Right(""))
    }
}

// ─── Shift create (POST) ──────────────────────────────────────────────────────

#[post("/shifts", data = "<form>")]
async fn shift_create_post(
    form: Form<ShiftForm<'_>>,
    db: &Db,
    admin: AdminUser,
) -> AppResult<Either<Flash<Redirect>, Template>> {
    let f = form.into_inner();

    let agency_id = match f.agency_id.parse::<Uuid>() {
        Ok(id) => id,
        Err(_) => {
            return Ok(Either::Left(Flash::error(
                Redirect::to("/admin/shifts/new"),
                "Please select a valid agency.",
            )))
        }
    };
    let site_id = match f.site_id.parse::<Uuid>() {
        Ok(id) => id,
        Err(_) => {
            return Ok(Either::Left(Flash::error(
                Redirect::to("/admin/shifts/new"),
                "Please select a valid site.",
            )))
        }
    };
    let contact_id: Option<Uuid> = f.contact_id.parse::<Uuid>().ok();

    let (start_at, end_at) = match (parse_dt(f.start_at), parse_dt(f.end_at)) {
        (Some(s), Some(e)) if e > s => (s, e),
        _ => {
            return Ok(Either::Left(Flash::error(
                Redirect::to("/admin/shifts/new"),
                "End time must be after start time.",
            )))
        }
    };

    // Validation Check
    if !f.ignore_warnings {
        let warnings = validate_shift_logic(start_at, end_at);
        if warnings.has_any {
            return Ok(Either::Right(Template::render(
                "admin/partials/shift_warning_modal",
                context! {
                    warnings,
                    start_at,
                    end_at,
                }
            )));
        }
    }

    let agency_name: String = sqlx::query_scalar("SELECT name FROM agencies WHERE id = $1")
        .bind(agency_id)
        .fetch_one(&**db)
        .await
        .unwrap_or_else(|_| "Unknown Agency".to_string());

    let site_name: String = sqlx::query_scalar("SELECT name FROM sites WHERE id = $1")
        .bind(site_id)
        .fetch_one(&**db)
        .await
        .unwrap_or_else(|_| "Unknown Site".to_string());

    let state = match f.state {
        "published" | "draft" | "invite_only" | "hidden" => f.state,
        _ => "draft",
    };

    let recurrence_rule: Option<String> = match f.recur_freq {
        "weekly"   => Some("FREQ=WEEKLY".to_owned()),
        "biweekly" => Some("FREQ=WEEKLY;INTERVAL=2".to_owned()),
        "monthly"  => Some("FREQ=MONTHLY".to_owned()),
        _          => None,
    };

    let parent_id: Uuid = match sqlx::query_scalar(
        r#"
        INSERT INTO shifts (
            agency_id, site_id, contact_id, title, description,
            specific_requests, parking_notes, meeting_notes,
            start_at, end_at, slots_requested, estimated_clients,
            state, requires_police_check, requires_vulnerable_check,
            recurrence_rule, created_by
        ) VALUES (
            $1,  $2,  $3,  $4,  $5,
            $6,  $7,  $8,
            $9,  $10, $11, $12,
            $13::shift_state, $14, $15,
            $16, $17
        )
        RETURNING id
        "#,
    )
    .bind(agency_id)
    .bind(site_id)
    .bind(contact_id)
    .bind(f.title)
    .bind(blank(f.description))
    .bind(blank(f.specific_requests))
    .bind(blank(f.parking_notes))
    .bind(blank(f.meeting_notes))
    .bind(start_at)
    .bind(end_at)
    .bind(f.slots_requested)
    .bind(f.estimated_clients)
    .bind(state)
    .bind(f.requires_police_check)
    .bind(f.requires_vulnerable_check)
    .bind(recurrence_rule.as_deref())
    .bind(admin.0.id)
    .fetch_one(&**db)
    .await
    {
        Ok(id) => {
            let _ = EventLog::shift_created(&**db, admin.0.id, id, f.title, &agency_name).await;
            id
        },
        Err(e) => {
            tracing::error!(error = %e, "Failed to insert shift");
            return Ok(Either::Left(Flash::error(
                Redirect::to("/admin/shifts/new"),
                "Failed to create shift — please try again.",
            )));
        }
    };

    // Expand recurrence into child shifts
    let child_count = expand_recurrence(
        &**db,
        parent_id,
        agency_id,
        site_id,
        contact_id,
        f.title,
        blank(f.description),
        blank(f.specific_requests),
        blank(f.parking_notes),
        blank(f.meeting_notes),
        start_at,
        end_at,
        f.slots_requested,
        f.estimated_clients,
        state,
        f.requires_police_check,
        f.requires_vulnerable_check,
        f.recur_freq,
        f.recur_until,
        f.recur_count,
        admin.0.id,
    )
    .await;

    let toast = ShiftSuccessToast {
        id: parent_id,
        title: f.title.to_string(),
        agency_name,
        site_name,
        start_at,
        child_count: child_count as i32,
    };

    let msg = serde_json::to_string(&toast).unwrap_or_default();

    Ok(Either::Left(Flash::success(
        Redirect::to("/admin/dashboard"),
        format!("SHIFT_CREATED:{}", msg),
    )))
}

/// Insert recurring child shifts; returns number of children created.
#[allow(clippy::too_many_arguments)]
async fn expand_recurrence(
    db: &sqlx::PgPool,
    parent_id: Uuid,
    agency_id: Uuid,
    site_id: Uuid,
    contact_id: Option<Uuid>,
    title: &str,
    description: Option<String>,
    specific_requests: Option<String>,
    parking_notes: Option<String>,
    meeting_notes: Option<String>,
    start_at: DateTime<Utc>,
    end_at: DateTime<Utc>,
    slots_requested: i32,
    estimated_clients: Option<i32>,
    state: &str,
    requires_police_check: bool,
    requires_vulnerable_check: bool,
    recur_freq: &str,
    recur_until: &str,
    recur_count: Option<i32>,
    created_by: Uuid,
) -> i32 {
    let step_days: i64 = match recur_freq {
        "weekly"   => 7,
        "biweekly" => 14,
        "monthly"  => 30,
        _          => return 0,
    };

    let max_count = recur_count.unwrap_or(12).clamp(1, 52);
    let until = blank(recur_until)
        .and_then(|s| parse_dt(&format!("{}T23:59", s)));
    let duration = end_at - start_at;
    let mut seq: i32 = 1;
    let mut cur_start = start_at;

    loop {
        cur_start = cur_start + Duration::days(step_days);
        let cur_end = cur_start + duration;

        if seq > max_count {
            break;
        }
        if let Some(u) = until {
            if cur_start > u {
                break;
            }
        }

        let _ = sqlx::query(
            r#"
            INSERT INTO shifts (
                agency_id, site_id, contact_id, title, description,
                specific_requests, parking_notes, meeting_notes,
                start_at, end_at, slots_requested, estimated_clients,
                state, requires_police_check, requires_vulnerable_check,
                recurrence_parent_id, recurrence_seq, inherited_from_shift_id,
                created_by
            ) VALUES (
                $1,  $2,  $3,  $4,  $5,
                $6,  $7,  $8,
                $9,  $10, $11, $12,
                $13::shift_state, $14, $15,
                $16, $17, $16,
                $18
            )
            "#,
        )
        .bind(agency_id)
        .bind(site_id)
        .bind(contact_id)
        .bind(title)
        .bind(&description)
        .bind(&specific_requests)
        .bind(&parking_notes)
        .bind(&meeting_notes)
        .bind(cur_start)
        .bind(cur_end)
        .bind(slots_requested)
        .bind(estimated_clients)
        .bind(state)
        .bind(requires_police_check)
        .bind(requires_vulnerable_check)
        .bind(parent_id)
        .bind(seq)
        .bind(created_by)
        .execute(db)
        .await;

        seq += 1;
    }

    seq - 1
}

// ─── Shift update (POST) ──────────────────────────────────────────────────────

#[post("/shifts/<id>", data = "<form>")]
async fn shift_update_post(
    id: &str,
    form: Form<ShiftForm<'_>>,
    db: &Db,
    admin: AdminUser,
) -> AppResult<Either<Flash<Redirect>, Template>> {
    let shift_id = match id.parse::<Uuid>() {
        Ok(id) => id,
        Err(_) => return Ok(Either::Left(Flash::error(Redirect::to("/admin/shifts"), "Invalid shift ID."))),
    };

    let edit_url = format!("/admin/shifts/{}/edit", shift_id);
    let f = form.into_inner();

    let site_id = match f.site_id.parse::<Uuid>() {
        Ok(id) => id,
        Err(_) => return Ok(Either::Left(Flash::error(Redirect::to(edit_url), "Please select a valid site."))),
    };
    let contact_id: Option<Uuid> = f.contact_id.parse::<Uuid>().ok();

    let (start_at, end_at) = match (parse_dt(f.start_at), parse_dt(f.end_at)) {
        (Some(s), Some(e)) if e > s => (s, e),
        _ => {
            return Ok(Either::Left(Flash::error(Redirect::to(edit_url), "End time must be after start time.")))
        }
    };

    // Validation Check
    if !f.ignore_warnings {
        let warnings = validate_shift_logic(start_at, end_at);
        if warnings.has_any {
            return Ok(Either::Right(Template::render(
                "admin/partials/shift_warning_modal",
                context! {
                    warnings,
                    start_at,
                    end_at,
                }
            )));
        }
    }

    let state = match f.state {
        "published" | "draft" | "invite_only" | "hidden" | "archived" => f.state,
        _ => "draft",
    };

    // Get current state for diffing
    let current: Option<(String, Uuid, Option<Uuid>, DateTime<Utc>, DateTime<Utc>, i32, String)> = sqlx::query_as(
        "SELECT title, site_id, contact_id, start_at, end_at, slots_requested, state::text FROM shifts WHERE id = $1"
    )
    .bind(shift_id)
    .fetch_optional(&**db)
    .await
    .unwrap_or(None);

    match sqlx::query(
        r#"
        UPDATE shifts SET
            site_id              = $2,
            contact_id           = $3,
            title                = $4,
            description          = $5,
            specific_requests    = $6,
            parking_notes        = $7,
            meeting_notes        = $8,
            start_at             = $9,
            end_at               = $10,
            slots_requested      = $11,
            estimated_clients    = $12,
            state                = $13::shift_state,
            requires_police_check    = $14,
            requires_vulnerable_check = $15,
            updated_by           = $16,
            updated_at           = now()
        WHERE id = $1
        "#,
    )
    .bind(shift_id)
    .bind(site_id)
    .bind(contact_id)
    .bind(f.title)
    .bind(blank(f.description))
    .bind(blank(f.specific_requests))
    .bind(blank(f.parking_notes))
    .bind(blank(f.meeting_notes))
    .bind(start_at)
    .bind(end_at)
    .bind(f.slots_requested)
    .bind(f.estimated_clients)
    .bind(state)
    .bind(f.requires_police_check)
    .bind(f.requires_vulnerable_check)
    .bind(admin.0.id)
    .execute(&**db)
    .await
    {
        Ok(_) => {
            if let Some(curr) = current {
                let mut changed = Vec::new();
                if curr.0 != f.title { changed.push("title".to_string()); }
                if curr.1 != site_id { changed.push("site".to_string()); }
                if curr.2 != contact_id { changed.push("contact".to_string()); }
                if curr.3 != start_at { changed.push("start_time".to_string()); }
                if curr.4 != end_at { changed.push("end_time".to_string()); }
                if curr.5 != f.slots_requested { changed.push("slots".to_string()); }
                if curr.6 != state { changed.push("state".to_string()); }

                if !changed.is_empty() {
                    let _ = EventLog::shift_updated(&**db, admin.0.id, shift_id, f.title, changed).await;
                }
            }
        }
        Err(e) => {
            tracing::error!(error = %e, "Failed to update shift");
            return Ok(Either::Left(Flash::error(
                Redirect::to(edit_url),
                "Failed to update shift — please try again.",
            )));
        }
    }

    // Invalidate change-detection hashes so all assignees see the "updated" banner
    let _ = sqlx::query("DELETE FROM shift_view_hashes WHERE shift_id = $1")
        .bind(shift_id)
        .execute(&**db)
        .await;

    // Optional: notify confirmed assignees via in-app notification
    if f.notify_assignees && !f.notify_message.trim().is_empty() {
        let msg = f.notify_message.trim();
        let _ = sqlx::query(
            r#"
            INSERT INTO notifications (user_id, "type", title, body, payload)
            SELECT
                sa.volunteer_id,
                'shift_updated'::notification_type,
                'A shift you joined has been updated',
                $2,
                jsonb_build_object('shift_id', $1::text)
            FROM shift_assignments sa
            WHERE sa.shift_id = $1
              AND sa.status IN ('confirmed', 'pending_confirmation')
            "#,
        )
        .bind(shift_id)
        .bind(msg)
        .execute(&**db)
        .await;
    }

    Ok(Either::Left(Flash::success(
        Redirect::to(format!("/admin/shifts/{}/edit", shift_id)),
        "Shift updated.",
    )))
}

// ─── Shift Assignments ───────────────────────────────────────────────────────

#[get("/shifts/<id>/assignments")]
async fn shift_assignments_get(
    id: &str,
    db: &Db,
    _admin: AdminUser,
    user: AuthUser,
    flash: Option<FlashMessage<'_>>,
) -> AppResult<Template> {
    let shift_id = id.parse::<Uuid>().map_err(|_| AppError::NotFound)?;

    let shift: AdminShiftRow = sqlx::query_as(
        r#"
        SELECT
            s.id, s.title, s.start_at, s.end_at,
            s.state::text AS state,
            s.slots_requested,
            COALESCE(COUNT(sa.id) FILTER (WHERE sa.status = 'confirmed'),  0) AS slots_confirmed,
            COALESCE(COUNT(sa.id) FILTER (WHERE sa.status = 'waitlisted'), 0) AS slots_waitlisted,
            a.name  AS agency_name,
            si.name AS site_name,
            '[]'::json AS teams,
            (
                (SELECT COUNT(*) FROM shift_assignments sa3 WHERE sa3.shift_id = s.id AND sa3.status = 'confirmed') < s.slots_requested
                OR EXISTS (SELECT 1 FROM volunteer_surveys vs WHERE vs.shift_id = s.id AND vs.reviewed_at IS NULL)
                OR EXISTS (SELECT 1 FROM agency_surveys ags WHERE ags.shift_id = s.id AND ags.reviewed_at IS NULL)
                OR (
                    (s.parking_notes IS NULL OR s.parking_notes = '' OR s.meeting_notes IS NULL OR s.meeting_notes = '' OR s.contact_id IS NULL)
                    AND s.start_at < (now() + interval '3 days')
                )
            ) AS requires_attention,
            EXISTS (SELECT 1 FROM volunteer_surveys vs WHERE vs.shift_id = s.id AND vs.reviewed_at IS NULL) AS unviewed_volunteer_reports,
            EXISTS (SELECT 1 FROM agency_surveys ags WHERE ags.shift_id = s.id AND ags.reviewed_at IS NULL) AS unviewed_agency_reports,
            EXISTS (SELECT 1 FROM volunteer_surveys vs WHERE vs.shift_id = s.id) AS has_volunteer_reports,
            EXISTS (SELECT 1 FROM agency_surveys ags WHERE ags.shift_id = s.id) AS has_agency_reports,
            (s.end_at < now()) AS is_past,
            (
                (s.parking_notes IS NULL OR s.parking_notes = '' OR s.meeting_notes IS NULL OR s.meeting_notes = '' OR s.contact_id IS NULL)
                AND s.start_at < (now() + interval '3 days')
            ) AS missing_details,
            (
                (SELECT COUNT(*) FROM shift_assignments sa4 WHERE sa4.shift_id = s.id AND sa4.status = 'confirmed') < s.slots_requested
            ) AS underfilled
        FROM shifts s
        JOIN agencies a  ON a.id  = s.agency_id
        JOIN sites si    ON si.id = s.site_id
        LEFT JOIN shift_assignments sa ON sa.shift_id = s.id
        WHERE s.id = $1
        GROUP BY s.id, a.name, si.name
        "#,
    )
    .bind(shift_id)
    .fetch_one(&**db)
    .await?;

    let current_assignments: Vec<VolunteerShiftTeamMember> = sqlx::query_as(
        r#"
        SELECT
            sa.volunteer_id as user_id,
            vp.volunteer_names,
            d.name AS dog_name,
            dt.name AS dog_breed,
            d.size::text AS dog_size,
            vp.profile_pic_asset_id,
            sa.status::text AS status,
            sa.waitlist_position,
            sa.confirmation_deadline_at
        FROM shift_assignments sa
        JOIN volunteer_profiles vp ON vp.user_id = sa.volunteer_id
        LEFT JOIN dogs d ON d.id = sa.dog_ids[1]
        LEFT JOIN dog_types dt ON dt.id = d.breed_id
        WHERE sa.shift_id = $1 AND sa.status IN ('confirmed', 'pending_confirmation', 'waitlisted')
        ORDER BY
            CASE sa.status WHEN 'confirmed' THEN 0 WHEN 'pending_confirmation' THEN 1 ELSE 2 END,
            sa.waitlist_position ASC NULLS LAST,
            sa.assigned_at ASC
        "#,
    )
    .bind(shift_id)
    .fetch_all(&**db)
    .await?;

    let volunteers: Vec<VolunteerOption> = sqlx::query_as(
        r#"
        SELECT vp.user_id as id, vp.volunteer_names as name, d.name as primary_dog_name
        FROM volunteer_profiles vp
        LEFT JOIN dogs d ON d.volunteer_id = vp.user_id AND d.is_primary = true
        ORDER BY vp.volunteer_names ASC
        "#,
    )
    .fetch_all(&**db)
    .await?;

    let slots_filled: i64 = current_assignments.iter().filter(|m| m.status == "confirmed").count() as i64;
    let slots_pending: i64 = current_assignments.iter().filter(|m| m.status == "pending_confirmation").count() as i64;

    Ok(Template::render(
        "admin/shift_assignments",
        context! {
            user: &user.0,
            flash: take_flash(flash),
            shift,
            current_assignments,
            volunteers,
            slots_filled,
            slots_pending,
        },
    ))
}

#[derive(rocket::form::FromForm)]
struct AddAssignmentForm {
    volunteer_id: Uuid,
    #[field(default = "confirmed")]
    status: String,
    overbook: Option<bool>,
    force_waitlist: Option<bool>,
}

pub struct HtmxFlashRedirect(pub Flash<Redirect>, pub bool);

impl<'r, 'o: 'r> rocket::response::Responder<'r, 'o> for HtmxFlashRedirect {
    fn respond_to(self, req: &'r rocket::Request<'_>) -> rocket::response::Result<'o> {
        let is_htmx = self.1;
        let flash = self.0;
        
        if is_htmx {
            // For HTMX, we use the HX-Redirect header to tell the client where to go
            // We still want the flash cookie to be set
            let mut response = flash.respond_to(req)?;
            
            // Extract the redirect URL from the Location header
            if let Some(location) = response.headers().get_one("Location") {
                response.set_header(rocket::http::Header::new("HX-Redirect", location.to_string()));
                // Change status to 200 so HTMX doesn't follow the 303 automatically, 
                // but instead uses the HX-Redirect header for a client-side redirect.
                response.set_status(rocket::http::Status::Ok);
            }
            Ok(response)
        } else {
            flash.respond_to(req)
        }
    }
}

#[post("/shifts/<id>/assignments", data = "<form>")]
async fn shift_assignment_add_post(
    id: &str,
    form: Form<AddAssignmentForm>,
    db: &Db,
    _admin: AdminUser,
    htmx: Htmx,
) -> AppResult<Either<HtmxFlashRedirect, Template>> {

    let is_htmx = htmx.0;
    let shift_id = match id.parse::<Uuid>() {
        Ok(u) => u,
        Err(_) => return Ok(Either::Left(HtmxFlashRedirect(Flash::error(Redirect::to("/admin/shifts"), "Invalid ID"), is_htmx))),
    };
    let mut f = form.into_inner();
    let redirect = Redirect::to(format!("/admin/shifts/{}/assignments", shift_id));

    // Check current capacity
    let (slots_requested, slots_filled, shift_title, agency_name): (i32, i64, String, String) = sqlx::query_as(
        r#"
        SELECT s.slots_requested,
               COUNT(sa.id) FILTER (WHERE sa.status IN ('confirmed', 'pending_confirmation') AND sa.volunteer_id <> $2),
               s.title,
               a.name AS agency_name
        FROM shifts s
        JOIN agencies a ON a.id = s.agency_id
        LEFT JOIN shift_assignments sa ON sa.shift_id = s.id
        WHERE s.id = $1
        GROUP BY s.slots_requested, s.title, a.name
        "#
    )
    .bind(shift_id)
    .bind(f.volunteer_id)
    .fetch_one(&**db)
    .await?;

    let requested_status = match f.status.as_str() {
        "waitlisted" => AssignmentStatus::Waitlisted,
        "pending_confirmation" | "pending" => AssignmentStatus::PendingConfirmation,
        _ => AssignmentStatus::Confirmed,
    };

    // If shift is full and user hasn't made an overbooking decision yet
    if (requested_status == AssignmentStatus::Confirmed || requested_status == AssignmentStatus::PendingConfirmation)
        && slots_filled >= slots_requested as i64 
        && f.overbook.is_none() 
        && f.force_waitlist.is_none()
    {
        // Get volunteer info for modal
        let volunteer_name: String = sqlx::query_scalar("SELECT volunteer_names FROM volunteer_profiles WHERE user_id = $1")
            .bind(f.volunteer_id)
            .fetch_one(&**db)
            .await?;

        return Ok(Either::Right(Template::render(
            "admin/partials/overbook_modal",
            context! {
                shift_id,
                shift_title,
                volunteer_id: f.volunteer_id,
                volunteer_name,
                requested_status: f.status,
                slots_requested,
                slots_filled,
            }
        )));
    }

    // Handle overbook decision: increase slots_requested
    if f.overbook == Some(true) {
        sqlx::query("UPDATE shifts SET slots_requested = $1 WHERE id = $2")
            .bind((slots_filled + 1) as i32)
            .bind(shift_id)
            .execute(&**db)
            .await?;
    }

    // Forced waitlist if full and trying to assign as active
    let (status, auto_waitlisted) = if (requested_status == AssignmentStatus::Confirmed || requested_status == AssignmentStatus::PendingConfirmation)
        && slots_filled >= slots_requested as i64 
        && f.overbook.is_none() 
        && f.force_waitlist.is_none()
    {
        // ... handled above by returning modal ...
        (requested_status.clone(), false)
    } else if f.force_waitlist == Some(true) || (requested_status != AssignmentStatus::Waitlisted && slots_filled >= (if f.overbook == Some(true) { slots_filled + 1 } else { slots_requested as i64 })) {
        (AssignmentStatus::Waitlisted, true)
    } else {
        (requested_status.clone(), false)
    };

    // Get selected or primary dog
    let dog_id: Option<Uuid> = sqlx::query_scalar(
        "SELECT id FROM dogs WHERE volunteer_id = $1 AND is_primary = true AND is_active = true"
    )
    .bind(f.volunteer_id)
    .fetch_optional(&**db)
    .await
    .unwrap_or(None);

    // Get waitlist position if needed
    let waitlist_pos: Option<i32> = if status == AssignmentStatus::Waitlisted {
        sqlx::query_scalar(
            "SELECT COALESCE(MAX(waitlist_position), 0) + 1 FROM shift_assignments WHERE shift_id = $1 AND status = 'waitlisted'"
        )
        .bind(shift_id)
        .fetch_optional(&**db)
        .await
        .unwrap_or(Some(1))
    } else {
        None
    };

    // Fetch volunteer info BEFORE insert/move
    let volunteer_info: (String, Option<String>) = sqlx::query_as(
        "SELECT vp.volunteer_names, d.name FROM volunteer_profiles vp LEFT JOIN dogs d ON d.id = $2 WHERE vp.user_id = $1"
    )
    .bind(f.volunteer_id)
    .bind(dog_id)
    .fetch_one(&**db)
    .await?;

    let (vn, dn) = volunteer_info;

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
    .bind(f.volunteer_id)
    .bind(dog_id.map(|id| vec![id]).unwrap_or_default())
    .bind(&status)
    .bind(waitlist_pos)
    .execute(&**db)
    .await;

    match res {
        Ok(_) => {
            let _ = EventLog::shift_joined(
                &**db, 
                f.volunteer_id, 
                shift_id, 
                dog_id,
                &shift_title, 
                &agency_name, 
                &vn, 
                dn.as_deref(),
                status == AssignmentStatus::Waitlisted
            ).await;

            if auto_waitlisted {
                Ok(Either::Left(HtmxFlashRedirect(Flash::success(redirect, "Shift is full. Volunteer has been added to the waitlist."), is_htmx)))
            } else {
                Ok(Either::Left(HtmxFlashRedirect(Flash::success(redirect, "Volunteer assigned successfully"), is_htmx)))
            }
        }
        Err(e) => {
            tracing::error!(error = %e, "Failed to add assignment");
            Ok(Either::Left(HtmxFlashRedirect(Flash::error(redirect, "Failed to add assignment"), is_htmx)))
        }
    }
}

#[derive(rocket::form::FromForm)]
struct RemoveAssignmentForm {
    volunteer_id: Uuid,
    reason: String,
    note: Option<String>,
}

#[post("/shifts/<id>/assignments/remove", data = "<form>")]
async fn shift_assignment_remove_post(
    id: &str,
    form: Form<RemoveAssignmentForm>,
    db: &Db,
    admin: AdminUser,
    cfg: &rocket::State<crate::config::AppConfig>,
) -> Flash<Redirect> {
    let shift_id = match id.parse::<Uuid>() {
        Ok(u) => u,
        Err(_) => return Flash::error(Redirect::to("/admin/shifts"), "Invalid ID"),
    };
    let f = form.into_inner();
    let redirect = Redirect::to(format!("/admin/shifts/{}/assignments", shift_id));

    // Start transaction
    let mut tx = match db.begin().await {
        Ok(t) => t,
        Err(e) => {
            tracing::error!(error = %e, "Failed to start transaction");
            return Flash::error(redirect, "Internal error");
        }
    };

    // Get info before update for logging (includes previous status to decide promotion)
    let info: Option<(String, String, String, Option<Uuid>, Option<String>, String)> = sqlx::query_as(
        r#"
        SELECT s.title, a.name, vp.volunteer_names, d.id, d.name, sa.status::text
        FROM shifts s
        JOIN agencies a ON a.id = s.agency_id
        JOIN shift_assignments sa ON sa.shift_id = s.id
        JOIN volunteer_profiles vp ON vp.user_id = sa.volunteer_id
        LEFT JOIN dogs d ON d.id = sa.dog_ids[1]
        WHERE s.id = $1 AND sa.volunteer_id = $2
        "#
    )
    .bind(shift_id)
    .bind(f.volunteer_id)
    .fetch_optional(&mut *tx)
    .await
    .unwrap_or(None);

    let res = sqlx::query(
        r#"
        UPDATE shift_assignments
        SET status              = 'cancelled',
            cancellation_reason = $1,
            cancellation_note   = $2,
            cancelled_at        = now(),
            confirmation_token  = NULL,
            updated_at          = now()
        WHERE shift_id = $3 AND volunteer_id = $4
        "#
    )
    .bind(&f.reason)
    .bind(&f.note)
    .bind(shift_id)
    .bind(f.volunteer_id)
    .execute(&mut *tx)
    .await;

    match res {
        Ok(_) => {
            let prev_status = info.as_ref().map(|r| r.5.as_str().to_owned());
            let slot_freed = matches!(prev_status.as_deref(), Some("confirmed") | Some("pending_confirmation"));

            if let Some((st, an, vn, di, dn, _)) = info {
                let log_reason = if let Some(n) = f.note.as_deref() {
                    if !n.is_empty() {
                        format!("{}: {}", f.reason, n)
                    } else {
                        f.reason.clone()
                    }
                } else {
                    f.reason.clone()
                };

                let _ = EventLog::shift_cancelled(
                    &mut *tx,
                    f.volunteer_id,
                    shift_id,
                    di,
                    &st,
                    &an,
                    &vn,
                    dn.as_deref(),
                    &format!("Removed by Admin - {}", log_reason)
                ).await;
            }

            if let Err(e) = tx.commit().await {
                tracing::error!(error = %e, "Failed to commit transaction");
                return Flash::error(redirect, "Failed to save cancellation");
            }

            // Auto-promote next waitlisted volunteer if a slot was freed
            if slot_freed {
                if let Err(e) = promote_next_waitlisted(&**db, shift_id, &cfg.app_url).await {
                    tracing::error!(error = %e, shift_id = %shift_id, "shift_assignment_remove: promote_next_waitlisted failed");
                }
            }

            Flash::success(redirect, "Volunteer removed from roster (marked as cancelled)")
        },
        Err(e) => {
            tracing::error!(error = %e, "Failed to update assignment");
            Flash::error(redirect, "Failed to remove volunteer")
        }
    }
}

/// POST /admin/shifts/<id>/assignments/<vid>/confirm
/// Manually confirm a pending assignment.
#[post("/shifts/<id>/assignments/<vid>/confirm")]
async fn shift_assignment_confirm_post(
    id: &str,
    vid: &str,
    db: &Db,
    _admin: AdminUser,
) -> AppResult<Flash<Redirect>> {
    let shift_id = id.parse::<Uuid>().map_err(|_| AppError::BadRequest("Invalid shift ID".into()))?;
    let volunteer_id = vid.parse::<Uuid>().map_err(|_| AppError::BadRequest("Invalid volunteer ID".into()))?;
    let redirect = Redirect::to(format!("/admin/shifts/{}", shift_id));

    // Update status to confirmed
    let res = sqlx::query(
        r#"
        UPDATE shift_assignments
        SET status = 'confirmed',
            confirmation_token = NULL,
            confirmed_at = now(),
            updated_at = now()
        WHERE shift_id = $1 AND volunteer_id = $2 AND status = 'pending_confirmation'
        "#
    )
    .bind(shift_id)
    .bind(volunteer_id)
    .execute(&**db)
    .await?;

    if res.rows_affected() == 0 {
        return Ok(Flash::error(redirect, "Assignment not found or not in pending state"));
    }

    // Log the event
    let info: Option<(String, String, String, Option<Uuid>, Option<String>)> = sqlx::query_as(
        r#"
        SELECT s.title, a.name, vp.volunteer_names, d.id, d.name
        FROM shifts s
        JOIN agencies a ON a.id = s.agency_id
        JOIN shift_assignments sa ON sa.shift_id = s.id
        JOIN volunteer_profiles vp ON vp.user_id = sa.volunteer_id
        LEFT JOIN dogs d ON d.id = sa.dog_ids[1]
        WHERE s.id = $1 AND sa.volunteer_id = $2
        "#
    )
    .bind(shift_id)
    .bind(volunteer_id)
    .fetch_optional(&**db)
    .await?;

    if let Some((st, an, vn, di, dn)) = info {
        let _ = EventLog::shift_invite_accepted(
            &**db,
            volunteer_id,
            shift_id,
            di,
            &st,
            &an,
            &vn,
            dn.as_deref(),
            true // Mark as admin confirmed
        ).await;
    }

    Ok(Flash::success(redirect, "Volunteer confirmed successfully"))
}

#[derive(Debug, Serialize, sqlx::FromRow)]
struct ShiftChangeRequestRowEnriched {
    id: Uuid,
    shift_id: Uuid,
    shift_title: String,
    agency_name: String,
    site_name: String,
    requested_by_name: String,
    requested_changes: serde_json::Value,
    reason: Option<String>,
    status: String,
    created_at: DateTime<Utc>,
    current_start_at: DateTime<Utc>,
    current_end_at: DateTime<Utc>,
    current_slots: i32,
    current_site_id: Uuid,
    current_site_name: String,
    new_site_name: Option<String>,
}

#[get("/shift-change-requests")]
async fn shift_change_requests_list(
    db: &Db,
    _admin: AdminUser,
    user: AuthUser,
    flash: Option<FlashMessage<'_>>,
) -> AppResult<Template> {
    let requests: Vec<ShiftChangeRequestRowEnriched> = sqlx::query_as(
        r#"
        SELECT 
            scr.id, scr.shift_id, s.title AS shift_title,
            a.name AS agency_name, si.name AS site_name,
            COALESCE(u.display_name, u.email) AS requested_by_name,
            scr.requested_changes, scr.reason, scr.status::text, scr.created_at,
            s.start_at AS current_start_at,
            s.end_at AS current_end_at,
            s.slots_requested AS current_slots,
            s.site_id AS current_site_id,
            si.name AS current_site_name,
            (SELECT name FROM sites WHERE id = (scr.requested_changes->>'site_id')::uuid) AS new_site_name
        FROM shift_change_requests scr
        JOIN shifts s ON s.id = scr.shift_id
        JOIN agencies a ON a.id = s.agency_id
        JOIN sites si ON si.id = s.site_id
        JOIN users u ON u.id = scr.requested_by
        WHERE scr.status = 'pending'
        ORDER BY scr.created_at DESC
        "#
    )
    .fetch_all(&**db)
    .await?;

    Ok(Template::render(
        "admin/shift_change_requests",
        context! { user: &user.0, requests, flash: take_flash(flash) }
    ))
}

#[derive(rocket::form::FromForm)]
struct ProcessChangeRequestForm<'r> {
    action: &'r str, // "approve" or "reject"
    admin_notes: &'r str,
    notify_volunteers: bool,
}

#[post("/shift-change-requests/<id>/process", data = "<form>")]
async fn shift_change_request_process(
    id: Uuid,
    form: Form<ProcessChangeRequestForm<'_>>,
    db: &Db,
    admin: AdminUser,
) -> AppResult<Flash<Redirect>> {
    let f = form.into_inner();
    
    let request: Option<(Uuid, serde_json::Value, Uuid)> = sqlx::query_as(
        "SELECT shift_id, requested_changes, requested_by FROM shift_change_requests WHERE id = $1 AND status = 'pending'"
    )
    .bind(id)
    .fetch_optional(&**db)
    .await?;

    let (shift_id, changes, requester_id) = match request {
        Some(r) => r,
        None => return Ok(Flash::error(Redirect::to("/admin/shift-change-requests"), "Request not found or already processed")),
    };

    let mut tx = db.begin().await?;

    if f.action == "approve" {
        // Apply changes to shift
        let start_at = changes["start_at"].as_str().unwrap();
        let end_at = changes["end_at"].as_str().unwrap();
        let site_id = changes["site_id"].as_str().unwrap().parse::<Uuid>().unwrap();
        let slots_requested = changes["slots_requested"].as_i64().unwrap() as i32;

        sqlx::query(
            "UPDATE shifts SET start_at = $1, end_at = $2, site_id = $3, slots_requested = $4, updated_at = now() WHERE id = $5"
        )
        .bind(DateTime::parse_from_rfc3339(start_at).unwrap().with_timezone(&Utc))
        .bind(DateTime::parse_from_rfc3339(end_at).unwrap().with_timezone(&Utc))
        .bind(site_id)
        .bind(slots_requested)
        .bind(shift_id)
        .execute(&mut *tx)
        .await?;

        // Update request status
        sqlx::query(
            "UPDATE shift_change_requests SET status = 'approved', admin_notes = $1, processed_at = now(), processed_by = $2 WHERE id = $3"
        )
        .bind(f.admin_notes)
        .bind(admin.0.id)
        .bind(id)
        .execute(&mut *tx)
        .await?;

        // Resolve admin alerts for this shift
        sqlx::query(
            "UPDATE admin_alerts SET resolved_at = now(), resolved_by = $1 WHERE shift_id = $2 AND alert_type = 'shift_change_request' AND resolved_at IS NULL"
        )
        .bind(admin.0.id)
        .bind(shift_id)
        .execute(&mut *tx)
        .await?;

        // Notify Agency
        sqlx::query(
            "INSERT INTO notifications (user_id, type, title, body, payload) VALUES ($1, 'shift_updated', 'Change Approved', $2, $3)"
        )
        .bind(requester_id)
        .bind(format!("Your requested changes for the shift have been approved. Admin notes: {}", f.admin_notes))
        .bind(serde_json::json!({ "shift_id": shift_id }))
        .execute(&mut *tx)
        .await?;

        // Optionally Notify Volunteers
        if f.notify_volunteers {
            let volunteer_ids: Vec<Uuid> = sqlx::query_scalar(
                "SELECT volunteer_id FROM shift_assignments WHERE shift_id = $1 AND status = 'confirmed'"
            )
            .bind(shift_id)
            .fetch_all(&mut *tx)
            .await?;

            for vid in volunteer_ids {
                sqlx::query(
                    "INSERT INTO notifications (user_id, type, title, body, payload) VALUES ($1, 'shift_updated', 'Visit Details Changed', 'A visit you are attending has been updated. Please review the new time or location.', $2)"
                )
                .bind(vid)
                .bind(serde_json::json!({ "shift_id": shift_id }))
                .execute(&mut *tx)
                .await?;
            }
        }
    } else {
        // Reject
        sqlx::query(
            "UPDATE shift_change_requests SET status = 'rejected', admin_notes = $1, processed_at = now(), processed_by = $2 WHERE id = $3"
        )
        .bind(f.admin_notes)
        .bind(admin.0.id)
        .bind(id)
        .execute(&mut *tx)
        .await?;

        // Resolve alert
        sqlx::query(
            "UPDATE admin_alerts SET resolved_at = now(), resolved_by = $1 WHERE shift_id = $2 AND alert_type = 'shift_change_request' AND resolved_at IS NULL"
        )
        .bind(admin.0.id)
        .bind(shift_id)
        .execute(&mut *tx)
        .await?;

        // Notify Agency
        sqlx::query(
            "INSERT INTO notifications (user_id, type, title, body, payload) VALUES ($1, 'shift_updated', 'Change Request Declined', $2, $3)"
        )
        .bind(requester_id)
        .bind(format!("Your requested changes for the shift have been declined. Admin notes: {}", f.admin_notes))
        .bind(serde_json::json!({ "shift_id": shift_id }))
        .execute(&mut *tx)
        .await?;
    }

    tx.commit().await?;

    // Get shift title for logging
    let shift_title: String = sqlx::query_scalar("SELECT title FROM shifts WHERE id = $1")
        .bind(shift_id)
        .fetch_one(&**db)
        .await
        .unwrap_or_default();

    let _ = EventLog::shift_change_processed(&**db, admin.0.id, shift_id, &shift_title, f.action == "approve", f.admin_notes).await;

    Ok(Flash::success(Redirect::to("/admin/shift-change-requests"), "Change request processed"))
}

// ─── Alert: promote waitlisted volunteer ──────────────────────────────────────

#[post("/alerts/<alert_id>/promote")]
async fn alert_promote_post(
    alert_id: &str,
    db: &Db,
    admin: AdminUser,
) -> Flash<Redirect> {
    let aid = match alert_id.parse::<Uuid>() {
        Ok(id) => id,
        Err(_) => return Flash::error(Redirect::to("/admin/dashboard"), "Invalid alert ID."),
    };

    let row: Option<(Uuid, Option<Uuid>)> = sqlx::query_as(
        "SELECT id, shift_id FROM admin_alerts WHERE id = $1 AND resolved_at IS NULL",
    )
    .bind(aid)
    .fetch_optional(&**db)
    .await
    .ok()
    .flatten();

    let shift_id = match row {
        Some((_, Some(sid))) => sid,
        Some((_, None)) => {
            let _ = sqlx::query(
                "UPDATE admin_alerts SET resolved_at = now() WHERE id = $1",
            )
            .bind(aid)
            .execute(&**db)
            .await;
            return Flash::success(Redirect::to("/admin/dashboard"), "Alert resolved.");
        }
        None => {
            return Flash::error(Redirect::to("/admin/dashboard"), "Alert not found or already resolved.");
        }
    };

    // Find the top waitlisted volunteer
    let top: Option<(Uuid,)> = sqlx::query_as(
        "SELECT id FROM shift_assignments \
         WHERE shift_id = $1 AND status = 'waitlisted' \
         ORDER BY waitlist_position ASC NULLS LAST, assigned_at ASC \
         LIMIT 1",
    )
    .bind(shift_id)
    .fetch_optional(&**db)
    .await
    .ok()
    .flatten();

    let assignment_id = match top {
        Some((id,)) => id,
        None => {
            let _ = sqlx::query(
                "UPDATE admin_alerts SET resolved_at = now() WHERE id = $1",
            )
            .bind(aid)
            .execute(&**db)
            .await;
            return Flash::success(
                Redirect::to("/admin/dashboard"),
                "No waitlisted volunteers — alert resolved.",
            );
        }
    };

    // Read confirmation window from system settings (default 48h)
    let window_hours: i64 = sqlx::query_scalar(
        "SELECT value::bigint FROM system_settings WHERE key = 'confirmation_window_hours'",
    )
    .fetch_optional(&**db)
    .await
    .ok()
    .flatten()
    .unwrap_or(48);

    let deadline = Utc::now() + Duration::hours(window_hours);
    let confirmation_token = Uuid::new_v4().to_string();

    let promoted = sqlx::query(
        "UPDATE shift_assignments \
         SET status = 'pending_confirmation', \
             confirmation_deadline_at = $2, \
             confirmation_token = $3, \
             updated_at = now() \
         WHERE id = $1",
    )
    .bind(assignment_id)
    .bind(deadline)
    .bind(&confirmation_token)
    .execute(&**db)
    .await;

    if let Err(e) = promoted {
        tracing::error!(error = %e, "Failed to promote waitlisted volunteer");
        return Flash::error(
            Redirect::to("/admin/dashboard"),
            "Failed to promote volunteer — please try again.",
        );
    }

    // Get info for logging and notifications
    let info: Option<(Uuid, String, String, String, Option<Uuid>, Option<String>)> = sqlx::query_as(
        r#"
        SELECT sa.volunteer_id, s.title, a.name, vp.volunteer_names, d.id, d.name
        FROM shift_assignments sa
        JOIN shifts s ON s.id = sa.shift_id
        JOIN agencies a ON a.id = s.agency_id
        JOIN volunteer_profiles vp ON vp.user_id = sa.volunteer_id
        LEFT JOIN dogs d ON d.id = sa.dog_ids[1]
        WHERE sa.id = $1
        "#
    )
    .bind(assignment_id)
    .fetch_optional(&**db)
    .await
    .unwrap_or(None);

    if let Some((vid, st, an, vn, di, dn)) = info {
        // Log event
        let _ = EventLog::waitlist_promoted(
            &**db, 
            vid, 
            shift_id, 
            di,
            &st, 
            &an, 
            &vn, 
            dn.as_deref()
        ).await;

        let _ = sqlx::query(
            r#"
            INSERT INTO notifications (user_id, "type", title, body, payload)
            VALUES (
                $1,
                'waitlist_promoted'::notification_type,
                'A spot opened up for you!',
                'You have been promoted from the waitlist. Please confirm or decline your spot.',
                jsonb_build_object('shift_id', $2::text, 'assignment_id', $3::text)
            )
            "#,
        )
        .bind(vid)
        .bind(shift_id)
        .bind(assignment_id)
        .execute(&**db)
        .await;
    }

    // Resolve alert
    let _ = sqlx::query("UPDATE admin_alerts SET resolved_at = now(), resolved_by = $2 WHERE id = $1")
        .bind(aid)
        .bind(admin.0.id)
        .execute(&**db)
        .await;

    Flash::success(
        Redirect::to("/admin/dashboard"),
        "Volunteer promoted to pending confirmation — they'll be notified shortly.",
    )
}

// ─── User Management ──────────────────────────────────────────────────────────

#[derive(Debug, Serialize, sqlx::FromRow)]
struct AdminUserRow {
    id: Uuid,
    email: String,
    role: String,
    display_name: Option<String>,
    is_active: bool,
    created_at: DateTime<Utc>,
    agency_name: Option<String>,
}

#[get("/users?<role_filter>&<search>&<page>")]
async fn users_list(
    role_filter: Option<&str>,
    search: Option<&str>,
    page: Option<u32>,
    db: &Db,
    admin: AdminUser,
    user: AuthUser,
    flash: Option<FlashMessage<'_>>,
    ) -> AppResult<Template> {
    let page = page.unwrap_or(0) as i64;
    let offset = page * 40;
    let filter = role_filter.unwrap_or("all");

    let where_role = match filter {
        "volunteer" => "u.role = 'volunteer'",
        "agency_contact" => "u.role = 'agency_contact'",
        "admin" => "u.role = 'admin'",
        "inactive" => "u.is_active = false",
        _ => "TRUE", // "all"
    };

    let search_trimmed = search.unwrap_or("").trim().to_owned();
    let has_search = !search_trimmed.is_empty();
    let search_pattern = format!("%{}%", search_trimmed);

    let sql = format!(
        r#"
        SELECT
            u.id, u.email, u.role::text AS role,
            u.display_name, u.is_active, u.created_at,
            a.name AS agency_name
        FROM users u
        LEFT JOIN contacts c ON c.user_id = u.id
        LEFT JOIN agencies a ON a.id = c.agency_id
        WHERE {where_role}
          AND ($1 = '' OR u.email ILIKE $2 OR u.display_name ILIKE $2)
        ORDER BY u.created_at DESC
        LIMIT 40 OFFSET {offset}
        "#
    );

    let users: Vec<AdminUserRow> = sqlx::query_as(&sql)
        .bind(&search_trimmed)
        .bind(&search_pattern)
        .fetch_all(&**db)
        .await?;

    let has_more = users.len() == 40;
    let show_agency_column = users.iter().any(|u| u.agency_name.is_some());

    Ok(Template::render(
        "admin/users",
        context! {
            user: &user.0,
            flash: take_flash(flash),
            users,
            has_more,
            page,
            current_filter: filter,
            search: if has_search { &search_trimmed } else { "" },
            admin_id: admin.0.id,
            show_agency_column,
        },
    ))
}

#[get("/users/<id>/edit")]
async fn user_edit_get(
    id: Uuid,
    db: &Db,
    admin: AdminUser,
    user: AuthUser,
    flash: Option<FlashMessage<'_>>,
) -> AppResult<Template> {
    let target_user: Option<AdminUserRow> = sqlx::query_as(
        r#"
        SELECT
            u.id, u.email, u.role::text AS role,
            u.display_name, u.is_active, u.created_at,
            a.name AS agency_name
        FROM users u
        LEFT JOIN contacts c ON c.user_id = u.id
        LEFT JOIN agencies a ON a.id = c.agency_id
        WHERE u.id = $1
        "#,
    )
    .bind(id)
    .fetch_optional(&**db)
    .await?;

    match target_user {
        Some(u) => Ok(Template::render(
            "admin/user_edit",
            context! {
                user: &user.0,
                flash: take_flash(flash),
                target_user: u,
                admin_id: admin.0.id,
            },
        )),
        None => Err(AppError::NotFound),
    }
}

#[derive(rocket::form::FromForm)]
struct UserEditForm<'r> {
    display_name: &'r str,
    role: &'r str,
    #[field(default = false)]
    is_active: bool,
}

#[post("/users/<id>", data = "<form>")]
async fn user_update_post(
    id: Uuid,
    form: Form<UserEditForm<'_>>,
    db: &Db,
    admin: AdminUser,
) -> Flash<Redirect> {
    let display_name = blank(form.display_name);
    let role = form.role.trim();

    // Validate role value
    if !matches!(role, "volunteer" | "agency_contact" | "admin") {
        return Flash::error(
            Redirect::to(format!("/admin/users/{}/edit", id)),
            "Invalid role.",
        );
    }

    let mut tx = match db.begin().await {
        Ok(tx) => tx,
        Err(e) => {
            tracing::error!(error = %e, "Failed to start transaction");
            return Flash::error(Redirect::to("/admin/users"), "Internal error");
        }
    };

    // Check if we are deactivating
    let was_active: bool = match sqlx::query_scalar("SELECT is_active FROM users WHERE id = $1")
        .bind(id)
        .fetch_one(&mut *tx)
        .await {
            Ok(a) => a,
            Err(_) => true, // default to true if check fails
        };

    let result = sqlx::query(
        "UPDATE users SET display_name = $1, role = $2::user_role, is_active = $3, updated_at = NOW()
         WHERE id = $4",
    )
    .bind(&display_name)
    .bind(role)
    .bind(form.is_active)
    .bind(id)
    .execute(&mut *tx)
    .await;

    match result {
        Ok(_) => {
            // Handle deactivation cascade
            if was_active && !form.is_active {
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
                .bind(id)
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
                    .bind(id)
                    .execute(&mut *tx)
                    .await;

                    let _ = EventLog::shift_cancelled(
                        &mut *tx, 
                        id, 
                        sid, 
                        di, 
                        &st, 
                        &an, 
                        &vn, 
                        dn.as_deref(), 
                        "User account deactivated"
                    ).await;
                }
                
                let _ = EventLog::profile_deactivated(&mut *tx, id, Some(admin.0.id)).await;
            } else if !was_active && form.is_active {
                let _ = EventLog::profile_reactivated(&mut *tx, id, Some(admin.0.id)).await;
            }

            if let Err(e) = tx.commit().await {
                tracing::error!(error = %e, "Failed to commit user update");
                return Flash::error(Redirect::to("/admin/users"), "Failed to save update");
            }

            Flash::success(
                Redirect::to(format!("/admin/users/{}/edit", id)),
                "User updated.",
            )
        },
        Err(e) => {
            tracing::error!(error = %e, "Failed to update user");
            Flash::error(
                Redirect::to(format!("/admin/users/{}/edit", id)),
                format!("Failed to update user: {}", e),
            )
        }
    }
}

// ─── Impersonation ────────────────────────────────────────────────────────────

#[post("/users/<id>/impersonate?<redirect>")]
async fn impersonate_by_id_post(
    id: Uuid,
    redirect: Option<String>,
    db: &Db,
    admin: AdminUser,
    jar: &rocket::http::CookieJar<'_>,
) -> Flash<Redirect> {
    if id == admin.0.id {
        return Flash::error(
            Redirect::to("/admin/users"),
            "You can't impersonate yourself.",
        );
    }

    let target: Option<User> = sqlx::query_as(
        "SELECT id, email, role, display_name, is_active, theme_preference, created_at, updated_at
         FROM users WHERE id = $1",
    )
    .bind(id)
    .fetch_optional(&**db)
    .await
    .ok()
    .flatten();

    let target = match target {
        Some(u) => u,
        None => {
            return Flash::error(
                Redirect::to("/admin/users"),
                "User not found.",
            );
        }
    };

    // Admins cannot impersonate other admins — this would mask actions under a different identity.
    if matches!(target.role, crate::models::user::UserRole::Admin) {
        return Flash::error(
            Redirect::to("/admin/users"),
            "Admins cannot impersonate other admins.",
        );
    }

    if !target.is_active {
        return Flash::error(
            Redirect::to(format!("/admin/users/{}/edit", id)),
            "That user account is deactivated.",
        );
    }

    let payload = ImpersonatePayload {
        user_id: target.id,
        display_name: target.display_name.clone().unwrap_or_else(|| target.email.clone()),
        role: format!("{:?}", target.role).to_lowercase(),
    };

    let json = serde_json::to_string(&payload).unwrap_or_default();
    let mut cookie = Cookie::new(IMPERSONATE_COOKIE, json);
    cookie.set_http_only(true);
    cookie.set_same_site(SameSite::Strict);
    cookie.set_secure(true);
    cookie.set_path("/");
    jar.add_private(cookie);

    // Use caller-supplied redirect if it's a safe relative URL, otherwise use role default.
    let default_dest = match target.role {
        crate::models::user::UserRole::Volunteer => "/volunteer/shifts",
        crate::models::user::UserRole::AgencyContact => "/agency/dashboard",
        crate::models::user::UserRole::Admin => "/admin/dashboard",
    };
    let dest = redirect
        .as_deref()
        .filter(|r| r.starts_with('/') && !r.starts_with("//"))
        .unwrap_or(default_dest);

    Flash::success(
        Redirect::to(dest.to_string()),
        format!("Now viewing as {}.", payload.display_name),
    )
}

#[post("/stop-impersonate")]
async fn stop_impersonate_post(
    _admin: AdminUser,
    jar: &rocket::http::CookieJar<'_>,
) -> Flash<Redirect> {
    jar.remove_private(Cookie::from(IMPERSONATE_COOKIE));
    Flash::success(Redirect::to("/admin/dashboard"), "Returned to admin session.")
}


#[derive(Debug, Serialize, sqlx::FromRow)]
struct AgencyRow {
    id: Uuid,
    name: String,
    slug: String,
    agency_type_name: Option<String>,
    is_login_active: bool,
    site_count: i64,
    contact_count: i64,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
struct AgencyTypeOption {
    id: Uuid,
    name: String,
}

#[derive(Debug, Serialize)]
struct AgencyFormValues {
    id: String,
    is_new: bool,
    name: String,
    slug: String,
    agency_type_id: String,
    description: String,
    is_login_active: bool,
    can_create_request: bool,
    primary_contact_id: String,
}

impl AgencyFormValues {
    fn new_empty() -> Self {
        Self {
            id: String::new(),
            is_new: true,
            name: String::new(),
            slug: String::new(),
            agency_type_id: String::new(),
            description: String::new(),
            is_login_active: false,
            can_create_request: false,
            primary_contact_id: String::new(),
        }
    }
}

// ... (rest of the file until agencies stub)

#[get("/agencies")]
async fn agencies_list(
    db: &Db,
    _admin: AdminUser,
    user: AuthUser,
    flash: Option<FlashMessage<'_>>,
) -> AppResult<Template> {
    let agencies: Vec<AgencyRow> = sqlx::query_as(
        r#"
        SELECT
            a.id, a.name, a.slug, a.is_login_active,
            at.name AS agency_type_name,
            (SELECT COUNT(*) FROM sites s WHERE s.agency_id = a.id) AS site_count,
            (SELECT COUNT(*) FROM contacts c WHERE c.agency_id = a.id) AS contact_count
        FROM agencies a
        LEFT JOIN agency_types at ON at.id = a.agency_type_id
        ORDER BY a.name ASC
        "#,
    )
    .fetch_all(&**db)
    .await?;

    Ok(Template::render(
        "admin/agencies",
        context! {
            user: &user.0,
            flash: take_flash(flash),
            agencies,
        },
    ))
}

#[get("/agencies/new")]
async fn agency_new_get(
    db: &Db,
    _admin: AdminUser,
    user: AuthUser,
    flash: Option<FlashMessage<'_>>,
) -> AppResult<Template> {
    let agency_types: Vec<AgencyTypeOption> =
        sqlx::query_as("SELECT id, name FROM agency_types WHERE is_active = true ORDER BY name")
            .fetch_all(&**db)
            .await
            .unwrap_or_default();

    Ok(Template::render(
        "admin/agency_edit",
        context! {
            user: &user.0,
            flash: take_flash(flash),
            agency: AgencyFormValues::new_empty(),
            agency_types,
            sites: Vec::<SiteOption>::new(),
            contacts: Vec::<ContactOption>::new(),
            shifts: Vec::<AdminShiftRow>::new(),
        },
    ))
}

#[get("/agencies/<id>")]
async fn agency_edit_get(
    id: &str,
    db: &Db,
    _admin: AdminUser,
    user: AuthUser,
    flash: Option<FlashMessage<'_>>,
) -> AppResult<Template> {
    let agency_id = id.parse::<Uuid>().map_err(|_| AppError::NotFound)?;

    let row: crate::models::agency::Agency = sqlx::query_as(
        "SELECT * FROM agencies WHERE id = $1",
    )
    .bind(agency_id)
    .fetch_optional(&**db)
    .await?
    .ok_or(AppError::NotFound)?;

    let agency_types: Vec<AgencyTypeOption> =
        sqlx::query_as("SELECT id, name FROM agency_types WHERE is_active = true ORDER BY name")
            .fetch_all(&**db)
            .await
            .unwrap_or_default();

    let sites: Vec<SiteOption> = sqlx::query_as(
        "SELECT id, name, address, is_active FROM sites WHERE agency_id = $1 ORDER BY name",
    )
    .bind(agency_id)
    .fetch_all(&**db)
    .await
    .unwrap_or_default();

    let contacts: Vec<ContactOption> = sqlx::query_as(
        "SELECT id, name, title, email, phone, is_primary, is_active FROM contacts WHERE agency_id = $1 ORDER BY name",
    )
    .bind(agency_id)
    .fetch_all(&**db)
    .await
    .unwrap_or_default();

    let shifts: Vec<AdminShiftRow> = sqlx::query_as(
        r#"
        SELECT
            s.id, s.title, s.start_at, s.end_at,
            s.state::text AS state,
            s.slots_requested,
            COALESCE(COUNT(sa.id) FILTER (WHERE sa.status = 'confirmed'),  0) AS slots_confirmed,
            COALESCE(COUNT(sa.id) FILTER (WHERE sa.status = 'waitlisted'), 0) AS slots_waitlisted,
            a.name  AS agency_name,
            si.name AS site_name
        FROM shifts s
        JOIN agencies a  ON a.id  = s.agency_id
        JOIN sites si    ON si.id = s.site_id
        LEFT JOIN shift_assignments sa ON sa.shift_id = s.id
        WHERE s.agency_id = $1
        GROUP BY s.id, a.name, si.name
        ORDER BY s.start_at DESC
        LIMIT 20
        "#,
    )
    .bind(agency_id)
    .fetch_all(&**db)
    .await
    .unwrap_or_default();

    let agency = AgencyFormValues {
        id: row.id.to_string(),
        is_new: false,
        name: row.name,
        slug: row.slug,
        agency_type_id: row.agency_type_id.map(|u| u.to_string()).unwrap_or_default(),
        description: row.description.unwrap_or_default(),
        is_login_active: row.is_login_active,
        can_create_request: row.can_create_request,
        primary_contact_id: row.primary_contact_id.map(|u| u.to_string()).unwrap_or_default(),
    };

    Ok(Template::render(
        "admin/agency_edit",
        context! {
            user: &user.0,
            flash: take_flash(flash),
            agency,
            agency_types,
            sites,
            contacts,
            shifts,
        },
    ))
}

// ─── Assessment Management ───────────────────────────────────────────────────

#[derive(Debug, Serialize, FromRow)]
struct AssessmentSessionListItem {
    id: Uuid,
    date: NaiveDate,
    location: String,
    total_slots: i64,
    filled_slots: i64,
    total_capacity: i64,
    slots: serde_json::Value,
}

#[get("/assessments")]
async fn assessments_list(
    db: &Db,
    _admin: AdminUser,
    user: AuthUser,
    flash: Option<FlashMessage<'_>>,
) -> AppResult<Template> {
    let sessions: Vec<AssessmentSessionListItem> = sqlx::query_as(
        r#"
        SELECT 
            asess.id, asess.date, asess.location,
            COUNT(aslots.id) as total_slots,
            SUM(CASE WHEN da.id IS NOT NULL THEN 1 ELSE 0 END) as filled_slots,
            SUM(aslots.capacity) as total_capacity,
            COALESCE((
                SELECT JSON_AGG(JSON_BUILD_OBJECT(
                    'id', s.id,
                    'start_time', s.start_time,
                    'end_time', s.end_time,
                    'available', s.capacity - (SELECT COUNT(*) FROM dog_applications WHERE selected_slot_id = s.id)
                ) ORDER BY s.start_time)
                FROM assessment_slots s
                WHERE s.session_id = asess.id
            ), '[]'::json) as slots
        FROM assessment_sessions asess
        LEFT JOIN assessment_slots aslots ON aslots.session_id = asess.id
        LEFT JOIN dog_applications da ON da.selected_slot_id = aslots.id
        GROUP BY asess.id
        ORDER BY asess.date DESC
        "#
    )
    .fetch_all(&**db)
    .await?;

    Ok(Template::render(
        "admin/assessments",
        context! { user: &user.0, sessions, flash: take_flash(flash) }
    ))
}

#[derive(rocket::form::FromForm)]
struct NewAssessmentSessionForm<'r> {
    date: &'r str,
    location: &'r str,
    slot_duration_mins: i32,
    start_time: &'r str,
    num_slots: i32,
    capacity_per_slot: i32,
}

#[post("/assessments/sessions", data = "<form>")]
async fn assessment_session_create(
    form: Form<NewAssessmentSessionForm<'_>>,
    db: &Db,
    admin: AdminUser,
) -> AppResult<Flash<Redirect>> {
    let f = form.into_inner();
    let date = NaiveDate::parse_from_str(f.date, "%Y-%m-%d").map_err(|_| AppError::BadRequest("Invalid date".to_string()))?;
    let start_time = chrono::NaiveTime::parse_from_str(f.start_time, "%H:%M").map_err(|_| AppError::BadRequest("Invalid time".to_string()))?;

    let mut tx = db.begin().await?;

    let session_id: Uuid = sqlx::query_scalar(
        "INSERT INTO assessment_sessions (date, location) VALUES ($1, $2) RETURNING id"
    )
    .bind(date)
    .bind(f.location)
    .fetch_one(&mut *tx)
    .await?;

    let mut current_time = start_time;
    for _ in 0..f.num_slots {
        let end_time = current_time + Duration::minutes(f.slot_duration_mins as i64);

        sqlx::query(
            "INSERT INTO assessment_slots (session_id, start_time, end_time, capacity) VALUES ($1, $2, $3, $4)"
        )
        .bind(session_id)
        .bind(current_time)
        .bind(end_time)
        .bind(f.capacity_per_slot)
        .execute(&mut *tx)
        .await?;

        current_time = end_time;
    }

    tx.commit().await?;

    Ok(Flash::success(Redirect::to("/admin/assessments"), "Assessment session created"))
}

#[derive(Debug, Serialize, FromRow)]
struct AssessmentRosterRow {
    slot_id: Uuid,
    start_time: chrono::NaiveTime,
    end_time: chrono::NaiveTime,
    capacity: i32,
    is_roster_finalized: bool,
    application_id: Option<Uuid>,
    volunteer_id: Option<Uuid>,
    volunteer_email: Option<String>,
    dog_name: Option<String>,
    volunteer_names: Option<String>,
    status: Option<String>,
    attendance: Option<String>,
    admin_notes: Option<String>,
}

#[get("/assessments/sessions/<id>")]
async fn assessment_session_detail(
    id: Uuid,
    db: &Db,
    _admin: AdminUser,
    user: AuthUser,
    flash: Option<FlashMessage<'_>>,
) -> AppResult<Template> {
    let session: AssessmentSession = sqlx::query_as("SELECT * FROM assessment_sessions WHERE id = $1")
        .bind(id)
        .fetch_optional(&**db)
        .await?
        .ok_or(AppError::NotFound)?;

    let roster: Vec<AssessmentRosterRow> = sqlx::query_as(
        r#"
        SELECT 
            aslots.id as slot_id, aslots.start_time, aslots.end_time, aslots.capacity,
            aslots.is_roster_finalized,
            da.id as application_id, u.id as volunteer_id, u.email as volunteer_email,
            da.dog_name, vp.volunteer_names, da.status::text as status,
            da.assessment_attendance::text as attendance,
            da.assessment_admin_notes as admin_notes
        FROM assessment_slots aslots
        LEFT JOIN dog_applications da ON da.selected_slot_id = aslots.id
        LEFT JOIN users u ON u.id = da.volunteer_id
        LEFT JOIN volunteer_profiles vp ON vp.user_id = da.volunteer_id
        WHERE aslots.session_id = $1
        ORDER BY aslots.start_time ASC
        "#
    )
    .bind(id)
    .fetch_all(&**db)
    .await
    .unwrap_or_default();

    Ok(Template::render(
        "admin/assessment_roster",
        context! { user: &user.0, session, roster, flash: take_flash(flash) }
    ))
}

#[derive(rocket::form::FromForm)]
struct SessionMessageForm<'r> {
    message: &'r str,
    slot_ids: Vec<Uuid>,
}

#[post("/assessments/sessions/<id>/message", data = "<form>")]
async fn assessment_session_message(
    id: Uuid,
    form: Form<SessionMessageForm<'_>>,
    db: &Db,
    admin: AdminUser,
) -> AppResult<Flash<Redirect>> {
    let f = form.into_inner();
    let redirect = Redirect::to(format!("/admin/assessments/sessions/{}", id));

    if f.slot_ids.is_empty() {
        return Ok(Flash::error(redirect, "No volunteers selected"));
    }

    // Get session info for notification title
    let session_date: NaiveDate = sqlx::query_scalar("SELECT date FROM assessment_sessions WHERE id = $1")
        .bind(id)
        .fetch_one(&**db)
        .await?;

    // Find all applications in selected slots
    let targets: Vec<(Uuid, String)> = sqlx::query_as(
        "SELECT volunteer_id, dog_name FROM dog_applications WHERE selected_slot_id = ANY($1)"
    )
    .bind(&f.slot_ids)
    .fetch_all(&**db)
    .await?;

    for (vid, dog_name) in &targets {
        let _ = sqlx::query(
            "INSERT INTO notifications (user_id, type, title, body, payload)
             VALUES ($1, 'admin_message', $2, $3, $4)"
        )
        .bind(vid)
        .bind(format!("Assessment Update — {}", dog_name))
        .bind(f.message)
        .bind(serde_json::json!({ "session_id": id.to_string(), "dog_name": dog_name }))
        .execute(&**db)
        .await;
    }

    let count = targets.len();

    Ok(Flash::success(redirect, format!("Message sent to {count} volunteer(s).")))
}

#[post("/assessments/sessions/<id>/finalize")]
async fn assessment_roster_finalize(
    id: Uuid,
    db: &Db,
    admin: AdminUser,
) -> AppResult<Flash<Redirect>> {
    sqlx::query(
        "UPDATE assessment_slots SET is_roster_finalized = true WHERE session_id = $1"
    )
    .bind(id)
    .execute(&**db)
    .await?;

    // Update all applications in these slots to 'assessment_scheduled'
    sqlx::query(
        r#"
        UPDATE dog_applications 
        SET status = 'assessment_scheduled' 
        WHERE selected_slot_id IN (SELECT id FROM assessment_slots WHERE session_id = $1)
          AND status = 'pending_assessment'
        "#
    )
    .bind(id)
    .execute(&**db)
    .await?;

    // Create alerts for each application to record results
    sqlx::query(
        r#"
        INSERT INTO admin_alerts (alert_type, dog_application_id)
        SELECT 'assessment_result_due', da.id
        FROM dog_applications da
        JOIN assessment_slots aslots ON aslots.id = da.selected_slot_id
        WHERE aslots.session_id = $1 AND da.status = 'assessment_scheduled'
        "#
    )
    .bind(id)
    .execute(&**db)
    .await?;

    Ok(Flash::success(Redirect::to(format!("/admin/assessments/sessions/{}", id)), "Roster finalized and volunteers notified"))
}

#[derive(rocket::form::FromForm)]
struct AssessmentAttendanceForm<'r> {
    status: &'r str, // "attended" or "no_show"
    #[field(default = "")]
    assessment_notes: &'r str,
}

#[post("/dog-applications/<app_id>/attendance", data = "<form>")]
async fn assessment_attendance_post(
    app_id: Uuid,
    form: Form<AssessmentAttendanceForm<'_>>,
    db: &Db,
    admin: AdminUser,
) -> AppResult<Flash<Redirect>> {
    let f = form.into_inner();
    
    // Get info for logging and redirect
    let info: Option<(Uuid, String, Uuid)> = sqlx::query_as(
        "SELECT volunteer_id, dog_name, s.id FROM dog_applications da JOIN assessment_slots aslots ON aslots.id = da.selected_slot_id JOIN assessment_sessions s ON s.id = aslots.session_id WHERE da.id = $1"
    )
    .bind(app_id)
    .fetch_optional(&**db)
    .await?;

    let (volunteer_id, dog_name, session_id) = match info {
        Some(i) => i,
        None => return Ok(Flash::error(Redirect::to("/admin/assessments"), "Application not found")),
    };

    let redirect = Redirect::to(format!("/admin/assessments/sessions/{}", session_id));

    if f.status == "attended" {
        sqlx::query("UPDATE dog_applications SET assessment_attendance = 'attended', assessment_admin_notes = $2 WHERE id = $1")
            .bind(app_id)
            .bind(blank(f.assessment_notes))
            .execute(&**db)
            .await?;
        
        let _ = EventLog::assessment_attended(&**db, volunteer_id, app_id, &dog_name, admin.0.id).await;
        Ok(Flash::success(redirect, format!("{} marked as attended", dog_name)))
    } else {
        sqlx::query("UPDATE dog_applications SET assessment_attendance = 'no_show', assessment_admin_notes = $2 WHERE id = $1")
            .bind(app_id)
            .bind(blank(f.assessment_notes))
            .execute(&**db)
            .await?;
        
        let _ = EventLog::assessment_no_show(&**db, volunteer_id, app_id, &dog_name, admin.0.id).await;
        Ok(Flash::warning(redirect, format!("{} marked as no-show", dog_name)))
    }
}

#[derive(rocket::form::FromForm)]
struct AssessmentResultForm<'r> {
    action: &'r str, // "approve" or "reject"
    feedback: &'r str,
    assessment_notes: &'r str,
}

#[post("/dog-applications/<app_id>/assessment-result", data = "<form>")]
async fn assessment_result_post(
    app_id: Uuid,
    form: Form<AssessmentResultForm<'_>>,
    db: &Db,
    admin: AdminUser,
) -> AppResult<Flash<Redirect>> {
    let f = form.into_inner();
    
    // Get application info
    let app: Option<(Uuid, String, Option<Uuid>, Option<String>, Option<NaiveDate>, String, Option<DogGender>)> = sqlx::query_as(
        r#"
        SELECT volunteer_id, dog_name, breed_id, breed_freeform, date_of_birth, size::text, gender
        FROM dog_applications WHERE id = $1
        "#
    )
    .bind(app_id)
    .fetch_optional(&**db)
    .await?;

    let (volunteer_id, dog_name, breed_id, breed_freeform, dob, size_str, gender) = match app {
        Some(a) => a,
        None => return Ok(Flash::error(Redirect::to("/admin/assessments"), "Application not found")),
    };

    let mut tx = db.begin().await?;

    if f.action == "approve" {
        // Create the dog record
        let size = match size_str.as_str() {
            "x_small" => DogSize::XSmall,
            "small" => DogSize::Small,
            "medium" => DogSize::Medium,
            "large" => DogSize::Large,
            "x_large" => DogSize::XLarge,
            _ => DogSize::Medium,
        };

        let dog_id: Uuid = sqlx::query_scalar(
            r#"
            INSERT INTO dogs (volunteer_id, name, breed_id, breed_freeform, size, gender, date_of_birth, is_active, is_primary)
            SELECT $1, $2, $3, $4, $5::dog_size, $6::dog_gender, $7, true,
                CASE WHEN NOT EXISTS (SELECT 1 FROM dogs WHERE volunteer_id = $1 AND is_active = true)
                     THEN true ELSE false END
            RETURNING id
            "#
        )
        .bind(volunteer_id)
        .bind(&dog_name)
        .bind(breed_id)
        .bind(breed_freeform)
        .bind(size)
        .bind(gender)
        .bind(dob)
        .fetch_one(&mut *tx)
        .await?;

        // Update application
        sqlx::query(
            r#"
            UPDATE dog_applications 
            SET status = 'approved',
                dog_id = $2,
                reviewed_at = now(),
                reviewed_by = $3,
                response_reason = $4,
                assessment_admin_notes = $5,
                updated_at = now()
            WHERE id = $1
            "#
        )
        .bind(app_id)
        .bind(dog_id)
        .bind(admin.0.id)
        .bind(f.feedback)
        .bind(f.assessment_notes)
        .execute(&mut *tx)
        .await?;

        // Log event
        EventLog::dog_application_approved(
            &mut *tx, 
            volunteer_id, 
            app_id, 
            &dog_name, 
            dog_id,
            admin.0.id,
            Some(f.feedback)
        ).await?;

    } else {
        // Reject
        sqlx::query(
            r#"
            UPDATE dog_applications 
            SET status = 'rejected',
                reviewed_at = now(),
                reviewed_by = $2,
                response_reason = $3,
                assessment_admin_notes = $4,
                updated_at = now()
            WHERE id = $1
            "#
        )
        .bind(app_id)
        .bind(admin.0.id)
        .bind(f.feedback)
        .bind(f.assessment_notes)
        .execute(&mut *tx)
        .await?;

        // Log event
        EventLog::dog_application_rejected(
            &mut *tx, 
            volunteer_id, 
            app_id, 
            &dog_name, 
            admin.0.id,
            f.feedback
        ).await?;
    }

    // Resolve alerts
    sqlx::query(
        "UPDATE admin_alerts SET resolved_at = now(), resolved_by = $2 WHERE dog_application_id = $1 AND alert_type = 'assessment_result_due'"
    )
    .bind(app_id)
    .bind(admin.0.id)
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;

    Ok(Flash::success(Redirect::to("/admin/assessments"), "Assessment finalized successfully"))
}

// ─── Volunteer management ─────────────────────────────────────────────────────


#[derive(Debug, Serialize, sqlx::FromRow)]
struct VolunteerShiftRow {
    id: Uuid,
    title: String,
    start_at: DateTime<Utc>,
    end_at: DateTime<Utc>,
    state: String,
    agency_name: String,
    site_name: String,
    status: String,
}

#[derive(rocket::form::FromForm, Debug)]
struct VolunteerForm<'r> {
    email: &'r str,
    #[field(default = "")]
    display_name: &'r str,
    volunteer_names: &'r str,
    #[field(default = "")]
    bio: &'r str,
    joined_at: Option<String>,
    #[field(default = false)]
    has_police_check: bool,
    #[field(default = false)]
    has_vulnerable_sector_check: bool,
    #[field(default = false)]
    is_active: bool,
}

#[derive(rocket::form::FromForm, Debug)]
struct DogForm<'r> {
    name: &'r str,
    #[field(default = "")]
    breed_id: &'r str,
    #[field(default = "")]
    breed_freeform: &'r str,
    size: &'r str,
    #[field(default = "")]
    gender: &'r str,
    date_of_birth: Option<String>,
    #[field(default = "")]
    personality_desc: &'r str,
    #[field(default = false)]
    is_primary: bool,
}

#[derive(rocket::form::FromForm, Debug)]
struct ContactFormVolunteer<'r> {
    subject: &'r str,
    #[allow(dead_code)]
    message: &'r str,
    #[field(default = "email")]
    method: &'r str,
}

// ─── Volunteer List ──────────────────────────────────────────────────────────

#[get("/volunteers?<search>&<active_filter>&<page>")]
async fn volunteers_list(
    db: &Db,
    _admin: AdminUser,
    user: AuthUser,
    search: Option<&str>,
    active_filter: Option<&str>,
    page: Option<u32>,
    flash: Option<FlashMessage<'_>>,
) -> AppResult<Template> {
    let page = page.unwrap_or(0) as i64;
    let offset = page * 50;

    let mut where_clauses = vec!["u.role = 'volunteer'".to_string()];

    // Filter by active status
    let filter_val = active_filter.unwrap_or("all");
    match filter_val {
        "active" => where_clauses.push("u.is_active = true".to_string()),
        "inactive" => {
            where_clauses.push(
                "(u.is_active = false OR EXISTS (SELECT 1 FROM dogs d_in WHERE d_in.volunteer_id = u.id AND d_in.is_active = false))".to_string()
            );
        }
        _ => {}
    }

    // Search filter
    let search_pattern = search.map(|s| format!("%{}%", s.to_lowercase()));
    if search_pattern.is_some() {
        let dog_active_clause = match filter_val {
            "active" => "AND d2.is_active = true",
            "inactive" => "AND d2.is_active = false",
            _ => ""
        };
        
        where_clauses.push(
            format!(
                "(LOWER(u.email) LIKE $1 OR LOWER(vp.volunteer_names) LIKE $1 OR EXISTS (SELECT 1 FROM dogs d2 WHERE d2.volunteer_id = u.id AND LOWER(d2.name) LIKE $1 {}))",
                dog_active_clause
            )
        );
    }

    let where_sql = where_clauses.join(" AND ");

    let sql = format!(
        r#"
        SELECT
            u.id, u.email, u.display_name, u.is_active, u.created_at,
            vp.volunteer_names, vp.has_police_check, vp.has_vulnerable_sector_check,
            d.name AS primary_dog_name,
            (
                SELECT string_agg(d2.name || CASE WHEN d2.is_active THEN '' ELSE ' (Inactive)' END, ', ') 
                FROM dogs d2 
                WHERE d2.volunteer_id = u.id 
                  AND (
                      ($1 IS NOT NULL AND LOWER(d2.name) LIKE $1)
                      OR
                      ($2 = 'inactive' AND d2.is_active = false)
                  )
            ) AS matched_dog_names,
            COUNT(DISTINCT sa.id) FILTER (WHERE sa.status = 'confirmed') AS total_shifts,
            MAX(s.start_at) FILTER (WHERE sa.status = 'confirmed') AS last_active
        FROM users u
        JOIN volunteer_profiles vp ON vp.user_id = u.id
        LEFT JOIN dogs d ON d.volunteer_id = u.id AND d.is_primary = true AND d.is_active = true
        LEFT JOIN shift_assignments sa ON sa.volunteer_id = u.id
        LEFT JOIN shifts s ON s.id = sa.shift_id
        WHERE {}
        GROUP BY u.id, vp.volunteer_names, vp.has_police_check, vp.has_vulnerable_sector_check, d.name
        ORDER BY u.created_at DESC
        LIMIT 50 OFFSET {}
        "#,
        where_sql, offset
    );
    let volunteers: Vec<VolunteerListRow> = sqlx::query_as(&sql)
        .bind(&search_pattern)
        .bind(filter_val)
        .fetch_all(&**db)
        .await
        .map_err(|e| {
            tracing::error!("Failed to fetch volunteers: {}", e);
            AppError::Database(e)
        })?;

    let has_more = volunteers.len() == 50;

    Ok(Template::render(
        "admin/volunteers",
        context! {
            user: &user.0,
            flash: take_flash(flash),
            volunteers,
            has_more,
            page,
            search: search.unwrap_or(""),
            active_filter: active_filter.unwrap_or("all"),
        },
    ))
}

#[get("/volunteers.csv")]
async fn volunteers_list_csv(
    db: &Db,
    admin: AdminUser,
) -> Result<String, Flash<Redirect>> {
    let volunteers: Vec<VolunteerListRow> = sqlx::query_as(
        r#"
        SELECT 
            u.id, u.email, u.display_name, u.is_active, u.created_at,
            vp.volunteer_names, vp.has_police_check, vp.has_vulnerable_sector_check,
            d.name AS primary_dog_name,
            NULL::text AS matched_dog_names,
            COUNT(DISTINCT sa.id) FILTER (WHERE sa.status = 'confirmed') AS total_shifts,
            MAX(s.start_at) FILTER (WHERE sa.status = 'confirmed') AS last_active
        FROM users u
        JOIN volunteer_profiles vp ON vp.user_id = u.id
        LEFT JOIN dogs d ON d.volunteer_id = u.id AND d.is_primary = true AND d.is_active = true
        LEFT JOIN shift_assignments sa ON sa.volunteer_id = u.id
        LEFT JOIN shifts s ON s.id = sa.shift_id
        WHERE u.role = 'volunteer'
        GROUP BY u.id, vp.volunteer_names, vp.has_police_check, vp.has_vulnerable_sector_check, d.name
        ORDER BY vp.volunteer_names
        "#
    )
    .fetch_all(&**db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to export volunteers: {}", e);
        Flash::error(Redirect::to("/admin/volunteers"), "Export failed")
    })?;

    let mut csv = String::from("Name,Email,Active,Police Check,Vulnerable Check,Primary Dog,Total Shifts,Last Active\n");
    for v in volunteers {
        csv.push_str(&format!(
            "\"{}\",\"{}\",{},{},{},\"{}\",{},\"{}\"\n",
            v.volunteer_names.replace('"', "\"\""),
            v.email,
            v.is_active,
            v.has_police_check,
            v.has_vulnerable_sector_check,
            v.primary_dog_name.unwrap_or_default(),
            v.total_shifts,
            v.last_active.map(|d| d.to_rfc3339()).unwrap_or_default()
        ));
    }

    Ok(csv)
}

#[get("/volunteers/new")]
async fn volunteer_new_get(
    db: &Db,
    _admin: AdminUser,
    user: AuthUser,
    flash: Option<FlashMessage<'_>>,
) -> AppResult<Template> {

    let all_breeds: Vec<(Uuid, String, Option<Uuid>)> = sqlx::query_as(
        "SELECT id, name, parent_id FROM dog_types WHERE is_active = true ORDER BY path"
    )
    .fetch_all(&**db)
    .await
    .unwrap_or_default();

    Ok(Template::render(
        "admin/volunteer_new",
        context! {
            user: &user.0,
            flash: take_flash(flash),
            all_breeds,
        },
    ))
}

// ─── Volunteer Detail ────────────────────────────────────────────────────────

#[derive(Debug, Serialize, FromRow)]
struct DogApplicationReviewInfo {
    id: Uuid,
    dog_name: String,
    status: String,
    assessment_admin_notes: Option<String>,
    response_reason: Option<String>,
    submitted_at: Option<DateTime<Utc>>,
}

#[get("/volunteers/<id>")]
async fn volunteer_detail(
    id: &str,
    db: &Db,
    _admin: AdminUser,
    user: AuthUser,
    flash: Option<FlashMessage<'_>>,
) -> AppResult<Template> {
    let user_id = id.parse::<Uuid>().map_err(|_| AppError::NotFound)?;

    let volunteer: VolunteerDetail = sqlx::query_as(
        r#"
        SELECT
            u.id AS user_id, u.email, u.display_name, u.is_active, u.created_at,
            vp.volunteer_names, vp.bio, vp.joined_at,
            vp.has_vulnerable_sector_check, vp.has_police_check, vp.profile_pic_asset_id,
            COUNT(DISTINCT sa.id) FILTER (WHERE sa.status = 'confirmed' AND s.end_at < now()) AS total_shifts,
            COALESCE(SUM(ags.actual_clients_served) FILTER (WHERE sa.status = 'confirmed'), 0)::bigint AS total_clients_served,
            COUNT(DISTINCT sa.id) FILTER (WHERE sa.status = 'confirmed' AND s.start_at > now()) AS upcoming_shifts

        FROM users u
        JOIN volunteer_profiles vp ON vp.user_id = u.id
        LEFT JOIN shift_assignments sa ON sa.volunteer_id = u.id
        LEFT JOIN shifts s ON s.id = sa.shift_id
        LEFT JOIN agency_surveys ags ON ags.shift_id = s.id
        WHERE u.id = $1
        GROUP BY u.id, u.email, u.display_name, u.is_active, u.created_at,
                 vp.volunteer_names, vp.bio, vp.joined_at,
                 vp.has_vulnerable_sector_check, vp.has_police_check, vp.profile_pic_asset_id
        "#
    )
    .bind(user_id)
    .fetch_optional(&**db)
    .await?
    .ok_or(AppError::NotFound)?;

    let dogs: Vec<DogDetail> = sqlx::query_as(
        r#"
        SELECT d.id, d.name, d.breed_id, dt.name AS breed_name, d.breed_freeform, d.size::text, d.gender,
               d.date_of_birth, d.personality_desc, d.is_primary, d.is_active,
               d.photo_asset_id,
               CASE WHEN a.storage_key IS NOT NULL THEN '/uploads/' || a.storage_key END AS photo_url,
               CASE WHEN a.thumb_key IS NOT NULL THEN '/uploads/' || a.thumb_key END AS photo_thumb_url,
               d.photo_crop_x, d.photo_crop_y, d.photo_crop_radius,
               d.created_at
        FROM dogs d
        LEFT JOIN dog_types dt ON dt.id = d.breed_id
        LEFT JOIN assets a ON a.id = d.photo_asset_id
        WHERE d.volunteer_id = $1
        ORDER BY d.is_primary DESC, d.created_at DESC
        "#
    )
    .bind(user_id)
    .fetch_all(&**db)
    .await
    .unwrap_or_default();

    let shifts: Vec<VolunteerShiftRow> = sqlx::query_as(
        r#"
        SELECT 
            s.id, s.title, s.start_at, s.end_at, s.state::text AS state,
            a.name AS agency_name, si.name AS site_name,
            sa.status::text AS status
        FROM shift_assignments sa
        JOIN shifts s ON s.id = sa.shift_id
        JOIN agencies a ON a.id = s.agency_id
        JOIN sites si ON si.id = s.site_id
        WHERE sa.volunteer_id = $1
        ORDER BY s.start_at DESC
        LIMIT 20
        "#
    )
    .bind(user_id)
    .fetch_all(&**db)
    .await
    .unwrap_or_default();

    // Recent events
    let events: Vec<VolunteerEventDetail> = sqlx::query_as(
        r#"
        SELECT 
            ve.id, ve.event_type::text, ve.metadata, ve.created_at,
            ve.shift_id, ve.dog_id,
            COALESCE(u.display_name, u.email) AS created_by_name,
            s.title AS shift_title, s.start_at AS shift_start_at,
            a.name AS agency_name,
            si.name AS site_name,
            d.name AS dog_name,
            vu.volunteer_names AS from_volunteer_name
        FROM volunteer_events ve
        LEFT JOIN users u ON u.id = ve.created_by
        LEFT JOIN shifts s ON s.id = ve.shift_id
        LEFT JOIN agencies a ON a.id = s.agency_id
        LEFT JOIN sites si ON si.id = s.site_id
        LEFT JOIN dogs d ON d.id = ve.dog_id
        LEFT JOIN volunteer_profiles vu ON vu.user_id = ve.related_user_id
        WHERE ve.user_id = $1
        ORDER BY ve.created_at DESC
        LIMIT 50
        "#
    )
    .bind(user_id)
    .fetch_all(&**db)
    .await
    .unwrap_or_default();

    let all_breeds: Vec<(Uuid, String, Option<Uuid>)> = sqlx::query_as(
        "SELECT id, name, parent_id FROM dog_types WHERE is_active = true ORDER BY path"
    )
    .fetch_all(&**db)
    .await
    .unwrap_or_default();

    let dog_applications: Vec<DogApplicationReviewInfo> = sqlx::query_as(
        "SELECT id, dog_name, status::text, assessment_admin_notes, response_reason, submitted_at FROM dog_applications WHERE volunteer_id = $1 ORDER BY created_at DESC"
    )
    .bind(user_id)
    .fetch_all(&**db)
    .await
    .unwrap_or_default();

    Ok(Template::render(
        "admin/volunteer_detail",
        context! {
            user: &user.0,
            flash: take_flash(flash),
            volunteer,
            dogs,
            shifts,
            events,
            all_breeds,
            dog_applications,
        },
    ))
}

#[get("/volunteers/<id>/edit")]
async fn volunteer_edit_get(
    id: &str,
    db: &Db,
    _admin: AdminUser,
    user: AuthUser,
    flash: Option<FlashMessage<'_>>,
) -> AppResult<Template> {

    let user_id = id.parse::<Uuid>().map_err(|_| AppError::NotFound)?;

    let volunteer: VolunteerDetail = sqlx::query_as(
        r#"
        SELECT 
            u.id AS user_id, u.email, u.display_name, u.is_active, u.created_at,
            vp.volunteer_names, vp.bio, vp.joined_at,
            vp.has_vulnerable_sector_check, vp.has_police_check, vp.profile_pic_asset_id,
            0::bigint AS total_shifts,
            0::bigint AS total_clients_served,
            0::bigint AS upcoming_shifts
        FROM users u
        JOIN volunteer_profiles vp ON vp.user_id = u.id
        WHERE u.id = $1
        "#
    )
    .bind(user_id)
    .fetch_optional(&**db)
    .await?
    .ok_or(AppError::NotFound)?;

    Ok(Template::render(
        "admin/volunteer_edit",
        context! {
            user: &user.0,
            flash: take_flash(flash),
            volunteer,
        },
    ))
}

// ─── Create/Update Volunteer ─────────────────────────────────────────────────

#[post("/volunteers", data = "<form>")]
async fn volunteer_create_post(
    form: Form<VolunteerForm<'_>>,
    db: &Db,
    admin: AdminUser,
) -> Flash<Redirect> {
    let f = form.into_inner();

    // Check if email already exists
    let existing: Option<Uuid> = sqlx::query_scalar("SELECT id FROM users WHERE email = $1")
        .bind(f.email)
        .fetch_optional(&**db)
        .await
        .unwrap_or(None);

    if existing.is_some() {
        return Flash::error(
            Redirect::to("/admin/volunteers/new"),
            "A user with this email already exists",
        );
    }

    // Create user
    let user_id = match sqlx::query_scalar::<_, Uuid>(
        "INSERT INTO users (email, role, display_name, is_active) VALUES ($1, $2, $3, $4) RETURNING id"
    )
    .bind(f.email)
    .bind(UserRole::Volunteer)
    .bind(blank(f.display_name))
    .bind(f.is_active)
    .fetch_one(&**db)
    .await {
        Ok(id) => id,
        Err(e) => {
            tracing::error!("Failed to create user: {}", e);
            return Flash::error(Redirect::to("/admin/volunteers/new"), "Failed to create volunteer");
        }
    };

    let joined_at = f.joined_at
        .filter(|s| !s.trim().is_empty())
        .and_then(|s| NaiveDate::parse_from_str(&s, "%Y-%m-%d").ok())
        .unwrap_or_else(|| Utc::now().date_naive());

    // Create volunteer profile
    if let Err(e) = sqlx::query(
        "INSERT INTO volunteer_profiles (user_id, volunteer_names, bio, joined_at, has_police_check, has_vulnerable_sector_check)
         VALUES ($1, $2, $3, $4, $5, $6)"
    )
    .bind(user_id)
    .bind(f.volunteer_names)
    .bind(blank(f.bio))
    .bind(joined_at)
    .bind(f.has_police_check)
    .bind(f.has_vulnerable_sector_check)
    .execute(&**db)
    .await {
        tracing::error!("Failed to create volunteer profile: {}", e);
        return Flash::error(Redirect::to("/admin/volunteers/new"), "Failed to create profile");
    }

    // Log event
    let _ = EventLog::profile_created(&**db, user_id, Some(admin.0.id)).await;

    Flash::success(
        Redirect::to(format!("/admin/volunteers/{}", user_id)),
        "Volunteer created successfully",
    )
}

#[post("/volunteers/<id>", data = "<form>")]
async fn volunteer_update_post(
    id: &str,
    form: Form<VolunteerForm<'_>>,
    db: &Db,
    admin: AdminUser,
) -> Flash<Redirect> {
    let user_id = match id.parse::<Uuid>() {
        Ok(u) => u,
        Err(_) => return Flash::error(Redirect::to("/admin/volunteers"), "Invalid ID"),
    };

    let f = form.into_inner();

    // Get current profile for change tracking
    let current: Option<(String, Option<String>, NaiveDate, bool, bool)> = sqlx::query_as(
        "SELECT volunteer_names, bio, joined_at, has_police_check, has_vulnerable_sector_check
         FROM volunteer_profiles WHERE user_id = $1"
    )
    .bind(user_id)
    .fetch_optional(&**db)
    .await
    .unwrap_or(None);

    let joined_at = f.joined_at
        .filter(|s| !s.trim().is_empty())
        .and_then(|s| NaiveDate::parse_from_str(&s, "%Y-%m-%d").ok())
        .unwrap_or_else(|| Utc::now().date_naive());

    // Track changed fields
    let mut changed_fields = Vec::new();
    if let Some((names, bio, joined, police, vulnerable)) = &current {
        if names != f.volunteer_names { changed_fields.push("volunteer_names".to_string()); }

        let bio_current = bio.as_deref().unwrap_or("");
        if bio_current != f.bio { changed_fields.push("bio".to_string()); }

        if joined != &joined_at { changed_fields.push("joined_at".to_string()); }

        if police != &f.has_police_check { changed_fields.push("has_police_check".to_string()); }
        if vulnerable != &f.has_vulnerable_sector_check { changed_fields.push("has_vulnerable_sector_check".to_string()); }
    }

    let mut tx = match db.begin().await {
        Ok(tx) => tx,
        Err(e) => {
            tracing::error!(error = %e, "Failed to start transaction");
            return Flash::error(Redirect::to(format!("/admin/volunteers/{}/edit", user_id)), "Internal error");
        }
    };

    // Get current is_active status
    let was_active: bool = match sqlx::query_scalar("SELECT is_active FROM users WHERE id = $1")
        .bind(user_id)
        .fetch_one(&mut *tx)
        .await {
            Ok(a) => a,
            Err(_) => true,
        };

    // Update user
    if let Err(e) = sqlx::query(
        "UPDATE users SET display_name = $2, is_active = $3, updated_at = now() WHERE id = $1"
    )
    .bind(user_id)
    .bind(blank(f.display_name))
    .bind(f.is_active)
    .execute(&mut *tx)
    .await {
        tracing::error!("Failed to update user: {}", e);
        return Flash::error(Redirect::to(format!("/admin/volunteers/{}/edit", user_id)), "Update failed");
    }

    // Update profile
    if let Err(e) = sqlx::query(
        "UPDATE volunteer_profiles SET
            volunteer_names = $2, bio = $3, joined_at = $4,
            has_police_check = $5, has_vulnerable_sector_check = $6, updated_at = now()
         WHERE user_id = $1"
    )
    .bind(user_id)
    .bind(f.volunteer_names)
    .bind(blank(f.bio))
    .bind(joined_at)
    .bind(f.has_police_check)
    .bind(f.has_vulnerable_sector_check)
    .execute(&mut *tx)
    .await {
        tracing::error!("Failed to update profile: {}", e);
        return Flash::error(Redirect::to(format!("/admin/volunteers/{}/edit", user_id)), "Update failed");
    }

    // Handle deactivation cascade
    if was_active && !f.is_active {
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

            let _ = EventLog::shift_cancelled(
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
        
        let _ = EventLog::profile_deactivated(&mut *tx, user_id, Some(admin.0.id)).await;
    } else if !was_active && f.is_active {
        let _ = EventLog::profile_reactivated(&mut *tx, user_id, Some(admin.0.id)).await;
    }

    // Log event if there were changes
    if !changed_fields.is_empty() {
        let _ = EventLog::profile_updated(&mut *tx, user_id, changed_fields, Some(admin.0.id)).await;
    }

    if let Err(e) = tx.commit().await {
        tracing::error!(error = %e, "Failed to commit user update");
        return Flash::error(Redirect::to(format!("/admin/volunteers/{}/edit", user_id)), "Failed to save update");
    }

    Flash::success(
        Redirect::to(format!("/admin/volunteers/{}", user_id)),
        "Volunteer updated successfully",
    )
}

#[post("/volunteers/<id>/toggle-active")]
async fn volunteer_toggle_active(
    id: &str,
    db: &Db,
    admin: AdminUser,
) -> Flash<Redirect> {
    let user_id = match id.parse::<Uuid>() {
        Ok(u) => u,
        Err(_) => return Flash::error(Redirect::to("/admin/volunteers"), "Invalid ID"),
    };

    let mut tx = match db.begin().await {
        Ok(tx) => tx,
        Err(e) => {
            tracing::error!(error = %e, "Failed to start transaction");
            return Flash::error(Redirect::to(format!("/admin/volunteers/{}", user_id)), "Internal error");
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
        None => return Flash::error(Redirect::to("/admin/volunteers"), "User not found"),
    };

    if let Err(e) = sqlx::query("UPDATE users SET is_active = $2, updated_at = now() WHERE id = $1")
        .bind(user_id)
        .bind(new_status)
        .execute(&mut *tx)
        .await
    {
        tracing::error!("Failed to toggle user status: {}", e);
        return Flash::error(Redirect::to(format!("/admin/volunteers/{}", user_id)), "Update failed");
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

            let _ = EventLog::shift_cancelled(
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
        
        let _ = EventLog::profile_deactivated(&mut *tx, user_id, Some(admin.0.id)).await;
    } else if !was_active && new_status {
        let _ = EventLog::profile_reactivated(&mut *tx, user_id, Some(admin.0.id)).await;
    }

    if let Err(e) = tx.commit().await {
        tracing::error!(error = %e, "Failed to commit user toggle");
        return Flash::error(Redirect::to(format!("/admin/volunteers/{}", user_id)), "Failed to save update");
    }

    let msg = if new_status { "Volunteer activated" } else { "Volunteer deactivated" };
    Flash::success(Redirect::to(format!("/admin/volunteers/{}", user_id)), msg)
}

// ─── Dog Management ──────────────────────────────────────────────────────────

#[post("/volunteers/<id>/dogs", data = "<form>")]
async fn volunteer_dog_create_post(
    id: &str,
    form: Form<DogForm<'_>>,
    db: &Db,
    admin: AdminUser,
) -> Flash<Redirect> {
    let user_id = match id.parse::<Uuid>() {
        Ok(u) => u,
        Err(_) => return Flash::error(Redirect::to("/admin/volunteers"), "Invalid ID"),
    };

    let f = form.into_inner();

    let breed_id = f.breed_id.parse::<Uuid>().ok();

    let size = match f.size {
        "x_small" => DogSize::XSmall,
        "small" => DogSize::Small,
        "medium" => DogSize::Medium,
        "large" => DogSize::Large,
        "x_large" => DogSize::XLarge,
        _ => DogSize::Medium,
    };

    let gender = match f.gender {
        "male" => Some(DogGender::Male),
        "female" => Some(DogGender::Female),
        _ => None,
    };

    let dob = f.date_of_birth.as_deref().filter(|s| !s.is_empty())
        .and_then(|s| NaiveDate::parse_from_str(s, "%Y-%m-%d").ok());

    let dog_id = match sqlx::query_scalar::<_, Uuid>(
        "INSERT INTO dogs (volunteer_id, name, breed_id, breed_freeform, size, gender, date_of_birth, personality_desc, is_primary)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id"
    )
    .bind(user_id)
    .bind(f.name)
    .bind(breed_id)
    .bind(blank(f.breed_freeform))
    .bind(size)
    .bind(gender)
    .bind(dob)
    .bind(blank(f.personality_desc))
    .bind(f.is_primary)

    .fetch_one(&**db)
    .await {
        Ok(id) => id,
        Err(e) => {
            tracing::error!("Failed to create dog: {}", e);
            return Flash::error(Redirect::to(format!("/admin/volunteers/{}", user_id)), "Failed to add dog");
        }
    };

    // Log event
    let _ = EventLog::dog_added(&**db, user_id, dog_id, f.name, Some(admin.0.id)).await;

    Flash::success(Redirect::to(format!("/admin/volunteers/{}", user_id)), "Dog added successfully")
}

#[post("/volunteers/<id>/dogs/<dog_id>", data = "<form>")]
async fn volunteer_dog_update_post(
    id: &str,
    dog_id: &str,
    form: Form<DogForm<'_>>,
    db: &Db,
    admin: AdminUser,
) -> Flash<Redirect> {
    let user_id = match id.parse::<Uuid>() {
        Ok(u) => u,
        Err(_) => return Flash::error(Redirect::to("/admin/volunteers"), "Invalid user ID"),
    };

    let dog_uuid = match dog_id.parse::<Uuid>() {
        Ok(u) => u,
        Err(_) => return Flash::error(Redirect::to(format!("/admin/volunteers/{}", user_id)), "Invalid dog ID"),
    };

    let f = form.into_inner();
    let breed_id = f.breed_id.parse::<Uuid>().ok();

    let size = match f.size {
        "x_small" => DogSize::XSmall,
        "small" => DogSize::Small,
        "medium" => DogSize::Medium,
        "large" => DogSize::Large,
        "x_large" => DogSize::XLarge,
        _ => DogSize::Medium,
    };

    let gender = match f.gender {
        "male" => Some(DogGender::Male),
        "female" => Some(DogGender::Female),
        _ => None,
    };

    let dob = f.date_of_birth.as_deref().filter(|s| !s.is_empty())
        .and_then(|s| NaiveDate::parse_from_str(s, "%Y-%m-%d").ok());

    // Get current dog info for change tracking
    let current: Option<(String, Option<Uuid>, Option<String>, String, Option<DogGender>, Option<NaiveDate>, bool)> = sqlx::query_as(
        "SELECT name, breed_id, breed_freeform, size::text, gender, date_of_birth, is_primary FROM dogs WHERE id = $1"
    )
    .bind(dog_uuid)
    .fetch_optional(&**db)
    .await
    .unwrap_or(None);

    let mut changed_fields = Vec::new();
    if let Some((name, breed, freeform, sz, cur_gender, cur_dob, primary)) = &current {
        if name != f.name { changed_fields.push("name".to_string()); }
        if breed != &breed_id { changed_fields.push("breed".to_string()); }
        
        let ff_current = freeform.as_deref().unwrap_or("");
        if ff_current != f.breed_freeform { changed_fields.push("breed_freeform".to_string()); }
        
        if sz != f.size { changed_fields.push("size".to_string()); }
        if cur_gender != &gender { changed_fields.push("gender".to_string()); }
        if cur_dob != &dob { changed_fields.push("date_of_birth".to_string()); }
        if primary != &f.is_primary { changed_fields.push("is_primary".to_string()); }
    }

    if let Err(e) = sqlx::query(
        "UPDATE dogs SET 
            name = $2, breed_id = $3, breed_freeform = $4, size = $5, 
            gender = $6, date_of_birth = $7, personality_desc = $8, is_primary = $9, updated_at = now()
         WHERE id = $1 AND volunteer_id = $10"
    )
    .bind(dog_uuid)
    .bind(f.name)
    .bind(breed_id)
    .bind(blank(f.breed_freeform))
    .bind(size)
    .bind(gender)
    .bind(dob)
    .bind(blank(f.personality_desc))
    .bind(f.is_primary)
    .bind(user_id)
    .execute(&**db)
    .await {
        tracing::error!("Failed to update dog: {}", e);
        return Flash::error(Redirect::to(format!("/admin/volunteers/{}", user_id)), "Failed to update dog");
    }

    // Log event if there were changes
    if !changed_fields.is_empty() {
        let _ = EventLog::dog_updated(&**db, user_id, dog_uuid, f.name, changed_fields, Some(admin.0.id)).await;
    }

    Flash::success(Redirect::to(format!("/admin/volunteers/{}", user_id)), "Dog updated successfully")
}

#[post("/volunteers/<id>/dogs/<dog_id>/toggle-active")]
async fn volunteer_dog_toggle_active(
    id: &str,
    dog_id: &str,
    db: &Db,
    admin: AdminUser,
) -> Flash<Redirect> {
    let user_id = match id.parse::<Uuid>() {
        Ok(u) => u,
        Err(_) => return Flash::error(Redirect::to("/admin/volunteers"), "Invalid user ID"),
    };

    let dog_uuid = match dog_id.parse::<Uuid>() {
        Ok(u) => u,
        Err(_) => return Flash::error(Redirect::to(format!("/admin/volunteers/{}", user_id)), "Invalid dog ID"),
    };

    // Get current status and name
    let current: Option<(bool, String)> = sqlx::query_as("SELECT is_active, name FROM dogs WHERE id = $1 AND volunteer_id = $2")
        .bind(dog_uuid)
        .bind(user_id)
        .fetch_optional(&**db)
        .await
        .unwrap_or(None);

    let (new_status, dog_name) = match current {
        Some((is_active, name)) => (!is_active, name),
        None => return Flash::error(Redirect::to(format!("/admin/volunteers/{}", user_id)), "Dog not found"),
    };

    if let Err(e) = sqlx::query("UPDATE dogs SET is_active = $2, updated_at = now() WHERE id = $1")
        .bind(dog_uuid)
        .bind(new_status)
        .execute(&**db)
        .await
    {
        tracing::error!("Failed to toggle dog status: {}", e);
        return Flash::error(Redirect::to(format!("/admin/volunteers/{}", user_id)), "Update failed");
    }

    // Log event
    if new_status {
        if let Err(e) = EventLog::dog_reactivated(&**db, user_id, dog_uuid, &dog_name, Some(admin.0.id)).await {
            tracing::error!("Failed to log dog reactivated event: {}", e);
        }
    } else {
        if let Err(e) = EventLog::dog_deactivated(&**db, user_id, dog_uuid, &dog_name, Some(admin.0.id)).await {
            tracing::error!("Failed to log dog deactivated event: {}", e);
        }
    }

    let msg = if new_status { "Dog activated" } else { "Dog deactivated" };
    Flash::success(Redirect::to(format!("/admin/volunteers/{}", user_id)), msg)
}

#[derive(rocket::form::FromForm)]
struct DogRetireForm<'r> {
    reason: &'r str,
    #[field(default = "")]
    note: &'r str,
}

#[post("/volunteers/<id>/dogs/<dog_id>/retire", data = "<form>")]
async fn volunteer_dog_retire_post(
    id: &str,
    dog_id: &str,
    form: Form<DogRetireForm<'_>>,
    db: &Db,
    admin: AdminUser,
) -> Flash<Redirect> {
    let user_id = match id.parse::<Uuid>() {
        Ok(u) => u,
        Err(_) => return Flash::error(Redirect::to("/admin/volunteers"), "Invalid user ID"),
    };

    let dog_uuid = match dog_id.parse::<Uuid>() {
        Ok(u) => u,
        Err(_) => return Flash::error(Redirect::to(format!("/admin/volunteers/{}", user_id)), "Invalid dog ID"),
    };

    let f = form.into_inner();
    let note = if f.note.is_empty() { None } else { Some(f.note) };

    // Get current status and name
    let current: Option<(String, bool)> = sqlx::query_as("SELECT name, is_primary FROM dogs WHERE id = $1 AND volunteer_id = $2")
        .bind(dog_uuid)
        .bind(user_id)
        .fetch_optional(&**db)
        .await
        .unwrap_or(None);

    let (dog_name, _was_primary) = match current {
        Some(c) => c,
        None => return Flash::error(Redirect::to(format!("/admin/volunteers/{}", user_id)), "Dog not found"),
    };

    // Set as inactive and NOT primary
    if let Err(e) = sqlx::query("UPDATE dogs SET is_active = false, is_primary = false, updated_at = now() WHERE id = $1")
        .bind(dog_uuid)
        .execute(&**db)
        .await
    {
        tracing::error!("Failed to retire dog: {}", e);
        return Flash::error(Redirect::to(format!("/admin/volunteers/{}", user_id)), "Update failed");
    }

    // --- Handle Upcoming Assignments ---
    
    // 1. Find all future assignments for this dog
    let affected_assignments: Vec<(Uuid, Uuid, String, String, DateTime<Utc>)> = sqlx::query_as(
        r#"
        SELECT sa.id, s.id as shift_id, s.title, a.name as agency_name, s.start_at
        FROM shift_assignments sa
        JOIN shifts s ON s.id = sa.shift_id
        JOIN agencies a ON a.id = s.agency_id
        WHERE $1 = ANY(sa.dog_ids)
          AND s.start_at > now()
          AND sa.status IN ('confirmed', 'waitlisted', 'pending_confirmation')
        "#
    )
    .bind(dog_uuid)
    .fetch_all(&**db)
    .await
    .unwrap_or_default();

    for (assignment_id, shift_id, shift_title, agency_name, shift_start) in affected_assignments {
        // 2. Mark assignment as cancelled
        let _ = sqlx::query(
            r#"
            UPDATE shift_assignments 
            SET status = 'cancelled', 
                updated_at = now(),
                cancelled_at = now(),
                cancellation_reason = 'Dog retired',
                cancellation_note = $2
            WHERE id = $1
            "#,
        )
        .bind(assignment_id)
        .bind(format!("Automatically cancelled because {} was retired. Reason: {}. Note: {}", dog_name, f.reason, f.note))
        .execute(&**db)
        .await;

        // 3. Create vacancy record for admin to fill
        let _ = sqlx::query(
            r#"
            INSERT INTO shift_vacancies (
                shift_id, source_assignment_id, cancelled_by_volunteer_id,
                cancellation_reason, cancellation_note, status
            ) VALUES ($1, $2, $3, 'Dog retired', $4, 'open')
            "#,
        )
        .bind(shift_id)
        .bind(assignment_id)
        .bind(user_id)
        .bind(format!("Dog {} retired ({}). {}", dog_name, f.reason, f.note))
        .execute(&**db)
        .await;

        // 4. Create admin alert for vacancy
        let _ = sqlx::query(
            r#"
            INSERT INTO admin_alerts (alert_type, shift_id, source_assignment_id)
            VALUES ('waitlist_promote', $1, $2)
            "#,
        )
        .bind(shift_id)
        .bind(assignment_id)
        .execute(&**db)
        .await;

        // 5. Log event
        let _ = EventLog::shift_cancelled(
            &**db, 
            user_id, 
            shift_id, 
            Some(dog_uuid),
            &shift_title, 
            &agency_name, 
            "Admin (Dog Retired)", 
            Some(&dog_name),
            "Dog retired"
        ).await;

        // 6. Notify all admins (except current if admin)
        let notification_title = format!("Spot vacant: {} retired", dog_name);
        let notification_body = format!(
            "Dog {} was retired ({}), leaving a vacancy in '{}' on {}. Note: {}",
            dog_name,
            f.reason,
            shift_title,
            shift_start.format("%b %-d"),
            f.note
        );

        let admin_ids: Vec<(Uuid,)> = sqlx::query_as("SELECT id FROM users WHERE role = 'admin'").fetch_all(&**db).await.unwrap_or_default();
        for (aid,) in admin_ids {
            let _ = sqlx::query(
                "INSERT INTO notifications (user_id, type, title, body, payload) VALUES ($1, 'booking_cancelled', $2, $3, $4)"
            )
            .bind(aid)
            .bind(&notification_title)
            .bind(&notification_body)
            .bind(serde_json::json!({ "shift_id": shift_id, "vacancy_id": assignment_id }))
            .execute(&**db)
            .await;
        }
    }

    // Log retired event
    if let Err(e) = EventLog::dog_retired(&**db, user_id, dog_uuid, &dog_name, f.reason, note, Some(admin.0.id)).await {
        tracing::error!("Failed to log dog retired event: {}", e);
    }

    Flash::success(Redirect::to(format!("/admin/volunteers/{}", user_id)), "Dog retired with honors")
}

// ─── Dog Photo Upload / Remove (Admin) ───────────────────────────────────────

#[derive(rocket::form::FromForm)]
struct AdminDogPhotoForm<'r> {
    file: rocket::fs::TempFile<'r>,
    crop_x: i32,
    crop_y: i32,
    crop_radius: i32,
}

#[post("/volunteers/<id>/dogs/<dog_id>/photo", data = "<form>")]
async fn volunteer_dog_photo_upload(
    id: &str,
    dog_id: &str,
    form: rocket::form::Form<AdminDogPhotoForm<'_>>,
    db: &Db,
    admin: AdminUser,
    storage: &rocket::State<StorageBackend>,
) -> Result<Redirect, Flash<Redirect>> {
    let user_id = match id.parse::<Uuid>() {
        Ok(u) => u,
        Err(_) => return Err(Flash::error(Redirect::to("/admin/volunteers"), "Invalid ID")),
    };
    let dog_uuid = match dog_id.parse::<Uuid>() {
        Ok(u) => u,
        Err(_) => return Err(Flash::error(Redirect::to(format!("/admin/volunteers/{}", user_id)), "Invalid dog ID")),
    };
    let f = form.into_inner();

    // Verify this dog belongs to this volunteer
    let exists: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM dogs WHERE id = $1 AND volunteer_id = $2)"
    )
    .bind(dog_uuid)
    .bind(user_id)
    .fetch_one(&**db)
    .await
    .unwrap_or(false);

    if !exists {
        return Err(Flash::error(Redirect::to(format!("/admin/volunteers/{}", user_id)), "Dog not found"));
    }

    // Remove old photo if exists
    let old_asset: Option<(Uuid, String, Option<String>)> = sqlx::query_as(
        "SELECT a.id, a.storage_key, a.thumb_key FROM assets a JOIN dogs d ON d.photo_asset_id = a.id WHERE d.id = $1"
    )
    .bind(dog_uuid)
    .fetch_optional(&**db)
    .await
    .unwrap_or(None);

    if let Some((old_id, old_key, old_thumb)) = old_asset {
        let _ = storage.delete(&old_key).await;
        if let Some(tk) = &old_thumb {
            let _ = storage.delete(tk).await;
        }
        let _ = sqlx::query("DELETE FROM assets WHERE id = $1").bind(old_id).execute(&**db).await;
    }

    let result = handle_upload(
        f.file,
        None,
        admin.0.id,
        AssetVisibility::Curated,
        storage.inner(),
        db,
    ).await;

    match result {
        Ok(upload) => {
            sqlx::query(r#"
                UPDATE dogs 
                SET photo_asset_id = $1,
                    photo_crop_x = $2,
                    photo_crop_y = $3,
                    photo_crop_radius = $4,
                    updated_at = now() 
                WHERE id = $5
            "#)
                .bind(upload.asset.id)
                .bind(f.crop_x)
                .bind(f.crop_y)
                .bind(f.crop_radius)
                .bind(dog_uuid)
                .execute(&**db)
                .await
                .ok();

            Ok(Redirect::to(format!("/admin/volunteers/{}", user_id)))
        }
        Err(e) => {
            tracing::error!(error = %e, "Admin dog photo upload failed");
            Err(Flash::error(Redirect::to(format!("/admin/volunteers/{}", user_id)), format!("Upload failed: {e}")))
        }
    }
}

#[post("/volunteers/<id>/dogs/<dog_id>/photo/remove")]
async fn volunteer_dog_photo_remove(
    id: &str,
    dog_id: &str,
    db: &Db,
    _admin: AdminUser,
    storage: &rocket::State<StorageBackend>,
) -> Result<Redirect, Flash<Redirect>> {
    let user_id = match id.parse::<Uuid>() {
        Ok(u) => u,
        Err(_) => return Err(Flash::error(Redirect::to("/admin/volunteers"), "Invalid ID")),
    };
    let dog_uuid = match dog_id.parse::<Uuid>() {
        Ok(u) => u,
        Err(_) => return Err(Flash::error(Redirect::to(format!("/admin/volunteers/{}", user_id)), "Invalid dog ID")),
    };

    let asset_info: Option<(Uuid, String, Option<String>)> = sqlx::query_as(
        r#"SELECT a.id, a.storage_key, a.thumb_key
           FROM assets a JOIN dogs d ON d.photo_asset_id = a.id
           WHERE d.id = $1 AND d.volunteer_id = $2"#
    )
    .bind(dog_uuid)
    .bind(user_id)
    .fetch_optional(&**db)
    .await
    .unwrap_or(None);

    if let Some((asset_id, storage_key, thumb_key)) = asset_info {
        sqlx::query(r#"UPDATE dogs 
            SET photo_asset_id = NULL,
                photo_crop_x = NULL,
                photo_crop_y = NULL,
                photo_crop_radius = NULL,
                updated_at = now() 
            WHERE id = $1"#)
            .bind(dog_uuid)
            .execute(&**db)
            .await
            .ok();

        let _ = storage.delete(&storage_key).await;
        if let Some(tk) = &thumb_key {
            let _ = storage.delete(tk).await;
        }
        let _ = sqlx::query("DELETE FROM assets WHERE id = $1").bind(asset_id).execute(&**db).await;
    }

    Ok(Redirect::to(format!("/admin/volunteers/{}", user_id)))
}

// ─── Volunteer Profile Photo Upload / Remove ─────────────────────────────────

#[derive(rocket::form::FromForm)]
pub struct AdminVolunteerPhotoForm<'r> {
    pub file: TempFile<'r>,
    pub crop_x: i32,
    pub crop_y: i32,
    pub crop_radius: i32,
}

#[post("/volunteers/<id>/photo", data = "<form>")]
async fn volunteer_photo_upload(
    id: &str,
    form: rocket::form::Form<AdminVolunteerPhotoForm<'_>>,
    db: &Db,
    _admin: AdminUser,
    storage: &rocket::State<StorageBackend>,
) -> Result<Redirect, Flash<Redirect>> {
    let user_id = match id.parse::<Uuid>() {
        Ok(u) => u,
        Err(_) => return Err(Flash::error(Redirect::to("/admin/volunteers"), "Invalid ID")),
    };
    let f = form.into_inner();

    // Remove old profile photo asset if exists
    let old_asset: Option<(Uuid, String, Option<String>)> = sqlx::query_as(
        "SELECT a.id, a.storage_key, a.thumb_key FROM assets a JOIN volunteer_profiles vp ON vp.profile_pic_asset_id = a.id WHERE vp.user_id = $1"
    )
    .bind(user_id)
    .fetch_optional(&**db)
    .await
    .unwrap_or(None);

    if let Some((old_id, old_key, old_thumb)) = old_asset {
        let _ = storage.delete(&old_key).await;
        if let Some(tk) = &old_thumb {
            let _ = storage.delete(tk).await;
        }
        let _ = sqlx::query("DELETE FROM assets WHERE id = $1").bind(old_id).execute(&**db).await;
    }

    // Upload new photo
    let result = handle_upload(
        f.file,
        None,
        user_id,
        AssetVisibility::Curated,
        storage.inner(),
        db,
    ).await;

    match result {
        Ok(upload) => {
            sqlx::query(r#"
                UPDATE volunteer_profiles 
                SET profile_pic_asset_id = $1,
                    profile_pic_crop_x = $2,
                    profile_pic_crop_y = $3,
                    profile_pic_crop_radius = $4,
                    updated_at = now() 
                WHERE user_id = $5
            "#)
                .bind(upload.asset.id)
                .bind(f.crop_x)
                .bind(f.crop_y)
                .bind(f.crop_radius)
                .bind(user_id)
                .execute(&**db)
                .await
                .ok();

            Ok(Redirect::to(format!("/admin/volunteers/{}", user_id)))
        }
        Err(e) => {
            tracing::error!(error = %e, "Admin volunteer photo upload failed");
            Err(Flash::error(Redirect::to(format!("/admin/volunteers/{}", user_id)), format!("Upload failed: {e}")))
        }
    }
}

#[post("/volunteers/<id>/photo/remove")]
async fn volunteer_photo_remove(
    id: &str,
    db: &Db,
    _admin: AdminUser,
    storage: &rocket::State<StorageBackend>,
) -> Result<Redirect, Flash<Redirect>> {
    let user_id = match id.parse::<Uuid>() {
        Ok(u) => u,
        Err(_) => return Err(Flash::error(Redirect::to("/admin/volunteers"), "Invalid ID")),
    };

    let asset_info: Option<(Uuid, String, Option<String>)> = sqlx::query_as(
        r#"SELECT a.id, a.storage_key, a.thumb_key
           FROM assets a JOIN volunteer_profiles vp ON vp.profile_pic_asset_id = a.id
           WHERE vp.user_id = $1"#
    )
    .bind(user_id)
    .fetch_optional(&**db)
    .await
    .unwrap_or(None);

    if let Some((asset_id, storage_key, thumb_key)) = asset_info {
        sqlx::query(r#"UPDATE volunteer_profiles 
            SET profile_pic_asset_id = NULL,
                profile_pic_crop_x = NULL,
                profile_pic_crop_y = NULL,
                profile_pic_crop_radius = NULL,
                updated_at = now() 
            WHERE user_id = $1"#)
            .bind(user_id)
            .execute(&**db)
            .await
            .ok();

        let _ = storage.delete(&storage_key).await;
        if let Some(tk) = &thumb_key {
            let _ = storage.delete(tk).await;
        }
        let _ = sqlx::query("DELETE FROM assets WHERE id = $1").bind(asset_id).execute(&**db).await;
    }

    Ok(Redirect::to(format!("/admin/volunteers/{}", user_id)))
}

// ─── Contact Volunteer ───────────────────────────────────────────────────────

#[post("/volunteers/<id>/contact", data = "<form>")]
async fn volunteer_contact_post(
    id: &str,
    form: Form<ContactFormVolunteer<'_>>,
    db: &Db,
    admin: AdminUser,
) -> Flash<Redirect> {
    let user_id = match id.parse::<Uuid>() {
        Ok(u) => u,
        Err(_) => return Flash::error(Redirect::to("/admin/volunteers"), "Invalid ID"),
    };

    let f = form.into_inner();

    // Log the contact event
    let _ = EventLog::contacted_by_admin(&**db, user_id, f.method, f.subject, admin.0.id).await;

    // TODO: Actually send the email/message here
    // For now, just log the event

    Flash::success(
        Redirect::to(format!("/admin/volunteers/{}", user_id)),
        format!("Message logged ({}). Email sending to be implemented.", f.method),
    )
}

// ─── Event Log Partial (for HTMX) ────────────────────────────────────────────

#[get("/volunteers/<id>/events?<event_type>&<page>")]
async fn volunteer_event_partial(
    id: &str,
    event_type: Option<&str>,
    page: Option<u32>,
    db: &Db,
    _admin: AdminUser,
    user: AuthUser,
) -> AppResult<Template> {
    let user_id = id.parse::<Uuid>().map_err(|_| AppError::NotFound)?;
    let page = page.unwrap_or(0) as i64;
    let offset = page * 20;

    let mut where_clauses = vec!["ve.user_id = $1".to_string()];
    
    if event_type.is_some() && event_type != Some("all") {
        where_clauses.push("ve.event_type = $3".to_string());
    }

    let where_sql = where_clauses.join(" AND ");

    let sql = format!(
        r#"
        SELECT 
            ve.id, ve.event_type::text, ve.metadata, ve.created_at,
            ve.shift_id, ve.dog_id,
            COALESCE(u.display_name, u.email) AS created_by_name,
            s.title AS shift_title, s.start_at AS shift_start_at,
            a.name AS agency_name,
            si.name AS site_name,
            d.name AS dog_name,
            vu.volunteer_names AS from_volunteer_name
        FROM volunteer_events ve
        LEFT JOIN users u ON u.id = ve.created_by
        LEFT JOIN shifts s ON s.id = ve.shift_id
        LEFT JOIN agencies a ON a.id = s.agency_id
        LEFT JOIN sites si ON si.id = s.site_id
        LEFT JOIN dogs d ON d.id = ve.dog_id
        LEFT JOIN volunteer_profiles vu ON vu.user_id = ve.related_user_id
        WHERE {}
        ORDER BY ve.created_at DESC
        LIMIT 20 OFFSET {}
        "#,
        where_sql, offset
    );

    let events: Vec<VolunteerEventDetail> = if event_type.is_some() && event_type != Some("all") {
        sqlx::query_as(&sql)
            .bind(user_id)
            .bind(event_type)
            .fetch_all(&**db)
            .await
    } else {
        sqlx::query_as(&sql)
            .bind(user_id)
            .fetch_all(&**db)
            .await
    }
    .unwrap_or_default();

    Ok(Template::render(
        "admin/partials/event_log",
        context! { user: &user.0, events, page },
    ))
}

#[get("/surveys/volunteers")]
async fn surveys_volunteer(
    db: &Db,
    _admin: AdminUser,
    user: AuthUser,
    flash: Option<FlashMessage<'_>>,
) -> AppResult<Template> {
    let surveys: Vec<VolunteerSurveyRow> = sqlx::query_as(
        r#"
        SELECT
            vs.id, vs.shift_id, s.title as shift_title, s.start_at as shift_start_at,
            vs.volunteer_id, vp.volunteer_names,
            (
                SELECT d.name
                FROM dogs d
                WHERE d.volunteer_id = vs.volunteer_id AND d.is_primary = true
                LIMIT 1
            ) as dog_names,
            vs.notes, vs.rating, vs.submitted_at
        FROM volunteer_surveys vs
        JOIN shifts s ON s.id = vs.shift_id
        JOIN volunteer_profiles vp ON vp.user_id = vs.volunteer_id
        WHERE vs.reviewed_at IS NULL
        ORDER BY vs.submitted_at DESC
        "#,
    )
    .fetch_all(&**db)
    .await?;

    Ok(Template::render(
        "admin/surveys_volunteer",
        context! {
            user: &user.0,
            flash: take_flash(flash),
            surveys,
        },
    ))
}

#[get("/surveys/agencies")]
async fn surveys_agency(
    db: &Db,
    _admin: AdminUser,
    user: AuthUser,
    flash: Option<FlashMessage<'_>>,
) -> AppResult<Template> {
    let surveys: Vec<AgencySurveyRow> = sqlx::query_as(
        r#"
        SELECT
            ags.id, ags.shift_id, s.title as shift_title, s.start_at as shift_start_at,
            a.name as agency_name, c.name as contact_name, c.user_id as contact_user_id,
            ags.notes, ags.rating, ags.submitted_at
        FROM agency_surveys ags
        JOIN shifts s ON s.id = ags.shift_id
        JOIN agencies a ON a.id = s.agency_id
        JOIN contacts c ON c.id = ags.contact_id
        WHERE ags.reviewed_at IS NULL
        ORDER BY ags.submitted_at DESC
        "#,
    )
    .fetch_all(&**db)
    .await?;

    Ok(Template::render(
        "admin/surveys_agency",
        context! {
            user: &user.0,
            flash: take_flash(flash),
            surveys,
        },
    ))
}

#[post("/surveys/volunteers/<id>/review")]
async fn volunteer_survey_review_post(
    id: &str,
    db: &Db,
    admin: AdminUser,
) -> Flash<Redirect> {
    let survey_id = match id.parse::<Uuid>() {
        Ok(u) => u,
        Err(_) => return Flash::error(Redirect::to("/admin/surveys/volunteers"), "Invalid ID"),
    };

    match sqlx::query("UPDATE volunteer_surveys SET reviewed_at = now(), reviewed_by = $1 WHERE id = $2")
        .bind(admin.0.id)
        .bind(survey_id)
        .execute(&**db)
        .await
    {
        Ok(_) => Flash::success(Redirect::to("/admin/surveys/volunteers"), "Report marked as viewed"),
        Err(_) => Flash::error(Redirect::to("/admin/surveys/volunteers"), "Failed to update report"),
    }
}

#[post("/surveys/agencies/<id>/review")]
async fn agency_survey_review_post(
    id: &str,
    db: &Db,
    admin: AdminUser,
) -> Flash<Redirect> {
    let survey_id = match id.parse::<Uuid>() {
        Ok(u) => u,
        Err(_) => return Flash::error(Redirect::to("/admin/surveys/agencies"), "Invalid ID"),
    };

    match sqlx::query("UPDATE agency_surveys SET reviewed_at = now(), reviewed_by = $1 WHERE id = $2")
        .bind(admin.0.id)
        .bind(survey_id)
        .execute(&**db)
        .await
    {
        Ok(_) => Flash::success(Redirect::to("/admin/surveys/agencies"), "Report marked as viewed"),
        Err(_) => Flash::error(Redirect::to("/admin/surveys/agencies"), "Failed to update report"),
    }
}

/// POST /admin/surveys/volunteers/<id>/review-inline — HTMX inline version
#[post("/surveys/volunteers/<id>/review-inline")]
async fn volunteer_survey_review_inline_post(
    id: &str,
    db: &Db,
    admin: AdminUser,
) -> rocket::response::content::RawHtml<String> {
    let Ok(survey_id) = id.parse::<Uuid>() else {
        return rocket::response::content::RawHtml(
            r#"<span class="text-[11px] text-red-500">Invalid ID</span>"#.to_string(),
        );
    };
    let result = sqlx::query(
        "UPDATE volunteer_surveys SET reviewed_at = now(), reviewed_by = $1 WHERE id = $2",
    )
    .bind(admin.0.id)
    .bind(survey_id)
    .execute(&**db)
    .await;

    let toast = match &result {
        Ok(_) => r#"<div id="toast-container" hx-swap-oob="true"><div x-data="{show:true}" x-init="setTimeout(()=>show=false,3000)" x-show="show" x-transition.opacity class="fixed bottom-6 right-6 bg-gray-900 text-white text-sm font-medium px-4 py-2.5 rounded-xl shadow-lg z-50">✓ Report marked as reviewed</div></div>"#,
        Err(_) => r#"<div id="toast-container" hx-swap-oob="true"><div x-data="{show:true}" x-init="setTimeout(()=>show=false,3000)" x-show="show" x-transition.opacity class="fixed bottom-6 right-6 bg-red-600 text-white text-sm font-medium px-4 py-2.5 rounded-xl shadow-lg z-50">Failed to update report</div></div>"#,
    };

    let badge = match &result {
        Ok(_) => r#"<span class="text-[11px] text-green-600 font-medium">✓ Reviewed</span>"#,
        Err(_) => r#"<span class="text-[11px] text-red-500">Error — try again</span>"#,
    };

    rocket::response::content::RawHtml(format!("{badge}{toast}"))
}

/// POST /admin/surveys/agencies/<id>/review-inline — HTMX inline version
#[post("/surveys/agencies/<id>/review-inline")]
async fn agency_survey_review_inline_post(
    id: &str,
    db: &Db,
    admin: AdminUser,
) -> rocket::response::content::RawHtml<String> {
    let Ok(survey_id) = id.parse::<Uuid>() else {
        return rocket::response::content::RawHtml(
            r#"<span class="text-[11px] text-red-500">Invalid ID</span>"#.to_string(),
        );
    };
    let result = sqlx::query(
        "UPDATE agency_surveys SET reviewed_at = now(), reviewed_by = $1 WHERE id = $2",
    )
    .bind(admin.0.id)
    .bind(survey_id)
    .execute(&**db)
    .await;

    let toast = match &result {
        Ok(_) => r#"<div id="toast-container" hx-swap-oob="true"><div x-data="{show:true}" x-init="setTimeout(()=>show=false,3000)" x-show="show" x-transition.opacity class="fixed bottom-6 right-6 bg-gray-900 text-white text-sm font-medium px-4 py-2.5 rounded-xl shadow-lg z-50">✓ Agency report marked as reviewed</div></div>"#,
        Err(_) => r#"<div id="toast-container" hx-swap-oob="true"><div x-data="{show:true}" x-init="setTimeout(()=>show=false,3000)" x-show="show" x-transition.opacity class="fixed bottom-6 right-6 bg-red-600 text-white text-sm font-medium px-4 py-2.5 rounded-xl shadow-lg z-50">Failed to update report</div></div>"#,
    };

    let badge = match &result {
        Ok(_) => r#"<span class="text-[11px] text-green-600 font-medium">✓ Reviewed</span>"#,
        Err(_) => r#"<span class="text-[11px] text-red-500">Error — try again</span>"#,
    };

    rocket::response::content::RawHtml(format!("{badge}{toast}"))
}

// ─── Shift Feedback Summary ───────────────────────────────────────────────────

#[derive(Debug, Serialize, FromRow)]
struct FeedbackVolunteerSurvey {
    id: Uuid,
    volunteer_id: Uuid,
    volunteer_names: String,
    dog_name: Option<String>,
    rating: Option<i16>,
    notes: Option<String>,
    submitted_at: DateTime<Utc>,
    reviewed_at: Option<DateTime<Utc>>,
    photo_asset_ids: Vec<Uuid>,
}

#[derive(Debug, Serialize, FromRow)]
struct FeedbackAgencySurvey {
    id: Uuid,
    contact_name: String,
    rating: Option<i16>,
    notes: Option<String>,
    actual_clients_served: Option<i32>,
    submitted_at: DateTime<Utc>,
    reviewed_at: Option<DateTime<Utc>>,
    photo_asset_ids: Vec<Uuid>,
}

#[derive(Debug, Serialize, FromRow)]
struct PendingFeedbackVolunteer {
    user_id: Uuid,
    volunteer_names: String,
    dog_name: Option<String>,
}

#[derive(Debug, Serialize, FromRow)]
struct FeedbackShiftInfo {
    id: Uuid,
    title: String,
    start_at: DateTime<Utc>,
    end_at: DateTime<Utc>,
    agency_name: String,
    site_name: String,
    slots_requested: i32,
}

/// GET /admin/shifts/<id>/feedback
#[get("/shifts/<id>/feedback")]
async fn shift_feedback_get(
    id: &str,
    db: &Db,
    admin: AdminUser,
    user: AuthUser,
) -> AppResult<Template> {
    let shift_id = id.parse::<Uuid>().map_err(|_| AppError::NotFound)?;

    let shift: FeedbackShiftInfo = sqlx::query_as(
        r#"
        SELECT s.id, s.title, s.start_at, s.end_at, a.name AS agency_name, si.name AS site_name, s.slots_requested
        FROM shifts s
        JOIN agencies a ON a.id = s.agency_id
        JOIN sites si ON si.id = s.site_id
        WHERE s.id = $1
        "#,
    )
    .bind(shift_id)
    .fetch_optional(&**db)
    .await?
    .ok_or(AppError::NotFound)?;

    let volunteer_surveys: Vec<FeedbackVolunteerSurvey> = sqlx::query_as(
        r#"
        SELECT
            vs.id, vs.volunteer_id,
            vp.volunteer_names,
            d.name AS dog_name,
            vs.rating, vs.notes, vs.submitted_at, vs.reviewed_at,
            COALESCE(vs.photo_asset_ids, '{}') AS photo_asset_ids
        FROM volunteer_surveys vs
        JOIN volunteer_profiles vp ON vp.user_id = vs.volunteer_id
        LEFT JOIN dogs d ON d.volunteer_id = vs.volunteer_id AND d.is_primary = true
        WHERE vs.shift_id = $1
        ORDER BY vs.submitted_at ASC
        "#,
    )
    .bind(shift_id)
    .fetch_all(&**db)
    .await?;

    let agency_survey: Option<FeedbackAgencySurvey> = sqlx::query_as(
        r#"
        SELECT
            ags.id, c.name AS contact_name,
            ags.rating, ags.notes, ags.actual_clients_served,
            ags.submitted_at, ags.reviewed_at,
            COALESCE(ags.photo_asset_ids, '{}') AS photo_asset_ids
        FROM agency_surveys ags
        JOIN contacts c ON c.id = ags.contact_id
        WHERE ags.shift_id = $1
        LIMIT 1
        "#,
    )
    .bind(shift_id)
    .fetch_optional(&**db)
    .await?;

    // Confirmed volunteers who haven't submitted a survey
    let pending_volunteers: Vec<PendingFeedbackVolunteer> = sqlx::query_as(
        r#"
        SELECT sa.volunteer_id AS user_id, vp.volunteer_names, d.name AS dog_name
        FROM shift_assignments sa
        JOIN volunteer_profiles vp ON vp.user_id = sa.volunteer_id
        LEFT JOIN dogs d ON d.volunteer_id = sa.volunteer_id AND d.is_primary = true
        WHERE sa.shift_id = $1
          AND sa.status = 'confirmed'
          AND NOT EXISTS (
              SELECT 1 FROM volunteer_surveys vs
              WHERE vs.shift_id = $1 AND vs.volunteer_id = sa.volunteer_id
          )
        ORDER BY vp.volunteer_names
        "#,
    )
    .bind(shift_id)
    .fetch_all(&**db)
    .await?;

    let has_agency_contact: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM shifts WHERE id = $1 AND contact_id IS NOT NULL)"
    )
    .bind(shift_id)
    .fetch_one(&**db)
    .await?;

    // Pre-compute average volunteer rating so templates avoid arithmetic
    let avg_volunteer_rating: Option<f64> = {
        let ratings: Vec<f64> = volunteer_surveys.iter()
            .filter_map(|s| s.rating.map(|r| r as f64))
            .collect();
        if ratings.is_empty() {
            None
        } else {
            let sum: f64 = ratings.iter().sum();
            Some((sum / ratings.len() as f64 * 10.0).round() / 10.0)
        }
    };

    Ok(Template::render(
        "admin/shift_feedback",
        context! {
            user: &user.0,
            shift,
            volunteer_surveys,
            agency_survey,
            pending_volunteers,
            has_agency_contact,
            avg_volunteer_rating,
        },
    ))
}

// ─── Feedback Collection ──────────────────────────────────────────────────────

#[derive(Debug, Serialize, FromRow)]
struct FeedbackCollectionRow {
    shift_id: Uuid,
    shift_title: String,
    shift_start_at: DateTime<Utc>,
    shift_end_at: DateTime<Utc>,
    agency_name: String,
    site_name: String,
    confirmed_count: i64,
    volunteer_survey_count: i64,
    has_agency_survey: bool,
}

/// GET /admin/feedback
#[get("/feedback")]
async fn feedback_collection_get(
    db: &Db,
    _admin: AdminUser,
    user: AuthUser,
    flash: Option<FlashMessage<'_>>,
) -> AppResult<Template> {
    let pending: Vec<FeedbackCollectionRow> = sqlx::query_as(
        r#"
        SELECT
            s.id AS shift_id,
            s.title AS shift_title,
            s.start_at AS shift_start_at,
            s.end_at AS shift_end_at,
            a.name AS agency_name,
            si.name AS site_name,
            COALESCE(ca.confirmed_count, 0) AS confirmed_count,
            COALESCE(vs_c.survey_count, 0)  AS volunteer_survey_count,
            EXISTS (SELECT 1 FROM agency_surveys ags WHERE ags.shift_id = s.id) AS has_agency_survey
        FROM shifts s
        JOIN agencies a ON a.id = s.agency_id
        JOIN sites si ON si.id = s.site_id
        LEFT JOIN (
            SELECT shift_id, COUNT(*) AS confirmed_count
            FROM shift_assignments WHERE status = 'confirmed' GROUP BY shift_id
        ) ca ON ca.shift_id = s.id
        LEFT JOIN (
            SELECT shift_id, COUNT(*) AS survey_count
            FROM volunteer_surveys GROUP BY shift_id
        ) vs_c ON vs_c.shift_id = s.id
        WHERE s.end_at < now()
          AND s.feedback_dismissed_at IS NULL
          AND (
              COALESCE(ca.confirmed_count, 0) > COALESCE(vs_c.survey_count, 0)
              OR NOT EXISTS (SELECT 1 FROM agency_surveys ags2 WHERE ags2.shift_id = s.id)
          )
        ORDER BY s.end_at DESC
        LIMIT 100
        "#,
    )
    .fetch_all(&**db)
    .await?;

    Ok(Template::render(
        "admin/feedback_collection",
        context! {
            user: &user.0,
            pending,
            flash: take_flash(flash),
        },
    ))
}

#[derive(rocket::form::FromForm)]
struct FeedbackBulkForm {
    shift_ids: Vec<String>,
    action: String,
}

/// POST /admin/feedback/action
#[post("/feedback/action", data = "<form>")]
async fn feedback_action_post(
    form: Form<FeedbackBulkForm>,
    db: &Db,
    admin: AdminUser,
) -> AppResult<Flash<Redirect>> {
    let f = form.into_inner();
    let redirect = Redirect::to("/admin/feedback");

    let shift_ids: Vec<Uuid> = f.shift_ids.iter()
        .filter_map(|s| s.parse::<Uuid>().ok())
        .collect();

    if shift_ids.is_empty() {
        return Ok(Flash::error(redirect, "No shifts selected"));
    }

    let count = shift_ids.len();

    match f.action.as_str() {
        "dismiss" => {
            for sid in &shift_ids {
                let _ = sqlx::query(
                    "UPDATE shifts SET feedback_dismissed_at = now() WHERE id = $1"
                )
                .bind(sid)
                .execute(&**db)
                .await;
            }
            return Ok(Flash::success(
                redirect,
                format!("{count} shift{} dismissed from feedback queue", if count == 1 { "" } else { "s" }),
            ));
        }

        action @ ("remind_volunteers" | "remind_agencies" | "remind_both") => {
            let remind_vol = action == "remind_volunteers" || action == "remind_both";
            let remind_agency = action == "remind_agencies" || action == "remind_both";
            let mut notif_count = 0u32;

            for sid in &shift_ids {
                // Fetch shift title once
                let title: Option<String> = sqlx::query_scalar(
                    "SELECT title FROM shifts WHERE id = $1"
                )
                .bind(sid)
                .fetch_optional(&**db)
                .await
                .unwrap_or(None);
                let title = title.unwrap_or_default();
                let survey_url = format!("/volunteer/survey/{}", sid);

                if remind_vol {
                    // Volunteers with confirmed status who haven't submitted
                    let vols: Vec<Uuid> = sqlx::query_scalar(
                        r#"
                        SELECT sa.volunteer_id FROM shift_assignments sa
                        WHERE sa.shift_id = $1 AND sa.status = 'confirmed'
                          AND NOT EXISTS (
                              SELECT 1 FROM volunteer_surveys vs
                              WHERE vs.shift_id = $1 AND vs.volunteer_id = sa.volunteer_id
                          )
                        "#,
                    )
                    .bind(sid)
                    .fetch_all(&**db)
                    .await
                    .unwrap_or_default();

                    for vid in vols {
                        let _ = sqlx::query(
                            r#"
                            INSERT INTO notifications (user_id, type, title, body, payload)
                            VALUES ($1, 'survey_prompt',
                                    'Reminder: How did your visit go?',
                                    $2, $3)
                            "#,
                        )
                        .bind(vid)
                        .bind(format!("Please share your feedback for the \"{}\" shift.", title))
                        .bind(serde_json::json!({ "shift_id": sid, "survey_url": survey_url }))
                        .execute(&**db)
                        .await;
                        notif_count += 1;
                    }
                }

                if remind_agency {
                    let agency_contact: Option<Uuid> = sqlx::query_scalar(
                        r#"
                        SELECT c.user_id FROM shifts s
                        JOIN contacts c ON c.id = s.contact_id
                        WHERE s.id = $1
                          AND NOT EXISTS (
                              SELECT 1 FROM agency_surveys ags
                              WHERE ags.shift_id = $1 AND ags.contact_id = c.id
                          )
                        "#,
                    )
                    .bind(sid)
                    .fetch_optional(&**db)
                    .await
                    .unwrap_or(None);

                    if let Some(uid) = agency_contact {
                        let _ = sqlx::query(
                            r#"
                            INSERT INTO notifications (user_id, type, title, body, payload)
                            VALUES ($1, 'survey_prompt',
                                    'Reminder: Tell us about your therapy dog visit!',
                                    $2, $3)
                            "#,
                        )
                        .bind(uid)
                        .bind(format!("Please share your feedback for the \"{}\" visit.", title))
                        .bind(serde_json::json!({ "shift_id": sid, "survey_url": format!("/agency/survey/{}", sid) }))
                        .execute(&**db)
                        .await;
                        notif_count += 1;
                    }
                }
            }

            let label = match action {
                "remind_volunteers" => "volunteer reminder",
                "remind_agencies"   => "agency reminder",
                _                   => "reminder",
            };
            return Ok(Flash::success(
                redirect,
                format!("{notif_count} {label} notification{} sent", if notif_count == 1 { "" } else { "s" }),
            ));
        }

        _ => return Ok(Flash::error(redirect, "Unknown action")),
    }
}

// ─── Gallery management ───────────────────────────────────────────────────────

#[get("/gallery?<filter>&<agency_id>&<page>")]
async fn gallery_manage(
    admin: AdminUser,
    user: AuthUser,
    filter: Option<String>,
    agency_id: Option<String>,
    page: Option<i64>,
    db: &Db,
) -> AppResult<Template> {
    let agency_uuid = agency_id.as_deref().and_then(|s| s.parse::<Uuid>().ok());
    let gfilter = GalleryFilter {
        filter: filter.clone(),
        agency_id: agency_uuid,
        page,
    };
    let items = get_gallery_items(db, &gfilter, Uuid::nil()).await?;
    Ok(Template::render(
        "admin/gallery",
        context! {
            user: &user.0,
            items,
            filter,
            page: page.unwrap_or(1),
            is_admin: true,
        },
    ))
}

/// GET /admin/agencies/<id>/gallery
#[get("/agencies/<id>/gallery")]
async fn gallery_agency_get(id: Uuid, _admin: AdminUser, user: AuthUser, db: &Db) -> AppResult<Template> {
    let groups = get_agency_gallery(db, id, Uuid::nil()).await?;
    Ok(Template::render(
        "admin/gallery_agency",
        context! { user: &user.0, groups, agency_id: id },
    ))
}

#[derive(rocket::form::FromForm)]
struct AdminUploadForm<'r> {
    photo: TempFile<'r>,
    #[allow(dead_code)]
    caption: Option<String>,
}

/// POST /admin/shifts/<id>/gallery/upload
#[post("/shifts/<shift_id>/gallery/upload", data = "<form>")]
async fn gallery_upload_post(
    shift_id: Uuid,
    form: rocket::form::Form<AdminUploadForm<'_>>,
    admin: AdminUser,
    db: &Db,
    storage: &rocket::State<StorageBackend>,
) -> crate::errors::AppResult<Template> {
    let admin_id = admin.0.id;
    let result = handle_upload(
        form.into_inner().photo,
        Some(shift_id),
        admin_id,
        AssetVisibility::Curated,
        storage,
        db,
    )
    .await?;

    // Admin uploads are immediately promoted
    sqlx::query(
        "UPDATE assets SET promoted_at = now(), promoted_by = $1 WHERE id = $2",
    )
    .bind(admin_id)
    .bind(result.asset.id)
    .execute(&**db)
    .await?;

    Ok(Template::render(
        "partials/asset_card",
        context! {
            asset: &result.asset,
            thumb_url: &result.thumb_url,
            star_count: 0_i64,
            my_star: false,
            tags: Vec::<serde_json::Value>::new(),
            show_delete: false,
            is_admin: true,
        },
    ))
}

/// POST /admin/assets/<id>/curate — toggle promoted_at
#[post("/assets/<id>/curate")]
async fn gallery_curate_post(
    id: Uuid,
    admin: AdminUser,
    db: &Db,
) -> crate::errors::AppResult<Template> {
    let currently_curated: bool = sqlx::query_scalar(
        "SELECT promoted_at IS NOT NULL FROM assets WHERE id = $1",
    )
    .bind(id)
    .fetch_one(&**db)
    .await?;

    if currently_curated {
        sqlx::query(
            "UPDATE assets SET promoted_at = NULL, promoted_by = NULL, visibility = 'private' WHERE id = $1",
        )
        .bind(id)
        .execute(&**db)
        .await?;
    } else {
        sqlx::query(
            "UPDATE assets SET promoted_at = now(), promoted_by = $1, visibility = 'curated' WHERE id = $2",
        )
        .bind(admin.0.id)
        .bind(id)
        .execute(&**db)
        .await?;
    }

    Ok(Template::render(
        "partials/curate_button",
        context! { asset_id: id, curated: !currently_curated },
    ))
}

/// POST /admin/assets/<id>/verify
#[post("/assets/<id>/verify")]
async fn gallery_verify_post(
    id: Uuid,
    admin: AdminUser,
    db: &Db,
) -> crate::errors::AppResult<&'static str> {
    sqlx::query(
        "UPDATE assets SET visibility = 'curated', promoted_at = now(), promoted_by = $1 WHERE id = $2",
    )
    .bind(admin.0.id)
    .bind(id)
    .execute(&**db)
    .await?;
    Ok("")
}

/// POST /admin/assets/<id>/hide
#[post("/assets/<id>/hide")]
async fn gallery_hide_post(
    id: Uuid,
    _admin: AdminUser,
    db: &Db,
) -> crate::errors::AppResult<&'static str> {
    sqlx::query("UPDATE assets SET visibility = 'hidden', promoted_at = NULL, promoted_by = NULL WHERE id = $1")
        .bind(id)
        .execute(&**db)
        .await?;
    Ok("")
}

#[get("/regions")]
async fn regions(_admin: AdminUser) -> &'static str {
    "Region editor — coming soon"
}

// ─── Dog Application Management ───────────────────────────────────────────────

#[derive(rocket::form::FromForm, Debug)]
struct DogApplicationReviewForm<'r> {
    #[allow(dead_code)]
    status: &'r str,
    #[field(default = "")]
    response_template_id: &'r str,
    #[field(default = "")]
    response_reason: &'r str,
    #[field(default = "")]
    response_notes: &'r str,
}

// ─── List Applications ───────────────────────────────────────────────────────

#[get("/dog-applications?<status>&<page>")]
async fn dog_applications_list(
    db: &Db,
    _admin: AdminUser,
    user: AuthUser,
    status: Option<&str>,
    page: Option<u32>,
    flash: Option<FlashMessage<'_>>,
) -> AppResult<Template> {
    let page = page.unwrap_or(0) as i64;
    let offset = page * 50;

    // Filter by status
    let status_filter = status.unwrap_or("pending");
    let where_clause = match status_filter {
        "pending" => "WHERE da.status IN ('submitted', 'under_review', 'assessment_scheduled', 'assessment_completed')",
        "approved" => "WHERE da.status = 'approved'",
        "rejected" => "WHERE da.status = 'rejected'",
        "all" => "",
        _ => "WHERE da.status IN ('submitted', 'under_review', 'assessment_scheduled', 'assessment_completed')",
    };

    let sql = format!(
        r#"
        SELECT 
            da.id, da.dog_name, da.status, 
            da.submitted_at, da.created_at,
            da.volunteer_id, vp.volunteer_names, u.email as volunteer_email,
            dt.name as breed_name
        FROM dog_applications da
        JOIN users u ON u.id = da.volunteer_id
        JOIN volunteer_profiles vp ON vp.user_id = da.volunteer_id
        LEFT JOIN dog_types dt ON dt.id = da.breed_id
        {}
        ORDER BY da.submitted_at ASC NULLS LAST, da.created_at DESC
        LIMIT 50 OFFSET {}
        "#,
        where_clause, offset
    );

    let applications: Vec<DogApplicationListItem> = sqlx::query_as(&sql)
        .fetch_all(&**db)
        .await?;

    let has_more = applications.len() == 50;

    // Get counts for tabs
    let pending_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM dog_applications WHERE status IN ('submitted', 'under_review', 'assessment_scheduled', 'assessment_completed')"
    )
    .fetch_one(&**db)
    .await?;

    let approved_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM dog_applications WHERE status = 'approved'"
    )
    .fetch_one(&**db)
    .await?;

    let rejected_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM dog_applications WHERE status = 'rejected'"
    )
    .fetch_one(&**db)
    .await?;

    Ok(Template::render(
        "admin/dog_applications",
        context! {
            user: &user.0,
            flash: take_flash(flash),
            applications,
            has_more,
            page,
            current_status: status_filter,
            pending_count,
            approved_count,
            rejected_count,
        },
    ))
}

// ─── Application Detail ──────────────────────────────────────────────────────

#[get("/dog-applications/<id>")]
async fn dog_application_detail(
    id: &str,
    db: &Db,
    _admin: AdminUser,
    user: AuthUser,
    flash: Option<FlashMessage<'_>>,
) -> AppResult<Template> {
    let app_id = id.parse::<Uuid>().map_err(|_| AppError::NotFound)?;

    let application: DogApplicationDetail = sqlx::query_as(
        r#"
        SELECT
            da.id, da.dog_name, da.breed_id, da.breed_freeform, da.size::text,
            da.gender, da.date_of_birth, da.personality_desc, da.status,
            da.status_changed_at,
 
            COALESCE(da.assessment_date, asess.date) as assessment_date,
            COALESCE(da.assessment_time, aslots.start_time) as assessment_time,
            COALESCE(da.assessment_location, asess.location) as assessment_location,
            da.assessment_notes, da.reviewed_at,
            da.response_reason, da.response_notes, da.submitted_at, da.created_at,
            da.volunteer_id, u.email as volunteer_email, vp.volunteer_names,
            NULL::text as volunteer_phone,
            reviewer.display_name as reviewer_name,
            dt.name as breed_name,
            da.selected_slot_id
        FROM dog_applications da
        JOIN users u ON u.id = da.volunteer_id
        JOIN volunteer_profiles vp ON vp.user_id = da.volunteer_id
        LEFT JOIN users reviewer ON reviewer.id = da.reviewed_by
        LEFT JOIN dog_types dt ON dt.id = da.breed_id
        LEFT JOIN assessment_slots aslots ON aslots.id = da.selected_slot_id
        LEFT JOIN assessment_sessions asess ON asess.id = aslots.session_id
        WHERE da.id = $1
        "#
    )
    .bind(app_id)
    .fetch_optional(&**db)
    .await?
    .ok_or(AppError::NotFound)?;

    // Get response templates
    let templates: Vec<DogApplicationResponseTemplate> = sqlx::query_as(
        r#"
        SELECT id, category, label, body, is_active, sort_order, created_at
        FROM dog_application_response_templates
        WHERE is_active = true
        ORDER BY category, sort_order
        "#
    )
    .fetch_all(&**db)
    .await?;

    // Get all breeds for reference
    let all_breeds: Vec<(Uuid, String, Option<Uuid>)> = sqlx::query_as(
        "SELECT id, name, parent_id FROM dog_types WHERE is_active = true ORDER BY path"
    )
    .fetch_all(&**db)
    .await?;

    // Get available sessions
    let sessions: Vec<AssessmentSessionListItem> = sqlx::query_as(
        r#"
        SELECT 
            asess.id, asess.date, asess.location,
            COUNT(aslots.id) as total_slots,
            SUM(CASE WHEN da.id IS NOT NULL THEN 1 ELSE 0 END) as filled_slots,
            SUM(aslots.capacity) as total_capacity,
            COALESCE((
                SELECT JSON_AGG(JSON_BUILD_OBJECT(
                    'id', s.id,
                    'start_time', s.start_time,
                    'end_time', s.end_time,
                    'available', s.capacity - (SELECT COUNT(*) FROM dog_applications WHERE selected_slot_id = s.id)
                ) ORDER BY s.start_time)
                FROM assessment_slots s
                WHERE s.session_id = asess.id
            ), '[]'::json) as slots
        FROM assessment_sessions asess
        LEFT JOIN assessment_slots aslots ON aslots.session_id = asess.id
        LEFT JOIN dog_applications da ON da.selected_slot_id = aslots.id
        WHERE asess.date >= CURRENT_DATE
        GROUP BY asess.id
        ORDER BY asess.date ASC
        "#
    )
    .fetch_all(&**db)
    .await?;

    Ok(Template::render(
        "admin/dog_application_detail",
        context! {
            user: &user.0,
            flash: take_flash(flash),
            application,
            templates,
            all_breeds,
            sessions,
        },
    ))
}

// ─── Review Application (Start Review) ───────────────────────────────────────

#[post("/dog-applications/<id>/review")]
async fn dog_application_review_post(
    id: &str,
    db: &Db,
    admin: AdminUser,
) -> Flash<Redirect> {
    let app_id = match id.parse::<Uuid>() {
        Ok(u) => u,
        Err(_) => return Flash::error(Redirect::to("/admin/dog-applications"), "Invalid ID"),
    };

    // Get current application info
    let app: Option<(Uuid, String, DogApplicationStatus)> = sqlx::query_as(
        "SELECT volunteer_id, dog_name, status FROM dog_applications WHERE id = $1"
    )
    .bind(app_id)
    .fetch_optional(&**db)
    .await
    .unwrap_or(None);

    let (volunteer_id, dog_name, old_status) = match app {
        Some((vid, name, status)) => (vid, name, status),
        None => return Flash::error(Redirect::to("/admin/dog-applications"), "Application not found"),
    };

    // Update to pending_assessment
    if let Err(e) = sqlx::query(
        "UPDATE dog_applications SET status = 'pending_assessment', status_changed_by = $2, updated_at = now() WHERE id = $1"
    )
    .bind(app_id)
    .bind(admin.0.id)
    .execute(&**db)
    .await {
        tracing::error!("Failed to update application status: {}", e);
        return Flash::error(Redirect::to(format!("/admin/dog-applications/{}", app_id)), "Update failed");
    }

    // Log event
    let _ = EventLog::dog_application_status_changed(
        &**db, 
        volunteer_id, 
        app_id, 
        &dog_name, 
        &old_status.to_string(), 
        "pending_assessment",
        Some(admin.0.id)
    ).await;

    Flash::success(
        Redirect::to(format!("/admin/dog-applications/{}", app_id)),
        "Application approved for assessment",
    )
}

// ─── Schedule Assessment ─────────────────────────────────────────────────────

#[derive(rocket::form::FromForm)]
struct DogApplicationScheduleSlotForm {
    slot_id: Uuid,
}

#[post("/dog-applications/<id>/schedule", data = "<form>")]
async fn dog_application_schedule_assessment(
    id: &str,
    form: Form<DogApplicationScheduleSlotForm>,
    db: &Db,
    admin: AdminUser,
    email_svc: &rocket::State<crate::email::EmailService>,
) -> Flash<Redirect> {
    let app_id = match id.parse::<Uuid>() {
        Ok(u) => u,
        Err(_) => return Flash::error(Redirect::to("/admin/dog-applications"), "Invalid ID"),
    };

    let f = form.into_inner();
    let slot_id = f.slot_id;

    // 1. Get all info for notifications and logging
    let info: Option<(Uuid, String, String, String, NaiveDate, NaiveTime, String, DogApplicationStatus)> = sqlx::query_as(
        r#"
        SELECT 
            u.id, u.email, vp.volunteer_names, da.dog_name,
            asess.date, aslots.start_time, asess.location,
            da.status
        FROM dog_applications da
        JOIN users u ON u.id = da.volunteer_id
        JOIN volunteer_profiles vp ON vp.user_id = da.volunteer_id
        JOIN assessment_slots aslots ON aslots.id = $2
        JOIN assessment_sessions asess ON asess.id = aslots.session_id
        WHERE da.id = $1
        "#
    )
    .bind(app_id)
    .bind(slot_id)
    .fetch_optional(&**db)
    .await
    .unwrap_or(None);

    let (volunteer_id, volunteer_email, volunteer_name, dog_name, s_date, s_time, s_loc, _old_status) = match info {
        Some(i) => i,
        None => return Flash::error(Redirect::to(format!("/admin/dog-applications/{}", app_id)), "Application or slot not found"),
    };

    // 2. Verify slot availability
    let is_available: bool = match sqlx::query_scalar(
        r#"
        SELECT (capacity - (SELECT COUNT(*) FROM dog_applications WHERE selected_slot_id = $1)) > 0
        FROM assessment_slots
        WHERE id = $1
        "#
    )
    .bind(slot_id)
    .fetch_one(&**db)
    .await {
        Ok(avail) => avail,
        Err(e) => {
            tracing::error!("Failed to check slot availability: {}", e);
            return Flash::error(Redirect::to(format!("/admin/dog-applications/{}", app_id)), "Database error");
        }
    };

    if !is_available {
        return Flash::error(Redirect::to(format!("/admin/dog-applications/{}", app_id)), "This slot is now full. Please select another.");
    }

    // 3. Update application
    if let Err(e) = sqlx::query(
        r#"
        UPDATE dog_applications 
        SET status = 'assessment_scheduled', 
            selected_slot_id = $2,
            status_changed_by = $3,
            updated_at = now() 
        WHERE id = $1
        "#
    )
    .bind(app_id)
    .bind(slot_id)
    .bind(admin.0.id)
    .execute(&**db)
    .await {
        tracing::error!("Failed to update application: {}", e);
        return Flash::error(Redirect::to(format!("/admin/dog-applications/{}", app_id)), "Update failed");
    }

    // 4. Notifications
    // Email
    let _ = email_svc.send_assessment_scheduled(
        &volunteer_email, 
        &dog_name, 
        &s_date.format("%A, %B %d, %Y").to_string(),
        &s_time.format("%-I:%M %p").to_string(),
        &s_loc
    ).await;

    // In-app
    let _ = sqlx::query(
        "INSERT INTO notifications (user_id, type, title, body, payload)
         VALUES ($1, 'shift_update', 'Assessment Scheduled', $2, $3)"
    )
    .bind(volunteer_id)
    .bind(format!("Your evaluation for {} is scheduled for {} at {}.", dog_name, s_date.format("%b %d"), s_time.format("%-I:%M %p")))
    .bind(serde_json::json!({ "application_id": app_id }))
    .execute(&**db)
    .await;

    // Log event
    let _ = EventLog::dog_application_assessment_scheduled(
        &**db, 
        volunteer_id, 
        app_id, 
        &dog_name, 
        &volunteer_name,
        s_date,
        s_time,
        &s_loc,
        Some(admin.0.id)
    ).await;

    Flash::success(
        Redirect::to(format!("/admin/dog-applications/{}", app_id)),
        "Assessment scheduled and volunteer notified",
    )
}

// ─── Approve Application ─────────────────────────────────────────────────────

#[post("/dog-applications/<id>/approve", data = "<form>")]
async fn dog_application_approve_post(
    id: &str,
    form: Form<DogApplicationReviewForm<'_>>,
    db: &Db,
    admin: AdminUser,
) -> Flash<Redirect> {
    let app_id = match id.parse::<Uuid>() {
        Ok(u) => u,
        Err(_) => return Flash::error(Redirect::to("/admin/dog-applications"), "Invalid ID"),
    };

    let f = form.into_inner();

    // Get current application info
    let app: Option<(Uuid, String, DogApplicationStatus, Option<Uuid>, Option<String>, Option<NaiveDate>, String, Option<DogGender>)> = sqlx::query_as(
        r#"
        SELECT volunteer_id, dog_name, status,
               breed_id, breed_freeform, date_of_birth, size::text, gender
        FROM dog_applications WHERE id = $1
        "#
    )
    .bind(app_id)
    .fetch_optional(&**db)
    .await
    .unwrap_or(None);

    let (volunteer_id, dog_name, _old_status, breed_id, breed_freeform, dob, size_str, gender): (Uuid, String, DogApplicationStatus, Option<Uuid>, Option<String>, Option<NaiveDate>, String, Option<DogGender>) = match app {
        Some((vid, name, status, bid, bf, d, sz, g)) => (vid, name, status, bid, bf, d, sz, g),
        None => return Flash::error(Redirect::to("/admin/dog-applications"), "Application not found"),
    };

    // Create the dog record
    let size = match size_str.as_str() {
        "x_small" => DogSize::XSmall,
        "small" => DogSize::Small,
        "medium" => DogSize::Medium,
        "large" => DogSize::Large,
        "x_large" => DogSize::XLarge,
        _ => DogSize::Medium,
    };

    let dog_id = match sqlx::query_scalar::<_, Uuid>(
        r#"
        INSERT INTO dogs (volunteer_id, name, breed_id, breed_freeform, size, gender, date_of_birth, is_active, is_primary)
        SELECT $1, $2, $3, $4, $5, $6, $7, true,
            CASE WHEN NOT EXISTS (SELECT 1 FROM dogs WHERE volunteer_id = $1 AND is_active = true)
                 THEN true ELSE false END
        RETURNING id
        "#
    )
    .bind(volunteer_id)
    .bind(&dog_name)
    .bind(breed_id)
    .bind(breed_freeform)
    .bind(size)
    .bind(gender)
    .bind(dob)
    .fetch_one(&**db)
    .await {

        Ok(id) => id,
        Err(e) => {
            tracing::error!("Failed to create dog: {}", e);
            return Flash::error(Redirect::to(format!("/admin/dog-applications/{}", app_id)), "Failed to create dog record");
        }
    };

    // Get response template if selected
    let response_template = if !f.response_template_id.is_empty() {
        let tmpl: Option<(String,)> = sqlx::query_as(
            "SELECT body FROM dog_application_response_templates WHERE id = $1"
        )
        .bind(f.response_template_id.parse::<Uuid>().unwrap_or_default())
        .fetch_optional(&**db)
        .await
        .unwrap_or(None);
        tmpl.map(|t| t.0)
    } else {
        None
    };

    let final_response = response_template.unwrap_or_else(|| f.response_reason.to_string());

    // Update application to approved
    if let Err(e) = sqlx::query(
        r#"
        UPDATE dog_applications 
        SET status = 'approved',
            dog_id = $2,
            reviewed_at = now(),
            reviewed_by = $3,
            response_template_id = $4,
            response_reason = $5,
            response_notes = $6,
            status_changed_by = $3,
            updated_at = now()
        WHERE id = $1
        "#
    )
    .bind(app_id)
    .bind(dog_id)
    .bind(admin.0.id)
    .bind(f.response_template_id.parse::<Uuid>().ok())
    .bind(blank(&final_response))
    .bind(blank(f.response_notes))
    .execute(&**db)
    .await {
        tracing::error!("Failed to approve application: {}", e);
        return Flash::error(Redirect::to(format!("/admin/dog-applications/{}", app_id)), "Approval failed");
    }

    // Log event
    let _ = EventLog::dog_application_approved(
        &**db, 
        volunteer_id, 
        app_id, 
        &dog_name, 
        dog_id,
        admin.0.id,
        Some(&final_response)
    ).await;

    Flash::success(
        Redirect::to(format!("/admin/dog-applications/{}", app_id)),
        "Application approved successfully",
    )
}

// ─── Reject Application ──────────────────────────────────────────────────────

#[post("/dog-applications/<id>/reject", data = "<form>")]
async fn dog_application_reject_post(
    id: &str,
    form: Form<DogApplicationReviewForm<'_>>,
    db: &Db,
    admin: AdminUser,
) -> Flash<Redirect> {
    let app_id = match id.parse::<Uuid>() {
        Ok(u) => u,
        Err(_) => return Flash::error(Redirect::to("/admin/dog-applications"), "Invalid ID"),
    };

    let f = form.into_inner();

    // Get current application info
    let app: Option<(Uuid, String, DogApplicationStatus)> = sqlx::query_as(
        "SELECT volunteer_id, dog_name, status FROM dog_applications WHERE id = $1"
    )
    .bind(app_id)
    .fetch_optional(&**db)
    .await
    .unwrap_or(None);

    let (volunteer_id, dog_name, _old_status) = match app {
        Some((vid, name, status)) => (vid, name, status),
        None => return Flash::error(Redirect::to("/admin/dog-applications"), "Application not found"),
    };

    // Get response template if selected
    let response_template = if !f.response_template_id.is_empty() {
        let tmpl: Option<(String,)> = sqlx::query_as(
            "SELECT body FROM dog_application_response_templates WHERE id = $1"
        )
        .bind(f.response_template_id.parse::<Uuid>().unwrap_or_default())
        .fetch_optional(&**db)
        .await
        .unwrap_or(None);
        tmpl.map(|t| t.0)
    } else {
        None
    };

    let final_response = if !f.response_reason.is_empty() {
        f.response_reason.to_string()
    } else if let Some(ref tmpl) = response_template {
        tmpl.clone()
    } else {
        return Flash::error(Redirect::to(format!("/admin/dog-applications/{}", app_id)), "Please provide a rejection reason");
    };

    // Update application to rejected
    if let Err(e) = sqlx::query(
        r#"
        UPDATE dog_applications 
        SET status = 'rejected',
            reviewed_at = now(),
            reviewed_by = $2,
            response_template_id = $3,
            response_reason = $4,
            response_notes = $5,
            status_changed_by = $2,
            updated_at = now()
        WHERE id = $1
        "#
    )
    .bind(app_id)
    .bind(admin.0.id)
    .bind(f.response_template_id.parse::<Uuid>().ok())
    .bind(&final_response)
    .bind(blank(f.response_notes))
    .execute(&**db)
    .await {
        tracing::error!("Failed to reject application: {}", e);
        return Flash::error(Redirect::to(format!("/admin/dog-applications/{}", app_id)), "Rejection failed");
    }

    // Log event
    let _ = EventLog::dog_application_rejected(
        &**db, 
        volunteer_id, 
        app_id, 
        &dog_name, 
        admin.0.id,
        &final_response
    ).await;

    Flash::success(
        Redirect::to(format!("/admin/dog-applications/{}", app_id)),
        "Application rejected",
    )
}

// ─── Get Response Templates (API endpoint) ───────────────────────────────────

#[get("/dog-applications/templates/<category>")]
async fn dog_application_templates(
    db: &Db,
    admin: AdminUser,
    category: &str,
) -> AppResult<Template> {
    let templates: Vec<DogApplicationResponseTemplate> = sqlx::query_as(
        r#"
        SELECT id, category, label, body, is_active, sort_order, created_at
        FROM dog_application_response_templates
        WHERE category = $1 AND is_active = true
        ORDER BY sort_order
        "#
    )
    .bind(category)
    .fetch_all(&**db)
    .await?;

    Ok(Template::render(
        "admin/partials/response_templates",
        context! { templates },
    ))
}

// ═══════════════════════════════════════════════════════════════════════════════
// Volunteer Application Management
// ═══════════════════════════════════════════════════════════════════════════════

#[derive(Debug, Serialize, FromRow)]
struct VolAppListRow {
    id: Uuid,
    user_id: Uuid,
    applicant_email: String,
    full_name: Option<String>,
    status: String,
    submitted_at: Option<DateTime<Utc>>,
    created_at: DateTime<Utc>,
    invite_link_label: Option<String>,
    source_tag: Option<String>,
}

#[get("/vol-applications?<status>&<page>")]
async fn vol_applications_list(
    db: &Db,
    _admin: AdminUser,
    user: AuthUser,
    status: Option<&str>,
    page: Option<u32>,
    flash: Option<FlashMessage<'_>>,
) -> AppResult<Template> {
    let page = page.unwrap_or(0) as i64;
    let offset = page * 25;
    let status_filter = status.unwrap_or("pending");

    let where_clause = match status_filter {
        "pending" => "WHERE va.status::text IN ('submitted', 'under_review', 'pending_vsc', 'pending_background_check', 'pending_assessment', 'assessment_scheduled')",
        "approved" => "WHERE va.status::text = 'approved'",
        "rejected" => "WHERE va.status::text = 'rejected'",
        "all" => "",
        _ => "WHERE va.status::text IN ('submitted', 'under_review', 'pending_vsc', 'pending_background_check', 'pending_assessment', 'assessment_scheduled')",
    };

    let sql = format!(
        r#"
        SELECT va.id, va.user_id, u.email as applicant_email, va.full_name,
               va.status::text as status, va.submitted_at, va.created_at,
               vil.label as invite_link_label, vil.source_tag
        FROM volunteer_applications va
        JOIN users u ON u.id = va.user_id
        LEFT JOIN volunteer_invite_links vil ON vil.id = va.invite_link_id
        {}
        ORDER BY va.submitted_at ASC NULLS LAST, va.created_at DESC
        LIMIT 26 OFFSET {}
        "#,
        where_clause, offset
    );

    let mut applications: Vec<VolAppListRow> = sqlx::query_as(&sql)
        .fetch_all(&**db)
        .await?;

    let has_more = applications.len() > 25;
    applications.truncate(25);

    let pending_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM volunteer_applications WHERE status::text IN ('submitted', 'under_review', 'pending_vsc', 'pending_background_check', 'pending_assessment', 'assessment_scheduled')",
    )
    .fetch_one(&**db)
    .await?;

    let approved_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM volunteer_applications WHERE status = 'approved'",
    )
    .fetch_one(&**db)
    .await?;

    let rejected_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM volunteer_applications WHERE status = 'rejected'",
    )
    .fetch_one(&**db)
    .await?;

    Ok(Template::render(
        "admin/vol_applications",
        context! {
            user: &user.0,
            flash: take_flash(flash),
            applications,
            has_more,
            page,
            current_status: status_filter,
            pending_count,
            approved_count,
            rejected_count,
        },
    ))
}

// ─── Volunteer Application Detail ────────────────────────────────────────────

#[derive(Debug, Serialize, FromRow)]
struct VolAppDetailRow {
    id: Uuid,
    user_id: Uuid,
    full_name: Option<String>,
    phone: Option<String>,
    city: Option<String>,
    postal_code: Option<String>,
    motivation: Option<String>,
    experience: Option<String>,
    availability: Option<String>,
    has_dog: Option<bool>,
    dog_breed_freeform: Option<String>,
    agreed_code_of_conduct: bool,
    agreed_photo_release: bool,
    agreed_liability_waiver: bool,
    agreements_signed_at: Option<DateTime<Utc>>,
    status: String,
    status_changed_at: DateTime<Utc>,
    reviewed_at: Option<DateTime<Utc>>,
    review_notes: Option<String>,
    rejection_reason: Option<String>,
    vsc_waived: bool,
    background_check_waived: bool,
    dog_health_check_waived: bool,
    vsc_waived_visible: bool,
    background_waived_visible: bool,
    dog_health_waived_visible: bool,
    selected_slot_id: Option<Uuid>,
    submitted_at: Option<DateTime<Utc>>,
    created_at: DateTime<Utc>,
    applicant_email: String,
    reviewer_name: Option<String>,
    invite_link_label: Option<String>,
    source_tag: Option<String>,
}

#[get("/vol-applications/<id>")]
async fn vol_application_detail(
    id: &str,
    db: &Db,
    _admin: AdminUser,
    user: AuthUser,
    flash: Option<FlashMessage<'_>>,
) -> AppResult<Template> {
    let app_id = id.parse::<Uuid>().map_err(|_| AppError::NotFound)?;

    let application: VolAppDetailRow = sqlx::query_as(
        r#"
        SELECT va.id, va.user_id, va.full_name, va.phone, va.city, va.postal_code,
               va.motivation, va.experience, va.availability, va.has_dog, va.dog_breed_freeform,
               va.agreed_code_of_conduct, va.agreed_photo_release, va.agreed_liability_waiver,
               va.agreements_signed_at, va.status::text as status, va.status_changed_at,
               va.reviewed_at, va.review_notes, va.rejection_reason,
               va.vsc_waived, va.background_check_waived, va.dog_health_check_waived,
               va.vsc_waived_visible, va.background_waived_visible, va.dog_health_waived_visible,
               va.selected_slot_id, va.submitted_at, va.created_at,
               u.email as applicant_email,
               reviewer.display_name as reviewer_name,
               vil.label as invite_link_label, vil.source_tag
        FROM volunteer_applications va
        JOIN users u ON u.id = va.user_id
        LEFT JOIN users reviewer ON reviewer.id = va.reviewed_by
        LEFT JOIN volunteer_invite_links vil ON vil.id = va.invite_link_id
        WHERE va.id = $1
        "#,
    )
    .bind(app_id)
    .fetch_optional(&**db)
    .await?
    .ok_or(AppError::NotFound)?;

    // Load event log for this applicant
    let events: Vec<VolunteerEventDetail> = sqlx::query_as(
        r#"
        SELECT ve.id, ve.event_type::text, ve.metadata, ve.created_at,
               ve.shift_id, ve.dog_id,
               creator.display_name as created_by_name,
               NULL::text as shift_title, NULL::timestamptz as shift_start_at,
               NULL::text as agency_name, NULL::text as site_name,
               NULL::text as dog_name, NULL::text as from_volunteer_name
        FROM volunteer_events ve
        LEFT JOIN users creator ON creator.id = ve.created_by
        WHERE ve.user_id = $1 AND ve.event_type::text LIKE 'vol_application_%'
        ORDER BY ve.created_at DESC
        LIMIT 50
        "#,
    )
    .bind(application.user_id)
    .fetch_all(&**db)
    .await
    .unwrap_or_default();

    // Determine valid next statuses
    let next_statuses: Vec<(&str, &str)> = match application.status.as_str() {
        "submitted" => vec![("under_review", "Under Review")],
        "under_review" => vec![
            ("pending_vsc", "Pending VSC"),
            ("pending_background_check", "Pending Background Check"),
            ("pending_assessment", "Pending Assessment"),
            ("approved", "Approve"),
        ],
        "pending_vsc" => vec![
            ("pending_background_check", "Pending Background Check"),
            ("pending_assessment", "Pending Assessment"),
            ("approved", "Approve"),
        ],
        "pending_background_check" => vec![
            ("pending_assessment", "Pending Assessment"),
            ("approved", "Approve"),
        ],
        "pending_assessment" => vec![("approved", "Approve")],
        "assessment_scheduled" => vec![("approved", "Approve")],
        _ => vec![],
    };

    Ok(Template::render(
        "admin/vol_application_detail",
        context! {
            user: &user.0,
            flash: take_flash(flash),
            application,
            events,
            next_statuses,
        },
    ))
}

// ─── Advance Application Status ──────────────────────────────────────────────

#[derive(FromForm)]
struct AdvanceVolAppForm<'r> {
    target_status: &'r str,
    note: Option<&'r str>,
}

#[post("/vol-applications/<id>/advance", data = "<form>")]
async fn vol_application_advance_post(
    id: &str,
    form: Form<AdvanceVolAppForm<'_>>,
    db: &Db,
    admin: AdminUser,
    _user: AuthUser,
    config: &State<AppConfig>,
) -> Flash<Redirect> {
    let app_id = match id.parse::<Uuid>() {
        Ok(id) => id,
        Err(_) => return Flash::error(Redirect::to("/admin/vol-applications"), "Invalid ID."),
    };
    // Load current status
    let current: Option<(Uuid, String)> = sqlx::query_as(
        "SELECT user_id, status::text FROM volunteer_applications WHERE id = $1",
    )
    .bind(app_id)
    .fetch_optional(&**db)
    .await
    .ok()
    .flatten();

    let (vol_user_id, old_status) = match current {
        Some(c) => c,
        None => return Flash::error(Redirect::to("/admin/vol-applications"), "Application not found."),
    };

    let target = form.target_status;

    // Update status
    if let Err(e) = sqlx::query(
        "UPDATE volunteer_applications
         SET status = $2::volunteer_application_status,
             status_changed_by = $3,
             reviewed_at = CASE WHEN $2 IN ('approved', 'rejected') THEN now() ELSE reviewed_at END,
             reviewed_by = CASE WHEN $2 IN ('approved', 'rejected') THEN $3 ELSE reviewed_by END,
             review_notes = CASE WHEN $4 IS NOT NULL AND $4 != '' THEN COALESCE(review_notes || E'\\n', '') || $4 ELSE review_notes END
         WHERE id = $1",
    )
    .bind(app_id)
    .bind(target)
    .bind(admin.0.id)
    .bind(form.note.unwrap_or(""))
    .execute(&**db)
    .await
    {
        tracing::error!(error = %e, "Failed to advance vol application");
        return Flash::error(Redirect::to(format!("/admin/vol-applications/{}", app_id)), "Failed to update application.");
    }

    // On approval: update volunteer profile with waived flags + geocode home address
    if target == "approved" {
        let _ = sqlx::query(
            r#"
            UPDATE volunteer_profiles vp SET
                has_vulnerable_sector_check = CASE WHEN va.vsc_waived THEN true ELSE vp.has_vulnerable_sector_check END,
                has_police_check = CASE WHEN va.background_check_waived THEN true ELSE vp.has_police_check END,
                volunteer_names = CASE WHEN vp.volunteer_names = '' OR vp.volunteer_names IS NULL THEN COALESCE(va.full_name, vp.volunteer_names) ELSE vp.volunteer_names END
            FROM volunteer_applications va
            WHERE vp.user_id = va.user_id AND va.id = $1
            "#,
        )
        .bind(app_id)
        .execute(&**db)
        .await;

        // Geocode street_address and create Home volunteer_location
        let street_address: Option<String> = sqlx::query_scalar(
            "SELECT street_address FROM volunteer_applications WHERE id = $1"
        )
        .bind(app_id)
        .fetch_optional(&**db)
        .await
        .ok()
        .flatten()
        .flatten();

        if let Some(ref addr) = street_address {
            if !addr.trim().is_empty() {
                let geo_result = match crate::geocoding::geocode(addr, config).await {
                    Ok(pt) => Some(pt),
                    Err(e) => {
                        tracing::warn!(error = %e, address = %addr, "Geocoding failed at approval");
                        None
                    }
                };

                // Insert Home location (idempotent)
                let insert_result = if let Some(ref pt) = geo_result {
                    sqlx::query(
                        "INSERT INTO volunteer_locations (user_id, name, address, geom, is_home, display_order, neighborhood)
                         SELECT va.user_id, 'Home', $2,
                                ST_SetSRID(ST_MakePoint($3, $4), 4326)::geography, true, 0, $5
                         FROM volunteer_applications va WHERE va.id = $1
                         ON CONFLICT DO NOTHING"
                    )
                    .bind(app_id)
                    .bind(addr)
                    .bind(pt.lng)
                    .bind(pt.lat)
                    .bind(pt.neighborhood.as_deref())
                    .execute(&**db)
                    .await
                } else {
                    sqlx::query(
                        "INSERT INTO volunteer_locations (user_id, name, address, geom, is_home, display_order)
                         SELECT va.user_id, 'Home', $2, NULL, true, 0
                         FROM volunteer_applications va WHERE va.id = $1
                         ON CONFLICT DO NOTHING"
                    )
                    .bind(app_id)
                    .bind(addr)
                    .execute(&**db)
                    .await
                };

                if let Err(e) = insert_result {
                    tracing::warn!(error = %e, "Failed to insert Home volunteer_location at approval");
                }

                // Update home_geom in volunteer_profiles if geocoding succeeded
                if let Some(ref pt) = geo_result {
                    let _ = sqlx::query(
                        "UPDATE volunteer_profiles vp SET
                             home_geom = ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography
                         FROM volunteer_applications va
                         WHERE vp.user_id = va.user_id AND va.id = $1"
                    )
                    .bind(app_id)
                    .bind(pt.lng)
                    .bind(pt.lat)
                    .execute(&**db)
                    .await;
                }
            }
        }
    }

    // Log event
    let _ = EventLog::vol_application_status_changed(
        &**db,
        vol_user_id,
        app_id,
        &old_status,
        target,
        Some(admin.0.id),
    )
    .await;

    Flash::success(Redirect::to(format!("/admin/vol-applications/{}", app_id)), format!("Application moved to {}.", target.replace('_', " ")))
}

// ─── Reject Application ─────────────────────────────────────────────────────

#[derive(FromForm)]
struct RejectVolAppForm<'r> {
    reason: &'r str,
    note: Option<&'r str>,
}

#[post("/vol-applications/<id>/reject", data = "<form>")]
async fn vol_application_reject_post(
    id: &str,
    form: Form<RejectVolAppForm<'_>>,
    db: &Db,
    admin: AdminUser,
    _user: AuthUser,
) -> Flash<Redirect> {
    let app_id = match id.parse::<Uuid>() {
        Ok(id) => id,
        Err(_) => return Flash::error(Redirect::to("/admin/vol-applications"), "Invalid ID."),
    };

    let current: Option<(Uuid, String)> = sqlx::query_as(
        "SELECT user_id, status::text FROM volunteer_applications WHERE id = $1",
    )
    .bind(app_id)
    .fetch_optional(&**db)
    .await
    .ok()
    .flatten();

    let (vol_user_id, old_status) = match current {
        Some(c) => c,
        None => return Flash::error(Redirect::to("/admin/vol-applications"), "Application not found."),
    };

    let _ = sqlx::query(
        "UPDATE volunteer_applications
         SET status = 'rejected', rejection_reason = $2,
             reviewed_at = now(), reviewed_by = $3,
             review_notes = CASE WHEN $4 IS NOT NULL AND $4 != '' THEN COALESCE(review_notes || E'\\n', '') || $4 ELSE review_notes END
         WHERE id = $1",
    )
    .bind(app_id)
    .bind(form.reason.trim())
    .bind(admin.0.id)
    .bind(form.note.unwrap_or(""))
    .execute(&**db)
    .await;

    let _ = EventLog::vol_application_status_changed(
        &**db, vol_user_id, app_id, &old_status, "rejected", Some(admin.0.id),
    ).await;

    Flash::success(
        Redirect::to(format!("/admin/vol-applications/{}", app_id)),
        "Application rejected.",
    )
}

// ─── Add Note ────────────────────────────────────────────────────────────────

#[derive(FromForm)]
struct VolAppNoteForm<'r> {
    note: &'r str,
}

#[post("/vol-applications/<id>/note", data = "<form>")]
async fn vol_application_note_post(
    id: &str,
    form: Form<VolAppNoteForm<'_>>,
    db: &Db,
    admin: AdminUser,
    _user: AuthUser,
) -> Flash<Redirect> {
    let app_id = match id.parse::<Uuid>() {
        Ok(id) => id,
        Err(_) => return Flash::error(Redirect::to("/admin/vol-applications"), "Invalid ID."),
    };

    let note = form.note.trim();
    if note.is_empty() {
        return Flash::error(
            Redirect::to(format!("/admin/vol-applications/{}", app_id)),
            "Note cannot be empty.",
        );
    }

    let _ = sqlx::query(
        "UPDATE volunteer_applications
         SET review_notes = COALESCE(review_notes || E'\\n', '') || $2
         WHERE id = $1",
    )
    .bind(app_id)
    .bind(note)
    .execute(&**db)
    .await;

    // Log it against the applicant
    if let Ok(Some(uid)) = sqlx::query_scalar::<_, Uuid>(
        "SELECT user_id FROM volunteer_applications WHERE id = $1",
    )
    .bind(app_id)
    .fetch_optional(&**db)
    .await
    {
        let _ = EventLog::note_added(&**db, uid, note, admin.0.id).await;
    }

    Flash::success(
        Redirect::to(format!("/admin/vol-applications/{}", app_id)),
        "Note added.",
    )
}

// ═══════════════════════════════════════════════════════════════════════════════
// Invite Link Management
// ═══════════════════════════════════════════════════════════════════════════════

#[derive(Debug, Serialize, FromRow)]
struct InviteLinkRow {
    id: Uuid,
    slug: Option<String>,
    label: String,
    source_tag: Option<String>,
    message: Option<String>,
    auto_approve_vsc: bool,
    auto_approve_background: bool,
    auto_approve_dog_health: bool,
    use_count: i32,
    max_uses: Option<i32>,
    expires_at: Option<DateTime<Utc>>,
    is_active: bool,
    created_at: DateTime<Utc>,
    application_count: i64,
    approved_count: i64,
}

#[get("/invite-links")]
async fn invite_links_list(
    db: &Db,
    _admin: AdminUser,
    user: AuthUser,
    flash: Option<FlashMessage<'_>>,
) -> AppResult<Template> {
    let links: Vec<InviteLinkRow> = sqlx::query_as(
        r#"
        SELECT vil.id, vil.slug, vil.label, vil.source_tag, vil.message,
               vil.auto_approve_vsc, vil.auto_approve_background, vil.auto_approve_dog_health,
               vil.use_count, vil.max_uses, vil.expires_at, vil.is_active, vil.created_at,
               COUNT(va.id)::bigint as application_count,
               COUNT(va.id) FILTER (WHERE va.status = 'approved')::bigint as approved_count
        FROM volunteer_invite_links vil
        LEFT JOIN volunteer_applications va ON va.invite_link_id = vil.id
        GROUP BY vil.id
        ORDER BY vil.created_at DESC
        "#,
    )
    .fetch_all(&**db)
    .await?;

    Ok(Template::render(
        "admin/invite_links",
        context! {
            user: &user.0,
            flash: take_flash(flash),
            links,
        },
    ))
}

#[derive(FromForm)]
struct InviteLinkForm<'r> {
    label: &'r str,
    slug: Option<&'r str>,
    source_tag: Option<&'r str>,
    message: Option<&'r str>,
    auto_approve_vsc: bool,
    auto_approve_background: bool,
    auto_approve_dog_health: bool,
    vsc_flag_visible: bool,
    background_flag_visible: bool,
    dog_health_flag_visible: bool,
    expires_at: Option<&'r str>,
    max_uses: Option<i32>,
}

#[post("/invite-links", data = "<form>")]
async fn invite_link_create_post(
    form: Form<InviteLinkForm<'_>>,
    db: &Db,
    admin: AdminUser,
    _user: AuthUser,
) -> Flash<Redirect> {
    let label = form.label.trim();
    if label.is_empty() {
        return Flash::error(Redirect::to("/admin/invite-links"), "Label is required.");
    }

    let slug: Option<String> = form.slug
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(|s| s.to_lowercase().replace(' ', "-"));

    // Validate slug isn't reserved
    if let Some(ref s) = slug {
        if matches!(s.as_str(), "start" | "step" | "submitted" | "status" | "withdraw" | "i") {
            return Flash::error(Redirect::to("/admin/invite-links"), "That slug is reserved.");
        }
    }

    let expires = form.expires_at.and_then(|s| parse_dt(s));
    let source_tag: Option<&str> = form.source_tag.map(str::trim).filter(|s| !s.is_empty());
    let message: Option<&str> = form.message.map(str::trim).filter(|s| !s.is_empty());

    match sqlx::query(
        "INSERT INTO volunteer_invite_links
            (label, slug, source_tag, message, auto_approve_vsc, auto_approve_background, auto_approve_dog_health,
             vsc_flag_visible, background_flag_visible, dog_health_flag_visible,
             expires_at, max_uses, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)",
    )
    .bind(label)
    .bind(&slug)
    .bind(source_tag)
    .bind(message)
    .bind(form.auto_approve_vsc)
    .bind(form.auto_approve_background)
    .bind(form.auto_approve_dog_health)
    .bind(form.vsc_flag_visible)
    .bind(form.background_flag_visible)
    .bind(form.dog_health_flag_visible)
    .bind(expires)
    .bind(form.max_uses)
    .bind(admin.0.id)
    .execute(&**db)
    .await
    {
        Ok(_) => {
            let _ = EventLog::invite_link_created(
                &**db, admin.0.id, label, slug.as_deref(), source_tag,
            ).await;
            Flash::success(Redirect::to("/admin/invite-links"), "Invitation link created.")
        }
        Err(e) => {
            tracing::error!(error = %e, "Failed to create invite link");
            Flash::error(Redirect::to("/admin/invite-links"), "Failed to create link. The slug may already be in use.")
        }
    }
}

#[post("/invite-links/<id>/toggle")]
async fn invite_link_toggle_post(
    id: &str,
    db: &Db,
    _admin: AdminUser,
) -> Flash<Redirect> {
    let link_id = match id.parse::<Uuid>() {
        Ok(id) => id,
        Err(_) => return Flash::error(Redirect::to("/admin/invite-links"), "Invalid ID."),
    };

    let _ = sqlx::query(
        "UPDATE volunteer_invite_links SET is_active = NOT is_active WHERE id = $1",
    )
    .bind(link_id)
    .execute(&**db)
    .await;

    Flash::success(Redirect::to("/admin/invite-links"), "Link status toggled.")
}

// ─── Calendar settings ────────────────────────────────────────────────────────

#[get("/calendar")]
async fn calendar_settings_page(
    db: &Db,
    admin: AdminUser,
    cfg: &State<AppConfig>,
) -> AppResult<Template> {
    use crate::models::calendar::{get_or_create_token, CalendarFeedType};

    let token =
        get_or_create_token(&**db, admin.0.id, CalendarFeedType::AdminGlobal).await?;
    let base_url = &cfg.app_url;

    Ok(Template::render(
        "admin/calendar",
        context! {
            user: &admin.0,
            token: &token.token,
            base_url,
            feed_url: format!("{}/calendar/admin/global.ics?token={}", base_url, token.token),
            last_accessed_at: token.last_accessed_at,
        },
    ))
}

#[post("/calendar/tokens/regenerate")]
async fn calendar_token_regenerate(
    db: &Db,
    admin: AdminUser,
) -> AppResult<Redirect> {
    use crate::models::calendar::{regenerate_token, CalendarFeedType};

    regenerate_token(&**db, admin.0.id, CalendarFeedType::AdminGlobal).await?;
    Ok(Redirect::to("/admin/calendar"))
}
