use anyhow::{bail, Context, Result};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use crate::config::AppConfig;

#[derive(Debug, Clone)]
pub struct GeoPoint {
    pub lat: f64,
    pub lng: f64,
    /// Neighbourhood/community extracted from geocoding address components.
    /// Priority: neighborhood → sublocality_level_1 → sublocality → locality
    pub neighborhood: Option<String>,
}

#[derive(Deserialize)]
struct GeocodeResponse {
    status: String,
    results: Vec<GeocodeResult>,
}

#[derive(Deserialize)]
struct GeocodeResult {
    geometry: GeocodeGeometry,
    #[serde(default)]
    address_components: Vec<AddressComponent>,
}

#[derive(Deserialize)]
struct AddressComponent {
    long_name: String,
    types: Vec<String>,
}

#[derive(Deserialize)]
struct GeocodeGeometry {
    location: LatLng,
}

#[derive(Deserialize)]
struct LatLng {
    lat: f64,
    lng: f64,
}

fn extract_neighborhood(components: &[AddressComponent]) -> Option<String> {
    for priority in &["neighborhood", "sublocality_level_1", "sublocality", "locality"] {
        if let Some(c) = components.iter().find(|c| c.types.iter().any(|t| t == priority)) {
            return Some(c.long_name.clone());
        }
    }
    None
}

/// Geocode a free-text address using the Google Maps Geocoding API.
///
/// Returns `Ok(GeoPoint)` on success. Returns `Err` if the network call
/// fails, the API returns no results, or the response cannot be parsed.
///
/// Callers should treat errors as non-fatal: save the address text with
/// `geom = NULL` and surface a warning to the user.
pub async fn geocode_address(address: &str, api_key: &str) -> Result<GeoPoint> {
    let encoded: String = url::form_urlencoded::byte_serialize(address.as_bytes()).collect();
    let url = format!(
        "https://maps.googleapis.com/maps/api/geocode/json?address={}&key={}",
        encoded,
        api_key,
    );

    let resp: GeocodeResponse = reqwest::get(&url)
        .await
        .context("Geocoding HTTP request failed")?
        .json()
        .await
        .context("Failed to parse geocoding response")?;

    if resp.status != "OK" {
        bail!("Geocoding API returned status: {}", resp.status);
    }

    let result = resp
        .results
        .into_iter()
        .next()
        .context("Geocoding returned no results")?;

    let neighborhood = extract_neighborhood(&result.address_components);
    let loc = result.geometry.location;

    Ok(GeoPoint { lat: loc.lat, lng: loc.lng, neighborhood })
}

// ─── File-backed cache ────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize)]
struct CacheEntry {
    lat: f64,
    lng: f64,
    #[serde(default)]
    neighborhood: Option<String>,
}

type CacheMap = HashMap<String, CacheEntry>;

fn normalize_key(address: &str) -> String {
    address.trim().to_lowercase()
}

async fn read_cache(path: &str) -> CacheMap {
    tokio::fs::read_to_string(path)
        .await
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

async fn write_cache(path: &str, cache: &CacheMap) {
    if let Ok(json) = serde_json::to_string_pretty(cache) {
        let _ = tokio::fs::write(path, json).await;
    }
}

// ─── Public entry point ───────────────────────────────────────────────────────

/// Geocode an address, optionally using a file-backed cache (controlled by
/// `config.use_geocode_cache`).  All callers should use this instead of
/// calling `geocode_address` directly.
pub async fn geocode(address: &str, config: &AppConfig) -> Result<GeoPoint> {
    let api_key = config
        .google_maps_api_key
        .as_deref()
        .context("Google Maps API key not configured")?;

    if !config.use_geocode_cache {
        return geocode_address(address, api_key).await;
    }

    let key = normalize_key(address);
    let mut cache = read_cache(&config.geocode_cache_path).await;

    if let Some(entry) = cache.get(&key) {
        tracing::debug!(address, "Geocode cache hit");
        return Ok(GeoPoint { lat: entry.lat, lng: entry.lng, neighborhood: entry.neighborhood.clone() });
    }

    tracing::debug!(address, "Geocode cache miss — calling API");
    let point = geocode_address(address, api_key).await?;

    cache.insert(key, CacheEntry { lat: point.lat, lng: point.lng, neighborhood: point.neighborhood.clone() });
    write_cache(&config.geocode_cache_path, &cache).await;

    Ok(point)
}
