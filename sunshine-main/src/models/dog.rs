use chrono::{DateTime, NaiveDate, NaiveTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::Type, PartialEq)]
#[sqlx(type_name = "dog_size", rename_all = "snake_case")]
#[serde(rename_all = "snake_case")]
pub enum DogSize {
    XSmall,
    Small,
    Medium,
    Large,
    XLarge,
}

impl DogSize {
    #[allow(dead_code)]
    pub fn
 label(&self) -> &'static str {
        match self {
            DogSize::XSmall => "Extra Small",
            DogSize::Small => "Small",
            DogSize::Medium => "Medium",
            DogSize::Large => "Large",
            DogSize::XLarge => "Extra Large",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::Type, PartialEq)]
#[sqlx(type_name = "dog_gender", rename_all = "snake_case")]
#[serde(rename_all = "snake_case")]
pub enum DogGender {
    Male,
    Female,
}

impl DogGender {
    #[allow(dead_code)]
    pub fn
 label(&self) -> &'static str {
        match self {
            DogGender::Male => "Male",
            DogGender::Female => "Female",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Dog {
    pub id: Uuid,
    pub volunteer_id: Uuid,
    pub name: String,
    pub breed_id: Option<Uuid>,
    pub breed_freeform: Option<String>,
    pub size: DogSize,
    pub gender: Option<DogGender>,
    pub date_of_birth: Option<NaiveDate>,
    pub personality_desc: Option<String>,
    pub is_primary: bool,
    pub is_active: bool,
    pub photo_asset_id: Option<Uuid>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl Dog {
    /// Returns the resolved breed label (taxonomy name or freeform fallback).
    #[allow(dead_code)]
    pub fn
 breed_display<'a>(&'a self, breed_name: Option<&'a str>) -> &'a str {
        breed_name
            .or(self.breed_freeform.as_deref())
            .unwrap_or("Unknown breed")
    }
}

// ============================================================
// Dog Application Types
// ============================================================

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::Type, PartialEq)]
#[sqlx(type_name = "dog_application_status", rename_all = "snake_case")]
#[serde(rename_all = "snake_case")]
pub enum DogApplicationStatus {
    Draft,
    Submitted,
    UnderReview,
    PendingAssessment,
    AssessmentScheduled,
    AssessmentCompleted,
    Approved,
    Rejected,
    Withdrawn,
}

impl std::fmt::Display for DogApplicationStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.label())
    }
}

impl DogApplicationStatus {
    #[allow(dead_code)]
    pub fn
 label(&self) -> &'static str {
        match self {
            Self::Draft => "Draft",
            Self::Submitted => "Submitted - Pending Review",
            Self::UnderReview => "Under Review",
            Self::PendingAssessment => "Pending Assessment",
            Self::AssessmentScheduled => "Assessment Scheduled",
            Self::AssessmentCompleted => "Assessment Completed",
            Self::Approved => "Approved",
            Self::Rejected => "Rejected",
            Self::Withdrawn => "Withdrawn",
        }
    }

    #[allow(dead_code)]
    pub fn
 color_class(&self) -> &'static str {
        match self {
            Self::Draft => "bg-gray-100 text-gray-700",
            Self::Submitted => "bg-blue-100 text-blue-700",
            Self::UnderReview => "bg-yellow-100 text-yellow-700",
            Self::PendingAssessment => "bg-orange-100 text-orange-700",
            Self::AssessmentScheduled => "bg-purple-100 text-purple-700",
            Self::AssessmentCompleted => "bg-indigo-100 text-indigo-700",
            Self::Approved => "bg-green-100 text-green-700",
            Self::Rejected => "bg-red-100 text-red-700",
            Self::Withdrawn => "bg-gray-100 text-gray-500",
        }
    }

    #[allow(dead_code)]
    pub fn is_pending(&self) -> bool {
        matches!(self, Self::Submitted | Self::UnderReview | Self::PendingAssessment | Self::AssessmentScheduled | Self::AssessmentCompleted)
    }


    #[allow(dead_code)]
    pub fn
 is_approved(&self) -> bool {
        matches!(self, Self::Approved)
    }

    #[allow(dead_code)]
    pub fn
 is_rejected(&self) -> bool {
        matches!(self, Self::Rejected)
    }
}

#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct DogApplication {
    pub id: Uuid,
    pub volunteer_id: Uuid,
    pub dog_id: Option<Uuid>,
    pub dog_name: String,
    pub breed_id: Option<Uuid>,
    pub breed_freeform: Option<String>,
    pub size: DogSize,
    pub gender: Option<DogGender>,
    pub date_of_birth: Option<NaiveDate>,
    pub personality_desc: Option<String>,
    pub status: DogApplicationStatus,
    pub status_changed_at: DateTime<Utc>,
    pub status_changed_by: Option<Uuid>,
    pub assessment_date: Option<NaiveDate>,
    pub assessment_time: Option<NaiveTime>,
    pub assessment_location: Option<String>,
    pub assessment_notes: Option<String>,
    pub reviewed_at: Option<DateTime<Utc>>,
    pub reviewed_by: Option<Uuid>,
    pub response_template_id: Option<Uuid>,
    pub response_reason: Option<String>,
    pub response_notes: Option<String>,
    pub submitted_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// Response template for admin responses
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct DogApplicationResponseTemplate {
    pub id: Uuid,
    pub category: String,
    pub label: String,
    pub body: String,
    pub is_active: bool,
    pub sort_order: i32,
    pub created_at: DateTime<Utc>,
}

/// Enriched application view for admin review
#[derive(Debug, Serialize, FromRow)]
pub struct DogApplicationDetail {
    // Application fields
    pub id: Uuid,
    pub dog_name: String,
    pub breed_id: Option<Uuid>,
    pub breed_freeform: Option<String>,
    pub size: String,
    pub gender: Option<DogGender>,
    pub date_of_birth: Option<NaiveDate>,
    pub personality_desc: Option<String>,
    pub status: DogApplicationStatus,
    pub status_changed_at: DateTime<Utc>,
    pub assessment_date: Option<NaiveDate>,
    pub assessment_time: Option<NaiveTime>,
    pub assessment_location: Option<String>,
    pub assessment_notes: Option<String>,
    pub reviewed_at: Option<DateTime<Utc>>,
    pub response_reason: Option<String>,
    pub response_notes: Option<String>,
    pub submitted_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    // Volunteer info
    pub volunteer_id: Uuid,
    pub volunteer_email: String,
    pub volunteer_names: String,
    pub volunteer_phone: Option<String>,
    // Reviewer info
    pub reviewer_name: Option<String>,
    // Breed info
    pub breed_name: Option<String>,
    pub selected_slot_id: Option<Uuid>,
}

/// Summary for listing applications
#[derive(Debug, Serialize, FromRow)]
pub struct DogApplicationListItem {
    pub id: Uuid,
    pub dog_name: String,
    pub status: DogApplicationStatus,
    pub submitted_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    // Volunteer
    pub volunteer_id: Uuid,
    pub volunteer_names: String,
    pub volunteer_email: String,
    // Breed
    pub breed_name: Option<String>,
}

#[derive(Debug, Serialize, FromRow)]
pub struct AssessmentSession {
    pub id: Uuid,
    pub date: NaiveDate,
    pub location: String,
    pub notes: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

