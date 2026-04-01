use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

/// Full row from volunteer_locations.
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct VolunteerLocation {
    pub id: Uuid,
    pub user_id: Uuid,
    pub name: String,
    pub address: String,
    pub is_home: bool,
    pub display_order: i32,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// Lightweight view including lat/lng extracted from geom at query time.
/// Query must include:
///   ST_Y(geom::geometry) AS lat, ST_X(geom::geometry) AS lng
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct VolunteerLocationCard {
    pub id: Uuid,
    pub name: String,
    pub address: String,
    pub is_home: bool,
    pub display_order: i32,
    pub lat: Option<f64>,
    pub lng: Option<f64>,
}
