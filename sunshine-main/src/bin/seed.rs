//! Sunshine seed binary.
//!
//! Run with:  cargo run --bin seed -- [--regions] [--taxonomy] [--mock] [--all]
//!
//! What it seeds:
//!   --regions   : Toronto zone polygons (from Open Data) + Stats Can GTA CSDs
//!   --taxonomy  : Agency types + Dog breed hierarchy
//!   --mock      : 5 admins, 45 volunteers+dogs, 15 agencies+sites+contacts, 15 shifts
//!   --all       : Everything above

use anyhow::{Context, Result};
use geojson::{Feature, GeoJson};
use serde::Deserialize;
use sqlx::postgres::PgPoolOptions;
use std::collections::HashMap;
use std::fs;

#[derive(Debug, Deserialize)]
struct ZoneFile {
    zones: Vec<ZoneDef>,
    assignments: HashMap<String, String>,
}

#[derive(Debug, Deserialize)]
struct ZoneDef {
    slug: String,
    name: String,
    display_order: i32,
}

// ─── Agency Type taxonomy ──────────────────────────────────────────────────────

#[derive(Debug)]
struct AgencyTypeNode {
    name: &'static str,
    slug: &'static str,
    children: &'static [AgencyTypeNode],
}

const AGENCY_TYPES: &[AgencyTypeNode] = &[
    AgencyTypeNode {
        name: "Education",
        slug: "education",
        children: &[
            AgencyTypeNode {
                name: "Elementary School",
                slug: "elementary-school",
                children: &[],
            },
            AgencyTypeNode {
                name: "Secondary School",
                slug: "secondary-school",
                children: &[
                    AgencyTypeNode { name: "Alternative School", slug: "alternative-school", children: &[] },
                    AgencyTypeNode { name: "Special Education", slug: "special-education", children: &[] },
                ],
            },
            AgencyTypeNode {
                name: "Post-Secondary",
                slug: "post-secondary",
                children: &[],
            },
            AgencyTypeNode {
                name: "Library",
                slug: "library",
                children: &[],
            },
        ],
    },
    AgencyTypeNode {
        name: "Healthcare",
        slug: "healthcare",
        children: &[
            AgencyTypeNode { name: "Care Home", slug: "care-home", children: &[] },
            AgencyTypeNode { name: "Hospital", slug: "hospital", children: &[] },
            AgencyTypeNode { name: "Hospice", slug: "hospice", children: &[] },
            AgencyTypeNode { name: "Rehabilitation Centre", slug: "rehabilitation-centre", children: &[] },
            AgencyTypeNode { name: "Mental Health Facility", slug: "mental-health-facility", children: &[] },
        ],
    },
    AgencyTypeNode {
        name: "Community & Social Services",
        slug: "community-social",
        children: &[
            AgencyTypeNode { name: "Youth Centre", slug: "youth-centre", children: &[] },
            AgencyTypeNode { name: "Shelter", slug: "shelter", children: &[] },
            AgencyTypeNode { name: "Community Centre", slug: "community-centre", children: &[] },
        ],
    },
    AgencyTypeNode {
        name: "Workplace & Corporate",
        slug: "workplace-corporate",
        children: &[
            AgencyTypeNode { name: "Office Wellness", slug: "office-wellness", children: &[] },
        ],
    },
];

// ─── Dog Breed taxonomy ────────────────────────────────────────────────────────

#[derive(Debug)]
struct BreedNode {
    name: &'static str,
    slug: &'static str,
    children: &'static [BreedNode],
}

const DOG_TYPES: &[BreedNode] = &[
    BreedNode {
        name: "Sporting Group",
        slug: "sporting",
        children: &[
            BreedNode { name: "Golden Retriever", slug: "golden-retriever", children: &[] },
            BreedNode { name: "Labrador Retriever", slug: "labrador-retriever", children: &[] },
            BreedNode { name: "Cocker Spaniel", slug: "cocker-spaniel", children: &[] },
            BreedNode { name: "Springer Spaniel", slug: "springer-spaniel", children: &[] },
            BreedNode { name: "Irish Setter", slug: "irish-setter", children: &[] },
            BreedNode { name: "Vizsla", slug: "vizsla", children: &[] },
        ],
    },
    BreedNode {
        name: "Working Group",
        slug: "working",
        children: &[
            BreedNode { name: "Bernese Mountain Dog", slug: "bernese-mountain-dog", children: &[] },
            BreedNode { name: "Boxer", slug: "boxer", children: &[] },
            BreedNode { name: "Doberman Pinscher", slug: "doberman-pinscher", children: &[] },
            BreedNode { name: "Great Dane", slug: "great-dane", children: &[] },
            BreedNode { name: "Newfoundland", slug: "newfoundland", children: &[] },
            BreedNode { name: "Saint Bernard", slug: "saint-bernard", children: &[] },
            BreedNode { name: "Siberian Husky", slug: "siberian-husky", children: &[] },
        ],
    },
    BreedNode {
        name: "Herding Group",
        slug: "herding",
        children: &[
            BreedNode { name: "Australian Shepherd", slug: "australian-shepherd", children: &[] },
            BreedNode { name: "Border Collie", slug: "border-collie", children: &[] },
            BreedNode { name: "Collie", slug: "collie", children: &[] },
            BreedNode { name: "German Shepherd", slug: "german-shepherd", children: &[] },
            BreedNode { name: "Old English Sheepdog", slug: "old-english-sheepdog", children: &[] },
            BreedNode { name: "Shetland Sheepdog", slug: "shetland-sheepdog", children: &[] },
        ],
    },
    BreedNode {
        name: "Hound Group",
        slug: "hound",
        children: &[
            BreedNode { name: "Basset Hound", slug: "basset-hound", children: &[] },
            BreedNode { name: "Beagle", slug: "beagle", children: &[] },
            BreedNode { name: "Dachshund", slug: "dachshund", children: &[] },
            BreedNode { name: "Greyhound", slug: "greyhound", children: &[] },
            BreedNode { name: "Whippet", slug: "whippet", children: &[] },
        ],
    },
    BreedNode {
        name: "Terrier Group",
        slug: "terrier",
        children: &[
            BreedNode { name: "Airedale Terrier", slug: "airedale-terrier", children: &[] },
            BreedNode { name: "Bull Terrier", slug: "bull-terrier", children: &[] },
            BreedNode { name: "Scottish Terrier", slug: "scottish-terrier", children: &[] },
            BreedNode { name: "West Highland White Terrier", slug: "westie", children: &[] },
            BreedNode { name: "Yorkshire Terrier", slug: "yorkshire-terrier", children: &[] },
            BreedNode { name: "Miniature Schnauzer", slug: "miniature-schnauzer", children: &[] },
        ],
    },
    BreedNode {
        name: "Toy Group",
        slug: "toy",
        children: &[
            BreedNode { name: "Cavalier King Charles Spaniel", slug: "cavalier-king-charles", children: &[] },
            BreedNode { name: "Chihuahua", slug: "chihuahua", children: &[] },
            BreedNode { name: "Maltese", slug: "maltese", children: &[] },
            BreedNode { name: "Pomeranian", slug: "pomeranian", children: &[] },
            BreedNode { name: "Pug", slug: "pug", children: &[] },
            BreedNode { name: "Shih Tzu", slug: "shih-tzu", children: &[] },
        ],
    },
    BreedNode {
        name: "Non-Sporting Group",
        slug: "non-sporting",
        children: &[
            BreedNode { name: "Bichon Frise", slug: "bichon-frise", children: &[] },
            BreedNode { name: "Boston Terrier", slug: "boston-terrier", children: &[] },
            BreedNode { name: "Bulldog", slug: "bulldog", children: &[] },
            BreedNode { name: "Dalmatian", slug: "dalmatian", children: &[] },
            BreedNode { name: "French Bulldog", slug: "french-bulldog", children: &[] },
            BreedNode { name: "Poodle (Standard)", slug: "poodle-standard", children: &[] },
            BreedNode { name: "Poodle (Miniature)", slug: "poodle-miniature", children: &[] },
        ],
    },
    BreedNode {
        name: "Mixed & Other",
        slug: "mixed-other",
        children: &[
            BreedNode { name: "Labradoodle", slug: "labradoodle", children: &[] },
            BreedNode { name: "Goldendoodle", slug: "goldendoodle", children: &[] },
            BreedNode { name: "Mixed Breed", slug: "mixed-breed", children: &[] },
        ],
    },
];

// ─── Main ─────────────────────────────────────────────────────────────────────

#[tokio::main]
async fn main() -> Result<()> {
    dotenvy::dotenv().ok();
    tracing_subscriber::fmt::init();

    let args: Vec<String> = std::env::args().collect();
    let seed_regions = args.iter().any(|a| a == "--regions" || a == "--all");
    let seed_taxonomy = args.iter().any(|a| a == "--taxonomy" || a == "--all");
    let seed_mock = args.iter().any(|a| a == "--mock" || a == "--all");

    if !seed_regions && !seed_taxonomy && !seed_mock {
        eprintln!("Usage: seed --regions | --taxonomy | --mock | --all");
        std::process::exit(1);
    }

    let database_url = std::env::var("DATABASE_URL").context("DATABASE_URL not set")?;
    let pool = PgPoolOptions::new()
        .max_connections(3)
        .connect(&database_url)
        .await
        .context("Failed to connect to database")?;

    if seed_taxonomy {
        println!("→ Seeding agency type taxonomy...");
        seed_agency_types(&pool).await?;
        println!("  ✓ Agency types done");

        println!("→ Seeding dog breed taxonomy...");
        seed_dog_types(&pool).await?;
        println!("  ✓ Dog breeds done");
    }

    if seed_regions {
        println!("→ Seeding Toronto zones...");
        seed_toronto_zones(&pool).await?;
        println!("  ✓ Toronto zones done");

        println!("→ Seeding GTA / Southern Ontario regions...");
        println!("  ℹ  Download the Statistics Canada 2021 CSD GeoJSON manually:");
        println!("     1. Download lcsd000b21a_e.zip from Statistics Canada boundary files");
        println!("     2. Run: ogr2ogr -f GeoJSON seed/ontario_csds.geojson \\");
        println!("              -s_srs EPSG:3347 -t_srs EPSG:4326 \\");
        println!("              -where \"PRUID = '35' AND CSDNAME != 'Toronto'\" \\");
        println!("              lcsd000b21a_e.shp");
        println!("     3. Re-run: cargo run --bin seed -- --regions");

        if std::path::Path::new("seed/ontario_csds.geojson").exists() {
            seed_ontario_csds(&pool).await?;
            println!("  ✓ Ontario CSDs done");
        } else {
            println!("  ⚠  seed/ontario_csds.geojson not found — skipping GTA regions");
        }
    }

    if seed_mock {
        println!("→ Seeding mock data (admins, volunteers, agencies, shifts)...");
        seed_mock_data(&pool).await?;
        println!("  ✓ Mock data done");
    }

    println!("\n✓ Seeding complete.");
    Ok(())
}

// ─── Toronto Zones ────────────────────────────────────────────────────────────

async fn seed_toronto_zones(pool: &sqlx::PgPool) -> Result<()> {
    // Load zone assignment config
    let zone_file: ZoneFile = serde_json::from_str(
        &fs::read_to_string("seed/toronto_zone_assignments.json")
            .context("seed/toronto_zone_assignments.json not found")?,
    )
    .context("Failed to parse toronto_zone_assignments.json")?;

    // Fetch (or load cached) Toronto neighbourhood GeoJSON
    let geojson_str = fetch_toronto_neighbourhoods().await?;
    let geojson: GeoJson = geojson_str.parse().context("Failed to parse GeoJSON")?;

    let collection = match geojson {
        GeoJson::FeatureCollection(fc) => fc,
        _ => anyhow::bail!("Expected a FeatureCollection"),
    };

    // Build a map: zone_slug → Vec<geojson geometry WKT strings>
    // We'll insert each neighbourhood geometry tagged with its zone,
    // then use ST_Union to dissolve into zone polygons.
    let mut zone_geoms: HashMap<String, Vec<String>> = HashMap::new();
    let mut unmatched: Vec<String> = Vec::new();

    for feature in &collection.features {
        let name = get_feature_name(feature);
        match zone_file.assignments.get(&name) {
            Some(zone_slug) => {
                if let Some(geom) = &feature.geometry {
                    let geom_json = serde_json::to_string(geom)?;
                    zone_geoms.entry(zone_slug.clone()).or_default().push(geom_json);
                }
            }
            None => unmatched.push(name),
        }
    }

    if !unmatched.is_empty() {
        println!("  ⚠  {} neighbourhoods not matched to a zone:", unmatched.len());
        for name in &unmatched {
            println!("      - {name}");
        }
        println!("  Add them to seed/toronto_zone_assignments.json to include in zones.");
    }

    // For each zone, union all neighbourhood polygons and insert
    for zone_def in &zone_file.zones {
        let geoms = match zone_geoms.get(&zone_def.slug) {
            Some(g) if !g.is_empty() => g,
            _ => {
                println!("  ⚠  No geometries found for zone: {}", zone_def.slug);
                continue;
            }
        };

        // Build the union using PostGIS: collect all geometries and ST_Union them.
        // We do this in SQL to avoid pulling large geometries into Rust.
        // Strategy: insert into a temp table, union, then upsert into regions.

        let mut tx = pool.begin().await?;

        sqlx::query("CREATE TEMP TABLE IF NOT EXISTS _zone_geoms (geom geometry) ON COMMIT DELETE ROWS")
            .execute(&mut *tx)
            .await?;

        for geom_json in geoms {
            sqlx::query(
                "INSERT INTO _zone_geoms (geom)
                 VALUES (ST_SetSRID(ST_GeomFromGeoJSON($1), 4326))",
            )
            .bind(geom_json)
            .execute(&mut *tx)
            .await?;
        }

        sqlx::query(
            "INSERT INTO regions (name, slug, source, display_order, geom)
             SELECT
                 $1,
                 $2,
                 'toronto_open_data'::region_source,
                 $3,
                 geography(ST_Multi(ST_Union(geom)))
             FROM _zone_geoms
             ON CONFLICT (slug) DO UPDATE
                 SET geom = EXCLUDED.geom,
                     name = EXCLUDED.name,
                     display_order = EXCLUDED.display_order",
        )
        .bind(&zone_def.name)
        .bind(&zone_def.slug)
        .bind(zone_def.display_order)
        .execute(&mut *tx)
        .await
        .with_context(|| format!("Failed to upsert zone: {}", zone_def.slug))?;

        tx.commit().await?;
        println!("    ✓ {}", zone_def.name);
    }

    Ok(())
}

async fn fetch_toronto_neighbourhoods() -> Result<String> {
    let cache_path = "seed/toronto_neighbourhoods_cache.geojson";

    if let Ok(cached) = fs::read_to_string(cache_path) {
        println!("  Using cached Toronto neighbourhoods GeoJSON");
        return Ok(cached);
    }

    let url = std::env::var("TORONTO_NEIGHBOURHOODS_GEOJSON_URL")
        .unwrap_or_else(|_| {
            "https://ckan0.cf.opendata.inter.prod-toronto.ca/dataset/4def3f65-2a65-4a4f-83b5-dbf4ef3f1e11/resource/a083c865-6d60-4d1d-b6c6-b0c8a85f9c15/download/Neighbourhoods.geojson".to_string()
        });

    println!("  Fetching Toronto neighbourhoods from Open Data...");
    let body = reqwest::get(&url).await?.text().await?;
    fs::write(cache_path, &body)?;
    println!("  Cached to {cache_path}");

    Ok(body)
}

fn get_feature_name(feature: &Feature) -> String {
    feature
        .properties
        .as_ref()
        .and_then(|p| p.get("AREA_NAME").or_else(|| p.get("area_name")))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string()
}

// ─── Ontario CSDs ─────────────────────────────────────────────────────────────

async fn seed_ontario_csds(pool: &sqlx::PgPool) -> Result<()> {
    let geojson_str = fs::read_to_string("seed/ontario_csds.geojson")
        .context("seed/ontario_csds.geojson not found")?;

    let geojson: GeoJson = geojson_str.parse()?;
    let collection = match geojson {
        GeoJson::FeatureCollection(fc) => fc,
        _ => anyhow::bail!("Expected FeatureCollection for Ontario CSDs"),
    };

    let mut count = 0u32;
    for feature in &collection.features {
        let name = feature
            .properties
            .as_ref()
            .and_then(|p| p.get("CSDNAME"))
            .and_then(|v| v.as_str())
            .unwrap_or("Unknown")
            .to_string();

        let csd_uid = feature
            .properties
            .as_ref()
            .and_then(|p| p.get("CSDUID"))
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();

        let slug = slugify(&name);

        if let Some(geom) = &feature.geometry {
            let geom_json = serde_json::to_string(geom)?;
            sqlx::query(
                "INSERT INTO regions (name, slug, source, source_code, display_order, geom)
                 VALUES (
                     $1, $2,
                     'statcan_2021'::region_source,
                     $3,
                     100,
                     geography(ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($4), 4326)))
                 )
                 ON CONFLICT (slug) DO UPDATE
                     SET geom = EXCLUDED.geom,
                         source_code = EXCLUDED.source_code",
            )
            .bind(&name)
            .bind(&slug)
            .bind(&csd_uid)
            .bind(&geom_json)
            .execute(pool)
            .await
            .with_context(|| format!("Failed to insert CSD: {name}"))?;

            count += 1;
        }
    }

    println!("    ✓ Inserted {count} Ontario CSDs");
    Ok(())
}

// ─── Agency Type Taxonomy ─────────────────────────────────────────────────────

async fn seed_agency_types(pool: &sqlx::PgPool) -> Result<()> {
    seed_agency_type_nodes(pool, AGENCY_TYPES, None, "").await
}

async fn seed_agency_type_nodes(
    pool: &sqlx::PgPool,
    nodes: &[AgencyTypeNode],
    parent_id: Option<uuid::Uuid>,
    parent_path: &str,
) -> Result<()> {
    for node in nodes {
        let path = if parent_path.is_empty() {
            node.slug.replace('-', "_")
        } else {
            format!("{}.{}", parent_path, node.slug.replace('-', "_"))
        };

        let id: uuid::Uuid = sqlx::query_scalar(
            "INSERT INTO agency_types (name, slug, parent_id, path)
             VALUES ($1, $2, $3, $4::ltree)
             ON CONFLICT (slug) DO UPDATE
                 SET name = EXCLUDED.name,
                     path = EXCLUDED.path
             RETURNING id",
        )
        .bind(node.name)
        .bind(node.slug)
        .bind(parent_id)
        .bind(&path)
        .fetch_one(pool)
        .await
        .with_context(|| format!("Failed to upsert agency type: {}", node.slug))?;

        if !node.children.is_empty() {
            Box::pin(seed_agency_type_nodes(pool, node.children, Some(id), &path)).await?;
        }
    }
    Ok(())
}

// ─── Dog Breed Taxonomy ───────────────────────────────────────────────────────

async fn seed_dog_types(pool: &sqlx::PgPool) -> Result<()> {
    seed_breed_nodes(pool, DOG_TYPES, None, "").await
}

async fn seed_breed_nodes(
    pool: &sqlx::PgPool,
    nodes: &[BreedNode],
    parent_id: Option<uuid::Uuid>,
    parent_path: &str,
) -> Result<()> {
    for node in nodes {
        let path = if parent_path.is_empty() {
            node.slug.replace('-', "_")
        } else {
            format!("{}.{}", parent_path, node.slug.replace('-', "_"))
        };

        let id: uuid::Uuid = sqlx::query_scalar(
            "INSERT INTO dog_types (name, slug, parent_id, path)
             VALUES ($1, $2, $3, $4::ltree)
             ON CONFLICT (slug) DO UPDATE
                 SET name = EXCLUDED.name,
                     path = EXCLUDED.path
             RETURNING id",
        )
        .bind(node.name)
        .bind(node.slug)
        .bind(parent_id)
        .bind(&path)
        .fetch_one(pool)
        .await
        .with_context(|| format!("Failed to upsert dog type: {}", node.slug))?;

        if !node.children.is_empty() {
            Box::pin(seed_breed_nodes(pool, node.children, Some(id), &path)).await?;
        }
    }
    Ok(())
}

// ─── Geocoding with file cache ─────────────────────────────────────────────────

#[derive(serde::Serialize, serde::Deserialize, Clone)]
struct CachedCoords {
    lat: f64,
    lng: f64,
    #[serde(default)]
    neighborhood: Option<String>,
}

/// Geocode an address, checking/writing a local JSON cache file first.
/// Returns None if geocoding fails.
async fn geocode_cached(address: &str, api_key: &str, cache_path: &str) -> Option<(f64, f64, Option<String>)> {
    let key = address.trim().to_lowercase();

    // Read cache
    let mut cache: HashMap<String, CachedCoords> = tokio::fs::read_to_string(cache_path)
        .await
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default();

    if let Some(entry) = cache.get(&key) {
        println!("      📍 cache hit: {address}");
        return Some((entry.lat, entry.lng, entry.neighborhood.clone()));
    }

    // Cache miss — call API
    let encoded: String = url::form_urlencoded::byte_serialize(address.as_bytes()).collect();
    let url = format!(
        "https://maps.googleapis.com/maps/api/geocode/json?address={}&key={}",
        encoded, api_key
    );

    #[derive(serde::Deserialize)]
    struct GeoResp { status: String, results: Vec<GeoResult> }
    #[derive(serde::Deserialize)]
    struct GeoResult { geometry: GeoGeom, #[serde(default)] address_components: Vec<GeoComp> }
    #[derive(serde::Deserialize)]
    struct GeoGeom { location: GeoLatLng }
    #[derive(serde::Deserialize)]
    struct GeoLatLng { lat: f64, lng: f64 }
    #[derive(serde::Deserialize)]
    struct GeoComp { long_name: String, types: Vec<String> }

    let resp: GeoResp = match reqwest::get(&url).await {
        Ok(r) => match r.json().await {
            Ok(j) => j,
            Err(e) => { eprintln!("      ⚠ geocode parse error for {address}: {e}"); return None; }
        },
        Err(e) => { eprintln!("      ⚠ geocode request failed for {address}: {e}"); return None; }
    };

    if resp.status != "OK" {
        eprintln!("      ⚠ geocode status {} for: {address}", resp.status);
        return None;
    }

    if let Some(result) = resp.results.into_iter().next() {
        let lat = result.geometry.location.lat;
        let lng = result.geometry.location.lng;
        let neighborhood = ["neighborhood", "sublocality_level_1", "sublocality", "locality"]
            .iter()
            .find_map(|p| result.address_components.iter()
                .find(|c| c.types.iter().any(|t| t == p))
                .map(|c| c.long_name.clone()));
        println!("      📍 geocoded: {address} → ({lat:.4}, {lng:.4})");
        cache.insert(key, CachedCoords { lat, lng, neighborhood: neighborhood.clone() });
        if let Ok(json) = serde_json::to_string_pretty(&cache) {
            let _ = tokio::fs::write(cache_path, json).await;
        }
        Some((lat, lng, neighborhood))
    } else {
        eprintln!("      ⚠ no geocode results for: {address}");
        None
    }
}

// ─── Mock Data ───────────────────────────────────────────────────────────────

async fn seed_mock_data(pool: &sqlx::PgPool) -> Result<()> {
    // Optional: reset mock data if requested (or just check existence)
    let exists: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM users WHERE email = 'admin-1@sunshine.dev')",
    )
    .fetch_one(pool)
    .await?;

    if exists {
        println!("  ℹ  Mock data already exists. Cleaning up for fresh seed...");
        sqlx::query("TRUNCATE users, agencies, agency_types, dog_types, regions CASCADE")
            .execute(pool)
            .await?;
        // Re-seed taxonomies since they were cascaded
        println!("  → Re-seeding taxonomies...");
        seed_agency_types(pool).await?;
        seed_dog_types(pool).await?;
    }

    // Geocoding config — read from env, same vars as the web service
    let api_key = std::env::var("GOOGLE_MAPS_API_KEY").unwrap_or_default();
    let _use_cache = std::env::var("USE_GEOCODE_CACHE")
        .map(|v| matches!(v.to_lowercase().as_str(), "true" | "1" | "yes"))
        .unwrap_or(false);
    let cache_path = std::env::var("GEOCODE_CACHE_PATH")
        .unwrap_or_else(|_| "./geocode_cache.json".into());
    let geocode_enabled = !api_key.is_empty();

    // ── 1. Admin accounts ──────────────────────────────────────────────────
    println!("    → 5 admin accounts...");

    // (email, display_name)
    let admins: &[(&str, &str)] = &[
        ("superadmin@sunshine.dev", "Super Admin"),
        ("admin-1@sunshine.dev", "Jordan Rivera"),
        ("admin-2@sunshine.dev", "Taylor Singh"),
        ("admin-3@sunshine.dev", "Morgan Chen"),
        ("admin-4@sunshine.dev", "Casey Thompson"),
        ("admin-5@sunshine.dev", "Riley Okonkwo"),
    ];

    let mut admin_ids: Vec<uuid::Uuid> = Vec::new();
    for (email, name) in admins {
        let id: uuid::Uuid = sqlx::query_scalar(
            "INSERT INTO users (email, role, display_name, is_active)
             VALUES ($1, 'admin'::user_role, $2, true)
             RETURNING id",
        )
        .bind(email)
        .bind(name)
        .fetch_one(pool)
        .await
        .with_context(|| format!("Failed to insert admin: {email}"))?;
        admin_ids.push(id);
    }
    let primary_admin = admin_ids[0];

    // ── 2. Volunteer accounts + profiles + dogs ────────────────────────────
    println!("    → 45 volunteer accounts...");

    // (email, display_name, volunteer_names, bio, years_vol, home_address, has_vsc, has_pc)
    #[rustfmt::skip]
    let volunteers: &[(&str, &str, &str, &str, f64, &str, bool, bool)] = &[
        ("v01@sunshine.dev", "Sarah Chen",         "Sarah Chen",              "Therapy dog handler since 2018. Love bringing joy to seniors.",                   6.0,  "145 Pape Ave, Toronto, ON M4M 2V5",                 true,  true),
        ("v02@sunshine.dev", "Marcus Williams",     "Marcus Williams",         "Retired firefighter. Duke and I visit hospitals weekly.",                          8.0,  "22 Beech Ave, Toronto, ON M4E 3H3",                 true,  true),
        ("v03@sunshine.dev", "Priya Sharma",        "Priya Sharma",            "Social worker by day, therapy dog volunteer on weekends.",                         3.5,  "35 Thorncliffe Park Dr, Toronto, ON M4H 1J4",       true,  true),
        ("v04@sunshine.dev", "James O'Brien",       "James O'Brien",           "Bear is a certified St. John Ambulance therapy dog.",                              5.0,  "82 Brunswick Ave, Toronto, ON M5S 2M1",             true,  true),
        ("v05@sunshine.dev", "Mei-Lin Zhang",       "Mei-Lin Zhang",           "University student volunteering between classes.",                                 1.5,  "415 Dundas St W, Toronto, ON M5T 1G6",              false, false),
        ("v06@sunshine.dev", "David Okonkwo",       "David Okonkwo",           "IT professional. Zeus brings calm to stressful environments.",                     4.0,  "5100 Yonge St, Toronto, ON M2N 6P3",                true,  true),
        ("v07@sunshine.dev", "Rachel Goldstein",    "Rachel Goldstein",        "Professional dog trainer and therapy team evaluator.",                             10.0, "420 Spadina Rd, Toronto, ON M5P 2W8",               true,  true),
        ("v08@sunshine.dev", "Ahmed Hassan",        "Ahmed Hassan",            "Scout loves kids. We visit schools and libraries.",                                2.5,  "3700 Kingston Rd, Toronto, ON M1J 3H8",             true,  false),
        ("v09@sunshine.dev", "Emily Park",          "Emily Park",              "Nurse at SickKids. Sunny visits patients on my days off.",                         7.0,  "1 Eastern Ave, Toronto, ON M4M 1B2",                true,  true),
        ("v10@sunshine.dev", "Carlos Rodriguez",    "Carlos Rodriguez",        "Rocky is the gentlest boxer you'll meet.",                                         3.0,  "1450 Dupont St, Toronto, ON M6P 3S4",               true,  true),
        ("v11@sunshine.dev", "Natasha Petrov",      "Natasha Petrov",          "Retired teacher. Bella and I brighten up care homes.",                             9.0,  "1873 Bloor St W, Toronto, ON M6R 1Z3",              true,  true),
        ("v12@sunshine.dev", "Tom Foster",          "Tom & Linda Foster",      "Married couple volunteering together with our collie.",                            6.5,  "40 McRae Dr, Toronto, ON M4G 1S6",                  true,  true),
        ("v13@sunshine.dev", "Anika Patel",         "Anika Patel",             "Ginger may be small but she has a huge heart.",                                    2.0,  "50 Peel Centre Dr, Brampton, ON L6T 4B9",           false, false),
        ("v14@sunshine.dev", "Robert Kim",          "Robert Kim",              "Ghost is surprisingly gentle despite his wolf-like looks.",                         4.5,  "5000 Yonge St, Toronto, ON M2N 7E9",                true,  true),
        ("v15@sunshine.dev", "Fatima Al-Rashid",    "Fatima Al-Rashid",        "Coco is hypoallergenic — perfect for sensitive environments.",                     3.0,  "100 City Centre Dr, Mississauga, ON L5B 2C9",       true,  false),
        ("v16@sunshine.dev", "Daniel Murphy",       "Daniel Murphy",           "Rusty has a calming effect on everyone he meets.",                                 5.5,  "500 Parliament St, Toronto, ON M4X 1P5",            true,  true),
        ("v17@sunshine.dev", "Yuki Tanaka",         "Yuki Tanaka",             "Tofu is a crowd favourite at every visit.",                                        1.0,  "171 East Liberty St, Toronto, ON M6K 3P6",          false, false),
        ("v18@sunshine.dev", "Grace Osei",          "Grace Osei",              "Atlas is gentle giant therapy. Kids love climbing on him.",                         4.0,  "2100 Islington Ave, Toronto, ON M9P 3R3",           true,  true),
        ("v19@sunshine.dev", "Michael Tremblay",    "Michael Tremblay",        "Moose was born to be a therapy dog. Calm as a lake.",                              7.5,  "2224 Bloor St W, Toronto, ON M6S 1N6",              true,  true),
        ("v20@sunshine.dev", "Sofia Costa",         "Sofia Costa",             "Pixie fits in my bag but fills every room with love.",                              2.0,  "516 College St, Toronto, ON M6G 1A8",               false, true),
        ("v21@sunshine.dev", "Brandon Lee",         "Brandon & Jackie Lee",    "We volunteer as a family. Charlie loves everyone.",                                 5.0,  "160 Main St N, Markham, ON L3P 1Y3",                true,  true),
        ("v22@sunshine.dev", "Amara Diallo",        "Amara Diallo",            "Ziggy has boundless energy and loves performing tricks.",                           3.5,  "1568 Queen St W, Toronto, ON M6R 1A8",              true,  true),
        ("v23@sunshine.dev", "Patrick Sullivan",    "Patrick Sullivan",        "Oscar may have short legs but he's got a long attention span.",                     6.0,  "600 Danforth Ave, Toronto, ON M4K 1R2",             true,  true),
        ("v24@sunshine.dev", "Nina Volkov",         "Nina Volkov",             "Arrow is calm and graceful. Perfect for rehab centres.",                            4.0,  "100 Bloor St W, Toronto, ON M5S 1M8",               true,  true),
        ("v25@sunshine.dev", "Chris Huang",         "Chris Huang",             "Buddy lives up to his name — everyone's best friend.",                              2.5,  "3850 Sheppard Ave E, Toronto, ON M1T 3N4",          true,  false),
        ("v26@sunshine.dev", "Jasmine Wright",      "Jasmine Wright",          "Winston snores during visits. Residents find it hilarious.",                        3.0,  "1560 St. Clair Ave W, Toronto, ON M6E 1C1",         false, true),
        ("v27@sunshine.dev", "Arjun Mehta",         "Arjun Mehta",             "Shadow is incredibly well-trained and intuitive.",                                  5.0,  "1000 Don Mills Rd, Toronto, ON M3C 1V3",            true,  true),
        ("v28@sunshine.dev", "Olivia St-Pierre",    "Olivia St-Pierre",        "Snowball melts hearts wherever we go.",                                             1.5,  "174 Roncesvalles Ave, Toronto, ON M6R 2L4",         false, false),
        ("v29@sunshine.dev", "Kevin Nakamura",      "Kevin Nakamura",          "Pepper is a rescue. Proving mixed breeds make great therapy dogs.",                 4.5,  "840 Coxwell Ave, Toronto, ON M4C 3E8",              true,  true),
        ("v30@sunshine.dev", "Hannah Müller",       "Hannah Müller",           "Daisy springs into action whenever someone needs comfort.",                         3.0,  "1200 Yonge St, Toronto, ON M4T 1W1",                true,  true),
        ("v31@sunshine.dev", "Dwayne Campbell",     "Dwayne Campbell",         "Teddy is the most huggable Airedale you'll ever meet.",                             6.0,  "4700 Jane St, Toronto, ON M3N 2L3",                 true,  true),
        ("v32@sunshine.dev", "Lisa Thompson",       "Lisa & Mark Thompson",    "Baxter is like a walking cloud. Everyone wants to pet him.",                        8.0,  "25 The West Mall, Toronto, ON M9C 1B8",             true,  true),
        ("v33@sunshine.dev", "Raj Kapoor",          "Raj Kapoor",              "Copper has laser focus during therapy sessions.",                                    2.5,  "7700 Yonge St, Thornhill, ON L4J 1V9",              true,  false),
        ("v34@sunshine.dev", "Stephanie Nguyen",    "Stephanie Nguyen",        "Taco is tiny but mighty. Lap dog therapy specialist.",                              1.0,  "214 Augusta Ave, Toronto, ON M5T 2L7",              false, false),
        ("v35@sunshine.dev", "Owen MacLeod",        "Owen MacLeod",            "Bruno weighs more than most people but is the gentlest soul.",                      5.5,  "2400 Lake Shore Blvd W, Toronto, ON M8V 1B5",       true,  true),
        ("v36@sunshine.dev", "Zara Mohammed",       "Zara Mohammed",           "Storm is a retired racer. Calm and regal with patients.",                           4.0,  "5 Flemingdon Park Dr, Toronto, ON M3C 1C7",         true,  true),
        ("v37@sunshine.dev", "Alex Dubois",         "Alex Dubois",             "Beans makes everyone laugh with his little snorts.",                                 2.0,  "920 Queen St W, Toronto, ON M6J 1G5",               false, true),
        ("v38@sunshine.dev", "Irina Kozlov",        "Irina Kozlov",            "Foxy is a fluffy ball of joy. Seniors adore her.",                                   3.5,  "2901 Bayview Ave, Toronto, ON M2K 1E6",             true,  true),
        ("v39@sunshine.dev", "Nathan Wright",       "Nathan Wright",           "Domino turns heads everywhere. Dalmatians are natural therapy dogs.",                6.0,  "130 King St E, Toronto, ON M5C 1G6",                true,  true),
        ("v40@sunshine.dev", "Chloe Beaumont",      "Chloe Beaumont",          "Willow is a gentle herder. She keeps groups together during visits.",                4.5,  "2838 Dundas St W, Toronto, ON M6P 1Y6",             true,  true),
        ("v41@sunshine.dev", "Trevor Wilson",       "Trevor & Diane Wilson",   "Tank is a loveable couch potato. Patients love his wrinkly face.",                   7.0,  "80 Midland Ave, Toronto, ON M1N 3H5",               true,  true),
        ("v42@sunshine.dev", "Amira Fahmy",         "Amira Fahmy",             "Pepper (the schnauzer) has the most expressive eyebrows.",                           2.5,  "55 Wilson Heights Blvd, Toronto, ON M3K 1E6",       true,  false),
        ("v43@sunshine.dev", "Sean O'Connor",       "Sean O'Connor",           "Droopy lives up to his name but perks up around people.",                            5.0,  "2150 Weston Rd, Toronto, ON M9N 1X9",               true,  true),
        ("v44@sunshine.dev", "Maya Johal",          "Maya Johal",              "Angus is a feisty Westie with a heart of gold.",                                     3.0,  "480 Bathurst St, Toronto, ON M5T 2S6",              true,  true),
        ("v45@sunshine.dev", "Liam Fitzgerald",     "Liam Fitzgerald",         "Rascal was a street dog in Mexico. Now he heals people.",                            4.0,  "585 Dundas St E, Toronto, ON M5A 2B7",              true,  true),
    ];

    // (volunteer_email, dog_name, breed_slug, size, gender, age_years, personality_desc, is_primary)
    #[rustfmt::skip]
    let dogs: &[(&str, &str, &str, &str, &str, f64, &str, bool)] = &[
        ("v01@sunshine.dev", "Maple",    "golden-retriever",    "large",   "female", 4.0,  "Gentle and patient. Loves to rest her head on laps.",                true),
        ("v02@sunshine.dev", "Duke",     "labrador-retriever",  "large",   "male",   6.0,  "Calm and steady. Former guide dog trainee.",                         true),
        ("v03@sunshine.dev", "Luna",     "border-collie",       "medium",  "female", 3.0,  "Incredibly smart. Knows over 30 commands.",                          true),
        ("v04@sunshine.dev", "Bear",     "bernese-mountain-dog","x_large", "male",   5.0,  "Living teddy bear. Gentle with everyone.",                           true),
        ("v05@sunshine.dev", "Mochi",    "cavalier-king-charles","small",  "female", 2.0,  "Snuggly lap dog. Perfect for one-on-one visits.",                    true),
        ("v06@sunshine.dev", "Zeus",     "german-shepherd",     "large",   "male",   4.5,  "Well-trained and intuitive. Senses when people need comfort.",       true),
        ("v07@sunshine.dev", "Pierre",   "poodle-standard",     "large",   "male",   3.0,  "Hypoallergenic and elegant. Very well-mannered.",                    true),
        ("v07@sunshine.dev", "Colette",  "poodle-miniature",    "small",   "female", 5.0,  "Pierre's companion. Gentle and quiet.",                              false),
        ("v08@sunshine.dev", "Scout",    "beagle",              "medium",  "male",   3.5,  "Friendly and curious. Loves exploring new places.",                  true),
        ("v09@sunshine.dev", "Sunny",    "golden-retriever",    "large",   "female", 5.0,  "Aptly named — makes everyone smile.",                                true),
        ("v10@sunshine.dev", "Rocky",    "boxer",               "large",   "male",   4.0,  "Gentle despite his tough name. Great with kids.",                    true),
        ("v11@sunshine.dev", "Bella",    "labrador-retriever",  "large",   "female", 7.0,  "Senior dog with a calm, reassuring presence.",                       true),
        ("v12@sunshine.dev", "Biscuit",  "collie",              "large",   "female", 4.0,  "Classic Lassie look. Kids go wild for her.",                         true),
        ("v13@sunshine.dev", "Ginger",   "shih-tzu",            "x_small", "female", 3.0,  "Tiny but confident. Sits perfectly still for petting.",              true),
        ("v14@sunshine.dev", "Ghost",    "siberian-husky",      "large",   "male",   3.5,  "Blue eyes and fluffy coat. Surprisingly gentle.",                    true),
        ("v15@sunshine.dev", "Coco",     "goldendoodle",        "medium",  "female", 2.0,  "Hypoallergenic and playful. Perfect for all settings.",              true),
        ("v16@sunshine.dev", "Rusty",    "irish-setter",        "large",   "male",   5.0,  "Beautiful red coat. Calm and affectionate.",                         true),
        ("v17@sunshine.dev", "Tofu",     "french-bulldog",      "small",   "male",   2.5,  "Compact and charming. Makes funny noises that delight everyone.",   true),
        ("v18@sunshine.dev", "Atlas",    "great-dane",          "x_large", "male",   3.0,  "Gentle giant. Loves leaning on people for hugs.",                    true),
        ("v19@sunshine.dev", "Moose",    "newfoundland",        "x_large", "male",   4.0,  "Giant, fluffy, and drool-worthy. Born nanny dog.",                   true),
        ("v20@sunshine.dev", "Pixie",    "maltese",             "x_small", "female", 4.0,  "Dainty and sweet. Fits perfectly on a hospital bed.",                true),
        ("v21@sunshine.dev", "Charlie",  "labradoodle",         "medium",  "male",   3.0,  "Easygoing and friendly. Loves being around people.",                 true),
        ("v22@sunshine.dev", "Ziggy",    "australian-shepherd", "medium",  "male",   2.5,  "Energetic and smart. Knows lots of tricks.",                         true),
        ("v23@sunshine.dev", "Oscar",    "dachshund",           "small",   "male",   5.0,  "Low-rider with a big personality. Very patient.",                    true),
        ("v24@sunshine.dev", "Arrow",    "whippet",             "medium",  "male",   4.0,  "Sleek and graceful. Incredibly calm during visits.",                 true),
        ("v25@sunshine.dev", "Buddy",    "cocker-spaniel",      "medium",  "male",   3.5,  "Soft ears that everyone wants to touch. Very gentle.",               true),
        ("v26@sunshine.dev", "Winston",  "pug",                 "small",   "male",   4.0,  "Round and loveable. Snores therapeutically.",                        true),
        ("v27@sunshine.dev", "Shadow",   "doberman-pinscher",   "large",   "male",   3.0,  "Sleek and noble. Proves Dobermans are gentle at heart.",             true),
        ("v28@sunshine.dev", "Snowball", "bichon-frise",        "small",   "female", 2.0,  "White fluffy cloud. Hypoallergenic and cheerful.",                   true),
        ("v29@sunshine.dev", "Pepper",   "mixed-breed",         "medium",  "female", 5.0,  "Scruffy rescue with soulful eyes. Incredibly empathetic.",           true),
        ("v30@sunshine.dev", "Daisy",    "springer-spaniel",    "medium",  "female", 3.0,  "Bouncy and joyful. Her wagging tail is contagious.",                 true),
        ("v31@sunshine.dev", "Teddy",    "airedale-terrier",    "large",   "male",   4.0,  "Big terrier with a bigger heart. Very huggable.",                    true),
        ("v32@sunshine.dev", "Baxter",   "old-english-sheepdog","large",   "male",   3.5,  "Walking cloud. People can't resist burying hands in his fur.",      true),
        ("v33@sunshine.dev", "Copper",   "vizsla",              "medium",  "male",   2.5,  "Velcro dog. Sticks close and reads emotions well.",                  true),
        ("v34@sunshine.dev", "Taco",     "chihuahua",           "x_small", "male",   3.0,  "Tiny but thinks he's a Great Dane. Very entertaining.",              true),
        ("v35@sunshine.dev", "Bruno",    "saint-bernard",       "x_large", "male",   4.0,  "Massive and drooly. Gives the best lean-in hugs.",                   true),
        ("v36@sunshine.dev", "Storm",    "greyhound",           "large",   "male",   6.0,  "Retired racer. Now the calmest dog in any room.",                    true),
        ("v37@sunshine.dev", "Beans",    "boston-terrier",       "small",   "male",   2.0,  "Tuxedo-wearing gentleman. Polite and funny.",                       true),
        ("v38@sunshine.dev", "Foxy",     "pomeranian",          "x_small", "female", 3.0,  "Tiny lion. Fluffy and full of personality.",                         true),
        ("v39@sunshine.dev", "Domino",   "dalmatian",           "large",   "male",   3.5,  "Spotty and photogenic. Kids love counting his spots.",               true),
        ("v40@sunshine.dev", "Willow",   "shetland-sheepdog",   "medium",  "female", 4.0,  "Gentle and intuitive. Herds anxious people into calm.",              true),
        ("v41@sunshine.dev", "Tank",     "bulldog",             "medium",  "male",   5.0,  "Stocky and wrinkly. A warm, snoring lap warmer.",                    true),
        ("v42@sunshine.dev", "Pepper",   "miniature-schnauzer", "small",   "female", 2.5,  "Distinguished gentleman with expressive eyebrows.",                  true),
        ("v43@sunshine.dev", "Droopy",   "basset-hound",        "medium",  "male",   6.0,  "Sad-looking but actually very happy. Irresistible ears.",            true),
        ("v44@sunshine.dev", "Angus",    "westie",              "small",   "male",   3.0,  "Feisty white terrier. Brightens every room.",                        true),
        ("v45@sunshine.dev", "Rascal",   "mixed-breed",         "medium",  "male",   4.0,  "Former street dog turned therapy pro. Resilient and loving.",        true),
        // Second dogs for some volunteers
        ("v09@sunshine.dev", "Maple Jr.","golden-retriever",    "large",   "female", 2.0,  "Sunny's daughter. Learning the therapy ropes.",                      false),
        ("v11@sunshine.dev", "Rosie",    "labrador-retriever",  "large",   "female", 3.0,  "Bella's younger companion. Chocolate lab.",                          false),
        ("v21@sunshine.dev", "Waffles",  "goldendoodle",        "medium",  "male",   1.5,  "Charlie's buddy. Still in training.",                                false),
        ("v32@sunshine.dev", "Muffin",   "collie",              "large",   "female", 2.0,  "Baxter's partner in fluff. Very photogenic.",                        false),
        ("v39@sunshine.dev", "Dot",      "dalmatian",           "large",   "female", 2.0,  "Domino's daughter. Fewer spots, same charm.",                        false),
    ];

    // Build breed slug → id lookup
    let breed_rows: Vec<(uuid::Uuid, String)> =
        sqlx::query_as("SELECT id, slug FROM dog_types WHERE parent_id IS NOT NULL")
            .fetch_all(pool)
            .await
            .context("Failed to load dog breeds — run --taxonomy first")?;

    let breed_map: HashMap<String, uuid::Uuid> = breed_rows.into_iter().map(|(id, slug)| (slug, id)).collect();

    // Insert volunteer users + profiles
    let mut vol_email_to_id: HashMap<String, uuid::Uuid> = HashMap::new();

    for &(email, display_name, vol_names, bio, years, addr, has_vsc, has_pc) in volunteers {
        let user_id: uuid::Uuid = sqlx::query_scalar(
            "INSERT INTO users (email, role, display_name, is_active)
             VALUES ($1, 'volunteer'::user_role, $2, true)
             RETURNING id",
        )
        .bind(email)
        .bind(display_name)
        .fetch_one(pool)
        .await
        .with_context(|| format!("Failed to insert volunteer user: {email}"))?;

        sqlx::query(
            "INSERT INTO volunteer_profiles
                (user_id, volunteer_names, bio, joined_at,
                 has_vulnerable_sector_check, has_police_check,
                 watched_agency_ids)
             VALUES ($1, $2, $3, CURRENT_DATE - ($4 || ' years')::interval,
                     $5, $6, '{}')",
        )
        .bind(user_id)
        .bind(vol_names)
        .bind(bio)
        .bind(years)
        .bind(has_vsc)
        .bind(has_pc)
        .execute(pool)
        .await
        .with_context(|| format!("Failed to insert volunteer profile: {email}"))?;

        // Seed home location — geocode if API key available, else insert without geom
        let coords = if geocode_enabled {
            geocode_cached(addr, &api_key, &cache_path).await
        } else {
            None
        };

        if let Some((lat, lng, neighborhood)) = coords {
            sqlx::query(
                "INSERT INTO volunteer_locations
                    (user_id, name, address, geom, is_home, display_order, neighborhood)
                 VALUES ($1, 'Home', $2, ST_SetSRID(ST_MakePoint($3, $4), 4326)::geography, true, 0, $5)",
            )
            .bind(user_id)
            .bind(addr)
            .bind(lng)
            .bind(lat)
            .bind(neighborhood.as_deref())
            .execute(pool)
            .await
            .with_context(|| format!("Failed to insert volunteer home location: {email}"))?;
        } else {
            sqlx::query(
                "INSERT INTO volunteer_locations
                    (user_id, name, address, is_home, display_order)
                 VALUES ($1, 'Home', $2, true, 0)",
            )
            .bind(user_id)
            .bind(addr)
            .execute(pool)
            .await
            .with_context(|| format!("Failed to insert volunteer home location: {email}"))?;
        }

        // Seed search preferences for the volunteer
        sqlx::query(
            "INSERT INTO search_preferences (user_id, max_distance_km)
             VALUES ($1, 25.0)"
        )
        .bind(user_id)
        .execute(pool)
        .await
        .with_context(|| format!("Failed to insert search preferences: {email}"))?;

        vol_email_to_id.insert(email.to_string(), user_id);
    }

    // Insert dogs
    println!("    → {} dogs...", dogs.len());
    // Primary dog ID per volunteer — used when populating shift assignments.
    let mut vol_email_to_dog_id: HashMap<String, uuid::Uuid> = HashMap::new();
    for &(vol_email, dog_name, breed_slug, size_str, gender_str, age, personality, is_primary) in dogs {
        let vol_id = vol_email_to_id
            .get(vol_email)
            .with_context(|| format!("Volunteer not found for dog: {vol_email}"))?;

        let breed_id = breed_map.get(breed_slug);

        let dog_id: uuid::Uuid = sqlx::query_scalar(
            "INSERT INTO dogs (volunteer_id, name, breed_id, size, gender, date_of_birth, personality_desc, is_primary)
             VALUES ($1, $2, $3, $4::dog_size, $5::dog_gender, CURRENT_DATE - ($6 || ' years')::interval, $7, $8)
             RETURNING id",
        )
        .bind(vol_id)
        .bind(dog_name)
        .bind(breed_id)
        .bind(size_str)
        .bind(gender_str)
        .bind(age)
        .bind(personality)
        .bind(is_primary)
        .fetch_one(pool)
        .await
        .with_context(|| format!("Failed to insert dog: {dog_name} for {vol_email}"))?;

        // Also create an approved application for this dog so they can join shifts
        sqlx::query(
            "INSERT INTO dog_applications (volunteer_id, dog_id, dog_name, breed_id, size, gender, date_of_birth, personality_desc, status, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5::dog_size, $6::dog_gender, CURRENT_DATE - ($7 || ' years')::interval, $8, 'approved', now() - interval '30 days', now() - interval '25 days')"
        )
        .bind(vol_id)
        .bind(dog_id)
        .bind(dog_name)
        .bind(breed_id)
        .bind(size_str)
        .bind(gender_str)
        .bind(age)
        .bind(personality)
        .execute(pool)
        .await
        .with_context(|| format!("Failed to insert dog application for: {dog_name}"))?;

        if is_primary {
            vol_email_to_dog_id.insert(vol_email.to_string(), dog_id);
        }
    }

    // ── 3. Agencies + contacts + sites ─────────────────────────────────────
    println!("    → 15 agencies with contacts & sites...");

    // Build agency_type slug → id lookup
    let atype_rows: Vec<(uuid::Uuid, String)> =
        sqlx::query_as("SELECT id, slug FROM agency_types")
            .fetch_all(pool)
            .await
            .context("Failed to load agency types — run --taxonomy first")?;

    let atype_map: HashMap<String, uuid::Uuid> =
        atype_rows.into_iter().map(|(id, slug)| (slug, id)).collect();

    // (name, slug, agency_type_slug, description)
    #[rustfmt::skip]
    let agencies: &[(&str, &str, &str, &str)] = &[
        ("Sunnybrook Health Sciences Centre",  "sunnybrook",           "hospital",               "Major Toronto trauma centre and veterans' care facility."),
        ("Baycrest Centre for Geriatric Care",  "baycrest",             "care-home",              "World leader in aging and brain health. Residential and day programs."),
        ("Toronto Public Library — Bloor/Gladstone", "tpl-bloor-gladstone", "library",            "Community library branch offering reading programs and events."),
        ("George Brown College",                "george-brown",         "post-secondary",         "Downtown Toronto college with health sciences and community programs."),
        ("Dixon Hall",                          "dixon-hall",           "community-centre",       "Multi-service agency in Regent Park serving diverse communities."),
        ("Yonge Street Mission",                "yonge-street-mission", "shelter",                "Serving homeless and marginally housed youth and adults since 1896."),
        ("Holland Bloorview Kids Rehab",        "holland-bloorview",    "rehabilitation-centre",  "Canada's largest children's rehabilitation hospital."),
        ("Bridgepoint Active Healthcare",       "bridgepoint",          "hospital",               "Complex care and rehabilitation in a stunning waterfront facility."),
        ("Michael Garron Hospital",             "michael-garron",       "hospital",               "East Toronto community hospital serving diverse east-end neighbourhoods."),
        ("Jessie's Centre for Teenagers",       "jessies-centre",       "youth-centre",           "Supporting pregnant and parenting teenagers with wraparound services."),
        ("Greenwood College School",            "greenwood-college",    "secondary-school",       "Independent school in the east end with strong community ties."),
        ("Hospice Toronto",                     "hospice-toronto",      "hospice",                "Residential hospice providing compassionate end-of-life care."),
        ("Scarborough Centre for Healthy Communities", "schc",          "community-centre",       "Providing health and social services across Scarborough."),
        ("CAMH — Centre for Addiction and Mental Health", "camh",       "mental-health-facility", "Canada's largest mental health teaching hospital."),
        ("Sunrise Senior Living — North York",  "sunrise-north-york",   "care-home",              "Senior living community offering assisted living and memory care."),
    ];

    // (agency_slug, name, title, phone, email, is_primary, has_user_account)
    #[rustfmt::skip]
    let contacts: &[(&str, &str, &str, &str, &str, bool, bool)] = &[
        ("sunnybrook",          "Dr. Karen Whitfield",    "Volunteer Coordinator",       "416-480-6100",  "k.whitfield@sunnybrook.dev",     true,  true),
        ("sunnybrook",          "Mark Patterson",         "Recreation Therapist",        "416-480-6101",  "m.patterson@sunnybrook.dev",     false, false),
        ("baycrest",            "Gloria Fung",            "Therapeutic Recreation Lead",  "416-785-2500",  "g.fung@baycrest.dev",            true,  true),
        ("tpl-bloor-gladstone", "Deepa Iyer",             "Branch Manager",              "416-393-7674",  "d.iyer@tpl.dev",                 true,  true),
        ("tpl-bloor-gladstone", "Sam Richards",           "Children's Librarian",        "416-393-7675",  "s.richards@tpl.dev",             false, false),
        ("george-brown",        "Catherine Oduya",        "Student Wellness Director",   "416-415-5000",  "c.oduya@georgebrown.dev",        true,  false),
        ("george-brown",        "Mike Petersen",          "Campus Life Coordinator",     "416-415-5001",  "m.petersen@georgebrown.dev",     false, false),
        ("dixon-hall",          "Angela Moretti",         "Program Manager",             "416-863-0499",  "a.moretti@dixonhall.dev",        true,  true),
        ("yonge-street-mission","Kwame Asante",           "Youth Outreach Worker",       "416-929-9614",  "k.asante@ysm.dev",              true,  false),
        ("holland-bloorview",   "Dr. Priya Nair",         "Child Life Specialist",       "416-425-6220",  "p.nair@hollandbloorview.dev",    true,  true),
        ("holland-bloorview",   "Jessica Chang",          "Volunteer Services",          "416-425-6221",  "j.chang@hollandbloorview.dev",   false, false),
        ("bridgepoint",         "Robert Sinclair",        "Patient Experience Lead",     "416-461-8252",  "r.sinclair@bridgepoint.dev",     true,  false),
        ("michael-garron",      "Tamara Bains",           "Volunteer Services Manager",  "416-461-8272",  "t.bains@michaelgarron.dev",      true,  true),
        ("jessies-centre",      "Lisa Okafor",            "Program Director",            "416-365-1888",  "l.okafor@jessies.dev",           true,  false),
        ("greenwood-college",   "Helen Strauss",          "Community Partnerships",      "416-461-5511",  "h.strauss@greenwood.dev",        true,  false),
        ("greenwood-college",   "Derek Hall",             "VP Student Life",             "416-461-5512",  "d.hall@greenwood.dev",           false, false),
        ("hospice-toronto",     "Margaret O'Neill",       "Volunteer Coordinator",       "416-364-1666",  "m.oneill@hospiceto.dev",         true,  true),
        ("hospice-toronto",     "James Afolabi",          "Social Worker",               "416-364-1667",  "j.afolabi@hospiceto.dev",        false, false),
        ("schc",                "Rupinder Gill",          "Health Promotion Lead",       "416-642-9445",  "r.gill@schc.dev",                true,  false),
        ("camh",                "Dr. Nadine Fournier",    "Recreation Therapy Manager",  "416-535-8501",  "n.fournier@camh.dev",            true,  true),
        ("camh",                "Omar Haddad",            "Peer Support Coordinator",    "416-535-8502",  "o.haddad@camh.dev",              false, false),
        ("sunrise-north-york",  "Patricia Lam",           "Activities Director",         "416-225-4567",  "p.lam@sunrise.dev",              true,  false),
    ];

    // (agency_slug, site_name, address, parking_notes, meeting_notes)
    #[rustfmt::skip]
    let sites: &[(&str, &str, &str, &str, &str)] = &[
        ("sunnybrook",          "Sunnybrook — Main Campus",     "2075 Bayview Ave, Toronto, ON M4N 3M5",          "Free visitor parking off Bayview. Lot B closest to K-Wing.", "Meet at K-Wing volunteer desk, ground floor."),
        ("sunnybrook",          "Sunnybrook — Veterans Centre", "2075 Bayview Ave, Toronto, ON M4N 3M5",          "Same lot as main campus.",                                    "Meet at Veterans Centre reception, Building 7."),
        ("baycrest",            "Baycrest Campus",              "3560 Bathurst St, Toronto, ON M6A 2E1",           "Visitor parking off Bathurst. $8/day max.",                    "Sign in at main reception. Ask for Rec Therapy."),
        ("tpl-bloor-gladstone", "Bloor/Gladstone Branch",       "1101 Bloor St W, Toronto, ON M6H 1M3",           "Street parking on Bloor. TTC recommended.",                    "Enter via main entrance. Ask at circulation desk."),
        ("george-brown",        "St. James Campus",             "200 King St E, Toronto, ON M5A 3W8",             "Green P lot on George St. TTC King streetcar.",                "Meet at Student Centre, Room 226."),
        ("george-brown",        "Waterfront Campus",            "51 Dockside Dr, Toronto, ON M5A 1B6",            "Underground parking available. $4/hr.",                        "Meet at main lobby security desk."),
        ("dixon-hall",          "Dixon Hall — Main",            "58 Sumach St, Toronto, ON M5A 3J7",              "Limited street parking. Dundas streetcar stop nearby.",         "Ring buzzer at front door. Staff will meet you."),
        ("yonge-street-mission","Yonge Street Mission",         "306 Gerrard St E, Toronto, ON M5A 2G7",          "No dedicated parking. TTC or bike recommended.",               "Check in at front desk. ID required."),
        ("holland-bloorview",   "Holland Bloorview Campus",     "150 Kilgour Rd, Toronto, ON M4G 1R8",            "Free parking in visitor lot off Kilgour Rd.",                  "Meet at volunteer services, main floor near Tim Hortons."),
        ("bridgepoint",         "Bridgepoint Campus",           "14 St. Matthews Rd, Toronto, ON M4M 2B5",        "Visitor parking P1 level. First hour free.",                   "Meet at main reception on level 1."),
        ("michael-garron",      "Michael Garron Hospital",      "825 Coxwell Ave, Toronto, ON M4C 3E7",           "Visitor parking off Mortimer Ave. $6/day.",                    "Meet at volunteer office, level 2 near cafeteria."),
        ("jessies-centre",      "Jessie's Centre",              "205 Parliament St, Toronto, ON M5A 2Z2",         "Street parking on Parliament. Very limited.",                  "Buzz unit 2. Staff will come down."),
        ("greenwood-college",   "Greenwood College School",     "443 Mount Pleasant Rd, Toronto, ON M4S 2L8",     "Small visitor lot off Mount Pleasant. Street parking nearby.", "Sign in at main office. Wait in lobby."),
        ("hospice-toronto",     "Kensington Hospice",           "38 Major St, Toronto, ON M5S 2L2",               "Street parking only. Very limited in Kensington.",             "Ring bell at front door. Quiet entry please."),
        ("hospice-toronto",     "Hospice Casa Famiglia",        "190 Dunn Ave, Toronto, ON M6K 1S6",              "Street parking on Dunn Ave.",                                  "Enter through garden gate. Check in at nursing station."),
        ("schc",                "SCHC — Mideast Site",          "2660 Eglinton Ave E, Scarborough, ON M1K 2S3",   "Free lot behind building.",                                    "Enter through main doors. Reception on left."),
        ("camh",                "CAMH — Queen St Site",         "1001 Queen St W, Toronto, ON M6J 1H4",           "Visitor parking off Shaw St. $3/hr.",                          "Meet at volunteer office, Building 80."),
        ("camh",                "CAMH — College St Site",       "250 College St, Toronto, ON M5T 1R8",            "Green P on University Ave. TTC College station.",              "Meet at main reception desk, ground floor."),
        ("sunrise-north-york",  "Sunrise Senior Living",        "3 Concorde Gate, Toronto, ON M3C 3N7",           "Visitor parking in front lot. Free.",                          "Sign in at reception. Ask for Activities room."),
    ];

    // Insert agencies
    let mut agency_slug_to_id: HashMap<String, uuid::Uuid> = HashMap::new();

    for &(name, slug, atype_slug, description) in agencies {
        let atype_id = atype_map.get(atype_slug);

        let agency_id: uuid::Uuid = sqlx::query_scalar(
            "INSERT INTO agencies (name, slug, agency_type_id, description, is_login_active, can_create_request)
             VALUES ($1, $2, $3, $4, true, true)
             RETURNING id",
        )
        .bind(name)
        .bind(slug)
        .bind(atype_id)
        .bind(description)
        .fetch_one(pool)
        .await
        .with_context(|| format!("Failed to insert agency: {slug}"))?;

        agency_slug_to_id.insert(slug.to_string(), agency_id);
    }

    // Insert contacts (some with user accounts)
    let mut contact_name_to_id: HashMap<String, uuid::Uuid> = HashMap::new();
    let mut primary_contacts: Vec<(String, uuid::Uuid)> = Vec::new(); // (agency_slug, contact_id)

    for &(agency_slug, name, title, phone, email, is_primary, has_account) in contacts {
        let agency_id = agency_slug_to_id
            .get(agency_slug)
            .with_context(|| format!("Agency not found for contact: {agency_slug}"))?;

        // Create user account if needed
        let user_id: Option<uuid::Uuid> = if has_account {
            let uid: uuid::Uuid = sqlx::query_scalar(
                "INSERT INTO users (email, role, display_name, is_active, email_verified_at)
                 VALUES ($1, 'agency_contact'::user_role, $2, true, now())
                 RETURNING id",
            )
            .bind(email)
            .bind(name)
            .fetch_one(pool)
            .await
            .with_context(|| format!("Failed to insert contact user: {email}"))?;
            Some(uid)
        } else {
            None
        };

        let contact_id: uuid::Uuid = sqlx::query_scalar(
            "INSERT INTO contacts (agency_id, user_id, name, title, phone, email, is_primary)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING id",
        )
        .bind(agency_id)
        .bind(user_id)
        .bind(name)
        .bind(title)
        .bind(phone)
        .bind(email)
        .bind(is_primary)
        .fetch_one(pool)
        .await
        .with_context(|| format!("Failed to insert contact: {name}"))?;

        contact_name_to_id.insert(format!("{agency_slug}:{name}"), contact_id);

        if is_primary {
            primary_contacts.push((agency_slug.to_string(), contact_id));
        }
    }

    // Set primary_contact_id on agencies
    for (slug, contact_id) in &primary_contacts {
        let agency_id = agency_slug_to_id.get(slug.as_str()).unwrap();
        sqlx::query("UPDATE agencies SET primary_contact_id = $1 WHERE id = $2")
            .bind(contact_id)
            .bind(agency_id)
            .execute(pool)
            .await?;
    }

    // Insert sites
    let mut site_key_to_id: HashMap<String, uuid::Uuid> = HashMap::new();

    for &(agency_slug, site_name, address, parking, meeting) in sites {
        let agency_id = agency_slug_to_id
            .get(agency_slug)
            .with_context(|| format!("Agency not found for site: {agency_slug}"))?;

        // Geocode the site address
        let coords = if geocode_enabled {
            geocode_cached(address, &api_key, &cache_path).await
        } else {
            None
        };

        let site_id: uuid::Uuid = if let Some((lat, lng, neighborhood)) = coords {
            sqlx::query_scalar(
                "INSERT INTO sites (agency_id, name, address, geom,
                                    region_id, default_parking_notes, default_meeting_notes, neighborhood)
                 VALUES ($1, $2, $3,
                         ST_SetSRID(ST_MakePoint($4, $5), 4326)::geography,
                         (SELECT id FROM regions
                          WHERE ST_Covers(geom, ST_SetSRID(ST_MakePoint($4, $5), 4326)::geography)
                          LIMIT 1),
                         $6, $7, $8)
                 RETURNING id",
            )
            .bind(agency_id)
            .bind(site_name)
            .bind(address)
            .bind(lng)
            .bind(lat)
            .bind(parking)
            .bind(meeting)
            .bind(neighborhood.as_deref())
            .fetch_one(pool)
            .await
            .with_context(|| format!("Failed to insert site: {site_name}"))?
        } else {
            sqlx::query_scalar(
                "INSERT INTO sites (agency_id, name, address,
                                    default_parking_notes, default_meeting_notes)
                 VALUES ($1, $2, $3, $4, $5)
                 RETURNING id",
            )
            .bind(agency_id)
            .bind(site_name)
            .bind(address)
            .bind(parking)
            .bind(meeting)
            .fetch_one(pool)
            .await
            .with_context(|| format!("Failed to insert site: {site_name}"))?
        };

        site_key_to_id.insert(format!("{agency_slug}:{site_name}"), site_id);
    }

    // ── 4. Shifts + volunteer assignments ──────────────────────────────────
    println!("    → Inserting shifts (upcoming + historical) and volunteer assignments...");

    // Shared row type: (agency_slug, site_name, contact_name, title, description,
    //                   days_from_now, start_hour, duration_hours, slots, est_clients)
    // days_from_now may be negative for historical shifts.

    // ─── Upcoming: coming up soon (≤ 14 days) ──────────────────────────────
    #[rustfmt::skip]
    let shifts_soon: &[(&str, &str, &str, &str, &str, i32, i32, i32, i32, i32)] = &[
        ("sunnybrook",           "Sunnybrook — Main Campus",     "Dr. Karen Whitfield", "K-Wing Patient Visits",       "Floor-by-floor room visits in the K-Wing. Focus on long-stay patients.",                        7,  10, 2, 3, 25),
        ("greenwood-college",    "Greenwood College School",     "Helen Strauss",       "Wellness Wednesday",          "Dogs visit the school library during lunch. Students rotate through in groups.",               7,  12, 1, 3, 30),
        ("george-brown",         "St. James Campus",             "Catherine Oduya",     "Exam Stress Relief",          "Drop-in therapy dog lounge during exam week. Student Centre atrium.",                         8,  12, 3, 4, 50),
        ("camh",                 "CAMH — Queen St Site",         "Dr. Nadine Fournier", "Outpatient Lounge Visit",     "Drop-in session in the outpatient wellness lounge. Patients self-select interaction.",         8,  14, 2, 3, 12),
        ("yonge-street-mission", "Yonge Street Mission",         "Kwame Asante",        "Youth Drop-In Session",       "Informal hang-out with therapy dogs in the youth lounge.",                                    9,  13, 2, 2, 10),
        ("baycrest",             "Baycrest Campus",              "Gloria Fung",         "Memory Care Lounge Visit",    "Group session in the memory care lounge. Gentle interaction with residents.",                 10, 14, 2, 4, 15),
        ("hospice-toronto",      "Kensington Hospice",           "Margaret O'Neill",    "Bedside Comfort Visits",      "Gentle one-on-one visits with hospice residents. Very calm dogs only.",                       10, 10, 3, 2, 8),
        ("bridgepoint",          "Bridgepoint Campus",           "Robert Sinclair",     "Complex Care Floor Walk",     "Walking visit through the complex care floor. Patients are mostly bedbound.",                 11, 14, 2, 2, 20),
        ("sunrise-north-york",   "Sunrise Senior Living",        "Patricia Lam",        "Afternoon Tea & Dogs",        "Therapy dogs join afternoon tea in the main lounge. Residents love the company.",             11, 14, 2, 3, 25),
        ("dixon-hall",           "Dixon Hall — Main",            "Angela Moretti",      "After-School Program Visit",  "Therapy dogs join the after-school homework club. Kids love the dogs.",                      12, 15, 2, 3, 18),
        ("michael-garron",       "Michael Garron Hospital",      "Tamara Bains",        "Geriatric Ward Visit",        "Visit the geriatric assessment unit. Many patients have dementia.",                          13, 10, 2, 3, 15),
        ("tpl-bloor-gladstone",  "Bloor/Gladstone Branch",       "Deepa Iyer",          "Reading Buddies with Dogs",   "Kids read aloud to therapy dogs in the children's section. Ages 6-12.",                     14, 11, 2, 3, 12),
        ("schc",                 "SCHC — Mideast Site",          "Rupinder Gill",       "Seniors Wellness Circle",     "Therapy dogs join the weekly seniors' wellness group. Light exercise and socializing.",      14, 10, 2, 3, 20),
    ];

    // ─── Upcoming: more than two weeks away ────────────────────────────────
    #[rustfmt::skip]
    let shifts_later: &[(&str, &str, &str, &str, &str, i32, i32, i32, i32, i32)] = &[
        ("holland-bloorview",   "Holland Bloorview Campus",     "Dr. Priya Nair",      "Rehab Floor Visits",          "One-on-one visits with children in rehab. Dogs must be calm with wheelchairs/walkers.",      15, 10, 2, 3, 8),
        ("jessies-centre",      "Jessie's Centre",              "Lisa Okafor",         "Young Moms & Dogs",           "Therapy dog session with young mothers and their babies. Very gentle dogs needed.",          16, 13, 2, 2, 6),
        ("sunnybrook",          "Sunnybrook — Veterans Centre", "Mark Patterson",      "Veterans' Lounge Visit",      "Monthly group visit to the Veterans Centre common room. Residents love the dogs.",          19, 10, 2, 3, 12),
        ("baycrest",            "Baycrest Campus",              "Gloria Fung",         "Afternoon Memory Garden",     "Outdoor session in the memory garden when weather permits.",                                 21, 14, 2, 4, 10),
        ("michael-garron",      "Michael Garron Hospital",      "Tamara Bains",        "Morning Ward Rounds",         "Early morning visits across the general medicine ward.",                                     23, 9,  2, 2, 18),
        ("camh",                "CAMH — College St Site",       "Omar Haddad",         "Peer Support Drop-In",        "Weekly peer support group with therapy dog participation.",                                  25, 13, 2, 3, 15),
        ("hospice-toronto",     "Hospice Casa Famiglia",        "James Afolabi",       "Evening Comfort Hour",        "Gentle evening visits for residents and families.",                                          27, 17, 2, 2, 6),
        ("holland-bloorview",   "Holland Bloorview Campus",     "Jessica Chang",       "Paediatric Playroom Visit",   "Play-based session with children in the therapy playroom.",                                 29, 11, 2, 3, 10),
        ("george-brown",        "Waterfront Campus",            "Mike Petersen",       "End-of-Term Celebration",     "Therapy dog lounge to celebrate the end of term.",                                          31, 12, 3, 4, 45),
        ("sunrise-north-york",  "Sunrise Senior Living",        "Patricia Lam",        "Morning Coffee & Dogs",       "Informal morning drop-in during coffee hour with residents.",                               33, 10, 2, 3, 20),
    ];

    // ─── Historical (past month) ────────────────────────────────────────────
    #[rustfmt::skip]
    let shifts_past: &[(&str, &str, &str, &str, &str, i32, i32, i32, i32, i32)] = &[
        ("sunnybrook",           "Sunnybrook — Main Campus",    "Dr. Karen Whitfield", "K-Wing Morning Rounds",       "Weekly floor visits for long-stay patients.",                                                -3,  10, 2, 3, 22),
        ("baycrest",             "Baycrest Campus",             "Gloria Fung",         "Memory Care Afternoon",       "Group session in the memory care lounge.",                                                   -7,  14, 2, 4, 14),
        ("greenwood-college",    "Greenwood College School",    "Helen Strauss",       "Lunch Break Visit",           "Dogs in the school library during lunch hour.",                                              -7,  12, 1, 3, 28),
        ("michael-garron",       "Michael Garron Hospital",     "Tamara Bains",        "Geriatric Unit Morning",      "Visits across the geriatric assessment unit.",                                               -10, 10, 2, 3, 16),
        ("camh",                 "CAMH — Queen St Site",        "Dr. Nadine Fournier", "Wellness Lounge Session",     "Drop-in session in the outpatient lounge.",                                                  -12, 14, 2, 3, 11),
        ("hospice-toronto",      "Kensington Hospice",          "Margaret O'Neill",    "Comfort Visits — Morning",    "One-on-one bedside visits with hospice residents.",                                          -15, 10, 2, 2, 7),
        ("dixon-hall",           "Dixon Hall — Main",           "Angela Moretti",      "After-School Dogs",           "Therapy dogs in the after-school homework club.",                                            -18, 15, 2, 3, 20),
        ("tpl-bloor-gladstone",  "Bloor/Gladstone Branch",      "Deepa Iyer",          "Tail Wagging Tales",          "Kids reading session with therapy dogs.",                                                    -20, 11, 2, 3, 14),
        ("sunrise-north-york",   "Sunrise Senior Living",       "Patricia Lam",        "Tea Time with Dogs",          "Therapy dogs at afternoon tea.",                                                             -22, 14, 2, 3, 24),
        ("bridgepoint",          "Bridgepoint Campus",          "Robert Sinclair",     "Complex Care Visits",         "Walking visits through the complex care floor.",                                             -25, 14, 2, 2, 18),
        ("yonge-street-mission", "Yonge Street Mission",        "Kwame Asante",        "Youth Lounge Hangout",        "Informal session with therapy dogs in the youth lounge.",                                   -28, 13, 2, 2, 9),
        ("george-brown",         "St. James Campus",            "Catherine Oduya",     "Finals Stress Buster",        "Therapy dog drop-in during final exam season.",                                             -30, 12, 3, 4, 48),
    ];

    let mut shift_key_to_id: HashMap<String, uuid::Uuid> = HashMap::new();

    // Insert upcoming shifts (published)
    for &(agency_slug, site_name, contact_name, title, description, days_offset, start_hour, duration_hrs, slots, est_clients)
        in shifts_soon.iter().chain(shifts_later.iter())
    {
        let agency_id = *agency_slug_to_id.get(agency_slug).unwrap();
        let site_key = format!("{agency_slug}:{site_name}");
        let site_id = *site_key_to_id.get(&site_key)
            .with_context(|| format!("Site not found: {site_key}"))?;
        let contact_key = format!("{agency_slug}:{contact_name}");
        let contact_id = *contact_name_to_id.get(&contact_key)
            .with_context(|| format!("Contact not found: {contact_key}"))?;

        let shift_id: uuid::Uuid = sqlx::query_scalar(
            "INSERT INTO shifts
                (agency_id, site_id, contact_id, title, description,
                 start_at, end_at, slots_requested, estimated_clients,
                 state, created_by)
             VALUES ($1, $2, $3, $4, $5,
                     CURRENT_DATE + $6 * INTERVAL '1 day' + $7 * INTERVAL '1 hour',
                     CURRENT_DATE + $6 * INTERVAL '1 day' + ($7 + $8) * INTERVAL '1 hour',
                     $9, $10, 'published'::shift_state, $11)
             RETURNING id",
        )
        .bind(agency_id).bind(site_id).bind(contact_id)
        .bind(title).bind(description)
        .bind(days_offset).bind(start_hour).bind(duration_hrs)
        .bind(slots).bind(est_clients).bind(primary_admin)
        .fetch_one(pool)
        .await
        .with_context(|| format!("Failed to insert shift: {title}"))?;

        shift_key_to_id.insert(format!("{agency_slug}:{title}"), shift_id);
    }

    // Insert historical shifts (archived)
    for &(agency_slug, site_name, contact_name, title, description, days_offset, start_hour, duration_hrs, slots, est_clients)
        in shifts_past.iter()
    {
        let agency_id = *agency_slug_to_id.get(agency_slug).unwrap();
        let site_key = format!("{agency_slug}:{site_name}");
        let site_id = *site_key_to_id.get(&site_key)
            .with_context(|| format!("Site not found: {site_key}"))?;
        let contact_key = format!("{agency_slug}:{contact_name}");
        let contact_id = *contact_name_to_id.get(&contact_key)
            .with_context(|| format!("Contact not found: {contact_key}"))?;

        let shift_id: uuid::Uuid = sqlx::query_scalar(
            "INSERT INTO shifts
                (agency_id, site_id, contact_id, title, description,
                 start_at, end_at, slots_requested, estimated_clients,
                 state, created_by,
                 volunteer_survey_sent_at, agency_survey_sent_at)
             VALUES ($1, $2, $3, $4, $5,
                     CURRENT_DATE + $6 * INTERVAL '1 day' + $7 * INTERVAL '1 hour',
                     CURRENT_DATE + $6 * INTERVAL '1 day' + ($7 + $8) * INTERVAL '1 hour',
                     $9, $10, 'archived'::shift_state, $11,
                     now(), now())
             RETURNING id",
        )
        .bind(agency_id).bind(site_id).bind(contact_id)
        .bind(title).bind(description)
        .bind(days_offset).bind(start_hour).bind(duration_hrs)
        .bind(slots).bind(est_clients).bind(primary_admin)
        .fetch_one(pool)
        .await
        .with_context(|| format!("Failed to insert historical shift: {title}"))?;

        shift_key_to_id.insert(format!("{agency_slug}:{title}"), shift_id);
    }

    // ─── Volunteer assignments ──────────────────────────────────────────────
    // (shift_key, confirmed_vol_emails, waitlisted_vol_emails)
    #[rustfmt::skip]
    let assignment_groups: &[(&str, &[&str], &[&str])] = &[
        // ── Coming up soon — fully crewed + waitlist ─────────────────────
        ("sunnybrook:K-Wing Patient Visits",
         &["v01@sunshine.dev", "v02@sunshine.dev", "v09@sunshine.dev"],
         &["v10@sunshine.dev", "v39@sunshine.dev"]),
        ("greenwood-college:Wellness Wednesday",
         &["v12@sunshine.dev", "v22@sunshine.dev", "v30@sunshine.dev"],
         &["v31@sunshine.dev"]),
        ("george-brown:Exam Stress Relief",
         &["v03@sunshine.dev", "v07@sunshine.dev", "v19@sunshine.dev", "v24@sunshine.dev"],
         &["v25@sunshine.dev", "v26@sunshine.dev"]),
        ("camh:Outpatient Lounge Visit",
         &["v04@sunshine.dev", "v16@sunshine.dev", "v27@sunshine.dev"],
         &["v28@sunshine.dev"]),
        ("yonge-street-mission:Youth Drop-In Session",
         &["v05@sunshine.dev", "v08@sunshine.dev"],
         &["v13@sunshine.dev"]),

        // ── Coming up soon — fully crewed, no waitlist ───────────────────
        ("baycrest:Memory Care Lounge Visit",
         &["v06@sunshine.dev", "v11@sunshine.dev", "v14@sunshine.dev", "v38@sunshine.dev"],
         &[]),
        ("hospice-toronto:Bedside Comfort Visits",
         &["v36@sunshine.dev", "v40@sunshine.dev"],
         &[]),
        ("bridgepoint:Complex Care Floor Walk",
         &["v15@sunshine.dev", "v23@sunshine.dev"],
         &[]),
        ("sunrise-north-york:Afternoon Tea & Dogs",
         &["v17@sunshine.dev", "v32@sunshine.dev", "v41@sunshine.dev"],
         &[]),
        ("dixon-hall:After-School Program Visit",
         &["v18@sunshine.dev", "v29@sunshine.dev", "v43@sunshine.dev"],
         &[]),
        ("michael-garron:Geriatric Ward Visit",
         &["v20@sunshine.dev", "v35@sunshine.dev", "v44@sunshine.dev"],
         &[]),

        // ── Coming up soon — open spots ──────────────────────────────────
        ("tpl-bloor-gladstone:Reading Buddies with Dogs",
         &["v21@sunshine.dev"],
         &[]),
        ("schc:Seniors Wellness Circle",
         &["v33@sunshine.dev"],
         &[]),

        // ── More than two weeks — partially filled ───────────────────────
        ("holland-bloorview:Rehab Floor Visits",    &["v34@sunshine.dev"], &[]),
        ("jessies-centre:Young Moms & Dogs",        &["v42@sunshine.dev"], &[]),
        ("sunnybrook:Veterans' Lounge Visit",       &["v45@sunshine.dev"], &[]),
        ("baycrest:Afternoon Memory Garden",        &["v02@sunshine.dev", "v09@sunshine.dev"], &[]),
        ("michael-garron:Morning Ward Rounds",      &["v01@sunshine.dev"], &[]),
        // camh:Peer Support Drop-In — no sign-ups yet
        ("holland-bloorview:Paediatric Playroom Visit", &["v34@sunshine.dev"], &[]),
        ("george-brown:End-of-Term Celebration",    &["v07@sunshine.dev"], &[]),

        // ── More than two weeks — fully crewed (a couple) ────────────────
        ("hospice-toronto:Evening Comfort Hour",
         &["v11@sunshine.dev", "v12@sunshine.dev"],
         &["v36@sunshine.dev"]),
        ("sunrise-north-york:Morning Coffee & Dogs",
         &["v17@sunshine.dev", "v19@sunshine.dev", "v32@sunshine.dev"],
         &[]),

        // ── Historical — all fully crewed ────────────────────────────────
        ("sunnybrook:K-Wing Morning Rounds",
         &["v01@sunshine.dev", "v02@sunshine.dev", "v09@sunshine.dev"], &[]),
        ("baycrest:Memory Care Afternoon",
         &["v03@sunshine.dev", "v07@sunshine.dev", "v14@sunshine.dev", "v24@sunshine.dev"], &[]),
        ("greenwood-college:Lunch Break Visit",
         &["v12@sunshine.dev", "v22@sunshine.dev", "v39@sunshine.dev"], &[]),
        ("michael-garron:Geriatric Unit Morning",
         &["v04@sunshine.dev", "v16@sunshine.dev", "v35@sunshine.dev"], &[]),
        ("camh:Wellness Lounge Session",
         &["v06@sunshine.dev", "v10@sunshine.dev", "v27@sunshine.dev"], &[]),
        ("hospice-toronto:Comfort Visits — Morning",
         &["v11@sunshine.dev", "v36@sunshine.dev"], &[]),
        ("dixon-hall:After-School Dogs",
         &["v18@sunshine.dev", "v29@sunshine.dev", "v40@sunshine.dev"], &[]),
        ("tpl-bloor-gladstone:Tail Wagging Tales",
         &["v21@sunshine.dev", "v30@sunshine.dev", "v43@sunshine.dev"], &[]),
        ("sunrise-north-york:Tea Time with Dogs",
         &["v17@sunshine.dev", "v32@sunshine.dev", "v41@sunshine.dev"], &[]),
        ("bridgepoint:Complex Care Visits",
         &["v15@sunshine.dev", "v23@sunshine.dev"], &[]),
        ("yonge-street-mission:Youth Lounge Hangout",
         &["v05@sunshine.dev", "v08@sunshine.dev"], &[]),
        ("george-brown:Finals Stress Buster",
         &["v19@sunshine.dev", "v24@sunshine.dev", "v25@sunshine.dev", "v26@sunshine.dev"], &[]),
    ];

    let mut assignment_count = 0u32;
    for &(shift_key, confirmed, waitlisted) in assignment_groups {
        let shift_id = match shift_key_to_id.get(shift_key) {
            Some(&id) => id,
            None => {
                eprintln!("  ⚠ Shift key not found for assignments: {shift_key}");
                continue;
            }
        };

        for &vol_email in confirmed {
            let vol_id = *vol_email_to_id
                .get(vol_email)
                .with_context(|| format!("Volunteer not found: {vol_email}"))?;
            let dog_ids: Vec<uuid::Uuid> = vol_email_to_dog_id
                .get(vol_email)
                .map(|&id| vec![id])
                .unwrap_or_default();

            sqlx::query(
                "INSERT INTO shift_assignments (shift_id, volunteer_id, dog_ids, status)
                 VALUES ($1, $2, $3, 'confirmed'::assignment_status)
                 ON CONFLICT (shift_id, volunteer_id) DO NOTHING",
            )
            .bind(shift_id).bind(vol_id).bind(&dog_ids)
            .execute(pool)
            .await
            .with_context(|| format!("Failed to assign {vol_email} to {shift_key}"))?;
            assignment_count += 1;
        }

        for (pos, &vol_email) in waitlisted.iter().enumerate() {
            let vol_id = *vol_email_to_id
                .get(vol_email)
                .with_context(|| format!("Volunteer not found: {vol_email}"))?;
            let dog_ids: Vec<uuid::Uuid> = vol_email_to_dog_id
                .get(vol_email)
                .map(|&id| vec![id])
                .unwrap_or_default();

            sqlx::query(
                "INSERT INTO shift_assignments (shift_id, volunteer_id, dog_ids, status, waitlist_position)
                 VALUES ($1, $2, $3, 'waitlisted'::assignment_status, $4)
                 ON CONFLICT (shift_id, volunteer_id) DO NOTHING",
            )
            .bind(shift_id).bind(vol_id).bind(&dog_ids).bind((pos + 1) as i32)
            .execute(pool)
            .await
            .with_context(|| format!("Failed to waitlist {vol_email} for {shift_key}"))?;
            assignment_count += 1;
        }
    }

    let total_shifts = shift_key_to_id.len();
    println!(
        "    ✓ 6 admins (1 super + 5), 45 volunteers ({} dogs), 15 agencies, \
         {} shifts ({} upcoming, {} past), {} assignments",
        dogs.len(),
        total_shifts,
        shifts_soon.len() + shifts_later.len(),
        shifts_past.len(),
        assignment_count,
    );
    Ok(())
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

fn slugify(s: &str) -> String {
    s.to_lowercase()
        .chars()
        .map(|c| if c.is_alphanumeric() { c } else { '-' })
        .collect::<String>()
        .split('-')
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join("-")
}
