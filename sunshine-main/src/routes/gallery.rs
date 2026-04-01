//! Gallery routes — shared upload handler, local file serving, star/tag endpoints.

use rocket::{
    data::ToByteUnit,
    delete, get,
    fs::TempFile,
    http::{ContentType, Header, Status},
    post, routes,
    Route, State,
};
use rocket_dyn_templates::{context, Template};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{
    auth::session::AuthUser,
    config::AppConfig,
    errors::{AppError, AppResult},
    models::gallery::{Asset, AssetVisibility, StorageBackendType},
    storage::StorageBackend,
    Db,
};

// ─── Public route list ────────────────────────────────────────────────────────

pub fn routes() -> Vec<Route> {
    routes![
        serve_local_file,
        toggle_star,
        delete_star,
        add_tag,
        remove_tag,
    ]
}

// ─── Shared upload handler ────────────────────────────────────────────────────

const MAX_UPLOAD_BYTES: usize = 10 * 1024 * 1024; // 10 MB
const ALLOWED_MIMES: &[&str] = &["image/jpeg", "image/png", "image/webp", "image/gif"];

#[derive(Debug, Serialize)]
pub struct UploadResult {
    pub asset: Asset,
    #[allow(dead_code)]
    pub url: String,
    pub thumb_url: String,
    pub starred: bool,
}

pub async fn handle_upload(
    file: TempFile<'_>,
    shift_id: Option<Uuid>,
    uploader_id: Uuid,
    initial_visibility: AssetVisibility,
    storage: &StorageBackend,
    db: &Db,
) -> AppResult<UploadResult> {
    // ── 1. Validate mime ──────────────────────────────────────────────────────
    let mime = file
        .content_type()
        .map(|ct| ct.to_string())
        .unwrap_or_default();

    if !ALLOWED_MIMES.contains(&mime.as_str()) {
        return Err(AppError::Validation(format!(
            "Unsupported file type: {mime}. Allowed: jpeg, png, webp, gif"
        )));
    }

    // ── 2. Read bytes ─────────────────────────────────────────────────────────
    let tmp_path = file
        .path()
        .ok_or_else(|| AppError::Validation("No temp file path".into()))?;

    let original_bytes = tokio::fs::read(tmp_path)
        .await
        .map_err(|e| AppError::Internal(anyhow::anyhow!("read temp file: {e}")))?;

    if original_bytes.len() > MAX_UPLOAD_BYTES {
        return Err(AppError::Validation(format!(
            "File too large ({} bytes). Maximum is 10 MB.",
            original_bytes.len()
        )));
    }

    // ── 3. Skip synchronous decode — we'll do it in the worker ──────────────
    // ── 4. Build storage keys ─────────────────────────────────────────────────
    let asset_uuid = Uuid::new_v4();
    let ext = mime_to_ext(&mime);

    let (orig_key, thumb_key) = match shift_id {
        Some(sid) => (
            format!("shifts/{sid}/originals/{asset_uuid}.{ext}"),
            format!("shifts/{sid}/thumbs/{asset_uuid}_thumb.webp"),
        ),
        None => (
            format!("general/{asset_uuid}.{ext}"),
            format!("general/{asset_uuid}_thumb.webp"),
        ),
    };

    // ── 5. Upload original ──────────────────────────────────────────────────
    storage.put(&orig_key, &original_bytes, &mime).await?;

    // ── 6. Determine backend type for DB ─────────────────────────────────────
    let backend_type = if storage.is_local() {
        StorageBackendType::Local
    } else {
        StorageBackendType::S3
    };

    // ── 7. INSERT into assets ─────────────────────────────────────────────────
    let asset: Asset = sqlx::query_as(
        r#"
        INSERT INTO assets (
            id, uploader_id, shift_id, storage_key, storage_backend,
            mime_type, size_bytes, visibility, thumb_key
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *
        "#,
    )
    .bind(asset_uuid)
    .bind(uploader_id)
    .bind(shift_id)
    .bind(&orig_key)
    .bind(&backend_type)
    .bind(&mime)
    .bind(original_bytes.len() as i64)
    .bind(&initial_visibility)
    .bind(&thumb_key)
    .fetch_one(&**db)
    .await?;

    // ── 8. Enqueue thumbnail generation ─────────────────────────────────────
    let payload = serde_json::json!({
        "asset_id": asset_uuid,
        "original_key": orig_key,
        "thumb_key": thumb_key,
    });
    
    let _ = crate::worker::enqueue(
        &**db,
        "generate_thumbnail",
        payload,
        chrono::Utc::now(),
        10 // priority
    ).await;

    let url = storage.url(&orig_key);
    let thumb_url = storage.url(&thumb_key);

    Ok(UploadResult { asset, url, thumb_url, starred: false })
}

fn mime_to_ext(mime: &str) -> &'static str {
    match mime {
        "image/jpeg" => "jpg",
        "image/png"  => "png",
        "image/webp" => "webp",
        "image/gif"  => "gif",
        _            => "bin",
    }
}

// ─── Local file serving ───────────────────────────────────────────────────────

#[get("/uploads/<path..>")]
pub async fn serve_local_file(
    path: std::path::PathBuf,
    db: &Db,
    au: Option<AuthUser>,
    storage: &State<StorageBackend>,
    cfg: &State<AppConfig>,
) -> AppResult<(ContentType, Vec<u8>)> {
    // Only serve for local backend
    if !storage.is_local() {
        return Err(AppError::NotFound);
    }

    // Normalise key: strip leading path separators
    let key = path.to_string_lossy().to_string();

    // Look up asset visibility
    let row: Option<(AssetVisibility, Uuid, Option<Uuid>)> = sqlx::query_as(
        "SELECT visibility, uploader_id, agency_id FROM assets WHERE storage_key = $1",
    )
    .bind(&key)
    .fetch_optional(&**db)
    .await?;

    let viewer_id = au.as_ref().map(|a| a.id());
    let is_admin = au.as_ref().map(|a| a.is_admin()).unwrap_or(false);

    match row {
        None => return Err(AppError::NotFound),
        Some((AssetVisibility::Curated, _, _)) => {}
        Some((AssetVisibility::Private, uploader_id, _)) => {
            if !is_admin && viewer_id != Some(uploader_id) {
                return Err(AppError::Forbidden);
            }
        }
        Some((AssetVisibility::Agency, uploader_id, Some(asset_agency_id))) => {
            if !is_admin && viewer_id != Some(uploader_id) {
                let is_contact: bool = sqlx::query_scalar(
                    "SELECT EXISTS(SELECT 1 FROM contacts WHERE user_id = $1 AND agency_id = $2 AND is_active = true)"
                )
                .bind(viewer_id)
                .bind(asset_agency_id)
                .fetch_one(&**db)
                .await
                .unwrap_or(false);

                if !is_contact {
                    return Err(AppError::Forbidden);
                }
            }
        }
        Some((AssetVisibility::Agency, uploader_id, None)) => {
            // Fallback for missing agency_id on record
            if !is_admin && viewer_id != Some(uploader_id) {
                return Err(AppError::Forbidden);
            }
        }
        Some((AssetVisibility::Hidden, _, _)) => {
            if !is_admin {
                return Err(AppError::Forbidden);
            }
        }
        Some((AssetVisibility::Unverified, uploader_id, _)) => {
            if !is_admin && viewer_id != Some(uploader_id) {
                return Err(AppError::Forbidden);
            }
        }
    }

    let file_path = std::path::PathBuf::from(&cfg.upload_dir).join(&key);
    let bytes = tokio::fs::read(&file_path)
        .await
        .map_err(|_| AppError::NotFound)?;

    let content_type = mime_from_path(&file_path);
    Ok((content_type, bytes))
}

fn mime_from_path(path: &std::path::Path) -> ContentType {
    match path.extension().and_then(|e| e.to_str()) {
        Some("jpg") | Some("jpeg") => ContentType::JPEG,
        Some("png")  => ContentType::PNG,
        Some("webp") => ContentType::new("image", "webp"),
        Some("gif")  => ContentType::GIF,
        _ => ContentType::Binary,
    }
}

// ─── Star toggle ──────────────────────────────────────────────────────────────

#[post("/assets/<id>/star")]
pub async fn toggle_star(
    id: Uuid,
    au: AuthUser,
    db: &Db,
) -> AppResult<Template> {
    // Upsert — if exists, delete; if not, insert
    let exists: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM asset_stars WHERE asset_id = $1 AND user_id = $2)",
    )
    .bind(id)
    .bind(au.id())
    .fetch_one(&**db)
    .await?;

    if exists {
        sqlx::query("DELETE FROM asset_stars WHERE asset_id = $1 AND user_id = $2")
            .bind(id)
            .bind(au.id())
            .execute(&**db)
            .await?;
    } else {
        sqlx::query(
            "INSERT INTO asset_stars (asset_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
        )
        .bind(id)
        .bind(au.id())
        .execute(&**db)
        .await?;
    }

    let star_count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM asset_stars WHERE asset_id = $1")
            .bind(id)
            .fetch_one(&**db)
            .await?;

    let starred = !exists;

    Ok(Template::render(
        "partials/star_button",
        context! {
            asset_id: id,
            starred,
            star_count,
        },
    ))
}

#[delete("/assets/<id>/star")]
pub async fn delete_star(id: Uuid, au: AuthUser, db: &Db) -> AppResult<Template> {
    sqlx::query("DELETE FROM asset_stars WHERE asset_id = $1 AND user_id = $2")
        .bind(id)
        .bind(au.id())
        .execute(&**db)
        .await?;

    let star_count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM asset_stars WHERE asset_id = $1")
            .bind(id)
            .fetch_one(&**db)
            .await?;

    Ok(Template::render(
        "partials/star_button",
        context! {
            asset_id: id,
            starred: false,
            star_count,
        },
    ))
}

// ─── Tag add / remove ─────────────────────────────────────────────────────────

#[derive(Debug, rocket::form::FromForm)]
pub struct AddTagForm {
    pub volunteer_id: Option<Uuid>,
    pub dog_id: Option<Uuid>,
}

#[post("/assets/<id>/tags", data = "<form>")]
pub async fn add_tag(
    id: Uuid,
    form: rocket::form::Form<AddTagForm>,
    au: AuthUser,
    db: &Db,
) -> AppResult<Template> {
    if form.volunteer_id.is_none() && form.dog_id.is_none() {
        return Err(AppError::Validation("Must supply volunteer_id or dog_id".into()));
    }
    if form.volunteer_id.is_some() && form.dog_id.is_some() {
        return Err(AppError::Validation("Supply volunteer_id OR dog_id, not both".into()));
    }

    sqlx::query(
        r#"
        INSERT INTO asset_tags (asset_id, tagged_by, volunteer_id, dog_id)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT DO NOTHING
        "#,
    )
    .bind(id)
    .bind(au.id())
    .bind(form.volunteer_id)
    .bind(form.dog_id)
    .execute(&**db)
    .await?;

    render_tags(db, id, &au).await
}

#[delete("/assets/<id>/tags/<tag_id>")]
pub async fn remove_tag(
    id: Uuid,
    tag_id: Uuid,
    au: AuthUser,
    db: &Db,
) -> AppResult<Template> {
    // Only the tagger or an admin can remove a tag
    let is_admin = au.is_admin();
    let rows = sqlx::query(
        "DELETE FROM asset_tags WHERE id = $1 AND asset_id = $2 AND (tagged_by = $3 OR $4)",
    )
    .bind(tag_id)
    .bind(id)
    .bind(au.id())
    .bind(is_admin)
    .execute(&**db)
    .await?;

    render_tags(db, id, &au).await
}

async fn render_tags(db: &Db, asset_id: Uuid, au: &AuthUser) -> AppResult<Template> {
    let tags = fetch_tags(db, asset_id, au.id(), au.is_admin()).await?;
    Ok(Template::render(
        "partials/asset_tags",
        context! { 
            asset_id, 
            tags,
            viewer_id: au.id(),
            is_admin: au.is_admin(),
        },
    ))
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct TagRow {
    pub id: Uuid,
    pub tagged_by: Uuid,
    pub volunteer_id: Option<Uuid>,
    pub volunteer_name: Option<String>,
    pub dog_name: Option<String>,
}

async fn fetch_tags(db: &Db, asset_id: Uuid, viewer_id: Uuid, is_admin: bool) -> AppResult<Vec<TagRow>> {
    let tags = sqlx::query_as::<_, TagRow>(
        r#"
        SELECT at.id,
               at.tagged_by,
               at.volunteer_id,
               vp.display_name AS volunteer_name,
               d.name          AS dog_name
        FROM asset_tags at
        LEFT JOIN users vp ON vp.id = at.volunteer_id
        LEFT JOIN dogs  d  ON d.id  = at.dog_id
        WHERE at.asset_id = $1
        "#,
    )
    .bind(asset_id)
    .fetch_all(&**db)
    .await?;

    // Privacy filter
    let filtered = tags.into_iter()
        .filter(|t| {
            is_admin 
            || t.tagged_by == viewer_id 
            || (t.volunteer_id.is_some() && t.volunteer_id == Some(viewer_id))
        })
        .collect();

    Ok(filtered)
}
