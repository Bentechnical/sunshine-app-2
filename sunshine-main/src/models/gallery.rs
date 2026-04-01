use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

use crate::errors::AppResult;
use crate::Db;

// ─── Enums ────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, sqlx::Type)]
#[sqlx(type_name = "asset_visibility", rename_all = "snake_case")]
pub enum AssetVisibility {
    Private,
    Agency,
    Curated,
    Hidden,
    Unverified,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, sqlx::Type)]
#[sqlx(type_name = "storage_backend", rename_all = "snake_case")]
pub enum StorageBackendType {
    Local,
    S3,
}

// ─── Core structs ─────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Asset {
    pub id: Uuid,
    pub uploader_id: Uuid,
    pub shift_id: Option<Uuid>,
    pub storage_key: String,
    pub storage_backend: StorageBackendType,
    pub mime_type: String,
    pub size_bytes: i64,
    pub visibility: AssetVisibility,
    pub caption: Option<String>,
    pub thumb_key: Option<String>,
    pub width_px: Option<i32>,
    pub height_px: Option<i32>,
    pub promoted_at: Option<DateTime<Utc>>,
    pub promoted_by: Option<Uuid>,
    pub uploaded_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TagInfo {
    pub id: Uuid,
    pub volunteer_name: Option<String>,
    pub dog_name: Option<String>,
}

/// Asset enriched with star count, viewer's star status, and tags.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GalleryItem {
    pub asset: Asset,
    pub star_count: i64,
    pub my_star: bool,
    pub tags: Vec<TagInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgencyGalleryItem {
    pub item: GalleryItem,
    pub shift_title: Option<String>,
    pub shift_start_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgencyGalleryGroup {
    pub shift_id: Option<Uuid>,
    pub shift_title: String,
    pub shift_start_at: Option<DateTime<Utc>>,
    pub items: Vec<GalleryItem>,
}

// ─── Filter for gallery listing ───────────────────────────────────────────────

#[derive(Debug, Default, Deserialize)]
pub struct GalleryFilter {
    pub filter: Option<String>,  // "all" | "admin_starred" | "user_starred"
    #[allow(dead_code)]
    pub agency_id: Option<Uuid>,
    pub page: Option<i64>,
}

// ─── Query helpers ────────────────────────────────────────────────────────────

const PAGE_SIZE: i64 = 24;

fn offset(page: Option<i64>) -> i64 {
    (page.unwrap_or(1).max(1) - 1) * PAGE_SIZE
}

/// Public/curated photostream for admin gallery.
pub async fn get_gallery_items(
    db: &Db,
    filter: &GalleryFilter,
    viewer_id: Uuid,
) -> AppResult<Vec<AgencyGalleryItem>> {
    let visibility_filter = match filter.filter.as_deref().unwrap_or("all") {
        "admin_starred" => "a.promoted_at IS NOT NULL AND a.visibility != 'unverified'",
        "user_starred"  => "EXISTS (SELECT 1 FROM asset_stars s WHERE s.asset_id = a.id) AND a.visibility != 'unverified'",
        "unverified"    => "a.visibility = 'unverified'",
        _               => "a.visibility NOT IN ('hidden', 'unverified')",
    };

    let sql = format!(
        r#"
        SELECT
            a.*,
            COALESCE(sc.cnt, 0)            AS star_count,
            (ms.asset_id IS NOT NULL)       AS my_star,
            sh.title AS shift_title,
            sh.start_at AS shift_start_at
        FROM assets a
        LEFT JOIN shifts sh ON sh.id = a.shift_id
        LEFT JOIN (
            SELECT asset_id, COUNT(*) AS cnt FROM asset_stars GROUP BY asset_id
        ) sc ON sc.asset_id = a.id
        LEFT JOIN asset_stars ms ON ms.asset_id = a.id AND ms.user_id = $1
        WHERE {visibility_filter}
        ORDER BY a.uploaded_at DESC
        LIMIT $2 OFFSET $3
        "#
    );

    let rows: Vec<AssetStarRow> = sqlx::query_as(&sql)
        .bind(viewer_id)
        .bind(PAGE_SIZE)
        .bind(offset(filter.page))
        .fetch_all(&**db)
        .await?;

    // For admin/public gallery, we'll assume is_admin based on whether we see unverified
    let is_admin = filter.filter.as_deref() == Some("unverified");
    build_gallery_items(db, rows, viewer_id, is_admin).await
}

/// A volunteer's own uploads plus photos they're tagged in.
pub async fn get_user_gallery(
    db: &Db,
    user_id: Uuid,
    filter: Option<&str>,
    page: Option<i64>,
) -> AppResult<Vec<GalleryItem>> {
    let extra_filter = match filter {
        Some("stars")  => "AND ms.asset_id IS NOT NULL",
        Some("tagged") => "AND at.volunteer_id = $1",
        _              => "",
    };

    let sql = format!(
        r#"
        SELECT DISTINCT ON (a.uploaded_at, a.id)
            a.*,
            COALESCE(sc.cnt, 0)       AS star_count,
            (ms.asset_id IS NOT NULL) AS my_star
        FROM assets a
        LEFT JOIN (
            SELECT asset_id, COUNT(*) AS cnt FROM asset_stars GROUP BY asset_id
        ) sc ON sc.asset_id = a.id
        LEFT JOIN asset_stars ms ON ms.asset_id = a.id AND ms.user_id = $1
        LEFT JOIN asset_tags   at ON at.asset_id = a.id AND at.volunteer_id = $1
        WHERE (a.uploader_id = $1 OR at.volunteer_id = $1)
          AND a.visibility != 'unverified'
          {extra_filter}
        ORDER BY a.uploaded_at DESC, a.id
        LIMIT $2 OFFSET $3
        "#
    );

    let rows: Vec<AssetStarRow> = sqlx::query_as(&sql)
        .bind(user_id)
        .bind(PAGE_SIZE)
        .bind(offset(page))
        .fetch_all(&**db)
        .await?;

    let items = build_gallery_items(db, rows, user_id, false).await?;
    Ok(items.into_iter().map(|i| i.item).collect())
}

/// All curated assets belonging to shifts at a given agency, grouped by shift.
pub async fn get_agency_gallery(
    db: &Db,
    agency_id: Uuid,
    viewer_id: Uuid,
) -> AppResult<Vec<AgencyGalleryGroup>> {
    let rows: Vec<AssetStarRow> = sqlx::query_as(
        r#"
        SELECT
            a.*,
            COALESCE(sc.cnt, 0)       AS star_count,
            (ms.asset_id IS NOT NULL) AS my_star,
            sh.title AS shift_title,
            sh.start_at AS shift_start_at
        FROM assets a
        JOIN shifts sh ON sh.id = a.shift_id
        LEFT JOIN (
            SELECT asset_id, COUNT(*) AS cnt FROM asset_stars GROUP BY asset_id
        ) sc ON sc.asset_id = a.id
        LEFT JOIN asset_stars ms ON ms.asset_id = a.id AND ms.user_id = $2
        WHERE sh.agency_id = $1
          AND a.visibility NOT IN ('hidden', 'unverified')
        ORDER BY sh.start_at DESC, a.uploaded_at DESC
        LIMIT $3
        "#,
    )
    .bind(agency_id)
    .bind(viewer_id)
    .bind(PAGE_SIZE * 5) // generous limit for agency view
    .fetch_all(&**db)
    .await?;

    let items = build_gallery_items(db, rows, viewer_id, false).await?;

    // Group items by shift_id
    let mut groups: Vec<AgencyGalleryGroup> = Vec::new();
    for item in items {
        let shift_id = item.item.asset.shift_id;
        let shift_title = item.shift_title.clone().unwrap_or_else(|| "General".to_string());
        let shift_start_at = item.shift_start_at;

        if let Some(group) = groups.iter_mut().find(|g| g.shift_id == shift_id) {
            group.items.push(item.item);
        } else {
            groups.push(AgencyGalleryGroup {
                shift_id,
                shift_title,
                shift_start_at,
                items: vec![item.item],
            });
        }
    }

    Ok(groups)
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/// Flat DB row — asset columns + star_count + my_star + shift info.
#[derive(Debug, FromRow)]
struct AssetStarRow {
    pub id: Uuid,
    pub uploader_id: Uuid,
    pub shift_id: Option<Uuid>,
    pub storage_key: String,
    pub storage_backend: StorageBackendType,
    pub mime_type: String,
    pub size_bytes: i64,
    pub visibility: AssetVisibility,
    pub caption: Option<String>,
    pub thumb_key: Option<String>,
    pub width_px: Option<i32>,
    pub height_px: Option<i32>,
    pub promoted_at: Option<DateTime<Utc>>,
    pub promoted_by: Option<Uuid>,
    pub uploaded_at: DateTime<Utc>,
    pub star_count: i64,
    pub my_star: bool,
    pub shift_title: Option<String>,
    pub shift_start_at: Option<DateTime<Utc>>,
}

impl From<AssetStarRow> for Asset {
    fn from(r: AssetStarRow) -> Self {
        Asset {
            id: r.id,
            uploader_id: r.uploader_id,
            shift_id: r.shift_id,
            storage_key: r.storage_key,
            storage_backend: r.storage_backend,
            mime_type: r.mime_type,
            size_bytes: r.size_bytes,
            visibility: r.visibility,
            caption: r.caption,
            thumb_key: r.thumb_key,
            width_px: r.width_px,
            height_px: r.height_px,
            promoted_at: r.promoted_at,
            promoted_by: r.promoted_by,
            uploaded_at: r.uploaded_at,
        }
    }
}

async fn build_gallery_items(
    db: &Db,
    rows: Vec<AssetStarRow>,
    viewer_id: Uuid,
    is_admin: bool,
) -> AppResult<Vec<AgencyGalleryItem>> {
    if rows.is_empty() {
        return Ok(vec![]);
    }

    let ids: Vec<Uuid> = rows.iter().map(|r| r.id).collect();

    // Fetch tags for all assets in one query
    let tags: Vec<TagRow> = sqlx::query_as(
        r#"
        SELECT
            at.id,
            at.asset_id,
            at.tagged_by,
            at.volunteer_id,
            vp.display_name AS volunteer_name,
            d.name          AS dog_name
        FROM asset_tags at
        LEFT JOIN users vp ON vp.id = at.volunteer_id
        LEFT JOIN dogs d   ON d.id  = at.dog_id
        WHERE at.asset_id = ANY($1)
        "#,
    )
    .bind(&ids)
    .fetch_all(&**db)
    .await?;

    let mut items = Vec::with_capacity(rows.len());
    for row in rows {
        let asset_id = row.id;
        let star_count = row.star_count;
        let my_star = row.my_star;
        let shift_title = row.shift_title.clone();
        let shift_start_at = row.shift_start_at;
        let asset = Asset::from(row);

        let asset_tags = tags
            .iter()
            .filter(|t| t.asset_id == asset_id)
            // Privacy filter: only show tag if viewer is admin, the tagger, or the person tagged
            .filter(|t| {
                is_admin 
                || t.tagged_by == viewer_id 
                || (t.volunteer_id.is_some() && t.volunteer_id == Some(viewer_id))
            })
            .map(|t| TagInfo {
                id: t.id,
                volunteer_name: t.volunteer_name.clone(),
                dog_name: t.dog_name.clone(),
            })
            .collect();

        items.push(AgencyGalleryItem {
            item: GalleryItem {
                asset,
                star_count,
                my_star,
                tags: asset_tags,
            },
            shift_title,
            shift_start_at,
        });
    }
    Ok(items)
}

#[derive(Debug, FromRow)]
struct TagRow {
    id: Uuid,
    asset_id: Uuid,
    tagged_by: Uuid,
    volunteer_id: Option<Uuid>,
    volunteer_name: Option<String>,
    dog_name: Option<String>,
}
