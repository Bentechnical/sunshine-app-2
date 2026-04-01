use chrono::{DateTime, NaiveDate, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct VolunteerProfile {
    pub user_id: Uuid,
    pub volunteer_names: String,
    pub bio: Option<String>,
    pub joined_at: NaiveDate,
    pub has_vulnerable_sector_check: bool,
    pub has_police_check: bool,
    pub profile_pic_asset_id: Option<Uuid>,
    pub watched_agency_ids: Vec<Uuid>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[allow(dead_code)]
/// Joined view used in shift listing hover cards.
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct VolunteerCard {
    pub user_id: Uuid,
    pub volunteer_names: String,
    pub profile_pic_asset_id: Option<Uuid>,
    // Primary dog fields (joined)
    pub dog_name: Option<String>,
    pub dog_breed_name: Option<String>,
    pub dog_size: Option<String>,
}

/// Career statistics for a volunteer.
#[derive(Debug, Serialize)]
pub struct VolunteerStats {
    pub total_shifts: i64,
    pub total_clients_served: i64,
    pub first_shift_date: Option<DateTime<Utc>>,
}

// ============================================================
// Event Log Types
// ============================================================

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::Type, PartialEq)]
#[sqlx(type_name = "volunteer_event_type", rename_all = "snake_case")]
#[serde(rename_all = "snake_case")]
pub enum VolunteerEventType {
    ProfileCreated,
    ProfileUpdated,
    ProfileDeactivated,
    ProfileReactivated,
    DogAdded,
    DogUpdated,
    DogDeactivated,
    DogReactivated,
    DogRetired,
    ShiftJoined,
    ShiftConfirmed,
    ShiftCancelled,
    WaitlistJoined,
    WaitlistPromoted,
    WaitlistDeclined,
    ContactedByAdmin,
    FeedbackSubmitted,
    FeedbackReceived,
    NoteAdded,
    NoteEdited,
    NoteDeleted,
    ShiftInvited,
    ShiftInviteAccepted,
    ShiftInviteDeclined,
    ShiftCreated,
    ShiftUpdated,
    ShiftPublished,
    ShiftArchived,
    ContactAdded,
    ShiftChangeRequested,
    ShiftChangeApproved,
    ShiftChangeRejected,
    // Dog Application Events
    DogApplicationSubmitted,
    DogApplicationUnderReview,
    PendingAssessment,
    DogApplicationAssessmentScheduled,
    DogApplicationAssessmentCompleted,
    AssessmentNoShow,
    DogApplicationApproved,
    DogApplicationRejected,
    DogApplicationWithdrawn,
    // Volunteer Application Events
    VolApplicationStarted,
    VolApplicationSubmitted,
    VolApplicationUnderReview,
    VolApplicationPendingVsc,
    VolApplicationPendingBackground,
    VolApplicationPendingAssessment,
    VolApplicationAssessmentScheduled,
    VolApplicationApproved,
    VolApplicationRejected,
    VolApplicationWithdrawn,
    InviteLinkCreated,
}

impl VolunteerEventType {
    #[allow(dead_code)]
    pub fn
 label(&self) -> &'static str {
        match self {
            Self::ProfileCreated => "Profile Created",
            Self::ProfileUpdated => "Profile Updated",
            Self::ProfileDeactivated => "Account Deactivated",
            Self::ProfileReactivated => "Account Reactivated",
            Self::DogAdded => "Dog Added",
            Self::DogUpdated => "Dog Updated",
            Self::DogDeactivated => "Dog Deactivated",
            Self::DogReactivated => "Dog Reactivated",
            Self::DogRetired => "Dog Retired",
            Self::ShiftJoined => "Shift Joined",

            Self::ShiftConfirmed => "Shift Confirmed",
            Self::ShiftCancelled => "Cancelled Shift",
            Self::WaitlistJoined => "Joined Waitlist",
            Self::WaitlistPromoted => "Promoted from Waitlist",
            Self::WaitlistDeclined => "Declined Promotion",
            Self::ContactedByAdmin => "Contacted by Admin",
            Self::FeedbackSubmitted => "Feedback Submitted",
            Self::FeedbackReceived => "Feedback Received",
            Self::NoteAdded => "Note Added",
            Self::NoteEdited => "Note Edited",
            Self::NoteDeleted => "Note Deleted",
            Self::ShiftInvited => "Invited to Shift",
            Self::ShiftInviteAccepted => "Invite Accepted",
            Self::ShiftInviteDeclined => "Invite Declined",
            Self::ShiftCreated => "Shift Created",
            Self::ShiftUpdated => "Shift Updated",
            Self::ShiftPublished => "Shift Published",
            Self::ShiftArchived => "Shift Archived",
            Self::ContactAdded => "Agency Contact Added",
            Self::ShiftChangeRequested => "Change Requested",
            Self::ShiftChangeApproved => "Change Approved",
            Self::ShiftChangeRejected => "Change Rejected",
            // Dog Application Events
            Self::DogApplicationSubmitted => "Dog Application Submitted",
            Self::DogApplicationUnderReview => "Dog Application Under Review",
            Self::PendingAssessment => "Approved for Assessment",
            Self::DogApplicationAssessmentScheduled => "Dog Assessment Scheduled",
            Self::DogApplicationAssessmentCompleted => "Dog Assessment Completed",
            Self::AssessmentNoShow => "Assessment No Show",
            Self::DogApplicationApproved => "Dog Application Approved",
            Self::DogApplicationRejected => "Dog Application Rejected",
            Self::DogApplicationWithdrawn => "Dog Application Withdrawn",
            // Volunteer Application Events
            Self::VolApplicationStarted => "Application Started",
            Self::VolApplicationSubmitted => "Application Submitted",
            Self::VolApplicationUnderReview => "Application Under Review",
            Self::VolApplicationPendingVsc => "Application Pending VSC",
            Self::VolApplicationPendingBackground => "Application Pending Background Check",
            Self::VolApplicationPendingAssessment => "Application Pending Assessment",
            Self::VolApplicationAssessmentScheduled => "Application Assessment Scheduled",
            Self::VolApplicationApproved => "Application Approved",
            Self::VolApplicationRejected => "Application Rejected",
            Self::VolApplicationWithdrawn => "Application Withdrawn",
            Self::InviteLinkCreated => "Invite Link Created",
        }
    }

    #[allow(dead_code)]
    pub fn
 icon(&self) -> &'static str {
        match self {
            Self::ProfileCreated | Self::ProfileUpdated => "👤",
            Self::ProfileDeactivated => "🚫",
            Self::ProfileReactivated => "✅",
            Self::DogAdded | Self::DogUpdated => "🐕",
            Self::DogDeactivated => "🐕‍🦺",
            Self::DogReactivated => "🦮",
            Self::DogRetired => "🎖️",
            Self::ShiftJoined | Self::ShiftConfirmed => "📅",
            Self::ShiftCancelled => "❌",
            Self::WaitlistJoined => "⏳",
            Self::WaitlistPromoted => "🎉",
            Self::WaitlistDeclined => "👎",
            Self::FeedbackSubmitted => "📝",
            Self::FeedbackReceived => "💬",
            Self::ContactedByAdmin => "📧",
            Self::NoteAdded | Self::NoteEdited => "📌",
            Self::NoteDeleted => "🗑️",
            Self::ShiftInvited => "✉️",
            Self::ShiftInviteAccepted => "✅",
            Self::ShiftInviteDeclined => "❌",
            Self::ShiftCreated => "🆕",
            Self::ShiftUpdated => "📝",
            Self::ShiftPublished => "📢",
            Self::ShiftArchived => "📥",
            Self::ContactAdded => "👤",
            Self::ShiftChangeRequested => "🔄",
            Self::ShiftChangeApproved => "✅",
            Self::ShiftChangeRejected => "❌",
            // Dog Application Events
            Self::DogApplicationSubmitted => "📨",
            Self::DogApplicationUnderReview => "🔍",
            Self::PendingAssessment => "⏳",
            Self::DogApplicationAssessmentScheduled => "📅",
            Self::DogApplicationAssessmentCompleted => "✓",
            Self::AssessmentNoShow => "❓",
            Self::DogApplicationApproved => "🎉",
            Self::DogApplicationRejected => "❌",
            Self::DogApplicationWithdrawn => "🚫",
            // Volunteer Application Events
            Self::VolApplicationStarted => "📋",
            Self::VolApplicationSubmitted => "📨",
            Self::VolApplicationUnderReview => "🔍",
            Self::VolApplicationPendingVsc => "🔒",
            Self::VolApplicationPendingBackground => "🔐",
            Self::VolApplicationPendingAssessment => "⏳",
            Self::VolApplicationAssessmentScheduled => "📅",
            Self::VolApplicationApproved => "🎉",
            Self::VolApplicationRejected => "❌",
            Self::VolApplicationWithdrawn => "🚫",
            Self::InviteLinkCreated => "🔗",
        }
    }

    #[allow(dead_code)]
    pub fn
 color_class(&self) -> &'static str {
        match self {
            Self::ProfileCreated => "bg-blue-100 text-blue-700 border-blue-200",
            Self::ProfileUpdated => "bg-gray-100 text-gray-700 border-gray-200",
            Self::ProfileDeactivated => "bg-red-100 text-red-700 border-red-200",
            Self::ProfileReactivated => "bg-green-100 text-green-700 border-green-200",
            Self::DogAdded => "bg-amber-100 text-amber-700 border-amber-200",
            Self::DogUpdated => "bg-amber-50 text-amber-600 border-amber-100",
            Self::DogDeactivated => "bg-orange-100 text-orange-700 border-orange-200",
            Self::DogReactivated => "bg-lime-100 text-lime-700 border-lime-200",
            Self::DogRetired => "bg-orange-100 text-orange-700 border-orange-200",
            Self::ShiftJoined | Self::ShiftConfirmed => "bg-indigo-100 text-indigo-700 border-indigo-200",
            Self::ShiftCancelled => "bg-rose-100 text-rose-700 border-rose-200",
            Self::WaitlistJoined => "bg-yellow-100 text-yellow-700 border-yellow-200",
            Self::WaitlistPromoted => "bg-emerald-100 text-emerald-700 border-emerald-200",
            Self::WaitlistDeclined => "bg-stone-100 text-stone-700 border-stone-200",
            Self::FeedbackSubmitted => "bg-purple-100 text-purple-700 border-purple-200",
            Self::FeedbackReceived => "bg-pink-100 text-pink-700 border-pink-200",
            Self::ContactedByAdmin => "bg-cyan-100 text-cyan-700 border-cyan-200",
            Self::NoteEdited => "bg-yellow-100 text-yellow-700 border-yellow-200",
            Self::NoteDeleted => "bg-red-100 text-red-700 border-red-200",
            Self::NoteAdded => "bg-teal-100 text-teal-700 border-teal-200",
            Self::ShiftInvited => "bg-blue-100 text-blue-700 border-blue-200",
            Self::ShiftInviteAccepted => "bg-green-100 text-green-700 border-green-200",
            Self::ShiftInviteDeclined => "bg-rose-100 text-rose-700 border-rose-200",
            Self::ShiftCreated => "bg-indigo-100 text-indigo-700 border-indigo-200",
            Self::ShiftUpdated => "bg-amber-100 text-amber-700 border-amber-200",
            Self::ShiftPublished => "bg-green-100 text-green-700 border-green-200",
            Self::ShiftArchived => "bg-gray-100 text-gray-700 border-gray-200",
            Self::ContactAdded => "bg-blue-100 text-blue-700 border-blue-200",
            Self::ShiftChangeRequested => "bg-amber-100 text-amber-700 border-amber-200",
            Self::ShiftChangeApproved => "bg-green-100 text-green-700 border-green-200",
            Self::ShiftChangeRejected => "bg-rose-100 text-rose-700 border-rose-200",
            // Dog Application Events
            Self::DogApplicationSubmitted => "bg-blue-100 text-blue-700 border-blue-200",
            Self::DogApplicationUnderReview => "bg-yellow-100 text-yellow-700 border-yellow-200",
            Self::PendingAssessment => "bg-orange-100 text-orange-700 border-orange-200",
            Self::DogApplicationAssessmentScheduled => "bg-purple-100 text-purple-700 border-purple-200",
            Self::DogApplicationAssessmentCompleted => "bg-indigo-100 text-indigo-700 border-indigo-200",
            Self::AssessmentNoShow => "bg-amber-50 text-amber-700 border-amber-200",
            Self::DogApplicationApproved => "bg-green-100 text-green-700 border-green-200",
            Self::DogApplicationRejected => "bg-red-100 text-red-700 border-red-200",
            Self::DogApplicationWithdrawn => "bg-gray-100 text-gray-500 border-gray-200",
            // Volunteer Application Events
            Self::VolApplicationStarted => "bg-gray-100 text-gray-700 border-gray-200",
            Self::VolApplicationSubmitted => "bg-blue-100 text-blue-700 border-blue-200",
            Self::VolApplicationUnderReview => "bg-yellow-100 text-yellow-700 border-yellow-200",
            Self::VolApplicationPendingVsc | Self::VolApplicationPendingBackground => "bg-orange-100 text-orange-700 border-orange-200",
            Self::VolApplicationPendingAssessment => "bg-amber-100 text-amber-700 border-amber-200",
            Self::VolApplicationAssessmentScheduled => "bg-purple-100 text-purple-700 border-purple-200",
            Self::VolApplicationApproved => "bg-green-100 text-green-700 border-green-200",
            Self::VolApplicationRejected => "bg-red-100 text-red-700 border-red-200",
            Self::VolApplicationWithdrawn => "bg-gray-100 text-gray-500 border-gray-200",
            Self::InviteLinkCreated => "bg-cyan-100 text-cyan-700 border-cyan-200",
        }
    }
}

#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct VolunteerEvent {
    pub id: Uuid,
    pub user_id: Uuid,
    pub event_type: VolunteerEventType,
    pub shift_id: Option<Uuid>,
    pub dog_id: Option<Uuid>,
    pub related_user_id: Option<Uuid>,
    pub metadata: serde_json::Value,
    pub created_by: Option<Uuid>,
    pub created_at: DateTime<Utc>,
}

/// Enriched event with joined data for display
#[derive(Debug, Serialize, FromRow)]
pub struct VolunteerEventDetail {
    // Event fields
    pub id: Uuid,
    pub event_type: String,
    pub metadata: serde_json::Value,
    pub created_at: DateTime<Utc>,
    pub shift_id: Option<Uuid>,
    pub dog_id: Option<Uuid>,
    // Creator info
    pub created_by_name: Option<String>,
    // Related shift info
    pub shift_title: Option<String>,
    pub shift_start_at: Option<DateTime<Utc>>,
    pub agency_name: Option<String>,
    pub site_name: Option<String>,
    // Related dog info  
    pub dog_name: Option<String>,
    // For feedback_received events
    pub from_volunteer_name: Option<String>,
}

/// Comprehensive volunteer profile for admin view
#[derive(Debug, Serialize, FromRow)]
pub struct VolunteerDetail {
    // User fields
    pub user_id: Uuid,
    pub email: String,
    pub display_name: Option<String>,
    pub is_active: bool,
    pub created_at: DateTime<Utc>,
    // Profile fields
    pub volunteer_names: String,
    pub bio: Option<String>,
    pub joined_at: NaiveDate,
    pub has_vulnerable_sector_check: bool,
    pub has_police_check: bool,
    pub profile_pic_asset_id: Option<Uuid>,
    // Stats
    pub total_shifts: i64,
    pub total_clients_served: i64,
    pub upcoming_shifts: i64,
}

/// Volunteer list row for admin listing
#[derive(Debug, Serialize, FromRow)]
pub struct VolunteerListRow {
    pub id: Uuid,
    pub email: String,
    pub display_name: Option<String>,
    pub volunteer_names: String,
    pub is_active: bool,
    pub has_police_check: bool,
    pub has_vulnerable_sector_check: bool,
    pub primary_dog_name: Option<String>,
    pub matched_dog_names: Option<String>,
    pub total_shifts: i64,
    pub last_active: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
}



/// Dog detail for admin/volunteer views
#[derive(Debug, Serialize, FromRow)]
pub struct DogDetail {
    pub id: Uuid,
    pub name: String,
    pub breed_id: Option<Uuid>,
    pub breed_name: Option<String>,
    pub breed_freeform: Option<String>,
    pub size: String,
    pub gender: Option<crate::models::dog::DogGender>,
    pub date_of_birth: Option<NaiveDate>,
    pub personality_desc: Option<String>,
    pub is_primary: bool,
    pub is_active: bool,
    pub photo_asset_id: Option<Uuid>,
    pub photo_url: Option<String>,
    pub photo_thumb_url: Option<String>,
    pub photo_crop_x: Option<i32>,
    pub photo_crop_y: Option<i32>,
    pub photo_crop_radius: Option<i32>,
    pub created_at: DateTime<Utc>,
}
