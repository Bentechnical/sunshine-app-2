use rocket::http::Status;
use rocket::response::{Responder, Response};
use rocket::Request;
use rocket_dyn_templates::Template;
use thiserror::Error;


#[derive(Debug, Error)]
pub enum AppError {
    #[error("Database error: {0}")]
    Database(#[from] sqlx::Error),

    #[error("Not found")]
    NotFound,

    #[error("Unauthorized")]
    Unauthorized,

    #[error("Forbidden")]
    Forbidden,

    #[error("Bad request: {0}")]
    BadRequest(String),

    #[error("Validation error: {0}")]
    Validation(String),

    #[error("Internal error: {0}")]
    Internal(#[from] anyhow::Error),
}

/// Error response that renders a styled template
pub struct ErrorResponse {
    pub status: Status,
    pub title: &'static str,
    pub message: String,
}

impl ErrorResponse {
    pub fn not_found() -> Self {
        Self {
            status: Status::NotFound,
            title: "Page Not Found",
            message: "The page you're looking for doesn't exist or has been moved.".to_string(),
        }
    }

    pub fn forbidden() -> Self {
        Self {
            status: Status::Forbidden,
            title: "Access Denied",
            message: "You don't have permission to access this page.".to_string(),
        }
    }

    pub fn unauthorized() -> Self {
        Self {
            status: Status::Unauthorized,
            title: "Sign In Required",
            message: "Please sign in to access this page.".to_string(),
        }
    }

    pub fn bad_request(msg: impl Into<String>) -> Self {
        Self {
            status: Status::BadRequest,
            title: "Invalid Request",
            message: msg.into(),
        }
    }

    pub fn internal_error() -> Self {
        Self {
            status: Status::InternalServerError,
            title: "Something Went Wrong",
            message: "We're experiencing technical difficulties. Please try again later.".to_string(),
        }
    }
}

impl<'r, 'o: 'r> Responder<'r, 'o> for AppError {
    fn respond_to(self, req: &'r rocket::Request<'_>) -> rocket::response::Result<'o> {
        let error_response = match &self {
            AppError::NotFound => ErrorResponse::not_found(),
            AppError::Unauthorized => ErrorResponse::unauthorized(),
            AppError::Forbidden => ErrorResponse::forbidden(),
            AppError::BadRequest(msg) => ErrorResponse::bad_request(msg.clone()),
            AppError::Validation(msg) => ErrorResponse::bad_request(msg.clone()),
            _ => {
                tracing::error!(error = %self, path = %req.uri(), "Internal server error");
                ErrorResponse::internal_error()
            }
        };

        // Try to render the error template
        let ctx = rocket_dyn_templates::context! {
            status: error_response.status.code,
            title: error_response.title,
            message: error_response.message,
        };
        
        match Template::render("error", ctx).respond_to(req) {
            Ok(template_response) => {
                // Set the correct status code on the template response
                Response::build_from(template_response)
                    .status(error_response.status)
                    .ok()
            }
            Err(_) => {
                // Fallback to plain status code if template rendering fails
                error_response.status.respond_to(req)
            }
        }
    }
}

pub type AppResult<T> = Result<T, AppError>;

// ============================================================================
// Error Catchers - Register these in main.rs
// ============================================================================

use rocket_dyn_templates::context;

#[rocket::catch(400)]
pub fn bad_request_catcher(req: &Request) -> Template {
    tracing::warn!(path = %req.uri(), "400 Bad Request");
    Template::render("error", context! {
        status: 400,
        title: "Invalid Request",
        message: "The request could not be understood by the server.",
    })
}

#[rocket::catch(401)]
pub fn unauthorized_catcher(req: &Request) -> Template {
    tracing::warn!(path = %req.uri(), "401 Unauthorized");
    Template::render("error", context! {
        status: 401,
        title: "Sign In Required",
        message: "Please sign in to access this page.",
    })
}

#[rocket::catch(403)]
pub async fn forbidden_catcher(req: &Request<'_>) -> Template {
    tracing::warn!(path = %req.uri(), "403 Forbidden");

    if let Some(tpl) = volunteer_application_gate(req).await {
        return tpl;
    }

    Template::render("error", context! {
        status: 403u16,
        title: "Access Denied",
        message: "You don't have permission to access this page.",
    })
}

/// For volunteers with an active (non-approved) application that hit a 403,
/// return a helpful gate page instead of the generic "Access Denied" message.
async fn volunteer_application_gate(req: &Request<'_>) -> Option<Template> {
    use sha2::{Digest, Sha256};
    use crate::models::user::{User, UserRole};

    let db = req.rocket().state::<crate::Db>()?;

    let token_value = req.cookies().get_private("sunshine_session")?.value().to_string();
    let token_hash = {
        let mut h = Sha256::new();
        h.update(token_value.as_bytes());
        hex::encode(h.finalize())
    };

    let user: User = sqlx::query_as(
        "SELECT u.id, u.email, u.role, u.display_name, u.is_active, u.theme_preference,
                u.created_at, u.updated_at
         FROM sessions s
         JOIN users u ON u.id = s.user_id
         WHERE s.token_hash = $1 AND s.expires_at > now() AND u.is_active = true",
    )
    .bind(&token_hash)
    .fetch_optional(&**db)
    .await
    .ok()
    .flatten()?;

    if user.role != UserRole::Volunteer {
        return None;
    }

    let row: Option<(String,)> = sqlx::query_as::<_, (String,)>(
        "SELECT status::text FROM volunteer_applications
         WHERE user_id = $1 AND status NOT IN ('approved', 'rejected', 'withdrawn')
         ORDER BY created_at DESC LIMIT 1",
    )
    .bind(user.id)
    .fetch_optional(&**db)
    .await
    .ok()
    .flatten();

    let (status_str,) = row?;

    let (gate, resume_url): (&str, &str) = match status_str.as_str() {
        "started"                                     => ("incomplete", "/apply/step/1"),
        "personal_info_completed"                     => ("incomplete", "/apply/step/2"),
        "questionnaire_completed"                     => ("incomplete", "/apply/step/3"),
        "dog_registration_completed"
        | "dog_registration_skipped"                  => ("incomplete", "/apply/step/4"),
        _                                             => ("pending",    "/apply/status"),
    };

    // Minimal user context matching what the base template expects
    let user_ctx = context! {
        id: user.id,
        email: &user.email,
        display_name: &user.display_name,
        role: "volunteer",
    };

    Some(Template::render("error", context! {
        status: 403u16,
        volunteer_gate: gate,
        resume_url: resume_url,
        user: user_ctx,
        volunteer_application_status: &status_str,
        title: if gate == "incomplete" { "Finish Your Application" } else { "Application Under Review" },
        message: if gate == "incomplete" {
            "This page is only available to approved volunteers. Please complete your application to get started."
        } else {
            "Your application is being reviewed by our team. Full access will be unlocked once you're approved."
        },
    }))
}

#[rocket::catch(404)]
pub fn not_found_catcher(req: &Request) -> Template {
    tracing::warn!(path = %req.uri(), "404 Not Found");
    Template::render("error", context! {
        status: 404,
        title: "Page Not Found",
        message: "The page you're looking for doesn't exist or has been moved.",
    })
}

#[rocket::catch(422)]
pub fn unprocessable_entity_catcher(req: &Request) -> Template {
    tracing::warn!(path = %req.uri(), "422 Unprocessable Entity");
    Template::render("error", context! {
        status: 422,
        title: "Validation Error",
        message: "The request was well-formed but contained semantic errors.",
    })
}

#[rocket::catch(500)]
pub fn internal_error_catcher(req: &Request) -> Template {
    tracing::error!(path = %req.uri(), "500 Internal Server Error");
    Template::render("error", context! {
        status: 500,
        title: "Something Went Wrong",
        message: "We're experiencing technical difficulties. Please try again later.",
    })
}

#[rocket::catch(default)]
pub fn default_catcher(status: Status, req: &Request) -> Template {
    tracing::warn!(status = %status, path = %req.uri(), "Unhandled error status");
    Template::render("error", context! {
        status: status.code,
        title: "Error",
        message: "An unexpected error occurred.",
    })
}

/// Get all error catchers for registration
pub fn catchers() -> Vec<rocket::Catcher> {
    rocket::catchers![
        bad_request_catcher,
        unauthorized_catcher,
        forbidden_catcher,
        not_found_catcher,
        unprocessable_entity_catcher,
        internal_error_catcher,
        default_catcher
    ]
}
