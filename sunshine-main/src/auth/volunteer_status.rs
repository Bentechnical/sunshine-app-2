//! Volunteer application status checking.
//!
//! Provides guards and helpers to restrict access based on volunteer
//! application status. Only volunteers with approved applications
//! can access full volunteer functionality.

use crate::auth::session::AuthUser;
use crate::errors::AppError;
use crate::models::volunteer_application::VolunteerApplicationStatus;
use crate::Db;
use rocket::request::{FromRequest, Outcome};
use rocket::{Request, State};
use uuid::Uuid;
use anyhow::anyhow;

/// Check if a user has an active (incomplete) volunteer application.
///
/// Returns `Some(status)` if there's an application that is NOT in
/// a terminal state (approved, rejected, withdrawn).
pub async fn has_active_application(db: &Db, user_id: Uuid) -> Result<Option<VolunteerApplicationStatus>, AppError> {
    let row: Option<(String,)> = sqlx::query_as(
        "SELECT status::text 
         FROM volunteer_applications 
         WHERE user_id = $1 
           AND status NOT IN ('approved', 'rejected', 'withdrawn')
         ORDER BY created_at DESC
         LIMIT 1"
    )
    .bind(user_id)
    .fetch_optional(&**db)
    .await
    .map_err(|e| AppError::Internal(e.into()))?;

    match row {
        Some((status_str,)) => {
            // Parse the status string back to enum
            let status = match status_str.as_str() {
                "started" => VolunteerApplicationStatus::Started,
                "personal_info_completed" => VolunteerApplicationStatus::PersonalInfoCompleted,
                "questionnaire_completed" => VolunteerApplicationStatus::QuestionnaireCompleted,
                "submitted" => VolunteerApplicationStatus::Submitted,
                "under_review" => VolunteerApplicationStatus::UnderReview,
                "pending_vsc" => VolunteerApplicationStatus::PendingVsc,
                "pending_background_check" => VolunteerApplicationStatus::PendingBackgroundCheck,
                "pending_assessment" => VolunteerApplicationStatus::PendingAssessment,
                "assessment_scheduled" => VolunteerApplicationStatus::AssessmentScheduled,
                _ => {
                    tracing::warn!("Unknown application status: {}", status_str);
                    return Ok(None);
                }
            };
            Ok(Some(status))
        }
        None => Ok(None),
    }
}

/// Request guard: Only allows access if the volunteer has an approved application.
///
/// Use this for routes that should only be accessible to fully-approved volunteers
/// (shifts, dogs, gallery, etc.)
///
/// # Example
/// ```rust
/// #[get("/volunteer/shifts")]
/// async fn shifts_listing(
///     volunteer: ApprovedVolunteer,
///     // ...
/// ) -> Template {
///     // This will only run if volunteer is approved
/// }
/// ```
pub struct ApprovedVolunteer(pub AuthUser);

impl ApprovedVolunteer {
    pub fn id(&self) -> Uuid { self.0.id() }
    pub fn user(&self) -> &AuthUser { &self.0 }
}

#[rocket::async_trait]
impl<'r> FromRequest<'r> for ApprovedVolunteer {
    type Error = AppError;

    async fn from_request(req: &'r Request<'_>) -> Outcome<Self, Self::Error> {
        // First, ensure user is authenticated
        let auth_user = match req.guard::<AuthUser>().await {
            Outcome::Success(u) => u,
            Outcome::Error(e) => return Outcome::Error(e),
            Outcome::Forward(f) => return Outcome::Forward(f),
        };

        // Get database connection
        let db = match req.guard::<&State<Db>>().await {
            Outcome::Success(db) => db,
            Outcome::Error(_) => {
                return Outcome::Error((
                    rocket::http::Status::InternalServerError,
                    AppError::Internal(anyhow::anyhow!("Database unavailable")),
                ));
            }
            Outcome::Forward(_) => {
                return Outcome::Error((
                    rocket::http::Status::InternalServerError,
                    AppError::Internal(anyhow::anyhow!("Database unavailable")),
                ));
            }
        };

        // Check if user has an active (incomplete) application
        match has_active_application(db, auth_user.id()).await {
            Ok(Some(status)) => {
                // User has an incomplete application - deny access
                tracing::info!(
                    user_id = %auth_user.id(),
                    status = ?status,
                    "Access denied: Volunteer has incomplete application"
                );
                Outcome::Error((
                    rocket::http::Status::Forbidden,
                    AppError::Forbidden,
                ))
            }
            Ok(None) => {
                // No active application - user is either approved or hasn't applied
                // If they haven't applied, that's ok for now (they'll see empty states)
                Outcome::Success(ApprovedVolunteer(auth_user))
            }
            Err(e) => {
                tracing::error!(error = %e, "Failed to check volunteer application status");
                Outcome::Error((
                    rocket::http::Status::InternalServerError,
                    e,
                ))
            }
        }
    }
}

/// Request guard: Allows access to volunteers with active (incomplete) applications.
///
/// Use this for routes that should only be accessible to volunteers who are
/// still going through the application process (application status, messages).
///
/// # Example
/// ```rust
/// #[get("/apply/status")]
/// async fn application_status(
///     applicant: ApplicantVolunteer,
///     // ...
/// ) -> Template {
///     // This will only run if volunteer has an active application
/// }
/// ```
pub struct ApplicantVolunteer {
    pub auth: AuthUser,
    pub status: VolunteerApplicationStatus,
}

impl ApplicantVolunteer {
    pub fn id(&self) -> Uuid { self.auth.id() }
    pub fn status(&self) -> VolunteerApplicationStatus { self.status }
}

#[rocket::async_trait]
impl<'r> FromRequest<'r> for ApplicantVolunteer {
    type Error = AppError;

    async fn from_request(req: &'r Request<'_>) -> Outcome<Self, Self::Error> {
        // First, ensure user is authenticated
        let auth_user = match req.guard::<AuthUser>().await {
            Outcome::Success(u) => u,
            Outcome::Error(e) => return Outcome::Error(e),
            Outcome::Forward(f) => return Outcome::Forward(f),
        };

        // Get database connection
        let db = match req.guard::<&State<Db>>().await {
            Outcome::Success(db) => db,
            Outcome::Error(_) => {
                return Outcome::Error((
                    rocket::http::Status::InternalServerError,
                    AppError::Internal(anyhow::anyhow!("Database unavailable")),
                ));
            }
            Outcome::Forward(_) => {
                return Outcome::Error((
                    rocket::http::Status::InternalServerError,
                    AppError::Internal(anyhow::anyhow!("Database unavailable")),
                ));
            }
        };

        // Check if user has an active (incomplete) application
        match has_active_application(db, auth_user.id()).await {
            Ok(Some(status)) => {
                // User has an incomplete application - allow access
                Outcome::Success(ApplicantVolunteer {
                    auth: auth_user,
                    status,
                })
            }
            Ok(None) => {
                // No active application - redirect to regular volunteer area
                Outcome::Error((
                    rocket::http::Status::Forbidden,
                    AppError::Forbidden,
                ))
            }
            Err(e) => {
                tracing::error!(error = %e, "Failed to check volunteer application status");
                Outcome::Error((
                    rocket::http::Status::InternalServerError,
                    e,
                ))
            }
        }
    }
}

/// A flexible volunteer guard that provides application status info.
///
/// Use this when you need to know the volunteer's application status
/// to customize the UI (e.g., in the navbar).
pub struct VolunteerWithStatus {
    pub auth: AuthUser,
    pub application_status: Option<VolunteerApplicationStatus>,
    pub is_approved: bool,
}

impl VolunteerWithStatus {
    pub fn id(&self) -> Uuid { self.auth.id() }
    
    /// Returns true if volunteer has full access (no active application)
    pub fn has_full_access(&self) -> bool {
        self.application_status.is_none()
    }
    
    /// Returns true if volunteer is in application process
    pub fn is_applicant(&self) -> bool {
        self.application_status.is_some()
    }
}

#[rocket::async_trait]
impl<'r> FromRequest<'r> for VolunteerWithStatus {
    type Error = AppError;

    async fn from_request(req: &'r Request<'_>) -> Outcome<Self, Self::Error> {
        // First, ensure user is authenticated
        let auth_user = match req.guard::<AuthUser>().await {
            Outcome::Success(u) => u,
            Outcome::Error(e) => return Outcome::Error(e),
            Outcome::Forward(f) => return Outcome::Forward(f),
        };

        // Get database connection
        let db = match req.guard::<&State<Db>>().await {
            Outcome::Success(db) => db,
            Outcome::Error(_) => {
                return Outcome::Error((
                    rocket::http::Status::InternalServerError,
                    AppError::Internal(anyhow::anyhow!("Database unavailable")),
                ));
            }
            Outcome::Forward(_) => {
                return Outcome::Error((
                    rocket::http::Status::InternalServerError,
                    AppError::Internal(anyhow::anyhow!("Database unavailable")),
                ));
            }
        };

        // Check application status
        match has_active_application(db, auth_user.id()).await {
            Ok(status_opt) => {
                let is_approved = status_opt.is_none();
                Outcome::Success(VolunteerWithStatus {
                    auth: auth_user,
                    application_status: status_opt,
                    is_approved,
                })
            }
            Err(e) => {
                tracing::error!(error = %e, "Failed to check volunteer application status");
                Outcome::Error((
                    rocket::http::Status::InternalServerError,
                    e,
                ))
            }
        }
    }
}
