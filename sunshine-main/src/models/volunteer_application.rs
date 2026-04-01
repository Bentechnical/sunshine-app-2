use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

// ============================================================
// Volunteer Application Status
// ============================================================

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::Type, PartialEq, Eq, Copy)]
#[sqlx(type_name = "volunteer_application_status", rename_all = "snake_case")]
#[serde(rename_all = "snake_case")]
pub enum VolunteerApplicationStatus {
    Started,
    PersonalInfoCompleted,
    QuestionnaireCompleted,
    DogRegistrationCompleted,
    DogRegistrationSkipped,
    Submitted,
    UnderReview,
    PendingVsc,
    PendingBackgroundCheck,
    PendingAssessment,
    AssessmentScheduled,
    Approved,
    Rejected,
    Withdrawn,
}

impl VolunteerApplicationStatus {
    pub fn redirect_url(&self) -> String {
        match self {
            Self::Started => "/apply/step/1".to_string(),
            Self::PersonalInfoCompleted => "/apply/step/2".to_string(),
            Self::QuestionnaireCompleted => "/apply/step/3".to_string(),
            Self::DogRegistrationCompleted | Self::DogRegistrationSkipped => "/apply/step/4".to_string(),
            Self::Submitted => "/apply/submitted".to_string(),
            _ => "/apply/status".to_string(),
        }
    }

    pub fn is_terminal(&self) -> bool {
        matches!(self, Self::Approved | Self::Rejected | Self::Withdrawn)
    }

    pub fn label(&self) -> &'static str {
        match self {
            Self::Started => "Started",
            Self::PersonalInfoCompleted => "Personal Info Done",
            Self::QuestionnaireCompleted => "Questionnaire Done",
            Self::DogRegistrationCompleted => "Dog Registration Done",
            Self::DogRegistrationSkipped => "No Dog Registered",
            Self::Submitted => "Submitted",
            Self::UnderReview => "Under Review",
            Self::PendingVsc => "Pending VSC",
            Self::PendingBackgroundCheck => "Pending Background Check",
            Self::PendingAssessment => "Pending Assessment",
            Self::AssessmentScheduled => "Assessment Scheduled",
            Self::Approved => "Approved",
            Self::Rejected => "Rejected",
            Self::Withdrawn => "Withdrawn",
        }
    }
}

impl std::fmt::Display for VolunteerApplicationStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.label())
    }
}

// ============================================================
// Data Models
// ============================================================

#[derive(Debug, FromRow, Serialize)]
pub struct VolunteerApplication {
    pub id: Uuid,
    pub user_id: Uuid,
    pub invite_link_id: Option<Uuid>,
    pub full_name: Option<String>,
    pub phone: Option<String>,
    pub city: Option<String>,
    pub postal_code: Option<String>,
    pub motivation: Option<String>,
    pub experience: Option<String>,
    pub availability: Option<String>,
    pub has_dog: Option<bool>,
    pub dog_breed_freeform: Option<String>,
    pub agreed_code_of_conduct: bool,
    pub agreed_photo_release: bool,
    pub agreed_liability_waiver: bool,
    pub agreements_signed_at: Option<DateTime<Utc>>,
    pub status: VolunteerApplicationStatus,
    pub status_changed_at: DateTime<Utc>,
    pub status_changed_by: Option<Uuid>,
    pub reviewed_at: Option<DateTime<Utc>>,
    pub reviewed_by: Option<Uuid>,
    pub review_notes: Option<String>,
    pub rejection_reason: Option<String>,
    pub vsc_waived: bool,
    pub background_check_waived: bool,
    pub dog_health_check_waived: bool,
    pub vsc_waived_visible: bool,
    pub background_waived_visible: bool,
    pub dog_health_waived_visible: bool,
    pub selected_slot_id: Option<Uuid>,
    pub submitted_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, FromRow, Serialize)]
pub struct VolunteerApplicationListItem {
    pub id: Uuid,
    pub user_id: Uuid,
    pub applicant_email: String,
    pub full_name: Option<String>,
    pub status: VolunteerApplicationStatus,
    pub submitted_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub invite_link_label: Option<String>,
    pub source_tag: Option<String>,
}

#[derive(Debug, FromRow, Serialize)]
pub struct VolunteerApplicationDetail {
    pub id: Uuid,
    pub user_id: Uuid,
    pub applicant_email: String,
    pub full_name: Option<String>,
    pub phone: Option<String>,
    pub city: Option<String>,
    pub postal_code: Option<String>,
    pub status: VolunteerApplicationStatus,
    pub motivation: Option<String>,
    pub experience: Option<String>,
    pub availability: Option<String>,
    pub has_dog: Option<bool>,
    pub dog_breed_freeform: Option<String>,
    pub agreed_code_of_conduct: bool,
    pub agreed_photo_release: bool,
    pub agreed_liability_waiver: bool,
    pub agreements_signed_at: Option<DateTime<Utc>>,
    pub invite_link_label: Option<String>,
    pub source_tag: Option<String>,
    pub vsc_waived: bool,
    pub background_check_waived: bool,
    pub dog_health_check_waived: bool,
    pub vsc_waived_visible: bool,
    pub background_waived_visible: bool,
    pub dog_health_waived_visible: bool,
    pub review_notes: Option<String>,
    pub rejection_reason: Option<String>,
    pub reviewer_name: Option<String>,
    pub submitted_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, FromRow, Serialize)]
pub struct VolunteerInviteLink {
    pub id: Uuid,
    pub slug: Option<String>,
    pub label: String,
    pub source_tag: Option<String>,
    pub message: Option<String>,
    pub auto_approve_vsc: bool,
    pub auto_approve_background: bool,
    pub auto_approve_dog_health: bool,
    pub vsc_flag_visible: bool,
    pub background_flag_visible: bool,
    pub dog_health_flag_visible: bool,
    pub expires_at: Option<DateTime<Utc>>,
    pub max_uses: Option<i32>,
    pub use_count: i32,
    pub is_active: bool,
    pub created_by: Uuid,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, FromRow, Serialize)]
pub struct InviteLinkListItem {
    pub id: Uuid,
    pub label: String,
    pub slug: Option<String>,
    pub use_count: i32,
    pub is_active: bool,
    pub application_count: i64,
}
