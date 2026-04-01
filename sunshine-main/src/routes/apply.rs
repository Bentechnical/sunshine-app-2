//! Public-facing volunteer application portal routes.
//! Mounted at `/apply`.

use chrono::{DateTime, Utc};
use rocket::{
    form::{Form, FromForm},
    get, post,
    request::FlashMessage,
    response::{Flash, Redirect},
    routes, Route, State,
    Either,
};
use rocket_dyn_templates::{context, Template};
use serde::Serialize;
use sqlx::FromRow;
use uuid::Uuid;

use crate::{
    auth::{magic_link::MagicLinkService, session::{AuthUser, MaybeAuthUser}},
    config::AppConfig,
    email::EmailService,
    errors::AppResult,
    models::event_log::EventLog,
    routes::auth::MagicLinkRateLimiter,
    Db,
};

pub fn routes() -> Vec<Route> {
    routes![
        landing,
        landing_invite,
        landing_invite_id,
        start_application,
        step1_get,
        step1_post,
        step2_get,
        step2_post,
        step3_get,
        step3_post,
        step4_get,
        step4_post,
        submitted_page,
        status_page,
        withdraw_post,
    ]
}

// ─── Local query structs ─────────────────────────────────────────────────────

#[derive(Debug, FromRow, Serialize)]
struct ActiveApp {
    id: Uuid,
    status: String,
    full_name: Option<String>,
    phone: Option<String>,
    street_address: Option<String>,
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
    invite_link_id: Option<Uuid>,
    submitted_at: Option<DateTime<Utc>>,
    created_at: DateTime<Utc>,
    vsc_waived: bool,
    background_check_waived: bool,
    dog_health_check_waived: bool,
    vsc_waived_visible: bool,
    background_waived_visible: bool,
    dog_health_waived_visible: bool,
    rejection_reason: Option<String>,
    review_notes: Option<String>,
}

#[derive(Debug, FromRow, Serialize)]
struct InviteLinkInfo {
    id: Uuid,
    label: String,
    source_tag: Option<String>,
    message: Option<String>,
    auto_approve_vsc: bool,
    auto_approve_background: bool,
    auto_approve_dog_health: bool,
    vsc_flag_visible: bool,
    background_flag_visible: bool,
    dog_health_flag_visible: bool,
}

#[derive(Serialize)]
struct FlashCtx {
    kind: String,
    message: String,
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async fn load_active_application(db: &Db, user_id: Uuid) -> AppResult<Option<ActiveApp>> {
    let app = sqlx::query_as::<_, ActiveApp>(
        "SELECT id, status::text as status, full_name, phone, street_address, city, postal_code,
                motivation, experience, availability, has_dog, dog_breed_freeform,
                agreed_code_of_conduct, agreed_photo_release, agreed_liability_waiver,
                invite_link_id, submitted_at, created_at,
                vsc_waived, background_check_waived, dog_health_check_waived,
                vsc_waived_visible, background_waived_visible, dog_health_waived_visible,
                rejection_reason, review_notes
         FROM volunteer_applications
         WHERE user_id = $1
           AND status NOT IN ('approved', 'rejected', 'withdrawn')
         LIMIT 1",
    )
    .bind(user_id)
    .fetch_optional(&**db)
    .await?;
    Ok(app)
}

async fn load_latest_application(db: &Db, user_id: Uuid) -> AppResult<Option<ActiveApp>> {
    let app = sqlx::query_as::<_, ActiveApp>(
        "SELECT id, status::text as status, full_name, phone, street_address, city, postal_code,
                motivation, experience, availability, has_dog, dog_breed_freeform,
                agreed_code_of_conduct, agreed_photo_release, agreed_liability_waiver,
                invite_link_id, submitted_at, created_at,
                vsc_waived, background_check_waived, dog_health_check_waived,
                vsc_waived_visible, background_waived_visible, dog_health_waived_visible,
                rejection_reason, review_notes
         FROM volunteer_applications
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT 1",
    )
    .bind(user_id)
    .fetch_optional(&**db)
    .await?;
    Ok(app)
}

fn redirect_to_current_step(status: &str) -> Redirect {
    match status {
        "started" => Redirect::to("/apply/step/1"),
        "personal_info_completed" => Redirect::to("/apply/step/2"),
        "questionnaire_completed" => Redirect::to("/apply/step/3"),
        "dog_registration_completed" | "dog_registration_skipped" => Redirect::to("/apply/step/4"),
        "submitted" => Redirect::to("/apply/submitted"),
        _ => Redirect::to("/apply/status"),
    }
}

// ─── Landing ─────────────────────────────────────────────────────────────────

#[get("/")]
pub async fn landing(
    db: &Db,
    user: MaybeAuthUser,
    flash: Option<FlashMessage<'_>>,
) -> AppResult<Either<Template, Redirect>> {
    if let Some(ref u) = user.0 {
        if matches!(u.role, crate::models::user::UserRole::Volunteer) {
            if let Some(app) = load_active_application(db, u.id).await? {
                return Ok(Either::Right(redirect_to_current_step(&app.status)));
            }
        }
    }

    Ok(Either::Left(Template::render(
        "apply/landing",
        context! {
            invite_link: None::<InviteLinkInfo>,
            flash: flash.map(|f| FlashCtx { kind: f.kind().to_string(), message: f.message().to_string() }),
        },
    )))
}

#[get("/i/<slug>")]
pub async fn landing_invite(
    slug: &str,
    db: &Db,
    user: MaybeAuthUser,
    flash: Option<FlashMessage<'_>>,
) -> Result<Either<Template, Redirect>, Flash<Redirect>> {
    if let Some(ref u) = user.0 {
        if matches!(u.role, crate::models::user::UserRole::Volunteer) {
            if let Some(app) = load_active_application(db, u.id).await.map_err(|_| Flash::error(Redirect::to("/apply"), "Error loading application"))? {
                return Ok(Either::Right(redirect_to_current_step(&app.status)));
            }
        }
    }

    let link = sqlx::query_as::<_, InviteLinkInfo>(
        "SELECT id, label, source_tag, message,
                auto_approve_vsc, auto_approve_background, auto_approve_dog_health,
                vsc_flag_visible, background_flag_visible, dog_health_flag_visible
         FROM volunteer_invite_links
         WHERE slug = $1
           AND is_active = true
           AND (expires_at IS NULL OR expires_at > now())
           AND (max_uses IS NULL OR use_count < max_uses)",
    )
    .bind(slug)
    .fetch_optional(&**db)
    .await
    .map_err(|e| {
        tracing::error!(error = %e, "DB error loading invite link");
        Flash::error(Redirect::to("/apply"), "Something went wrong.")
    })?;

    match link {
        Some(link) => Ok(Either::Left(Template::render(
            "apply/landing",
            context! {
                invite_link: Some(&link),
                flash: flash.map(|f| FlashCtx { kind: f.kind().to_string(), message: f.message().to_string() }),
            },
        ))),
        None => Err(Flash::error(
            Redirect::to("/apply"),
            "This invitation link is no longer valid.",
        )),
    }
}

#[get("/id/<id>")]
pub async fn landing_invite_id(
    id: &str,
    db: &Db,
    user: MaybeAuthUser,
    flash: Option<FlashMessage<'_>>,
) -> Result<Either<Template, Redirect>, Flash<Redirect>> {
    if let Some(ref u) = user.0 {
        if matches!(u.role, crate::models::user::UserRole::Volunteer) {
            if let Some(app) = load_active_application(db, u.id).await.map_err(|_| Flash::error(Redirect::to("/apply"), "Error loading application"))? {
                return Ok(Either::Right(redirect_to_current_step(&app.status)));
            }
        }
    }

    let link_id = Uuid::parse_str(id).map_err(|_| {
        Flash::error(Redirect::to("/apply"), "Invalid invitation link ID.")
    })?;

    let link = sqlx::query_as::<_, InviteLinkInfo>(
        "SELECT id, label, source_tag, message,
                auto_approve_vsc, auto_approve_background, auto_approve_dog_health,
                vsc_flag_visible, background_flag_visible, dog_health_flag_visible
         FROM volunteer_invite_links
         WHERE id = $1
           AND is_active = true
           AND (expires_at IS NULL OR expires_at > now())
           AND (max_uses IS NULL OR use_count < max_uses)",
    )
    .bind(link_id)
    .fetch_optional(&**db)
    .await
    .map_err(|e| {
        tracing::error!(error = %e, "DB error loading invite link");
        Flash::error(Redirect::to("/apply"), "Something went wrong.")
    })?;

    match link {
        Some(link) => Ok(Either::Left(Template::render(
            "apply/landing",
            context! {
                invite_link: Some(&link),
                flash: flash.map(|f| FlashCtx { kind: f.kind().to_string(), message: f.message().to_string() }),
            },
        ))),
        None => Err(Flash::error(
            Redirect::to("/apply"),
            "This invitation link is no longer valid.",
        )),
    }
}

// ─── Start application ──────────────────────────────────────────────────────

#[derive(FromForm)]
pub struct StartForm<'r> {
    email: &'r str,
    invite_link_id: Option<&'r str>,
}

#[post("/start", data = "<form>")]
pub async fn start_application(
    form: Form<StartForm<'_>>,
    db: &Db,
    config: &State<AppConfig>,
    email_svc: &State<EmailService>,
    rate_limiter: &State<MagicLinkRateLimiter>,
    jar: &rocket::http::CookieJar<'_>,
) -> Flash<Redirect> {
    let email = form.email.trim().to_lowercase();

    if email.is_empty() || !email.contains('@') {
        return Flash::error(Redirect::to("/apply"), "Please enter a valid email address.");
    }

    // Rate limit
    if !rate_limiter.check(&email) {
        return Flash::success(
            Redirect::to(format!(
                "/auth/magic-link-sent?email={}",
                crate::routes::auth::urlencoding::encode(&email)
            )),
            "Check your email for a link to continue your application.",
        );
    }

    // Get or create user
    let user = match crate::routes::auth::get_or_create_volunteer(&**db, &email).await {
        Ok(u) => u,
        Err(e) => {
            tracing::error!(error = %e, "Failed to get/create user for application");
            return Flash::error(Redirect::to("/apply"), "Something went wrong. Please try again.");
        }
    };

    let invite_link_id = form.invite_link_id.and_then(|s| Uuid::parse_str(s).ok());

    // Check for existing active application
    let existing = sqlx::query_scalar::<_, Uuid>(
        "SELECT id FROM volunteer_applications
         WHERE user_id = $1 AND status NOT IN ('approved', 'rejected', 'withdrawn')
         LIMIT 1",
    )
    .bind(user.id)
    .fetch_optional(&**db)
    .await;

    if existing.ok().flatten().is_none() {
        // Create application
        let app_id = match sqlx::query_scalar::<_, Uuid>(
            "INSERT INTO volunteer_applications (user_id, invite_link_id)
             VALUES ($1, $2)
             RETURNING id",
        )
        .bind(user.id)
        .bind(invite_link_id)
        .fetch_one(&**db)
        .await
        {
            Ok(id) => id,
            Err(e) => {
                tracing::error!(error = %e, "Failed to create application record");
                return Flash::error(Redirect::to("/apply"), "Could not start application.");
            }
        };

        // Log event
        let source_tag: Option<String> = if let Some(link_id) = invite_link_id {
            sqlx::query_scalar("SELECT source_tag FROM volunteer_invite_links WHERE id = $1")
                .bind(link_id)
                .fetch_optional(&**db)
                .await
                .ok()
                .flatten()
        } else {
            None
        };

        let _ = EventLog::vol_application_started(
            &**db,
            user.id,
            app_id,
            invite_link_id,
            source_tag.as_deref(),
        )
        .await;
    }

    // Clerk auth: redirect to sign-up (Option 2: user pre-created)
    if config.clerk_enabled() {
        let mut cookie =
            rocket::http::Cookie::new("pending_apply_user_id", user.id.to_string());
        cookie.set_http_only(true);
        cookie.set_same_site(rocket::http::SameSite::Lax);
        cookie.set_path("/");
        cookie.set_max_age(rocket::time::Duration::minutes(30));
        jar.add_private(cookie);

        if let Some(sign_up_url) = config.clerk_sign_up_url(&config.app_url, "/apply/step/1") {
            return Flash::success(Redirect::to(sign_up_url), "");
        }
        // Clerk configured but no account URL — fall through to magic link
    }

    // Dev / magic-link fallback
    let svc = MagicLinkService::new(config.inner());
    match svc.create(db, &email).await {
        Ok(token) => {
            if let Err(e) = email_svc.send_magic_link(&email, &token).await {
                tracing::warn!(error = %e, email = %email, "Magic link email failed");
            }
        }
        Err(e) => {
            tracing::error!(error = %e, "Failed to create magic link for application");
        }
    }

    Flash::success(
        Redirect::to(format!(
            "/auth/magic-link-sent?email={}",
            crate::routes::auth::urlencoding::encode(&email)
        )),
        "Check your email for a link to continue your application.",
    )
}

// ─── Step 1: Personal Info ───────────────────────────────────────────────────

#[get("/step/1")]
pub async fn step1_get(
    db: &Db,
    user: AuthUser,
    flash: Option<FlashMessage<'_>>,
) -> Result<Template, Redirect> {
    let app = load_active_application(db, user.id()).await.map_err(|_| Redirect::to("/apply"))?;
    match app {
        None => return Err(Redirect::to("/apply")),
        Some(ref a) if a.status != "started" => {
            return Err(redirect_to_current_step(&a.status));
        }
        _ => {}
    }
    let app = app.unwrap();
    Ok(Template::render(
        "apply/step1_personal",
        context! {
            application: &app,
            current_step: 1,
            user: context! { id: user.id(), email: &user.0.email, display_name: &user.0.display_name, role: format!("{:?}", user.0.role).to_lowercase() },
            flash: flash.map(|f| FlashCtx { kind: f.kind().to_string(), message: f.message().to_string() }),
        },
    ))
}

#[derive(FromForm)]
pub struct Step1Form<'r> {
    full_name: &'r str,
    phone: &'r str,
    #[field(default = "")]
    street_address: &'r str,
    city: Option<&'r str>,
    postal_code: Option<&'r str>,
}

#[post("/step/1", data = "<form>")]
pub async fn step1_post(
    form: Form<Step1Form<'_>>,
    db: &Db,
    user: AuthUser,
) -> Flash<Redirect> {
    let app = match load_active_application(db, user.id()).await {
        Ok(Some(a)) => a,
        _ => return Flash::error(Redirect::to("/apply"), "No active application found."),
    };

    if app.status != "started" {
        return Flash::error(
            redirect_to_current_step(&app.status),
            "This step has already been completed.",
        );
    }

    let street_address = if form.street_address.trim().is_empty() {
        None
    } else {
        Some(form.street_address.trim())
    };

    let res = sqlx::query(
        "UPDATE volunteer_applications
         SET full_name = $1, phone = $2, city = $3, postal_code = $4,
             street_address = $5,
             status = 'personal_info_completed'
         WHERE id = $6"
    )
    .bind(form.full_name)
    .bind(form.phone)
    .bind(form.city)
    .bind(form.postal_code)
    .bind(street_address)
    .bind(app.id)
    .execute(&**db)
    .await;

    match res {
        Ok(_) => Flash::success(Redirect::to("/apply/step/2"), "Step 1 completed!"),
        Err(_) => Flash::error(Redirect::to("/apply/step/1"), "Failed to save data."),
    }
}

// ─── Step 2: Questionnaire ───────────────────────────────────────────────────

#[get("/step/2")]
pub async fn step2_get(
    db: &Db,
    user: AuthUser,
    flash: Option<FlashMessage<'_>>,
) -> Result<Template, Redirect> {
    let app = load_active_application(db, user.id()).await.map_err(|_| Redirect::to("/apply"))?;
    match app {
        None => return Err(Redirect::to("/apply")),
        Some(ref a) if a.status == "started" => return Err(Redirect::to("/apply/step/1")),
        Some(ref a) if a.status != "personal_info_completed" => {
            return Err(redirect_to_current_step(&a.status));
        }
        _ => {}
    }
    let app = app.unwrap();
    Ok(Template::render(
        "apply/step2_questionnaire",
        context! {
            application: &app,
            current_step: 2,
            user: context! { id: user.id(), email: &user.0.email, display_name: &user.0.display_name, role: format!("{:?}", user.0.role).to_lowercase() },
            flash: flash.map(|f| FlashCtx { kind: f.kind().to_string(), message: f.message().to_string() }),
        },
    ))
}

#[derive(FromForm)]
pub struct Step2Form<'r> {
    motivation: &'r str,
    experience: &'r str,
    availability: &'r str,
}

#[post("/step/2", data = "<form>")]
pub async fn step2_post(
    form: Form<Step2Form<'_>>,
    db: &Db,
    user: AuthUser,
) -> Flash<Redirect> {
    let app = match load_active_application(db, user.id()).await {
        Ok(Some(a)) => a,
        _ => return Flash::error(Redirect::to("/apply"), "No active application found."),
    };

    if app.status != "personal_info_completed" {
        return Flash::error(
            redirect_to_current_step(&app.status),
            "This step is not available yet.",
        );
    }

    let res = sqlx::query(
        "UPDATE volunteer_applications 
         SET motivation = $1, experience = $2, availability = $3,
             status = 'questionnaire_completed'
         WHERE id = $4"
    )
    .bind(form.motivation)
    .bind(form.experience)
    .bind(form.availability)
    .bind(app.id)
    .execute(&**db)
    .await;

    match res {
        Ok(_) => Flash::success(Redirect::to("/apply/step/3"), "Step 2 completed!"),
        Err(_) => Flash::error(Redirect::to("/apply/step/2"), "Failed to save data."),
    }
}

// ─── Step 3: Dog Registration (Optional) ─────────────────────────────────────

#[derive(FromForm)]
pub struct Step3Form<'r> {
    has_dog: bool,
    dog_name: Option<&'r str>,
    dog_breed_id: Option<Uuid>,
    dog_breed_freeform: Option<&'r str>,
    dog_size: Option<&'r str>,
    dog_gender: Option<&'r str>,
    dog_date_of_birth: Option<&'r str>,
    dog_personality: Option<&'r str>,
}

#[get("/step/3")]
pub async fn step3_get(
    db: &Db,
    user: AuthUser,
    flash: Option<FlashMessage<'_>>,
) -> Result<Template, Redirect> {
    let app = load_active_application(db, user.id()).await.map_err(|_| Redirect::to("/apply"))?;
    match app {
        None => return Err(Redirect::to("/apply")),
        Some(ref a) if a.status == "started" => return Err(Redirect::to("/apply/step/1")),
        Some(ref a) if a.status == "personal_info_completed" => return Err(Redirect::to("/apply/step/2")),
        Some(ref a) if !matches!(a.status.as_str(), "questionnaire_completed" | "dog_registration_completed" | "dog_registration_skipped") => {
            return Err(redirect_to_current_step(&a.status));
        }
        _ => {}
    }
    
    // Load existing dog application if any
    let existing_dog = sqlx::query_as::<_, DogApplicationInfo>(
        r#"SELECT 
            da.id, da.dog_name, da.breed_id, da.breed_freeform, 
            da.size::text as size, da.gender::text as gender, 
            da.date_of_birth, da.personality_desc
         FROM dog_applications da
         JOIN volunteer_applications va ON va.user_id = da.volunteer_id
         WHERE va.id = $1 AND da.status != 'withdrawn'
         ORDER BY da.created_at DESC
         LIMIT 1"#
    )
    .bind(app.as_ref().unwrap().id)
    .fetch_optional(&**db)
    .await
    .ok()
    .flatten();
    
    // Load breed list for dropdown
    let breeds: Vec<(Uuid, String)> = sqlx::query_as(
        "SELECT id, name FROM dog_breeds WHERE is_active = true ORDER BY name"
    )
    .fetch_all(&**db)
    .await
    .unwrap_or_default();
    
    let app = app.unwrap();
    Ok(Template::render(
        "apply/step3_dog",
        context! {
            application: &app,
            existing_dog: existing_dog,
            breeds: breeds,
            current_step: 3,
            user: context! { id: user.id(), email: &user.0.email, display_name: &user.0.display_name, role: format!("{:?}", user.0.role).to_lowercase() },
            flash: flash.map(|f| FlashCtx { kind: f.kind().to_string(), message: f.message().to_string() }),
        },
    ))
}

#[derive(Debug, FromRow, Serialize)]
struct DogApplicationInfo {
    id: Uuid,
    dog_name: String,
    breed_id: Option<Uuid>,
    breed_freeform: Option<String>,
    size: Option<String>,
    gender: Option<String>,
    date_of_birth: Option<chrono::NaiveDate>,
    personality_desc: Option<String>,
}

#[post("/step/3", data = "<form>")]
pub async fn step3_post(
    form: Form<Step3Form<'_>>,
    db: &Db,
    user: AuthUser,
) -> Flash<Redirect> {
    let app = match load_active_application(db, user.id()).await {
        Ok(Some(a)) => a,
        _ => return Flash::error(Redirect::to("/apply"), "No active application found."),
    };

    if !matches!(app.status.as_str(), "questionnaire_completed" | "dog_registration_completed" | "dog_registration_skipped") {
        return Flash::error(
            redirect_to_current_step(&app.status),
            "This step is not available yet.",
        );
    }

    if form.has_dog {
        // Validate dog info
        let dog_name = form.dog_name.unwrap_or("").trim();
        if dog_name.is_empty() {
            return Flash::error(Redirect::to("/apply/step/3"), "Please enter your dog's name.");
        }

        // Parse size
        let size = match form.dog_size {
            Some("xsmall") => crate::models::dog::DogSize::XSmall,
            Some("small") => crate::models::dog::DogSize::Small,
            Some("medium") => crate::models::dog::DogSize::Medium,
            Some("large") => crate::models::dog::DogSize::Large,
            Some("xlarge") => crate::models::dog::DogSize::XLarge,
            _ => return Flash::error(Redirect::to("/apply/step/3"), "Please select your dog's size."),
        };

        // Parse gender
        let gender = form.dog_gender.and_then(|g| match g {
            "male" => Some(crate::models::dog::DogGender::Male),
            "female" => Some(crate::models::dog::DogGender::Female),
            _ => None,
        });

        // Parse date of birth
        let dob = form.dog_date_of_birth
            .and_then(|d| chrono::NaiveDate::parse_from_str(d, "%Y-%m-%d").ok());

        // Create dog application
        let res = sqlx::query(
            r#"INSERT INTO dog_applications 
                (volunteer_id, dog_name, breed_id, breed_freeform, size, gender, 
                 date_of_birth, personality_desc, status)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'submitted')
               ON CONFLICT (volunteer_id) WHERE status IN ('draft', 'submitted', 'under_review', 'pending_assessment')
               DO UPDATE SET
                 dog_name = EXCLUDED.dog_name,
                 breed_id = EXCLUDED.breed_id,
                 breed_freeform = EXCLUDED.breed_freeform,
                 size = EXCLUDED.size,
                 gender = EXCLUDED.gender,
                 date_of_birth = EXCLUDED.date_of_birth,
                 personality_desc = EXCLUDED.personality_desc,
                 status = 'submitted',
                 submitted_at = now()"#
        )
        .bind(user.id())
        .bind(dog_name)
        .bind(form.dog_breed_id)
        .bind(form.dog_breed_freeform)
        .bind(size)
        .bind(gender)
        .bind(dob)
        .bind(form.dog_personality)
        .execute(&**db)
        .await;

        if let Err(e) = res {
            tracing::error!(error = %e, "Failed to create dog application");
            return Flash::error(Redirect::to("/apply/step/3"), "Failed to save dog information.");
        }

        // Update volunteer application status
        let _ = sqlx::query(
            "UPDATE volunteer_applications 
             SET has_dog = true, status = 'dog_registration_completed'
             WHERE id = $1"
        )
        .bind(app.id)
        .execute(&**db)
        .await;

        Flash::success(Redirect::to("/apply/step/4"), "Dog registration saved!")
    } else {
        // No dog - skip to agreements
        let _ = sqlx::query(
            "UPDATE volunteer_applications 
             SET has_dog = false, status = 'dog_registration_skipped'
             WHERE id = $1"
        )
        .bind(app.id)
        .execute(&**db)
        .await;

        Flash::success(Redirect::to("/apply/step/4"), "Continuing without a therapy dog.")
    }
}

// ─── Step 4: Agreements ──────────────────────────────────────────────────────

#[get("/step/4")]
pub async fn step4_get(
    db: &Db,
    user: AuthUser,
    flash: Option<FlashMessage<'_>>,
) -> Result<Template, Redirect> {
    let app = load_active_application(db, user.id()).await.map_err(|_| Redirect::to("/apply"))?;
    match app {
        None => return Err(Redirect::to("/apply")),
        Some(ref a) if !matches!(a.status.as_str(), "dog_registration_completed" | "dog_registration_skipped") => {
            return Err(redirect_to_current_step(&a.status));
        }
        _ => {}
    }
    let app = app.unwrap();
    Ok(Template::render(
        "apply/step4_agreements",
        context! {
            application: &app,
            current_step: 4,
            user: context! { id: user.id(), email: &user.0.email, display_name: &user.0.display_name, role: format!("{:?}", user.0.role).to_lowercase() },
            flash: flash.map(|f| FlashCtx { kind: f.kind().to_string(), message: f.message().to_string() }),
        },
    ))
}

#[derive(FromForm)]
pub struct Step4Form {
    agreed_code_of_conduct: bool,
    agreed_photo_release: bool,
    agreed_liability_waiver: bool,
}

#[post("/step/4", data = "<form>")]
pub async fn step4_post(
    form: Form<Step4Form>,
    db: &Db,
    user: AuthUser,
) -> Flash<Redirect> {
    let app = match load_active_application(db, user.id()).await {
        Ok(Some(a)) => a,
        _ => return Flash::error(Redirect::to("/apply"), "No active application found."),
    };

    if !matches!(app.status.as_str(), "dog_registration_completed" | "dog_registration_skipped") {
        return Flash::error(
            redirect_to_current_step(&app.status),
            "This step is not available yet.",
        );
    }

    if !form.agreed_code_of_conduct || !form.agreed_photo_release || !form.agreed_liability_waiver {
        return Flash::error(Redirect::to("/apply/step/4"), "You must agree to all terms to proceed.");
    }

    let res = sqlx::query(
        "UPDATE volunteer_applications 
         SET agreed_code_of_conduct = $1, agreed_photo_release = $2, agreed_liability_waiver = $3,
             agreements_signed_at = now(), status = 'submitted', submitted_at = now()
         WHERE id = $4"
    )
    .bind(form.agreed_code_of_conduct)
    .bind(form.agreed_photo_release)
    .bind(form.agreed_liability_waiver)
    .bind(app.id)
    .execute(&**db)
    .await;

    match res {
        Ok(_) => Flash::success(Redirect::to("/apply/submitted"), "Application submitted!"),
        Err(_) => Flash::error(Redirect::to("/apply/step/4"), "Failed to save agreements."),
    }
}

// ─── Post-submission ─────────────────────────────────────────────────────────

#[get("/submitted")]
pub async fn submitted_page(
    db: &Db,
    user: AuthUser,
) -> Result<Template, Redirect> {
    let app = load_latest_application(db, user.id()).await.map_err(|_| Redirect::to("/apply"))?;
    match app {
        None => Err(Redirect::to("/apply")),
        Some(a) => Ok(Template::render(
            "apply/submitted",
            context! {
                application: &a,
                volunteer_application_status: &a.status,
                user: context! { id: user.id(), email: &user.0.email, display_name: &user.0.display_name, role: format!("{:?}", user.0.role).to_lowercase() },
            },
        ))
    }
}

#[get("/status")]
pub async fn status_page(
    db: &Db,
    user: AuthUser,
) -> Result<Template, Redirect> {
    let app = load_latest_application(db, user.id()).await.map_err(|_| Redirect::to("/apply"))?;
    match app {
        None => Err(Redirect::to("/apply")),
        Some(a) => Ok(Template::render(
            "apply/status",
            context! {
                application: &a,
                volunteer_application_status: &a.status,
                user: context! { id: user.id(), email: &user.0.email, display_name: &user.0.display_name, role: format!("{:?}", user.0.role).to_lowercase() },
            },
        )),
    }
}

#[post("/withdraw")]
pub async fn withdraw_post(
    db: &Db,
    user: AuthUser,
) -> Flash<Redirect> {
    let _ = sqlx::query(
        "UPDATE volunteer_applications SET status = 'withdrawn' WHERE user_id = $1 AND status NOT IN ('approved', 'rejected', 'withdrawn')"
    )
    .bind(user.id())
    .execute(&**db)
    .await;

    Flash::success(Redirect::to("/"), "Your application has been withdrawn.")
}

