use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Agency {
    pub id: Uuid,
    pub name: String,
    pub slug: String,
    pub agency_type_id: Option<Uuid>,
    pub description: Option<String>,
    pub logo_asset_id: Option<Uuid>,
    pub is_login_active: bool,
    pub can_create_request: bool,
    pub primary_contact_id: Option<Uuid>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::Type, PartialEq)]
#[sqlx(type_name = "contact_visibility_type", rename_all = "snake_case")]
#[serde(rename_all = "snake_case")]
pub enum ContactVisibility {
    Visible,
    Hidden,
    LeadUp,
}

impl Default for ContactVisibility {
    fn default() -> Self {
        Self::Hidden
    }
}

#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Contact {
    pub id: Uuid,
    pub agency_id: Uuid,
    pub user_id: Option<Uuid>,
    pub name: String,
    pub title: Option<String>,
    pub phone: Option<String>,
    pub phone_visibility: ContactVisibility,
    pub email: Option<String>,
    pub email_visibility: ContactVisibility,
    pub is_primary: bool,
    pub is_active: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Site {
    pub id: Uuid,
    pub agency_id: Uuid,
    pub name: String,
    pub address: Option<String>,
    pub region_id: Option<Uuid>,
    pub default_parking_notes: Option<String>,
    pub default_meeting_notes: Option<String>,
    pub is_active: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct AgencyType {
    pub id: Uuid,
    pub name: String,
    pub slug: String,
    pub parent_id: Option<Uuid>,
    pub path: String,
    pub sort_order: i32,
    pub is_active: bool,
}
