use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Region {
    pub id: Uuid,
    pub name: String,
    pub slug: String,
    pub source: String,
    pub source_code: Option<String>,
    pub display_order: i32,
    pub is_active: bool,
    pub created_at: DateTime<Utc>,
}
