use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::Type, PartialEq, Eq, Copy)]
#[sqlx(type_name = "agency_application_status", rename_all = "snake_case")]
#[serde(rename_all = "snake_case")]
pub enum AgencyApplicationStatus {
    Submitted,
    UnderReview,
    Approved,
    Rejected,
    Withdrawn,
}

impl AgencyApplicationStatus {
    pub fn label(&self) -> &'static str {
        match self {
            Self::Submitted => "Submitted",
            Self::UnderReview => "Under Review",
            Self::Approved => "Approved",
            Self::Rejected => "Rejected",
            Self::Withdrawn => "Withdrawn",
        }
    }

    pub fn color_class(&self) -> &'static str {
        match self {
            Self::Submitted => "bg-blue-100 text-blue-700",
            Self::UnderReview => "bg-yellow-100 text-yellow-700",
            Self::Approved => "bg-green-100 text-green-700",
            Self::Rejected => "bg-red-100 text-red-700",
            Self::Withdrawn => "bg-gray-100 text-gray-500",
        }
    }
}

#[derive(Debug, FromRow, Serialize)]
pub struct AgencyApplication {
    pub id: Uuid,
    pub org_name: String,
    pub org_type_id: Uuid,
    pub contact_name: String,
    pub contact_email: String,
    pub contact_phone: String,
    pub address: String,
    pub city: String,
    pub postal_code: String,
    pub region_id: Uuid,
    pub website: Option<String>,
    pub description: Option<String>,
    pub visit_frequency: Option<String>,
    pub preferred_days: Option<String>,
    pub preferred_times: Option<String>,
    pub status: AgencyApplicationStatus,
    pub status_changed_at: DateTime<Utc>,
    pub reviewed_at: Option<DateTime<Utc>>,
    pub reviewed_by: Option<Uuid>,
    pub review_notes: Option<String>,
    pub rejection_reason: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}
