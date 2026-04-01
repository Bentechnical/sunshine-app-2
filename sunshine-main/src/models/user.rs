use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::Type, PartialEq)]
#[sqlx(type_name = "user_role", rename_all = "snake_case")]
#[serde(rename_all = "snake_case")]
pub enum UserRole {
    Volunteer,
    AgencyContact,
    Admin,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct User {
    pub id: Uuid,
    pub email: String,
    pub role: UserRole,
    pub display_name: Option<String>,
    pub is_active: bool,
    pub theme_preference: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl User {
    #[allow(dead_code)]
    pub fn display(&self) -> &str {
        self.display_name
            .as_deref()
            .unwrap_or(&self.email)
    }
}
