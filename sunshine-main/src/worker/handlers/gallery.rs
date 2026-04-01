use serde::Deserialize;
use uuid::Uuid;
use crate::errors::AppResult;
use crate::worker::runner::WorkerContext;

#[derive(Deserialize)]
pub struct GenerateThumbnailPayload {
    pub asset_id: Uuid,
    pub original_key: String,
    pub thumb_key: String,
}

pub async fn generate_thumbnail(ctx: &WorkerContext, payload: &serde_json::Value) -> anyhow::Result<()> {
    let p: GenerateThumbnailPayload = serde_json::from_value(payload.clone())?;
    
    // 1. Fetch original bytes
    let original_bytes = ctx.storage.get(&p.original_key).await?;

    // 2. Decode with `image` crate
    let img = image::load_from_memory(&original_bytes)
        .map_err(|e| anyhow::anyhow!("Cannot decode image: {e}"))?;

    let width_px = img.width() as i32;
    let height_px = img.height() as i32;

    // 3. Generate 400×400 WebP thumbnail
    let thumb_img = img.resize(400, 400, image::imageops::FilterType::Lanczos3);
    let mut thumb_bytes: Vec<u8> = Vec::new();
    thumb_img
        .write_to(
            &mut std::io::Cursor::new(&mut thumb_bytes),
            image::ImageFormat::WebP,
        )
        .map_err(|e| anyhow::anyhow!("encode thumb: {e}"))?;

    // 4. Upload thumbnail
    ctx.storage.put(&p.thumb_key, &thumb_bytes, "image/webp").await?;

    // 5. Update asset record
    sqlx::query(
        "UPDATE assets 
         SET thumb_key = $1, width_px = $2, height_px = $3 
         WHERE id = $4"
    )
    .bind(&p.thumb_key)
    .bind(width_px)
    .bind(height_px)
    .bind(p.asset_id)
    .execute(&ctx.pool)
    .await?;
    
    Ok(())
}
