use std::collections::HashMap;
use chrono::{DateTime, NaiveDate, NaiveTime, Utc};
use rocket::{delete, form::Form, fs::TempFile, get, http::{Cookie, CookieJar}, post, response::{Flash, Redirect}, routes, Route, Either, request::FlashMessage, State};
use rocket_dyn_templates::{context, Template};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

// Helper function
fn blank(s: &str) -> Option<String> {
    if s.trim().is_empty() {
        None
    } else {
        Some(s.to_owned())
    }
}

use crate::{
    auth::{
        session::AuthUser,
        volunteer_status::{ApprovedVolunteer, VolunteerWithStatus},
    },
    config::AppConfig,
    errors::{AppError, AppResult},
    models::{
        agency::ContactVisibility,
        dog::{DogSize, DogGender, DogApplicationStatus},
        event_log::EventLog,
        gallery::{AssetVisibility, get_user_gallery},
        shift::{AssignmentStatus, promote_next_waitlisted},
        user::UserRole,
        volunteer::{
            DogDetail, VolunteerEventDetail, VolunteerStats,
        },
        volunteer_location::VolunteerLocationCard,
    },
    routes::gallery::handle_upload,
    storage::StorageBackend,
    Db,
};

pub fn routes() -> Vec<Route> {
    routes![
        shifts_listing,
        shift_detail,
        shift_join,
        shift_leave,
        dashboard,
        profile_page,
        profile_update,
        dog_create,
        dog_update,
        dog_toggle_active,
        dog_retire,
        dog_photo_upload,
        dog_photo_remove,
        profile_photo_upload,
        profile_photo_remove,
        history_page,
        agenda,
        gallery,
        survey_upload,
        delete_asset,
        survey_form,
        survey_submit,
        dismiss_notification,
        waitlist_respond,
        waitlist_decline_token,
        accept_invite,
        decline_invite,
        // Dog application routes
        dog_applications_list,
        dog_application_new,
        dog_application_create,
        dog_application_detail_volunteer,
        dog_application_reschedule,
        // Message centre
        messages_page,
        message_mark_read,
        message_archive,
        messages_mark_all_read,
        // Help alert bar
        help_alerts_partial,
        dismiss_help_alert,
        // Survey banner
        survey_banner_partial,
        // Shift time preferences
        shift_time_preferences_get,
        shift_time_preferences_update,
        // Search preferences
        save_match_prefs,
        // Search locations
        location_create,
        location_edit_get,
        location_update,
        location_delete,
        location_geocode_retry,
        // Saved querysets
        queryset_list,
        queryset_save,
        queryset_delete,
        queryset_set_default,
        queryset_clear_default,
        // Calendar settings
        calendar_settings_page,
        calendar_token_regenerate,
        calendar_available_config,
    ]
}

// ─── Shift listing ────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct ShiftFilters {
    pub region: Option<String>,               // region slug
    pub distance_km: Option<f64>,             // legacy
    pub agency_type: Option<String>,          // agency type slug
    pub page: Option<i64>,
    pub location_id: Option<Uuid>,            // selected volunteer_location id
    pub preferred_distance_km: Option<f64>,   // slider value (3–20 km)
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct ShiftCard {
    pub id: Uuid,
    pub title: String,
    pub start_at: DateTime<Utc>,
    pub end_at: DateTime<Utc>,
    pub slots_requested: i32,
    pub slots_confirmed: i64,
    pub requires_police_check: bool,
    pub requires_vulnerable_check: bool,
    pub agency_name: String,
    pub agency_type_name: Option<String>,
    pub site_name: String,
    pub region_name: Option<String>,
    pub distance_km: Option<f64>,
    pub site_lat: Option<f64>,
    pub site_lng: Option<f64>,
    // Whether the current user is assigned / waitlisted
    pub my_status: Option<String>,
    pub my_waitlist_position: Option<i32>,
    // JSON array of {volunteer_names, dog_name} for confirmed assignees
    pub team_members: serde_json::Value,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct ShiftTeamMember {
    pub user_id: Uuid,
    pub volunteer_names: String,
    pub dog_name: Option<String>,
    pub dog_breed: Option<String>,
    pub dog_size: Option<String>,
    pub profile_pic_asset_id: Option<Uuid>,
    pub status: String,
    pub waitlist_position: Option<i32>,
    pub confirmation_deadline_at: Option<DateTime<Utc>>,
}

const PAGE_SIZE: i64 = 20;

// ─── Filter pills ──────────────────────────────────────────────────────────────

/// A single dismissible filter pill rendered in the active-filter summary row.
#[derive(Debug, Serialize)]
struct FilterPill {
    label: String,
    clear_url: String,
}

/// Pre-computed pill data for all active shift filters.
/// Built in the route handler so the template only renders values, not URLs.
#[derive(Debug, Serialize)]
struct FilterPills {
    distance: Option<FilterPill>,
    region: Option<FilterPill>,
    agency_type: Option<FilterPill>,
    open_only: Option<FilterPill>,
    /// True if any server-side filter pill is active (used for initial `display:none` hint).
    any_server_filter: bool,
    /// Integer km value for `<input type="range">` — 0 means "no filter".
    distance_slider_value: i64,
    /// Human-readable distance label shown beside the slider (e.g. "10 km" or "Any distance").
    distance_slider_label: String,
}

/// Assemble a `/volunteer/shifts?…` URL from a list of (key, value) pairs,
/// skipping any pair whose value is empty.
fn build_shifts_url(params: &[(&str, &str)]) -> String {
    let parts: Vec<String> = params
        .iter()
        .filter(|(_, v)| !v.is_empty())
        .map(|(k, v)| format!("{}={}", k, v))
        .collect();
    if parts.is_empty() {
        "/volunteer/shifts".to_string()
    } else {
        format!("/volunteer/shifts?{}", parts.join("&"))
    }
}

/// Build [`FilterPills`] from the resolved filter state.
fn build_filter_pills(
    distance_filter_active: bool,
    filter_location_id: Option<Uuid>,
    ui_distance_km: f64,
    region: Option<&str>,
    agency_type: Option<&str>,
    open_only: bool,
    match_prefs_active: bool,
    regions: &[(Uuid, String, String)],
    agency_types: &[(Uuid, String, String)],
    locations: &[VolunteerLocationCard],
) -> FilterPills {
    // Shared stringified values reused across pill URL builders.
    let dist_km_str = format!("{}", ui_distance_km.floor() as i64);
    let loc_id_str = filter_location_id.map(|id| id.to_string()).unwrap_or_default();
    let region_str = region.unwrap_or("");
    let agency_type_str = agency_type.unwrap_or("");
    let open_only_str = if open_only { "true" } else { "" };
    let match_prefs_str = if match_prefs_active { "true" } else { "" };

    // Distance pill — cleared via `clear_distance=true`.
    let distance_pill = if distance_filter_active {
        let location_suffix = filter_location_id
            .and_then(|lid| locations.iter().find(|l| l.id == lid))
            .map(|l| format!(" of {}", l.name))
            .unwrap_or_default();
        let label = format!("Within {} km{}", ui_distance_km.floor() as i64, location_suffix);
        let clear_url = build_shifts_url(&[
            ("clear_distance", "true"),
            ("region", region_str),
            ("agency_type", agency_type_str),
            ("open_only", open_only_str),
            ("match_prefs", match_prefs_str),
        ]);
        Some(FilterPill { label, clear_url })
    } else {
        None
    };

    // Region pill — cleared by omitting `region`.
    let region_pill = region.map(|slug| {
        let name = regions
            .iter()
            .find(|(_, _, s)| s == slug)
            .map(|t| t.1.as_str())
            .unwrap_or(slug);
        let clear_url = build_shifts_url(&[
            ("location_id", if distance_filter_active { &loc_id_str } else { "" }),
            ("preferred_distance_km", if distance_filter_active { &dist_km_str } else { "" }),
            ("agency_type", agency_type_str),
            ("open_only", open_only_str),
            ("match_prefs", match_prefs_str),
        ]);
        FilterPill { label: name.to_string(), clear_url }
    });

    // Agency type pill — cleared by omitting `agency_type`.
    let agency_type_pill = agency_type.map(|slug| {
        let name = agency_types
            .iter()
            .find(|(_, _, s)| s == slug)
            .map(|t| t.1.as_str())
            .unwrap_or(slug);
        let clear_url = build_shifts_url(&[
            ("region", region_str),
            ("location_id", if distance_filter_active { &loc_id_str } else { "" }),
            ("preferred_distance_km", if distance_filter_active { &dist_km_str } else { "" }),
            ("open_only", open_only_str),
            ("match_prefs", match_prefs_str),
        ]);
        FilterPill { label: name.to_string(), clear_url }
    });

    // Open spots only pill — cleared by omitting `open_only`.
    let open_only_pill = if open_only {
        let clear_url = build_shifts_url(&[
            ("region", region_str),
            ("location_id", if distance_filter_active { &loc_id_str } else { "" }),
            ("preferred_distance_km", if distance_filter_active { &dist_km_str } else { "" }),
            ("agency_type", agency_type_str),
            ("match_prefs", match_prefs_str),
        ]);
        Some(FilterPill { label: "Open spots only".to_string(), clear_url })
    } else {
        None
    };

    let any_server_filter = distance_pill.is_some()
        || region_pill.is_some()
        || agency_type_pill.is_some()
        || open_only_pill.is_some();

    let distance_slider_value = if distance_filter_active { ui_distance_km.floor() as i64 } else { 0 };
    let distance_slider_label = if distance_filter_active {
        format!("{} km", ui_distance_km.floor() as i64)
    } else {
        "Any distance".to_string()
    };

    FilterPills {
        distance: distance_pill,
        region: region_pill,
        agency_type: agency_type_pill,
        open_only: open_only_pill,
        any_server_filter,
        distance_slider_value,
        distance_slider_label,
    }
}

#[get("/shifts?<region>&<agency_type>&<page>&<location_id>&<preferred_distance_km>&<clear_distance>&<open_only>&<match_prefs>")]
pub async fn shifts_listing(
    db: &Db,
    user: ApprovedVolunteer,
    region: Option<&str>,
    agency_type: Option<&str>,
    page: Option<i64>,
    location_id: Option<Uuid>,
    preferred_distance_km: Option<f64>,
    clear_distance: Option<bool>,
    open_only: Option<bool>,
    match_prefs: Option<String>,
    flash: Option<FlashMessage<'_>>,
    config: &State<AppConfig>,
) -> AppResult<Template> {
    let user = user.user();
    let flash_msg = flash.map(|f| context! { kind: f.kind().to_string(), message: f.message().to_string() });
    let page = page.unwrap_or(0).max(0);
    let offset = page * PAGE_SIZE;
    // Normalize empty strings from form submissions to None so SQL NULL checks work correctly.
    let region = region.filter(|s| !s.is_empty());
    let agency_type = agency_type.filter(|s| !s.is_empty());

    // Determine if matching preferences filter is active.
    // URL param takes precedence; if absent, fall back to the saved DB preference.
    // (The DB value is updated by the client via POST /volunteer/match-prefs.)
    let match_prefs_from_url = match_prefs.as_deref().map(|v| v == "true");
    // resolved after loading saved_match_prefs below

    // Load saved distance filter preferences and match_preferences flag
    let (saved_location_id, saved_distance_km, saved_match_prefs): (Option<Uuid>, Option<f64>, bool) =
        sqlx::query_as(
            "SELECT preferred_location_id, preferred_distance_km::float8, match_preferences \
             FROM search_preferences WHERE user_id = $1",
        )
        .bind(user.id())
        .fetch_optional(&**db)
        .await?
        .unwrap_or((None, None, false));

    // Resolve match_prefs: URL param wins; otherwise restore from DB.
    let match_prefs_active = match_prefs_from_url.unwrap_or(saved_match_prefs);

    // Resolve filter location and distance, persisting when the form is submitted
    let (filter_location_id, ui_distance_km): (Option<Uuid>, f64) =
        if clear_distance == Some(true) {
            sqlx::query(
                "UPDATE search_preferences \
                 SET preferred_location_id = NULL, preferred_distance_km = NULL \
                 WHERE user_id = $1",
            )
            .bind(user.id())
            .execute(&**db)
            .await?;
            (None, 10.0)
        } else if let Some(dist_raw) = preferred_distance_km {
            if dist_raw == 0.0 {
                // Slider at "Any" position — clear the distance filter
                sqlx::query(
                    "UPDATE search_preferences \
                     SET preferred_location_id = NULL, preferred_distance_km = NULL \
                     WHERE user_id = $1",
                )
                .bind(user.id())
                .execute(&**db)
                .await?;
                (None, 10.0)
            } else {
                // Form submitted with a real distance — save and apply
                let dist = dist_raw.clamp(3.0, 20.0);
                sqlx::query(
                    "INSERT INTO search_preferences (user_id, preferred_location_id, preferred_distance_km) \
                     VALUES ($1, $2, $3) \
                     ON CONFLICT (user_id) DO UPDATE SET \
                         preferred_location_id = EXCLUDED.preferred_location_id, \
                         preferred_distance_km = EXCLUDED.preferred_distance_km",
                )
                .bind(user.id())
                .bind(location_id)
                .bind(dist)
                .execute(&**db)
                .await?;
                (location_id, dist)
            }
        } else {
            (saved_location_id, saved_distance_km.unwrap_or(10.0).clamp(3.0, 20.0))
        };

    // For the dropdown UI, show Home as default when no filter location is active
    let home_location_id: Option<Uuid> = sqlx::query_scalar(
        "SELECT id FROM volunteer_locations WHERE user_id = $1 AND is_home = true LIMIT 1",
    )
    .bind(user.id())
    .fetch_optional(&**db)
    .await?;
    let ui_location_id = filter_location_id.or(home_location_id);

    // Fetch geom for the active filter location (None = distance filter not active)
    let filter_geom: Option<String> = if let Some(loc_id) = filter_location_id {
        sqlx::query_scalar(
            "SELECT ST_AsText(geom) FROM volunteer_locations WHERE id = $1 AND user_id = $2",
        )
        .bind(loc_id)
        .bind(user.id())
        .fetch_optional(&**db)
        .await?
        .flatten()
    } else {
        None
    };

    // Resolve region ID from slug
    let region_id: Option<Uuid> = if let Some(slug) = region {
        sqlx::query_scalar("SELECT id FROM regions WHERE slug = $1 AND is_active = true")
            .bind(slug)
            .fetch_optional(&**db)
            .await?
    } else {
        sqlx::query_scalar(
            "SELECT preferred_region_ids[1] FROM search_preferences WHERE user_id = $1",
        )
        .bind(user.id())
        .fetch_optional(&**db)
        .await?
        .flatten()
    };

    // Count all compliance-eligible shifts (no region/distance/type filters)
    let total_eligible: i64 = sqlx::query_scalar(
        r#"
        SELECT COUNT(DISTINCT s.id)
        FROM shifts s
        JOIN sites si ON si.id = s.site_id
        LEFT JOIN shift_assignments my_sa ON my_sa.shift_id = s.id AND my_sa.volunteer_id = $1
        WHERE s.state IN ('published', 'invite_only')
          AND s.start_at > now()
          AND (
              s.state = 'published'
              OR EXISTS (SELECT 1 FROM shift_invites si2 WHERE si2.shift_id = s.id AND si2.volunteer_id = $1)
              OR my_sa.id IS NOT NULL
          )
          AND (s.requires_police_check = false OR EXISTS (
              SELECT 1 FROM volunteer_profiles vp WHERE vp.user_id = $1 AND vp.has_police_check = true
          ))
          AND (s.requires_vulnerable_check = false OR EXISTS (
              SELECT 1 FROM volunteer_profiles vp WHERE vp.user_id = $1 AND vp.has_vulnerable_sector_check = true
          ))
        "#,
    )
    .bind(user.id())
    .fetch_one(&**db)
    .await?;

    // Count shifts with all active filters applied (for the active-filter summary)
    let filtered_count: i64 = sqlx::query_scalar(
        r#"
        SELECT COUNT(DISTINCT s.id)
        FROM shifts s
        JOIN agencies a ON a.id = s.agency_id
        LEFT JOIN agency_types at ON at.id = a.agency_type_id
        JOIN sites si ON si.id = s.site_id
        LEFT JOIN shift_assignments my_sa ON my_sa.shift_id = s.id AND my_sa.volunteer_id = $1
        WHERE s.state IN ('published', 'invite_only')
          AND s.start_at > now()
          AND (
              s.state = 'published'
              OR EXISTS (SELECT 1 FROM shift_invites si2 WHERE si2.shift_id = s.id AND si2.volunteer_id = $1)
              OR my_sa.id IS NOT NULL
          )
          AND ($2::uuid IS NULL OR si.region_id = $2)
          AND (
              $3::text IS NULL OR $4::float8 IS NULL
              OR ST_DWithin(si.geom, ST_GeogFromText($3), $4 * 1000)
          )
          AND (
              $5::text IS NULL
              OR at.path <@ (SELECT path FROM agency_types WHERE slug = $5 LIMIT 1)
          )
          AND (s.requires_police_check = false OR EXISTS (
              SELECT 1 FROM volunteer_profiles vp WHERE vp.user_id = $1 AND vp.has_police_check = true
          ))
          AND (s.requires_vulnerable_check = false OR EXISTS (
              SELECT 1 FROM volunteer_profiles vp WHERE vp.user_id = $1 AND vp.has_vulnerable_sector_check = true
          ))
          AND ($6::bool IS NOT TRUE OR (
              SELECT COUNT(*) FROM shift_assignments sa3
              WHERE sa3.shift_id = s.id AND sa3.status = 'confirmed'
          ) < s.slots_requested)
          AND ($7::bool IS NOT TRUE OR EXISTS (
              SELECT 1 FROM volunteer_shift_time_preferences vstp
              WHERE vstp.user_id = $1
                AND vstp.is_preferred = true
                AND vstp.day_of_week = EXTRACT(DOW FROM s.start_at)::integer
                AND (
                    (vstp.time_slot = 'morning' AND EXTRACT(HOUR FROM s.start_at) >= 6 AND EXTRACT(HOUR FROM s.start_at) < 12)
                    OR (vstp.time_slot = 'afternoon' AND EXTRACT(HOUR FROM s.start_at) >= 12 AND EXTRACT(HOUR FROM s.start_at) < 17)
                    OR (vstp.time_slot = 'evening' AND EXTRACT(HOUR FROM s.start_at) >= 17 AND EXTRACT(HOUR FROM s.start_at) < 21)
                )
          ))
        "#,
    )
    .bind(user.id())
    .bind(region_id)
    .bind(filter_geom.as_deref())
    .bind(if filter_geom.is_some() { Some(ui_distance_km) } else { None::<f64> })
    .bind(agency_type)
    .bind(open_only)
    .bind(match_prefs_active)
    .fetch_one(&**db)
    .await?;

    let shifts = sqlx::query_as::<_, ShiftCard>(
        r#"
        SELECT
            s.id,
            s.title,
            s.start_at,
            s.end_at,
            s.slots_requested,
            COUNT(sa.id) FILTER (WHERE sa.status = 'confirmed') AS slots_confirmed,
            s.requires_police_check,
            s.requires_vulnerable_check,
            a.name AS agency_name,
            at.name AS agency_type_name,
            si.name AS site_name,
            r.name AS region_name,
            CASE
                WHEN $3::text IS NOT NULL
                THEN ROUND((ST_Distance(si.geom, ST_GeogFromText($3)) / 1000.0)::numeric, 1)::double precision
                ELSE NULL
            END AS distance_km,
            ST_Y(si.geom::geometry) AS site_lat,
            ST_X(si.geom::geometry) AS site_lng,
            my_sa.status::text AS my_status,
            my_sa.waitlist_position AS my_waitlist_position,
            COALESCE((
                SELECT json_agg(json_build_object(
                    'volunteer_names', vp2.volunteer_names,
                    'dog_name', d2.name
                ) ORDER BY sa2.id)
                FROM shift_assignments sa2
                JOIN volunteer_profiles vp2 ON vp2.user_id = sa2.volunteer_id
                LEFT JOIN dogs d2 ON d2.id = sa2.dog_ids[1]
                WHERE sa2.shift_id = s.id AND sa2.status = 'confirmed'
            ), '[]'::json) AS team_members
        FROM shifts s
        JOIN agencies a ON a.id = s.agency_id
        LEFT JOIN agency_types at ON at.id = a.agency_type_id
        JOIN sites si ON si.id = s.site_id
        LEFT JOIN regions r ON r.id = si.region_id
        LEFT JOIN shift_assignments sa ON sa.shift_id = s.id
        LEFT JOIN shift_assignments my_sa
            ON my_sa.shift_id = s.id AND my_sa.volunteer_id = $1
        WHERE s.state IN ('published', 'invite_only')
          AND s.start_at > now()
          AND (
              s.state = 'published'
              OR EXISTS (
                  SELECT 1 FROM shift_invites si2
                  WHERE si2.shift_id = s.id AND si2.volunteer_id = $1
              )
              OR my_sa.id IS NOT NULL
          )
          AND ($2::uuid IS NULL OR si.region_id = $2)
          AND (
              $3::text IS NULL OR $4::float8 IS NULL
              OR ST_DWithin(si.geom, ST_GeogFromText($3), $4 * 1000)
          )
          AND (
              $5::text IS NULL
              OR at.path <@ (
                  SELECT path FROM agency_types WHERE slug = $5 LIMIT 1
              )
          )
          AND (s.requires_police_check = false OR EXISTS (
              SELECT 1 FROM volunteer_profiles vp
              WHERE vp.user_id = $1 AND vp.has_police_check = true
          ))
          AND (s.requires_vulnerable_check = false OR EXISTS (
              SELECT 1 FROM volunteer_profiles vp
              WHERE vp.user_id = $1 AND vp.has_vulnerable_sector_check = true
          ))
          AND ($7::bool IS NOT TRUE OR EXISTS (
              SELECT 1 FROM volunteer_shift_time_preferences vstp
              WHERE vstp.user_id = $1
                AND vstp.is_preferred = true
                AND vstp.day_of_week = EXTRACT(DOW FROM s.start_at)::integer
                AND (
                    (vstp.time_slot = 'morning' AND EXTRACT(HOUR FROM s.start_at) >= 6 AND EXTRACT(HOUR FROM s.start_at) < 12)
                    OR (vstp.time_slot = 'afternoon' AND EXTRACT(HOUR FROM s.start_at) >= 12 AND EXTRACT(HOUR FROM s.start_at) < 17)
                    OR (vstp.time_slot = 'evening' AND EXTRACT(HOUR FROM s.start_at) >= 17 AND EXTRACT(HOUR FROM s.start_at) < 21)
                )
          ))
        GROUP BY s.id, a.name, at.name, si.name, r.name, si.geom, my_sa.status, my_sa.waitlist_position
        HAVING ($6::bool IS NOT TRUE OR COUNT(sa.id) FILTER (WHERE sa.status = 'confirmed') < s.slots_requested)
        ORDER BY s.start_at ASC
        LIMIT $8 OFFSET $9
        "#,
    )
    .bind(user.id())
    .bind(region_id)
    .bind(filter_geom.as_deref())
    .bind(if filter_geom.is_some() { Some(ui_distance_km) } else { None::<f64> })
    .bind(agency_type)
    .bind(open_only)
    .bind(match_prefs_active)
    .bind(PAGE_SIZE)
    .bind(offset)
    .fetch_all(&**db)
    .await?;

    // Load active regions and agency types for the filter sidebar
    let regions: Vec<(Uuid, String, String)> = sqlx::query_as(
        "SELECT id, name, slug FROM regions WHERE is_active = true ORDER BY display_order, name",
    )
    .fetch_all(&**db)
    .await?;

    let agency_types: Vec<(Uuid, String, String)> = sqlx::query_as(
        "SELECT id, name, slug FROM agency_types WHERE parent_id IS NULL AND is_active = true ORDER BY sort_order, name",
    )
    .fetch_all(&**db)
    .await?;

    // Load volunteer's saved locations for the distance filter dropdown
    let locations: Vec<VolunteerLocationCard> = sqlx::query_as(
        "SELECT id, name, address, is_home, display_order, \
                ST_Y(geom::geometry) AS lat, ST_X(geom::geometry) AS lng \
         FROM volunteer_locations WHERE user_id = $1 ORDER BY display_order",
    )
    .bind(user.id())
    .fetch_all(&**db)
    .await?;

    // Load shift time preferences
    let time_preferences: Vec<ShiftTimePreference> = sqlx::query_as(
        r#"
        SELECT day_of_week, time_slot, is_preferred
        FROM volunteer_shift_time_preferences
        WHERE user_id = $1 AND is_preferred = true
        ORDER BY day_of_week, time_slot
        "#
    )
    .bind(user.id())
    .fetch_all(&**db)
    .await?;

    let distance_filter_active = filter_geom.is_some();
    let open_only_bool = open_only.unwrap_or(false);

    let filter_pills = build_filter_pills(
        distance_filter_active,
        filter_location_id,
        ui_distance_km,
        region,
        agency_type,
        open_only_bool,
        match_prefs_active,
        &regions,
        &agency_types,
        &locations,
    );

    Ok(Template::render(
        "volunteer/shifts",
        context! {
            user: &user.0,
            shifts: &shifts,
            regions: &regions,
            agency_types: &agency_types,
            locations: &locations,
            time_preferences: &time_preferences,
            current_region: region,
            current_agency_type: agency_type,
            current_location_id: ui_location_id,
            current_distance_km: ui_distance_km,
            distance_filter_active: distance_filter_active,
            match_preferences: match_prefs_active,
            open_only: open_only_bool,
            total_eligible: total_eligible,
            filtered_count: filtered_count,
            filter_pills: &filter_pills,
            page: page,
            has_more: shifts.len() as i64 == PAGE_SIZE,
            flash: flash_msg,
            google_maps_api_key: config.google_maps_api_key.as_deref().unwrap_or(""),
        },
    ))
}

// ─── Shift detail ─────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct ShiftDetail {
    pub id: Uuid,
    pub title: String,
    pub description: Option<String>,
    pub specific_requests: Option<String>,
    pub parking_notes: Option<String>,
    pub meeting_notes: Option<String>,
    pub start_at: DateTime<Utc>,
    pub end_at: DateTime<Utc>,
    pub slots_requested: i32,
    pub slots_confirmed: i64,
    pub requires_police_check: bool,
    pub requires_vulnerable_check: bool,
    // Agency
    pub agency_name: String,
    pub agency_type_name: Option<String>,
    pub agency_description: Option<String>,
    // Site
    pub site_name: String,
    pub site_address: Option<String>,
    // Contact
    pub contact_name: Option<String>,
    pub contact_title: Option<String>,
    pub contact_phone: Option<String>,
    pub contact_phone_visibility: ContactVisibility,
    pub contact_email: Option<String>,
    pub contact_email_visibility: ContactVisibility,
    // User's own status
    pub my_status: Option<String>,
    pub my_waitlist_position: Option<i32>,
    // Change detection
    pub content_changed: bool,
}

#[get("/shifts/<shift_id>")]
pub async fn shift_detail(
    db: &Db,
    user: ApprovedVolunteer,
    shift_id: &str,
    flash: Option<FlashMessage<'_>>,
) -> AppResult<Template> {
    let user = user.user();
    let shift_id: Uuid = match shift_id.parse() {
        Ok(id) => id,
        Err(_) => return Err(AppError::NotFound),
    };

    // Helper to extract flash message for context
    let flash_msg = flash.map(|f| context! { kind: f.kind().to_string(), message: f.message().to_string() });

    let detail = sqlx::query_as::<_, ShiftDetail>(
        r#"
        SELECT
            s.id, s.title, s.description, s.specific_requests,
            s.parking_notes, s.meeting_notes,
            s.start_at, s.end_at, s.slots_requested,
            COUNT(sa.id) FILTER (WHERE sa.status = 'confirmed') AS slots_confirmed,
            s.requires_police_check, s.requires_vulnerable_check,
            a.name AS agency_name,
            at.name AS agency_type_name,
            a.description AS agency_description,
            si.name AS site_name,
            si.address AS site_address,
            c.name AS contact_name,
            c.title AS contact_title,
            c.phone AS contact_phone,
            c.phone_visibility AS contact_phone_visibility,
            c.email AS contact_email,
            c.email_visibility AS contact_email_visibility,
            my_sa.status::text AS my_status,
            my_sa.waitlist_position AS my_waitlist_position,
            -- Change detection: compare current hash vs saved hash
            CASE
                WHEN svh.content_hash IS NULL THEN false
                WHEN svh.content_hash <> md5(
                    COALESCE(s.description,'') ||
                    COALESCE(s.parking_notes,'') ||
                    COALESCE(s.meeting_notes,'') ||
                    COALESCE(s.specific_requests,'')
                ) THEN true
                ELSE false
            END AS content_changed
        FROM shifts s
        JOIN agencies a ON a.id = s.agency_id
        LEFT JOIN agency_types at ON at.id = a.agency_type_id
        JOIN sites si ON si.id = s.site_id
        LEFT JOIN contacts c ON c.id = s.contact_id
        LEFT JOIN shift_assignments sa ON sa.shift_id = s.id
        LEFT JOIN shift_assignments my_sa
            ON my_sa.shift_id = s.id AND my_sa.volunteer_id = $2
        LEFT JOIN shift_view_hashes svh
            ON svh.shift_id = s.id AND svh.user_id = $2
        WHERE s.id = $1
          AND s.state NOT IN ('draft', 'archived')
        GROUP BY s.id, a.name, at.name, a.description, si.name, si.address,
                 c.name, c.title, c.phone, c.phone_visibility, c.email, c.email_visibility,
                 my_sa.status, my_sa.waitlist_position, svh.content_hash
        "#,
    )
    .bind(shift_id)
    .bind(user.id())
    .fetch_optional(&**db)
    .await?
    .ok_or(AppError::NotFound)?;

    // Load team members (confirmed + pending_confirmation shown as "joining soon", waitlisted separate)
    let team = sqlx::query_as::<_, ShiftTeamMember>(
        r#"
        SELECT
            sa.volunteer_id as user_id,
            vp.volunteer_names,
            d.name AS dog_name,
            dt.name AS dog_breed,
            d.size::text AS dog_size,
            vp.profile_pic_asset_id,
            sa.status::text,
            sa.waitlist_position,
            sa.confirmation_deadline_at
        FROM shift_assignments sa
        JOIN volunteer_profiles vp ON vp.user_id = sa.volunteer_id
        LEFT JOIN dogs d ON d.id = sa.dog_ids[1]
        LEFT JOIN dog_types dt ON dt.id = d.breed_id
        WHERE sa.shift_id = $1 AND sa.status IN ('confirmed', 'pending_confirmation', 'waitlisted')
        ORDER BY
            CASE sa.status WHEN 'confirmed' THEN 0 WHEN 'pending_confirmation' THEN 1 ELSE 2 END,
            sa.waitlist_position ASC NULLS LAST,
            sa.assigned_at ASC
        "#,
    )
    .bind(shift_id)
    .fetch_all(&**db)
    .await?;

    // Update view hash (upsert current content hash so next visit won't show "changed")
    sqlx::query(
        r#"
        INSERT INTO shift_view_hashes (shift_id, user_id, content_hash, last_viewed_at)
        SELECT $1, $2,
            md5(COALESCE(description,'') || COALESCE(parking_notes,'') ||
                COALESCE(meeting_notes,'') || COALESCE(specific_requests,'')),
            now()
        FROM shifts WHERE id = $1
        ON CONFLICT (shift_id, user_id) DO UPDATE
            SET content_hash = EXCLUDED.content_hash,
                last_viewed_at = now()
        "#,
    )
    .bind(shift_id)
    .bind(user.id())
    .execute(&**db)
    .await?;

    // Get shift history
    let history: Vec<VolunteerEventDetail> = sqlx::query_as(
        r#"
        SELECT 
            ve.id, ve.event_type::text, ve.metadata, ve.created_at,
            ve.shift_id, ve.dog_id,
            COALESCE(u_cb.display_name, u_cb.email) AS created_by_name,
            s.title AS shift_title, s.start_at AS shift_start_at,
            a.name AS agency_name,
            si.name AS site_name,
            d.name AS dog_name,
            vp_fv.volunteer_names AS from_volunteer_name
        FROM volunteer_events ve
        LEFT JOIN shifts s ON s.id = ve.shift_id
        LEFT JOIN agencies a ON a.id = s.agency_id
        LEFT JOIN sites si ON si.id = s.site_id
        LEFT JOIN dogs d ON d.id = ve.dog_id
        LEFT JOIN users u_cb ON u_cb.id = ve.created_by
        LEFT JOIN volunteer_profiles vp_fv ON vp_fv.user_id = ve.related_user_id
        WHERE ve.shift_id = $1
        ORDER BY ve.created_at DESC
        "#
    )
    .bind(shift_id)
    .fetch_all(&**db)
    .await
    .unwrap_or_default();

    // Get user's approved/active dogs
    let user_dogs: Vec<(Uuid, String, bool)> = sqlx::query_as(
        r#"
        SELECT d.id, d.name, d.is_primary
        FROM dogs d
        WHERE d.volunteer_id = $1 AND d.is_active = true
          AND (
              EXISTS (SELECT 1 FROM dog_applications da WHERE da.dog_id = d.id AND da.status = 'approved')
              OR NOT EXISTS (SELECT 1 FROM dog_applications da WHERE da.dog_id = d.id)
          )
        ORDER BY d.is_primary DESC, d.name ASC
        "#
    )
    .bind(user.id())
    .fetch_all(&**db)
    .await
    .unwrap_or_default();

    // Check if survey already submitted
    let already_submitted: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM volunteer_surveys WHERE shift_id = $1 AND volunteer_id = $2)",
    )
    .bind(shift_id)
    .bind(user.id())
    .fetch_one(&**db)
    .await?;

    Ok(Template::render(
        "volunteer/shift_detail",
        context! { 
            user: &user.0, 
            shift: &detail, 
            team: &team,
            history: history,
            user_dogs: user_dogs,
            flash: flash_msg,
            already_submitted,
        },
    ))
}

// ─── Join / Leave ─────────────────────────────────────────────────────────────

#[derive(rocket::form::FromForm)]
pub struct JoinShiftForm {
    pub dog_id: Option<Uuid>,
}

#[post("/shifts/<shift_id>/join", data = "<form>")]
pub async fn shift_join(
    db: &Db,
    user: ApprovedVolunteer,
    shift_id: &str,
    form: Form<JoinShiftForm>,
) -> AppResult<Flash<Redirect>> {
    let shift_id: Uuid = match shift_id.parse() {
        Ok(id) => id,
        Err(_) => return Ok(Flash::error(Redirect::to("/volunteer/shifts"), "Shift not found")),
    };

    let user_id = user.id();
    let f = form.into_inner();

    // Check if user has any approved or active dogs (allowing legacy dogs with no application record)
    let approved_dog_count: i64 = match sqlx::query_scalar(
        r#"
        SELECT COUNT(*) FROM dogs d
        WHERE d.volunteer_id = $1 AND d.is_active = true
          AND (
              -- Either has an approved application
              EXISTS (SELECT 1 FROM dog_applications da WHERE da.dog_id = d.id AND da.status = 'approved')
              -- OR has NO application record at all (legacy dogs created before the system)
              OR NOT EXISTS (SELECT 1 FROM dog_applications da WHERE da.dog_id = d.id)
          )
        "#
    )
    .bind(user_id)
    .fetch_one(&**db)
    .await {
        Ok(c) => c,
        Err(e) => {
            tracing::error!(error = %e, "DB error checking dogs");
            return Ok(Flash::error(Redirect::to(format!("/volunteer/shifts/{}", shift_id)), "Internal error"));
        }
    };

    if approved_dog_count == 0 {
        // Check if they have any pending applications
        let pending_count: i64 = match sqlx::query_scalar(
            "SELECT COUNT(*) FROM dog_applications WHERE volunteer_id = $1 AND status NOT IN ('approved', 'rejected', 'withdrawn')"
        )
        .bind(user_id)
        .fetch_one(&**db)
        .await {
            Ok(c) => c,
            Err(_) => 0,
        };

        if pending_count > 0 {
            return Ok(Flash::error(
                Redirect::to(format!("/volunteer/shifts/{}", shift_id)),
                "Your dog application is still pending approval. You'll be able to join shifts once approved."
            ));
        } else {
            return Ok(Flash::error(
                Redirect::to(format!("/volunteer/shifts/{}", shift_id)),
                "You need an approved therapy dog to join shifts. Please submit a dog registration application first."
            ));
        }
    }

    // Get selected or primary dog
    let dog_id: Option<Uuid> = if let Some(did) = f.dog_id {
        // Verify this dog belongs to the user and is approved/active
        sqlx::query_scalar(
            r#"
            SELECT id FROM dogs d
            WHERE d.id = $1 AND d.volunteer_id = $2 AND d.is_active = true
              AND (
                  EXISTS (SELECT 1 FROM dog_applications da WHERE da.dog_id = d.id AND da.status = 'approved')
                  OR NOT EXISTS (SELECT 1 FROM dog_applications da WHERE da.dog_id = d.id)
              )
            "#,
        )
        .bind(did)
        .bind(user_id)
        .fetch_optional(&**db)
        .await
        .unwrap_or(None)
    } else {
        match sqlx::query_scalar(
            "SELECT id FROM dogs WHERE volunteer_id = $1 AND is_primary = true AND is_active = true LIMIT 1",
        )
        .bind(user_id)
        .fetch_optional(&**db)
        .await {
            Ok(id) => id,
            Err(_) => None,
        }
    };

    // Start transaction
    let mut tx = db.begin().await.map_err(|e| {
        tracing::error!(error = %e, "Failed to start transaction");
        AppError::Internal(anyhow::anyhow!("Transaction error"))
    })?;

    // Lock the shift row to serialise concurrent joins
    let shift_info: Option<(i32, String, String)> = sqlx::query_as(
        r#"
        SELECT s.slots_requested, s.title, a.name AS agency_name
        FROM shifts s
        JOIN agencies a ON a.id = s.agency_id
        WHERE s.id = $1
        FOR UPDATE
        "#,
    )
    .bind(shift_id)
    .fetch_optional(&mut *tx)
    .await
    .map_err(|e| {
        tracing::error!(error = %e, "DB error fetching shift info");
        AppError::Internal(anyhow::anyhow!("DB error"))
    })?;

    let (slots_requested, shift_title, agency_name) = match shift_info {
        Some(info) => info,
        None => return Ok(Flash::error(Redirect::to("/volunteer/shifts"), "Shift not found")),
    };

    // Count currently filled slots (confirmed + pending_confirmation) excluding current user
    let slots_filled: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM shift_assignments
         WHERE shift_id = $1 AND status IN ('confirmed', 'pending_confirmation') AND volunteer_id <> $2",
    )
    .bind(shift_id)
    .bind(user_id)
    .fetch_one(&mut *tx)
    .await
    .map_err(|e| {
        tracing::error!(error = %e, "DB error counting filled slots");
        AppError::Internal(anyhow::anyhow!("DB error"))
    })?;

    let status = if slots_filled < slots_requested as i64 {
        AssignmentStatus::Confirmed
    } else {
        AssignmentStatus::Waitlisted
    };

    // Get next waitlist position if needed
    let waitlist_pos: Option<i32> = if status == AssignmentStatus::Waitlisted {
        sqlx::query_scalar(
            "SELECT COALESCE(MAX(waitlist_position), 0) + 1 FROM shift_assignments WHERE shift_id = $1 AND status = 'waitlisted'",
        )
        .bind(shift_id)
        .fetch_one(&mut *tx)
        .await
        .ok()
    } else {
        None
    };

    let res = sqlx::query(
        r#"
        INSERT INTO shift_assignments (shift_id, volunteer_id, dog_ids, status, waitlist_position, updated_at)
        VALUES ($1, $2, $3, $4, $5, now())
        ON CONFLICT (shift_id, volunteer_id) 
        DO UPDATE SET 
            status = EXCLUDED.status,
            waitlist_position = EXCLUDED.waitlist_position,
            dog_ids = EXCLUDED.dog_ids,
            updated_at = now()
        "#,
    )
    .bind(shift_id)
    .bind(user_id)
    .bind(dog_id.map(|id| vec![id]).unwrap_or_default())
    .bind(&status)
    .bind(waitlist_pos)
    .execute(&mut *tx)
    .await;

    if let Err(e) = res {
        tracing::error!(error = %e, "DB error joining shift");
        return Ok(Flash::error(Redirect::to(format!("/volunteer/shifts/{}", shift_id)), "Failed to join shift"));
    }

    // Get volunteer name
    let volunteer_name: String = sqlx::query_scalar("SELECT volunteer_names FROM volunteer_profiles WHERE user_id = $1")
        .bind(user_id)
        .fetch_optional(&mut *tx)
        .await
        .unwrap_or_default()
        .flatten()
        .unwrap_or_else(|| user.0.0.display_name.clone().unwrap_or_else(|| user.0.0.email.clone()));

    let dog_name: Option<String> = if let Some(did) = dog_id {
        sqlx::query_scalar("SELECT name FROM dogs WHERE id = $1")
            .bind(did)
            .fetch_one(&mut *tx)
            .await
            .ok()
    } else {
        None
    };

    // Log event
    let waitlisted = status == AssignmentStatus::Waitlisted;
    let _ = EventLog::shift_joined(
        &mut *tx, 
        user_id, 
        shift_id, 
        dog_id,
        &shift_title, 
        &agency_name, 
        &volunteer_name, 
        dog_name.as_deref(),
        waitlisted
    ).await;

    tx.commit().await.map_err(|e| {
        tracing::error!(error = %e, "Failed to commit transaction");
        AppError::Internal(anyhow::anyhow!("Commit error"))
    })?;

    let msg = if waitlisted { 
        "Added to waitlist. We'll notify you if a spot opens up!" 
    } else { 
        "Shift joined! Thank you for volunteering. Stay tuned closer to the visit time for more details." 
    };
    Ok(Flash::success(Redirect::to(format!("/volunteer/shifts/{}", shift_id)), msg))
}

#[derive(rocket::form::FromForm)]
pub struct CancellationForm<'r> {
    reason: &'r str,
    note: Option<&'r str>,
}

#[post("/shifts/<shift_id>/leave", data = "<form>")]
pub async fn shift_leave(
    db: &Db,
    user: ApprovedVolunteer,
    shift_id: &str,
    form: Form<CancellationForm<'_>>,
    cfg: &rocket::State<crate::config::AppConfig>,
) -> Flash<Redirect> {
    let shift_id: Uuid = match shift_id.parse() {
        Ok(id) => id,
        Err(_) => return Flash::error(Redirect::to("/volunteer/shifts"), "Shift not found"),
    };

    let form = form.into_inner();
    let reason = form.reason.trim();
    let note = form.note.map(|n| n.trim()).filter(|n| !n.is_empty());

    // Get shift info before cancelling (for event log and notifications)
    let shift_info: Option<(String, String, DateTime<Utc>)> = match sqlx::query_as(
        "SELECT s.title, a.name, s.start_at FROM shifts s JOIN agencies a ON a.id = s.agency_id WHERE s.id = $1"
    )
    .bind(shift_id)
    .fetch_optional(&**db)
    .await {
        Ok(info) => info,
        Err(_) => None,
    };

    // Get volunteer info for notification
    let volunteer_info: Option<(String,)> = sqlx::query_as(
        "SELECT volunteer_names FROM volunteer_profiles WHERE user_id = $1"
    )
    .bind(user.id())
    .fetch_optional(&**db)
    .await
    .unwrap_or_default();

    // Capture the previous status so we know whether a slot was freed
    let prev_status: Option<String> = sqlx::query_scalar(
        "SELECT status::text FROM shift_assignments
         WHERE shift_id = $1 AND volunteer_id = $2
           AND status IN ('confirmed', 'waitlisted', 'pending_confirmation')",
    )
    .bind(shift_id)
    .bind(user.id())
    .fetch_optional(&**db)
    .await
    .unwrap_or_default();

    // Mark cancelled with reason (don't delete — admin needs the audit trail)
    let res = sqlx::query(
        r#"
        UPDATE shift_assignments
        SET status              = 'cancelled',
            updated_at          = now(),
            cancelled_at        = now(),
            cancellation_reason = $3,
            cancellation_note   = $4,
            confirmation_token  = NULL
        WHERE shift_id = $1 AND volunteer_id = $2
          AND status IN ('confirmed', 'waitlisted', 'pending_confirmation')
        "#,
    )
    .bind(shift_id)
    .bind(user.id())
    .bind(reason)
    .bind(note)
    .execute(&**db)
    .await;

    if let Err(e) = res {
        tracing::error!(error = %e, "DB error leaving shift");
        return Flash::error(Redirect::to(format!("/volunteer/shifts/{}", shift_id)), "Failed to leave shift");
    }

    // Get the cancelled assignment ID for vacancy tracking and event logging
    let cancelled_assignment: Option<(Uuid,)> = sqlx::query_as(
        "SELECT id FROM shift_assignments
         WHERE shift_id = $1 AND volunteer_id = $2 AND status = 'cancelled'
         ORDER BY updated_at DESC LIMIT 1",
    )
    .bind(shift_id)
    .bind(user.id())
    .fetch_optional(&**db)
    .await
    .unwrap_or_default();

    let slot_freed = matches!(prev_status.as_deref(), Some("confirmed") | Some("pending_confirmation"));

    if let Some((assignment_id,)) = cancelled_assignment {
        if let Some((shift_title, agency_name, shift_start)) = &shift_info {
            let volunteer_name = volunteer_info.as_ref().map(|v| v.0.clone()).unwrap_or_else(|| "A volunteer".to_string());

            let dog_info: Option<(Option<Uuid>, Option<String>)> = sqlx::query_as(
                "SELECT d.id, d.name FROM shift_assignments sa LEFT JOIN dogs d ON d.id = sa.dog_ids[1] WHERE sa.id = $1"
            )
            .bind(assignment_id)
            .fetch_optional(&**db)
            .await
            .unwrap_or(None);

            let (dog_id, dog_name) = dog_info.unwrap_or((None, None));

            let _ = EventLog::shift_cancelled(
                &**db,
                user.id(),
                shift_id,
                dog_id,
                shift_title,
                agency_name,
                &volunteer_name,
                dog_name.as_deref(),
                reason
            ).await;

            if slot_freed {
                // Create vacancy record for audit trail
                let _ = sqlx::query(
                    r#"
                    INSERT INTO shift_vacancies (
                        shift_id, source_assignment_id, cancelled_by_volunteer_id,
                        cancellation_reason, cancellation_note, status
                    ) VALUES ($1, $2, $3, $4, $5, 'open')
                    "#,
                )
                .bind(shift_id)
                .bind(assignment_id)
                .bind(user.id())
                .bind(reason)
                .bind(note)
                .execute(&**db)
                .await;

                // Notify admins of the cancellation
                let notification_title = format!("{} cancelled shift at {}", volunteer_name, agency_name);
                let notification_body = format!(
                    "{} cancelled their spot for '{}' on {}. Reason: {}.",
                    volunteer_name, shift_title, shift_start.format("%b %-d"), reason
                );
                let payload = serde_json::json!({
                    "shift_id": shift_id,
                    "cancellation_reason": reason,
                    "volunteer_name": volunteer_name,
                });

                let admin_ids: Vec<(Uuid,)> = sqlx::query_as("SELECT id FROM users WHERE role = 'admin'")
                    .fetch_all(&**db)
                    .await
                    .unwrap_or_default();

                for (admin_id,) in admin_ids {
                    let _ = sqlx::query(
                        "INSERT INTO notifications (user_id, type, title, body, payload)
                         VALUES ($1, 'booking_cancelled', $2, $3, $4)",
                    )
                    .bind(admin_id)
                    .bind(&notification_title)
                    .bind(&notification_body)
                    .bind(&payload)
                    .execute(&**db)
                    .await;
                }

                // Auto-promote the next waitlisted volunteer
                if let Err(e) = promote_next_waitlisted(&**db, shift_id, &cfg.app_url).await {
                    tracing::error!(error = %e, shift_id = %shift_id, "shift_leave: promote_next_waitlisted failed");
                }
            }
        }
    }

    Flash::success(Redirect::to(format!("/volunteer/shifts/{}", shift_id)), "You have left the shift.")
}

// ─── Waitlist confirmation (email CTA links) ──────────────────────────────────

#[get("/waitlist/<token>/confirm")]
pub async fn waitlist_respond(db: &Db, token: &str) -> AppResult<Template> {
    // Find assignment by confirmation token
    let assignment_id: Option<Uuid> = sqlx::query_scalar(
        "SELECT id FROM shift_assignments WHERE confirmation_token = $1",
    )
    .bind(token)
    .fetch_optional(&**db)
    .await?;

    if let Some(id) = assignment_id {
        sqlx::query(
            "UPDATE shift_assignments SET status = 'confirmed', confirmation_token = NULL, updated_at = now()
             WHERE id = $1 AND status = 'pending_confirmation'",
        )
        .bind(id)
        .execute(&**db)
        .await?;

        // Get info for logging
        let info: Option<(Uuid, Uuid, String, String, String, Option<Uuid>, Option<String>)> = sqlx::query_as(
            r#"
            SELECT sa.volunteer_id, sa.shift_id, s.title, a.name, vp.volunteer_names, d.id, d.name
            FROM shift_assignments sa
            JOIN shifts s ON s.id = sa.shift_id
            JOIN agencies a ON a.id = s.agency_id
            JOIN volunteer_profiles vp ON vp.user_id = sa.volunteer_id
            LEFT JOIN dogs d ON d.id = sa.dog_ids[1]
            WHERE sa.id = $1
            "#
        )
        .bind(id)
        .fetch_optional(&**db)
        .await?;

        if let Some((vid, sid, st, an, vn, di, dn)) = info {
            let _ = EventLog::shift_confirmed(
                &**db, 
                vid, 
                sid, 
                di,
                &st, 
                &an, 
                &vn, 
                dn.as_deref()
            ).await;
        }
    }

    Ok(Template::render("volunteer/waitlist_confirmed", context! {}))
}

// ─── Waitlist decline via email token ─────────────────────────────────────────

#[get("/waitlist/<token>/decline")]
pub async fn waitlist_decline_token(
    db: &Db,
    token: &str,
    cfg: &rocket::State<crate::config::AppConfig>,
) -> AppResult<Template> {
    // Find assignment by confirmation token
    let row: Option<(Uuid, Uuid)> = sqlx::query_as(
        "SELECT id, shift_id FROM shift_assignments WHERE confirmation_token = $1",
    )
    .bind(token)
    .fetch_optional(&**db)
    .await?;

    if let Some((assignment_id, shift_id)) = row {
        // Get info for event log before cancelling
        let info: Option<(Uuid, String, String, String, Option<Uuid>, Option<String>)> =
            sqlx::query_as(
                r#"
                SELECT sa.volunteer_id, s.title, a.name, vp.volunteer_names, d.id, d.name
                FROM shift_assignments sa
                JOIN shifts s ON s.id = sa.shift_id
                JOIN agencies a ON a.id = s.agency_id
                LEFT JOIN volunteer_profiles vp ON vp.user_id = sa.volunteer_id
                LEFT JOIN dogs d ON d.id = sa.dog_ids[1]
                WHERE sa.id = $1
                "#,
            )
            .bind(assignment_id)
            .fetch_optional(&**db)
            .await?;

        sqlx::query(
            r#"
            UPDATE shift_assignments
            SET status              = 'cancelled',
                cancelled_at        = now(),
                cancellation_reason = 'Declined via email',
                confirmation_token  = NULL,
                updated_at          = now()
            WHERE id = $1 AND status = 'pending_confirmation'
            "#,
        )
        .bind(assignment_id)
        .execute(&**db)
        .await?;

        if let Some((vid, st, an, vn, di, dn)) = info {
            let _ = EventLog::shift_invite_declined(
                &**db, vid, shift_id, di, &st, &an, &vn, dn.as_deref(),
            )
            .await;
        }

        // Auto-promote the next waitlisted volunteer
        if let Err(e) = promote_next_waitlisted(&**db, shift_id, &cfg.app_url).await {
            tracing::error!(error = %e, shift_id = %shift_id, "waitlist_decline_token: promote_next_waitlisted failed");
        }
    }

    Ok(Template::render("volunteer/waitlist_declined", context! {}))
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

#[get("/dashboard")]
pub async fn dashboard(
    db: &Db,
    user: ApprovedVolunteer,
    flash: Option<FlashMessage<'_>>,
) -> AppResult<Template> {
    let user = user.user();
    let flash_msg = flash.map(|f| context! { kind: f.kind().to_string(), message: f.message().to_string() });
    
    // Unread survey prompts — shown as dismissable login alerts
    let survey_prompts = sqlx::query_as::<_, (Uuid, String, String, serde_json::Value)>(
        r#"
        SELECT id, title, body, payload
        FROM notifications
        WHERE user_id = $1
          AND type = 'survey_prompt'
          AND read_at IS NULL
        ORDER BY created_at DESC
        "#,
    )
    .bind(user.id())
    .fetch_all(&**db)
    .await?;

    // All other unread notifications
    let notifications = sqlx::query_as::<_, (Uuid, String, String, String, Option<DateTime<Utc>>)>(
        r#"
        SELECT id, type::text, title, body, read_at
        FROM notifications
        WHERE user_id = $1
          AND type != 'survey_prompt'
        ORDER BY created_at DESC
        LIMIT 20
        "#,
    )
    .bind(user.id())
    .fetch_all(&**db)
    .await?;

    let pending_invites = sqlx::query_as::<_, ShiftCard>(
        r#"
        SELECT s.id, s.title, s.start_at, s.end_at, s.slots_requested,
               COUNT(sa2.id) FILTER (WHERE sa2.status = 'confirmed') AS slots_confirmed,
               s.requires_police_check, s.requires_vulnerable_check,
               a.name AS agency_name, at.name AS agency_type_name,
               si.name AS site_name, r.name AS region_name,
               NULL::double precision AS distance_km,
               ST_Y(si.geom::geometry) AS site_lat,
               ST_X(si.geom::geometry) AS site_lng,
               sa.status::text AS my_status,
               NULL::integer AS my_waitlist_position,
               '[]'::json AS team_members
        FROM shift_assignments sa
        JOIN shifts s ON s.id = sa.shift_id
        JOIN agencies a ON a.id = s.agency_id
        LEFT JOIN agency_types at ON at.id = a.agency_type_id
        JOIN sites si ON si.id = s.site_id
        LEFT JOIN regions r ON r.id = si.region_id
        LEFT JOIN shift_assignments sa2 ON sa2.shift_id = s.id
        WHERE sa.volunteer_id = $1 AND sa.status = 'pending_confirmation' AND s.start_at > now()
        GROUP BY s.id, a.name, at.name, si.name, r.name, sa.status, si.geom
        ORDER BY s.start_at ASC
        "#,
    )
    .bind(user.id())
    .fetch_all(&**db)
    .await?;

    let upcoming_confirmed = sqlx::query_as::<_, ShiftCard>(
        r#"
        SELECT s.id, s.title, s.start_at, s.end_at, s.slots_requested,
               COUNT(sa2.id) FILTER (WHERE sa2.status = 'confirmed') AS slots_confirmed,
               s.requires_police_check, s.requires_vulnerable_check,
               a.name AS agency_name, at.name AS agency_type_name,
               si.name AS site_name, r.name AS region_name,
               NULL::double precision AS distance_km,
               ST_Y(si.geom::geometry) AS site_lat,
               ST_X(si.geom::geometry) AS site_lng,
               sa.status::text AS my_status,
               NULL::integer AS my_waitlist_position,
               '[]'::json AS team_members
        FROM shift_assignments sa
        JOIN shifts s ON s.id = sa.shift_id
        JOIN agencies a ON a.id = s.agency_id
        LEFT JOIN agency_types at ON at.id = a.agency_type_id
        JOIN sites si ON si.id = s.site_id
        LEFT JOIN regions r ON r.id = si.region_id
        LEFT JOIN shift_assignments sa2 ON sa2.shift_id = s.id
        WHERE sa.volunteer_id = $1 AND sa.status = 'confirmed' AND s.start_at > now()
        GROUP BY s.id, a.name, at.name, si.name, r.name, sa.status, si.geom
        ORDER BY s.start_at ASC
        LIMIT 5
        "#,
    )
    .bind(user.id())
    .fetch_all(&**db)
    .await?;

    let recently_completed = sqlx::query_as::<_, ShiftCard>(
        r#"
        SELECT s.id, s.title, s.start_at, s.end_at, s.slots_requested,
               COUNT(sa2.id) FILTER (WHERE sa2.status = 'confirmed') AS slots_confirmed,
               s.requires_police_check, s.requires_vulnerable_check,
               a.name AS agency_name, at.name AS agency_type_name,
               si.name AS site_name, r.name AS region_name,
               NULL::double precision AS distance_km,
               ST_Y(si.geom::geometry) AS site_lat,
               ST_X(si.geom::geometry) AS site_lng,
               CASE
                 WHEN vs.id IS NOT NULL THEN 'completed'
                 ELSE 'needs_report'
               END AS my_status,
               NULL::integer AS my_waitlist_position,
               '[]'::json AS team_members
        FROM shift_assignments sa
        JOIN shifts s ON s.id = sa.shift_id
        JOIN agencies a ON a.id = s.agency_id
        LEFT JOIN agency_types at ON at.id = a.agency_type_id
        JOIN sites si ON si.id = s.site_id
        LEFT JOIN regions r ON r.id = si.region_id
        LEFT JOIN shift_assignments sa2 ON sa2.shift_id = s.id
        LEFT JOIN volunteer_surveys vs ON vs.shift_id = s.id AND vs.volunteer_id = sa.volunteer_id
        WHERE sa.volunteer_id = $1 AND sa.status = 'confirmed' AND s.end_at <= now()
        GROUP BY s.id, a.name, at.name, si.name, r.name, sa.status, vs.id, si.geom
        ORDER BY s.end_at DESC
        LIMIT 5
        "#,
    )
    .bind(user.id())
    .fetch_all(&**db)
    .await?;

    Ok(Template::render(
        "volunteer/dashboard",
        context! {
            user: &user.0,
            survey_prompts: &survey_prompts,
            notifications: &notifications,
            pending_invites: &pending_invites,
            upcoming_confirmed: &upcoming_confirmed,
            recently_completed: &recently_completed,
            flash: flash_msg,
        },
    ))
}

// ─── Help Alert Bar ──────────────────────────────────────────────────────────

#[derive(Serialize)]
struct HelpAlert {
    key: String,
    icon: String,
    title: String,
    description: String,
    bg_class: String,
    action_url: Option<String>,
    action_label: Option<String>,
}

#[get("/help-alerts")]
pub async fn help_alerts_partial(
    db: &Db,
    user: AuthUser,
    cookies: &CookieJar<'_>,
) -> AppResult<Template> {
    let mut alerts: Vec<HelpAlert> = Vec::new();

    // Check if email is verified
    let email_verified: Option<(Option<DateTime<Utc>>,)> = sqlx::query_as(
        "SELECT email_verified_at FROM users WHERE id = $1",
    )
    .bind(user.id())
    .fetch_optional(&**db)
    .await?;

    if let Some((verified_at,)) = &email_verified {
        if verified_at.is_none() && cookies.get("dismiss_verify_email").is_none() {
            alerts.push(HelpAlert {
                key: "verify_email".to_string(),
                icon: "📧".to_string(),
                title: "Verify your email".to_string(),
                description: "Please verify your email address to receive shift notifications and updates.".to_string(),
                bg_class: "bg-blue-50 border border-blue-200".to_string(),
                action_url: Some("/auth/login".to_string()),
                action_label: Some("Send Verification".to_string()),
            });
        }
    }

    // Check if user has any dogs
    let dog_count: (i64,) = sqlx::query_as(
        "SELECT COUNT(*) FROM dogs WHERE volunteer_id = $1",
    )
    .bind(user.id())
    .fetch_one(&**db)
    .await?;

    if dog_count.0 == 0 && cookies.get("dismiss_add_dog").is_none() {
        alerts.push(HelpAlert {
            key: "add_dog".to_string(),
            icon: "🐕".to_string(),
            title: "Add a therapy dog".to_string(),
            description: "Register your therapy dog to start signing up for visits.".to_string(),
            bg_class: "bg-amber-50 border border-amber-200".to_string(),
            action_url: Some("/volunteer/dog-applications/new".to_string()),
            action_label: Some("Register Dog".to_string()),
        });
    }

    // Check for active/incomplete volunteer application
    let active_app: Option<(String,)> = sqlx::query_as(
        r#"SELECT status::text FROM volunteer_applications
           WHERE user_id = $1 AND status NOT IN ('approved', 'rejected', 'withdrawn')
           ORDER BY created_at DESC LIMIT 1"#,
    )
    .bind(user.id())
    .fetch_optional(&**db)
    .await?;

    if let Some((status,)) = &active_app {
        if (status == "started" || status == "draft") && cookies.get("dismiss_complete_app").is_none() {
            alerts.push(HelpAlert {
                key: "complete_app".to_string(),
                icon: "📋".to_string(),
                title: "Complete your application".to_string(),
                description: "Your volunteer application is in progress. Continue where you left off.".to_string(),
                bg_class: "bg-green-50 border border-green-200".to_string(),
                action_url: Some("/apply".to_string()),
                action_label: Some("Continue Application".to_string()),
            });
        }
    }

    Ok(Template::render("partials/help_alert_bar", context! { alerts: &alerts }))
}

#[post("/help-alerts/<key>/dismiss")]
pub async fn dismiss_help_alert(
    _user: AuthUser,
    cookies: &CookieJar<'_>,
    key: &str,
) -> &'static str {
    let cookie_name = format!("dismiss_{}", key);
    let mut cookie = Cookie::new(cookie_name, "1");
    cookie.set_path("/");
    // Session cookie — expires when browser closes
    cookies.add(cookie);
    // Return empty string so HTMX removes the element
    ""
}

// ─── Survey Banner ────────────────────────────────────────────────────────────

/// GET /volunteer/survey-banner — returns dismissable survey prompt banner HTML or empty
#[get("/survey-banner")]
pub async fn survey_banner_partial(
    db: &Db,
    user: AuthUser,
) -> AppResult<rocket::response::content::RawHtml<String>> {
    let prompts = sqlx::query_as::<_, (uuid::Uuid, String, String, serde_json::Value)>(
        r#"
        SELECT id, title, body, payload
        FROM notifications
        WHERE user_id = $1
          AND type = 'survey_prompt'
          AND read_at IS NULL
        ORDER BY created_at DESC
        LIMIT 5
        "#,
    )
    .bind(user.id())
    .fetch_all(&**db)
    .await?;

    if prompts.is_empty() {
        // Empty div — HTMX outerHTML swap replaces the placeholder with nothing visible
        return Ok(rocket::response::content::RawHtml(
            r#"<div class="hidden"></div>"#.to_string(),
        ));
    }

    let mut html = String::from(
        r#"<div class="space-y-0" id="survey-banner-list">"#,
    );
    for (id, title, body, payload) in &prompts {
        let survey_url = payload
            .get("survey_url")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        let action_btn = if !survey_url.is_empty() {
            format!(
                r#"<a href="{survey_url}" class="flex-shrink-0 text-sm font-semibold bg-sunshine-500 hover:bg-sunshine-600 text-white px-4 py-2 rounded-lg transition">Complete Survey</a>"#
            )
        } else {
            String::new()
        };
        html.push_str(&format!(
            r##"<div id="survey-banner-{id}"
                 class="flex items-center gap-4 bg-amber-50 border-b border-amber-200 px-6 py-3">
              <span class="text-xl flex-shrink-0">📝</span>
              <div class="flex-1 min-w-0">
                <span class="font-semibold text-gray-900 text-sm">{title}</span>
                <span class="text-sm text-gray-600 ml-2">{body}</span>
              </div>
              <div class="flex items-center gap-2 flex-shrink-0">
                {action_btn}
                <button hx-post="/volunteer/notifications/{id}/dismiss"
                        hx-target="#survey-banner-{id}"
                        hx-swap="outerHTML"
                        class="text-xs text-gray-400 hover:text-gray-600 border border-gray-200 bg-white px-3 py-1.5 rounded-lg transition">
                  Dismiss
                </button>
              </div>
            </div>"##
        ));
    }
    html.push_str("</div>");

    Ok(rocket::response::content::RawHtml(html))
}

// ─── Profile ─────────────────────────────────────────────────────────────────

#[get("/profile")]
pub async fn profile_page(
    db: &Db,
    user: ApprovedVolunteer,
    flash: Option<FlashMessage<'_>>,
    config: &State<AppConfig>,
) -> AppResult<Template> {
    if user.0.0.role != UserRole::Volunteer {
        return Err(AppError::Forbidden);
    }

    let profile: Option<(String, Option<String>, NaiveDate, Option<Uuid>)> = sqlx::query_as(
        "SELECT volunteer_names, bio, joined_at, profile_pic_asset_id
          FROM volunteer_profiles WHERE user_id = $1",
    )
    .bind(user.id())
    .fetch_optional(&**db)
    .await
    .map_err(|e| {
        tracing::error!(error = %e, "Failed to fetch profile");
        AppError::Database(e)
    })?;

    let profile = profile.ok_or(AppError::NotFound)?;

    // Get profile picture URL if exists
    let profile_pic_url: Option<String> = if let Some(asset_id) = profile.3 {
        sqlx::query_scalar::<_, String>(
            "SELECT CASE WHEN storage_key IS NOT NULL THEN '/uploads/' || thumb_key END 
             FROM assets WHERE id = $1"
        )
        .bind(asset_id)
        .fetch_optional(&**db)
        .await
        .unwrap_or(None)
    } else {
        None
    };

    let dogs: Vec<DogDetail> = sqlx::query_as(
        r#"
        SELECT d.id, d.name, d.breed_id, dt.name AS breed_name, d.breed_freeform, d.size::text, d.gender,
               d.date_of_birth, d.personality_desc, d.is_primary, d.is_active,
               d.photo_asset_id,
               CASE WHEN a.storage_key IS NOT NULL THEN '/uploads/' || a.storage_key END AS photo_url,
               CASE WHEN a.thumb_key IS NOT NULL THEN '/uploads/' || a.thumb_key END AS photo_thumb_url,
               d.photo_crop_x, d.photo_crop_y, d.photo_crop_radius,
               d.created_at
        FROM dogs d
        LEFT JOIN dog_types dt ON dt.id = d.breed_id
        LEFT JOIN assets a ON a.id = d.photo_asset_id
        WHERE d.volunteer_id = $1
        ORDER BY d.is_primary DESC, d.created_at DESC
        "#
    )
    .bind(user.id())
    .fetch_all(&**db)
    .await
    .map_err(|e| {
        tracing::error!(error = %e, "Failed to fetch dogs for profile");
        AppError::Database(e)
    })?;

    let all_breeds: Vec<(Uuid, String, Option<Uuid>)> = sqlx::query_as(
        "SELECT id, name, parent_id FROM dog_types WHERE is_active = true ORDER BY path",
    )
    .fetch_all(&**db)
    .await
    .map_err(|e| {
        tracing::error!(error = %e, "Failed to fetch breeds");
        AppError::Database(e)
    })?;

    // Recent events
    let recent_events: Vec<VolunteerEventDetail> = sqlx::query_as(
        r#"
        SELECT 
            ve.id, ve.event_type::text, ve.metadata, ve.created_at,
            ve.shift_id, ve.dog_id,
            COALESCE(u_cb.display_name, u_cb.email) AS created_by_name,
            s.title AS shift_title, s.start_at AS shift_start_at,
            a.name AS agency_name,
            si.name AS site_name,
            d.name AS dog_name,
            vp_fv.volunteer_names AS from_volunteer_name
        FROM volunteer_events ve
        LEFT JOIN shifts s ON s.id = ve.shift_id
        LEFT JOIN agencies a ON a.id = s.agency_id
        LEFT JOIN sites si ON si.id = s.site_id
        LEFT JOIN dogs d ON d.id = ve.dog_id
        LEFT JOIN users u_cb ON u_cb.id = ve.created_by
        LEFT JOIN volunteer_profiles vp_fv ON vp_fv.user_id = ve.related_user_id
        WHERE ve.user_id = $1
        ORDER BY ve.created_at DESC
        LIMIT 10
        "#
    )
    .bind(user.id())
    .fetch_all(&**db)
    .await
    .map_err(|e| {
        tracing::error!(error = %e, "Failed to fetch recent events");
        AppError::Database(e)
    })?;

    let locations: Vec<VolunteerLocationCard> = sqlx::query_as(
        "SELECT id, name, address, is_home, display_order,
                ST_Y(geom::geometry) AS lat, ST_X(geom::geometry) AS lng
         FROM volunteer_locations
         WHERE user_id = $1
         ORDER BY display_order ASC, created_at ASC",
    )
    .bind(user.id())
    .fetch_all(&**db)
    .await
    .unwrap_or_default();

    Ok(Template::render(
        "volunteer/profile",
        context! {
            user: &user.0.0,
            profile: &(profile.0, profile.1, profile.2), // names, bio, joined_at
            profile_pic_url: profile_pic_url,
            dogs: &dogs,
            all_breeds: &all_breeds,
            recent_events: &recent_events,
            locations: &locations,
            google_maps_api_key: config.google_maps_api_key.as_deref().unwrap_or(""),
            flash: flash.map(|f| context! { kind: f.kind().to_string(), message: f.message().to_string() }),
        },
    ))
}

#[derive(rocket::form::FromForm, Debug)]
pub(crate) struct ProfileForm<'r> {
    volunteer_names: &'r str,
    #[field(default = "")]
    bio: &'r str,
    joined_at: Option<String>,
}

#[post("/profile", data = "<form>")]
pub async fn profile_update(
    db: &Db,
    user: ApprovedVolunteer,
    form: Form<ProfileForm<'_>>,
) -> AppResult<rocket::response::Redirect> {
    let f = form.into_inner();

    // Get current profile for change tracking
    let current: Option<(String, Option<String>, NaiveDate)> = sqlx::query_as(
        "SELECT volunteer_names, bio, joined_at
         FROM volunteer_profiles WHERE user_id = $1"
    )
    .bind(user.id())
    .fetch_optional(&**db)
    .await?;

    let joined_at = f.joined_at
        .filter(|s| !s.trim().is_empty())
        .and_then(|s| NaiveDate::parse_from_str(&s, "%Y-%m-%d").ok())
        .unwrap_or_else(|| {
            current.as_ref().map(|c| c.2).unwrap_or_else(|| Utc::now().date_naive())
        });

    // Track changed fields
    let mut changed_fields = Vec::new();
    if let Some((names, bio, joined)) = &current {
        if names != f.volunteer_names { changed_fields.push("volunteer_names".to_string()); }

        let bio_current = bio.as_deref().unwrap_or("");
        if bio_current != f.bio { changed_fields.push("bio".to_string()); }

        if joined != &joined_at { changed_fields.push("joined_at".to_string()); }
    }

    sqlx::query(
        "UPDATE volunteer_profiles
         SET volunteer_names = $2, bio = $3, joined_at = $4, updated_at = now()
         WHERE user_id = $1"
    )
    .bind(user.id())
    .bind(f.volunteer_names)
    .bind(if f.bio.is_empty() { None } else { Some(f.bio) })
    .bind(joined_at)
    .execute(&**db)
    .await?;

    // Log event if there were changes
    if !changed_fields.is_empty() {
        let _ = EventLog::profile_updated(&**db, user.id(), changed_fields, None).await;
    }

    Ok(rocket::response::Redirect::to("/volunteer/profile"))
}

// ─── Dog Management ──────────────────────────────────────────────────────────

#[derive(rocket::form::FromForm, Debug)]
pub(crate) struct DogFormVolunteer<'r> {
    name: &'r str,
    #[field(default = "")]
    breed_id: &'r str,
    #[field(default = "")]
    breed_freeform: &'r str,
    size: &'r str,
    #[field(default = "")]
    gender: &'r str,
    date_of_birth: Option<String>,
    #[field(default = "")]
    personality_desc: &'r str,
    #[field(default = false)]
    is_primary: bool,
}

#[post("/profile/dogs", data = "<form>")]
pub async fn dog_create(
    db: &Db,
    user: ApprovedVolunteer,
    form: Form<DogFormVolunteer<'_>>,
) -> AppResult<rocket::response::Redirect> {
    let f = form.into_inner();

    let breed_id = f.breed_id.parse::<Uuid>().ok();

    let size = match f.size {
        "x_small" => DogSize::XSmall,
        "small" => DogSize::Small,
        "medium" => DogSize::Medium,
        "large" => DogSize::Large,
        "x_large" => DogSize::XLarge,
        _ => DogSize::Medium,
    };

    let gender = match f.gender {
        "male" => Some(DogGender::Male),
        "female" => Some(DogGender::Female),
        _ => None,
    };

    let dob = f.date_of_birth.as_deref().filter(|s| !s.is_empty())
        .and_then(|s| NaiveDate::parse_from_str(s, "%Y-%m-%d").ok());

    let dog_id = sqlx::query_scalar::<_, Uuid>(
        "INSERT INTO dogs (volunteer_id, name, breed_id, breed_freeform, size, gender, date_of_birth, personality_desc, is_primary)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id"
    )
    .bind(user.id())
    .bind(f.name)
    .bind(breed_id)
    .bind(if f.breed_freeform.is_empty() { None } else { Some(f.breed_freeform) })
    .bind(size)
    .bind(gender)
    .bind(dob)
    .bind(if f.personality_desc.is_empty() { None } else { Some(f.personality_desc) })
    .bind(f.is_primary)

    .fetch_one(&**db)
    .await?;

    // Log event
    let _ = EventLog::dog_added(&**db, user.id(), dog_id, f.name, None).await;

    Ok(rocket::response::Redirect::to("/volunteer/profile"))
}

#[post("/profile/dogs/<dog_id>", data = "<form>")]
pub async fn dog_update(
    db: &Db,
    user: ApprovedVolunteer,
    dog_id: &str,
    form: Form<DogFormVolunteer<'_>>,
) -> AppResult<rocket::response::Redirect> {
    let dog_uuid = dog_id.parse::<Uuid>().map_err(|_| AppError::NotFound)?;

    let f = form.into_inner();
    let breed_id = f.breed_id.parse::<Uuid>().ok();

    let size = match f.size {
        "x_small" => DogSize::XSmall,
        "small" => DogSize::Small,
        "medium" => DogSize::Medium,
        "large" => DogSize::Large,
        "x_large" => DogSize::XLarge,
        _ => DogSize::Medium,
    };

    let gender = match f.gender {
        "male" => Some(DogGender::Male),
        "female" => Some(DogGender::Female),
        _ => None,
    };

    let dob = f.date_of_birth.as_deref().filter(|s| !s.is_empty())
        .and_then(|s| NaiveDate::parse_from_str(s, "%Y-%m-%d").ok());

    // Get current dog info for change tracking
    let current: Option<(String, Option<Uuid>, Option<String>, String, Option<DogGender>, Option<NaiveDate>, bool)> = sqlx::query_as(
        "SELECT name, breed_id, breed_freeform, size::text, gender, date_of_birth, is_primary FROM dogs
         WHERE id = $1 AND volunteer_id = $2"
    )
    .bind(dog_uuid)
    .bind(user.id())
    .fetch_optional(&**db)
    .await?;

    let mut changed_fields = Vec::new();
    if let Some((name, breed, freeform, sz, cur_gender, cur_dob, primary)) = &current {
        if name != f.name { changed_fields.push("name".to_string()); }
        if breed != &breed_id { changed_fields.push("breed".to_string()); }
        
        let ff_current = freeform.as_deref().unwrap_or("");
        if ff_current != f.breed_freeform { changed_fields.push("breed_freeform".to_string()); }
        
        if sz != f.size { changed_fields.push("size".to_string()); }
        if cur_gender != &gender { changed_fields.push("gender".to_string()); }
        if cur_dob != &dob { changed_fields.push("date_of_birth".to_string()); }
        if primary != &f.is_primary { changed_fields.push("is_primary".to_string()); }
    }

    sqlx::query(
        "UPDATE dogs SET
            name = $2, breed_id = $3, breed_freeform = $4, size = $5,
            gender = $6, date_of_birth = $7, personality_desc = $8, is_primary = $9, updated_at = now()
         WHERE id = $1 AND volunteer_id = $10"
    )
    .bind(dog_uuid)
    .bind(f.name)
    .bind(breed_id)
    .bind(if f.breed_freeform.is_empty() { None } else { Some(f.breed_freeform) })
    .bind(size)
    .bind(gender)
    .bind(dob)
    .bind(if f.personality_desc.is_empty() { None } else { Some(f.personality_desc) })
    .bind(f.is_primary)
    .bind(user.id())
    .execute(&**db)
    .await?;
    // Log event if there were changes
    if !changed_fields.is_empty() {
        let _ = EventLog::dog_updated(&**db, user.id(), dog_uuid, f.name, changed_fields, None).await;
    }

    Ok(rocket::response::Redirect::to("/volunteer/profile"))
}

#[post("/profile/dogs/<dog_id>/toggle-active")]
pub async fn dog_toggle_active(
    db: &Db,
    user: ApprovedVolunteer,
    dog_id: &str,
) -> AppResult<rocket::response::Redirect> {
    let dog_uuid = dog_id.parse::<Uuid>().map_err(|_| AppError::NotFound)?;

    // Get current status and name
    let current: Option<(bool, String)> = sqlx::query_as(
        "SELECT is_active, name FROM dogs WHERE id = $1 AND volunteer_id = $2"
    )
    .bind(dog_uuid)
    .bind(user.id())
    .fetch_optional(&**db)
    .await?;

    let (new_status, dog_name) = match current {
        Some((is_active, name)) => (!is_active, name),
        None => return Err(AppError::NotFound),
    };

    sqlx::query("UPDATE dogs SET is_active = $2, updated_at = now() WHERE id = $1")
        .bind(dog_uuid)
        .bind(new_status)
        .execute(&**db)
        .await?;

    // Log event
    if new_status {
        if let Err(e) = EventLog::dog_reactivated(&**db, user.id(), dog_uuid, &dog_name, None).await {
            tracing::error!("Failed to log dog reactivated event: {}", e);
        }
    } else {
        if let Err(e) = EventLog::dog_deactivated(&**db, user.id(), dog_uuid, &dog_name, None).await {
            tracing::error!("Failed to log dog deactivated event: {}", e);
        }
    }

    Ok(rocket::response::Redirect::to("/volunteer/profile"))
}

#[derive(rocket::form::FromForm)]
pub(crate) struct DogRetireForm<'r> {
    reason: &'r str,
    #[field(default = "")]
    note: &'r str,
}

#[post("/profile/dogs/<dog_id>/retire", data = "<form>")]
pub async fn dog_retire(
    db: &Db,
    user: ApprovedVolunteer,
    dog_id: &str,
    form: Form<DogRetireForm<'_>>,
) -> AppResult<rocket::response::Redirect> {
    let dog_uuid = dog_id.parse::<Uuid>().map_err(|_| AppError::NotFound)?;
    let f = form.into_inner();
    let note = if f.note.is_empty() { None } else { Some(f.note) };

    // Get name
    let dog_name: Option<String> = sqlx::query_scalar(
        "SELECT name FROM dogs WHERE id = $1 AND volunteer_id = $2"
    )
    .bind(dog_uuid)
    .bind(user.id())
    .fetch_optional(&**db)
    .await?;

    let dog_name = dog_name.ok_or(AppError::NotFound)?;

    sqlx::query("UPDATE dogs SET is_active = false, is_primary = false, updated_at = now() WHERE id = $1 AND volunteer_id = $2")
        .bind(dog_uuid)
        .bind(user.id())
        .execute(&**db)
        .await?;

    // --- Handle Upcoming Assignments ---
    let volunteer_id = user.id();
    
    // Get volunteer name
    let volunteer_name: String = sqlx::query_scalar("SELECT volunteer_names FROM volunteer_profiles WHERE user_id = $1")
        .bind(volunteer_id)
        .fetch_optional(&**db)
        .await
        .unwrap_or_default()
        .flatten()
        .unwrap_or_else(|| user.0.0.display_name.clone().unwrap_or_else(|| user.0.0.email.clone()));

    // 1. Find all future assignments for this dog
    let affected_assignments: Vec<(Uuid, Uuid, String, String, DateTime<Utc>)> = sqlx::query_as(
        r#"
        SELECT sa.id, s.id as shift_id, s.title, a.name as agency_name, s.start_at
        FROM shift_assignments sa
        JOIN shifts s ON s.id = sa.shift_id
        JOIN agencies a ON a.id = s.agency_id
        WHERE $1 = ANY(sa.dog_ids)
          AND s.start_at > now()
          AND sa.status IN ('confirmed', 'waitlisted', 'pending_confirmation')
        "#
    )
    .bind(dog_uuid)
    .fetch_all(&**db)
    .await
    .unwrap_or_default();

    for (assignment_id, shift_id, shift_title, agency_name, shift_start) in affected_assignments {
        // 2. Mark assignment as cancelled
        let _ = sqlx::query(
            r#"
            UPDATE shift_assignments 
            SET status = 'cancelled', 
                updated_at = now(),
                cancelled_at = now(),
                cancellation_reason = 'Dog retired',
                cancellation_note = $2
            WHERE id = $1
            "#,
        )
        .bind(assignment_id)
        .bind(format!("Automatically cancelled because {} was retired. Reason: {}. Note: {}", dog_name, f.reason, f.note))
        .execute(&**db)
        .await;

        // 3. Create vacancy record for admin to fill
        let _ = sqlx::query(
            r#"
            INSERT INTO shift_vacancies (
                shift_id, source_assignment_id, cancelled_by_volunteer_id,
                cancellation_reason, cancellation_note, status
            ) VALUES ($1, $2, $3, 'Dog retired', $4, 'open')
            "#,
        )
        .bind(shift_id)
        .bind(assignment_id)
        .bind(volunteer_id)
        .bind(format!("Dog {} retired ({}). {}", dog_name, f.reason, f.note))
        .execute(&**db)
        .await;

        // 4. Create admin alert for vacancy
        let _ = sqlx::query(
            r#"
            INSERT INTO admin_alerts (alert_type, shift_id, source_assignment_id)
            VALUES ('waitlist_promote', $1, $2)
            "#,
        )
        .bind(shift_id)
        .bind(assignment_id)
        .execute(&**db)
        .await;

        // 5. Log event
        let _ = EventLog::shift_cancelled(
            &**db, 
            volunteer_id, 
            shift_id, 
            Some(dog_uuid),
            &shift_title, 
            &agency_name, 
            &volunteer_name, 
            Some(&dog_name),
            "Dog retired"
        ).await;

        // 6. Notify all admins
        let notification_title = format!("Spot vacant: {} ({}'s dog) retired", dog_name, volunteer_name);
        let notification_body = format!(
            "{} retired their dog {} ({}), leaving a vacancy in '{}' on {}. Note: {}",
            volunteer_name,
            dog_name,
            f.reason,
            shift_title,
            shift_start.format("%b %-d"),
            f.note
        );

        let admin_ids: Vec<(Uuid,)> = sqlx::query_as("SELECT id FROM users WHERE role = 'admin'").fetch_all(&**db).await.unwrap_or_default();
        for (aid,) in admin_ids {
            let _ = sqlx::query(
                "INSERT INTO notifications (user_id, type, title, body, payload) VALUES ($1, 'booking_cancelled', $2, $3, $4)"
            )
            .bind(aid)
            .bind(&notification_title)
            .bind(&notification_body)
            .bind(serde_json::json!({ "shift_id": shift_id, "vacancy_id": assignment_id }))
            .execute(&**db)
            .await;
        }
    }

    // Log event
    if let Err(e) = EventLog::dog_retired(&**db, user.id(), dog_uuid, &dog_name, f.reason, note, None).await {
        tracing::error!("Failed to log dog retired event: {}", e);
    }

    Ok(rocket::response::Redirect::to("/volunteer/profile"))
}

// ─── Dog Photo Upload / Remove ───────────────────────────────────────────────

#[derive(rocket::form::FromForm)]
pub struct DogPhotoForm<'r> {
    pub file: TempFile<'r>,
    pub crop_x: i32,
    pub crop_y: i32,
    pub crop_radius: i32,
}

#[post("/profile/dogs/<dog_id>/photo", data = "<form>")]
pub async fn dog_photo_upload(
    db: &Db,
    user: ApprovedVolunteer,
    dog_id: &str,
    form: Form<DogPhotoForm<'_>>,
    storage: &rocket::State<StorageBackend>,
) -> Result<Redirect, Flash<Redirect>> {
    let redirect_url = "/volunteer/profile";
    let dog_uuid = match dog_id.parse::<Uuid>() {
        Ok(u) => u,
        Err(_) => return Err(Flash::error(Redirect::to(redirect_url), "Invalid dog ID")),
    };
    let f = form.into_inner();

    // Verify ownership
    let exists: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM dogs WHERE id = $1 AND volunteer_id = $2)"
    )
    .bind(dog_uuid)
    .bind(user.id())
    .fetch_one(&**db)
    .await
    .unwrap_or(false);

    if !exists {
        return Err(Flash::error(Redirect::to(redirect_url), "Dog not found"));
    }

    // Remove old photo asset if exists
    let old_asset: Option<(Uuid, String, Option<String>)> = sqlx::query_as(
        "SELECT a.id, a.storage_key, a.thumb_key FROM assets a JOIN dogs d ON d.photo_asset_id = a.id WHERE d.id = $1"
    )
    .bind(dog_uuid)
    .fetch_optional(&**db)
    .await
    .unwrap_or(None);

    if let Some((old_id, old_key, old_thumb)) = old_asset {
        let _ = storage.delete(&old_key).await;
        if let Some(tk) = &old_thumb {
            let _ = storage.delete(tk).await;
        }
        let _ = sqlx::query("DELETE FROM assets WHERE id = $1").bind(old_id).execute(&**db).await;
    }

    // Upload new photo
    let result = handle_upload(
        f.file,
        None, // no shift_id — this is a dog profile photo
        user.id(),
        AssetVisibility::Curated,
        storage.inner(),
        db,
    ).await;

    match result {
        Ok(upload) => {
            sqlx::query(r#"
                UPDATE dogs 
                SET photo_asset_id = $1,
                    photo_crop_x = $2,
                    photo_crop_y = $3,
                    photo_crop_radius = $4,
                    updated_at = now() 
                WHERE id = $5
            "#)
                .bind(upload.asset.id)
                .bind(f.crop_x)
                .bind(f.crop_y)
                .bind(f.crop_radius)
                .bind(dog_uuid)
                .execute(&**db)
                .await
                .ok();

            Ok(Redirect::to(redirect_url))
        }
        Err(e) => {
            tracing::error!(error = %e, "Dog photo upload failed");
            Err(Flash::error(Redirect::to(redirect_url), format!("Upload failed: {e}")))
        }
    }
}

#[post("/profile/dogs/<dog_id>/photo/remove")]
pub async fn dog_photo_remove(
    db: &Db,
    user: ApprovedVolunteer,
    dog_id: &str,
    storage: &rocket::State<StorageBackend>,
) -> Result<Redirect, Flash<Redirect>> {
    let redirect_url = "/volunteer/profile";
    let dog_uuid = match dog_id.parse::<Uuid>() {
        Ok(u) => u,
        Err(_) => return Err(Flash::error(Redirect::to(redirect_url), "Invalid dog ID")),
    };

    // Get the asset info, verifying ownership
    let asset_info: Option<(Uuid, String, Option<String>)> = sqlx::query_as(
        r#"SELECT a.id, a.storage_key, a.thumb_key
           FROM assets a JOIN dogs d ON d.photo_asset_id = a.id
           WHERE d.id = $1 AND d.volunteer_id = $2"#
    )
    .bind(dog_uuid)
    .bind(user.id())
    .fetch_optional(&**db)
    .await
    .unwrap_or(None);

    if let Some((asset_id, storage_key, thumb_key)) = asset_info {
        // Clear the FK and crop info first
        sqlx::query(r#"UPDATE dogs 
            SET photo_asset_id = NULL,
                photo_crop_x = NULL,
                photo_crop_y = NULL,
                photo_crop_radius = NULL,
                updated_at = now() 
            WHERE id = $1"#)
            .bind(dog_uuid)
            .execute(&**db)
            .await
            .ok();

        // Delete files from storage
        let _ = storage.delete(&storage_key).await;
        if let Some(tk) = &thumb_key {
            let _ = storage.delete(tk).await;
        }

        // Delete asset record
        let _ = sqlx::query("DELETE FROM assets WHERE id = $1").bind(asset_id).execute(&**db).await;
    }

    Ok(Redirect::to(redirect_url))
}

// ─── Profile Photo Upload / Remove ────────────────────────────────────────────

#[derive(rocket::form::FromForm)]
pub struct ProfilePhotoForm<'r> {
    pub file: TempFile<'r>,
    pub crop_x: i32,
    pub crop_y: i32,
    pub crop_radius: i32,
}

#[post("/profile/photo", data = "<form>")]
pub async fn profile_photo_upload(
    db: &Db,
    user: ApprovedVolunteer,
    form: Form<ProfilePhotoForm<'_>>,
    storage: &rocket::State<StorageBackend>,
) -> Result<Redirect, Flash<Redirect>> {
    let redirect_url = "/volunteer/profile";
    let f = form.into_inner();

    // Remove old profile photo asset if exists
    let old_asset: Option<(Uuid, String, Option<String>)> = sqlx::query_as(
        "SELECT a.id, a.storage_key, a.thumb_key FROM assets a JOIN volunteer_profiles vp ON vp.profile_pic_asset_id = a.id WHERE vp.user_id = $1"
    )
    .bind(user.id())
    .fetch_optional(&**db)
    .await
    .unwrap_or(None);

    if let Some((old_id, old_key, old_thumb)) = old_asset {
        let _ = storage.delete(&old_key).await;
        if let Some(tk) = &old_thumb {
            let _ = storage.delete(tk).await;
        }
        let _ = sqlx::query("DELETE FROM assets WHERE id = $1").bind(old_id).execute(&**db).await;
    }

    // Upload new photo
    let result = handle_upload(
        f.file,
        None, // no shift_id — this is a profile photo
        user.id(),
        AssetVisibility::Curated,
        storage.inner(),
        db,
    ).await;

    match result {
        Ok(upload) => {
            // Update volunteer profile with new asset ID and crop coordinates
            sqlx::query(r#"
                UPDATE volunteer_profiles 
                SET profile_pic_asset_id = $1,
                    profile_pic_crop_x = $2,
                    profile_pic_crop_y = $3,
                    profile_pic_crop_radius = $4,
                    updated_at = now() 
                WHERE user_id = $5
            "#)
                .bind(upload.asset.id)
                .bind(f.crop_x)
                .bind(f.crop_y)
                .bind(f.crop_radius)
                .bind(user.id())
                .execute(&**db)
                .await
                .ok();

            Ok(Redirect::to(redirect_url))
        }
        Err(e) => {
            tracing::error!(error = %e, "Profile photo upload failed");
            Err(Flash::error(Redirect::to(redirect_url), format!("Upload failed: {e}")))
        }
    }
}

#[post("/profile/photo/remove")]
pub async fn profile_photo_remove(
    db: &Db,
    user: ApprovedVolunteer,
    storage: &rocket::State<StorageBackend>,
) -> Result<Redirect, Flash<Redirect>> {
    let redirect_url = "/volunteer/profile";

    // Get the asset info
    let asset_info: Option<(Uuid, String, Option<String>)> = sqlx::query_as(
        r#"SELECT a.id, a.storage_key, a.thumb_key
           FROM assets a JOIN volunteer_profiles vp ON vp.profile_pic_asset_id = a.id
           WHERE vp.user_id = $1"#
    )
    .bind(user.id())
    .fetch_optional(&**db)
    .await
    .unwrap_or(None);

    if let Some((asset_id, storage_key, thumb_key)) = asset_info {
        // Clear the FK and crop info first
        sqlx::query(r#"UPDATE volunteer_profiles 
            SET profile_pic_asset_id = NULL,
                profile_pic_crop_x = NULL,
                profile_pic_crop_y = NULL,
                profile_pic_crop_radius = NULL,
                updated_at = now() 
            WHERE user_id = $1"#)
            .bind(user.id())
            .execute(&**db)
            .await
            .ok();

        // Delete files from storage
        let _ = storage.delete(&storage_key).await;
        if let Some(tk) = &thumb_key {
            let _ = storage.delete(tk).await;
        }

        // Delete asset record
        let _ = sqlx::query("DELETE FROM assets WHERE id = $1").bind(asset_id).execute(&**db).await;
    }

    Ok(Redirect::to(redirect_url))
}

// ─── History / Event Log ─────────────────────────────────────────────────────

#[get("/history")]
pub async fn history_page(
    db: &Db,
    user: ApprovedVolunteer,
) -> AppResult<Template> {
    let events: Vec<VolunteerEventDetail> = sqlx::query_as(
        r#"
        SELECT 
            ve.id, ve.event_type::text, ve.metadata, ve.created_at,
            ve.shift_id, ve.dog_id,
            COALESCE(u_cb.display_name, u_cb.email) AS created_by_name,
            s.title AS shift_title, s.start_at AS shift_start_at,
            a.name AS agency_name,
            si.name AS site_name,
            d.name AS dog_name,
            vp_fv.volunteer_names AS from_volunteer_name
        FROM volunteer_events ve
        LEFT JOIN shifts s ON s.id = ve.shift_id
        LEFT JOIN agencies a ON a.id = s.agency_id
        LEFT JOIN sites si ON si.id = s.site_id
        LEFT JOIN dogs d ON d.id = ve.dog_id
        LEFT JOIN users u_cb ON u_cb.id = ve.created_by
        LEFT JOIN volunteer_profiles vp_fv ON vp_fv.user_id = ve.related_user_id
        WHERE ve.user_id = $1
        ORDER BY ve.created_at DESC
        "#
    )
    .bind(user.id())
    .fetch_all(&**db)
    .await?;

    Ok(Template::render(
        "volunteer/history",
        context! { user: &user.0.0, events },
    ))
}

// ─── Agenda / Career stats ────────────────────────────────────────────────────

#[get("/agenda")]
pub async fn agenda(db: &Db, user: ApprovedVolunteer) -> AppResult<Template> {
    let user = user.user();
    // Past completed shifts
    let past_shifts = sqlx::query_as::<_, ShiftCard>(
        r#"
        SELECT s.id, s.title, s.start_at, s.end_at, s.slots_requested,
               COUNT(sa2.id) FILTER (WHERE sa2.status = 'confirmed') AS slots_confirmed,
               s.requires_police_check, s.requires_vulnerable_check,
               a.name AS agency_name, at.name AS agency_type_name,
               si.name AS site_name, r.name AS region_name,
               NULL::double precision AS distance_km,
               ST_Y(si.geom::geometry) AS site_lat,
               ST_X(si.geom::geometry) AS site_lng,
               sa.status::text AS my_status,
               NULL::integer AS my_waitlist_position,
               '[]'::json AS team_members
        FROM shift_assignments sa
        JOIN shifts s ON s.id = sa.shift_id
        JOIN agencies a ON a.id = s.agency_id
        LEFT JOIN agency_types at ON at.id = a.agency_type_id
        JOIN sites si ON si.id = s.site_id
        LEFT JOIN regions r ON r.id = si.region_id
        LEFT JOIN shift_assignments sa2 ON sa2.shift_id = s.id
        WHERE sa.volunteer_id = $1 AND sa.status = 'confirmed' AND s.end_at < now()
        GROUP BY s.id, a.name, at.name, si.name, r.name, sa.status, si.geom
        ORDER BY s.start_at DESC LIMIT 50
        "#,
    )
    .bind(user.id())
    .fetch_all(&**db)
    .await?;

    // Upcoming (confirmed, invited, or waitlisted)
    let upcoming_shifts = sqlx::query_as::<_, ShiftCard>(
        r#"
        SELECT s.id, s.title, s.start_at, s.end_at, s.slots_requested,
               COUNT(sa2.id) FILTER (WHERE sa2.status = 'confirmed') AS slots_confirmed,
               s.requires_police_check, s.requires_vulnerable_check,
               a.name AS agency_name, at.name AS agency_type_name,
               si.name AS site_name, r.name AS region_name,
               NULL::double precision AS distance_km,
               ST_Y(si.geom::geometry) AS site_lat,
               ST_X(si.geom::geometry) AS site_lng,
               sa.status::text AS my_status,
               sa.waitlist_position AS my_waitlist_position,
               '[]'::json AS team_members
        FROM shift_assignments sa
        JOIN shifts s ON s.id = sa.shift_id
        JOIN agencies a ON a.id = s.agency_id
        LEFT JOIN agency_types at ON at.id = a.agency_type_id
        JOIN sites si ON si.id = s.site_id
        LEFT JOIN regions r ON r.id = si.region_id
        LEFT JOIN shift_assignments sa2 ON sa2.shift_id = s.id
        WHERE sa.volunteer_id = $1 AND sa.status IN ('confirmed', 'waitlisted', 'pending_confirmation') AND s.start_at > now()
        GROUP BY s.id, a.name, at.name, si.name, r.name, sa.status, sa.waitlist_position, si.geom
        ORDER BY s.start_at ASC
        "#,
    )
    .bind(user.id())
    .fetch_all(&**db)
    .await?;

    // Career stats
    let stats_row: (i64, i64, Option<DateTime<Utc>>) = sqlx::query_as(
        r#"
        SELECT
            COUNT(sa.id),
            COALESCE(SUM(
                COALESCE(ags.actual_clients_served,
                         vs.clients_served_override,
                         s.estimated_clients, 0)
            ), 0),
            MIN(s.start_at)
        FROM shift_assignments sa
        JOIN shifts s ON s.id = sa.shift_id
        LEFT JOIN volunteer_surveys vs ON vs.shift_id = s.id AND vs.volunteer_id = sa.volunteer_id
        LEFT JOIN agency_surveys ags ON ags.shift_id = s.id
        WHERE sa.volunteer_id = $1 AND sa.status = 'confirmed' AND s.end_at < now()
        "#,
    )
    .bind(user.id())
    .fetch_one(&**db)
    .await?;

    let stats = VolunteerStats {
        total_shifts: stats_row.0,
        total_clients_served: stats_row.1,
        first_shift_date: stats_row.2,
    };

    Ok(Template::render(
        "volunteer/agenda",
        context! {
            user: &user.0,
            past_shifts: &past_shifts,
            upcoming_shifts: &upcoming_shifts,
            stats: &stats,
        },
    ))
}

// ─── Gallery ─────────────────────────────────────────────────────────────────

#[get("/gallery?<filter>&<page>&<htmx>")]
pub async fn gallery(
    db: &Db, 
    user: ApprovedVolunteer,
    filter: Option<&str>,
    page: Option<i64>,
    htmx: Option<&str>,
) -> AppResult<Template> {
    let user = user.user();
    let filter = filter.unwrap_or("all");
    let page = page.unwrap_or(1);
    
    let items = get_user_gallery(db, user.id(), Some(filter), Some(page)).await?;

    let template_name = if htmx.is_some() {
        "partials/gallery_photostream"
    } else {
        "volunteer/gallery"
    };

    Ok(Template::render(
        template_name,
        context! { 
            user: &user.0, 
            items,
            filter,
            page,
        },
    ))
}

/// POST /volunteer/shifts/<id>/survey/upload
/// Upload a photo in the context of a survey; appends to photo_asset_ids.
#[post("/shifts/<shift_id>/survey/upload", data = "<form>")]
pub async fn survey_upload(
    shift_id: Uuid,
    form: rocket::form::Form<SurveyUploadForm<'_>>,
    user: ApprovedVolunteer,
    db: &Db,
    storage: &rocket::State<StorageBackend>,
) -> AppResult<Template> {
    let result = handle_upload(
        form.into_inner().photo,
        Some(shift_id),
        user.id(),
        AssetVisibility::Unverified,
        storage,
        db,
    )
    .await?;

    // 2. Ensure a survey record exists and append the photo ID
    // We use a dummy rating of 0 to indicate a draft if needed, 
    // but the table schema allows rating to be NULL if we didn't have the CHECK constraint.
    // Actually the schema has: rating SMALLINT CHECK (rating BETWEEN 1 AND 5)
    // So we'll leave rating as NULL if possible, or 1 if it's required.
    // Wait, check the schema again... it says rating SMALLINT CHECK (rating BETWEEN 1 AND 5).
    // If it's NOT NULL, we must provide it. Let me check if it's NOT NULL.
    // Schema from earlier: rating SMALLINT CHECK (rating BETWEEN 1 AND 5), -- no NOT NULL
    
    let _ = sqlx::query(
        r#"
        INSERT INTO volunteer_surveys (shift_id, volunteer_id, photo_asset_ids)
        VALUES ($1, $2, ARRAY[$3]::uuid[])
        ON CONFLICT (shift_id, volunteer_id) DO UPDATE SET
            photo_asset_ids = array_append(volunteer_surveys.photo_asset_ids, $3)
        "#,
    )
    .bind(shift_id)
    .bind(user.id())
    .bind(result.asset.id)
    .execute(&**db)
    .await;

    Ok(Template::render(
        "partials/survey_asset_card",
        context! {
            result,
            viewer_id: user.id(),
            is_admin: false,
            tags: Vec::<serde_json::Value>::new(),
        },
    ))
}

#[derive(rocket::form::FromForm)]
pub struct SurveyUploadForm<'r> {
    pub photo: TempFile<'r>,
    pub caption: Option<String>,
}

/// DELETE /volunteer/assets/<id>
/// Remove own private asset and disassociate from any survey.
#[delete("/assets/<id>")]
pub async fn delete_asset(
    id: Uuid,
    user: ApprovedVolunteer,
    db: &Db,
    storage: &rocket::State<StorageBackend>,
) -> AppResult<rocket::http::Status> {
    // Fetch asset — must belong to this user and be private
    let asset: Option<crate::models::gallery::Asset> = sqlx::query_as(
        "SELECT * FROM assets WHERE id = $1 AND uploader_id = $2 AND visibility = 'private'",
    )
    .bind(id)
    .bind(user.id())
    .fetch_optional(&**db)
    .await?;

    let asset = asset.ok_or(AppError::Forbidden)?;

    // Delete files from storage
    storage.delete(&asset.storage_key).await.ok();
    if let Some(thumb) = &asset.thumb_key {
        storage.delete(thumb).await.ok();
    }

    // Remove from all surveys
    sqlx::query(
        "UPDATE volunteer_surveys SET photo_asset_ids = array_remove(photo_asset_ids, $1)",
    )
    .bind(id)
    .execute(&**db)
    .await?;

    // Delete the asset row
    sqlx::query("DELETE FROM assets WHERE id = $1")
        .bind(id)
        .execute(&**db)
        .await?;

    Ok(rocket::http::Status::NoContent)
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct TaggableEntity {
    pub id: Uuid,
    pub name: String,
    pub type_name: String, // "volunteer" | "dog"
}

// ─── Post-shift survey ────────────────────────────────────────────────────────

#[get("/survey/<shift_id>")]
pub async fn survey_form(db: &Db, user: ApprovedVolunteer, shift_id: &str) -> AppResult<Template> {
    let shift_id: Uuid = shift_id.parse().map_err(|_| AppError::NotFound)?;

    // Verify user was on this shift
    let confirmed: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM shift_assignments WHERE shift_id = $1 AND volunteer_id = $2 AND status = 'confirmed')",
    )
    .bind(shift_id)
    .bind(user.id())
    .fetch_one(&**db)
    .await?;

    if !confirmed {
        return Err(AppError::Forbidden);
    }

    // Check if survey already submitted
    let already_submitted: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM volunteer_surveys WHERE shift_id = $1 AND volunteer_id = $2)",
    )
    .bind(shift_id)
    .bind(user.id())
    .fetch_one(&**db)
    .await?;

    // Load shift title and teammates for peer notes
    let shift_title: String = sqlx::query_scalar("SELECT title FROM shifts WHERE id = $1")
        .bind(shift_id)
        .fetch_one(&**db)
        .await?;

    let teammates = sqlx::query_as::<_, ShiftTeamMember>(
        r#"
        SELECT sa.volunteer_id AS user_id, vp.volunteer_names, d.name AS dog_name,
               dt.name AS dog_breed, d.size::text AS dog_size,
               vp.profile_pic_asset_id, sa.status::text,
               sa.waitlist_position, sa.confirmation_deadline_at
        FROM shift_assignments sa
        JOIN volunteer_profiles vp ON vp.user_id = sa.volunteer_id
        LEFT JOIN dogs d ON d.id = sa.dog_ids[1]
        LEFT JOIN dog_types dt ON dt.id = d.breed_id
        WHERE sa.shift_id = $1 AND sa.volunteer_id <> $2 AND sa.status = 'confirmed'
        "#,
    )
    .bind(shift_id)
    .bind(user.id())
    .fetch_all(&**db)
    .await?;

    // Fetch taggable entities (all dogs and volunteers confirmed for this shift)
    let taggables: Vec<TaggableEntity> = sqlx::query_as(
        r#"
        SELECT vp.user_id AS id, vp.volunteer_names AS name, 'volunteer' AS type_name
        FROM shift_assignments sa
        JOIN volunteer_profiles vp ON vp.user_id = sa.volunteer_id
        WHERE sa.shift_id = $1 AND sa.status = 'confirmed'
        UNION ALL
        SELECT d.id, d.name, 'dog' AS type_name
        FROM shift_assignments sa
        JOIN dogs d ON d.id = ANY(sa.dog_ids)
        WHERE sa.shift_id = $1 AND sa.status = 'confirmed'
        ORDER BY type_name DESC, name ASC
        "#
    )
    .bind(shift_id)
    .fetch_all(&**db)
    .await?;

    Ok(Template::render(
        "volunteer/survey",
        context! {
            user: &user.0.0,
            shift_id,
            shift_title: &shift_title,
            teammates: &teammates,
            taggables,
            already_submitted,
        },
    ))
}

#[derive(rocket::form::FromForm)]
pub struct SurveySubmitForm<'r> {
    pub rating: i16,
    pub notes: &'r str,
    pub suggestions_for_agency: Option<&'r str>,
    pub kudos: HashMap<String, String>,
}

#[post("/survey/<shift_id>", data = "<form>")]
pub async fn survey_submit(
    db: &Db,
    user: ApprovedVolunteer,
    shift_id: &str,
    form: rocket::form::Form<SurveySubmitForm<'_>>,
) -> AppResult<Flash<Redirect>> {
    let shift_id: Uuid = shift_id.parse().map_err(|_| AppError::NotFound)?;
    let user_id = user.id();
    let f = form.into_inner();

    if f.rating == 0 || f.notes.is_empty() {
        return Ok(Flash::error(Redirect::to(format!("/volunteer/survey/{}", shift_id)), "Please provide a rating and notes."));
    }

    // Get shift info and volunteer name for event log
    let shift_title: String = sqlx::query_scalar("SELECT title FROM shifts WHERE id = $1")
        .bind(shift_id)
        .fetch_one(&**db)
        .await?;

    let volunteer_name: String = sqlx::query_scalar("SELECT volunteer_names FROM volunteer_profiles WHERE user_id = $1")
        .bind(user_id)
        .fetch_optional(&**db)
        .await
        .unwrap_or_default()
        .flatten()
        .unwrap_or_else(|| user.0.0.display_name.clone().unwrap_or_else(|| user.0.0.email.clone()));

    let mut peer_notes = Vec::new();
    for (key, value) in f.kudos {
        // Form field names for kudos are "kudos_<uuid>"
        if let Some(uuid_str) = key.strip_prefix("kudos_") {
            if let Ok(target_id) = Uuid::parse_str(uuid_str) {
                let note = value.trim();
                if !note.is_empty() {
                    peer_notes.push(serde_json::json!({
                        "volunteer_id": target_id.to_string(),
                        "note": note
                    }));
                }
            }
        }
    }

    let mut tx = db.begin().await?;

    // 3. Save survey
    let res = sqlx::query(
        r#"
        INSERT INTO volunteer_surveys (shift_id, volunteer_id, rating, notes, suggestions_for_agency, peer_notes)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (shift_id, volunteer_id) DO UPDATE SET
            rating = $3, notes = $4, suggestions_for_agency = $5, peer_notes = $6, submitted_at = now()
        "#
    )
    .bind(shift_id)
    .bind(user_id)
    .bind(f.rating)
    .bind(f.notes)
    .bind(f.suggestions_for_agency)
    .bind(serde_json::Value::Array(peer_notes.clone()))
    .execute(&mut *tx)
    .await;

    if let Err(e) = res {
        tracing::error!("Failed to save survey: {}", e);
        return Ok(Flash::error(Redirect::to("/volunteer/dashboard"), "Internal error saving survey"));
    }

    // 4. Clear the prompt notification
    sqlx::query(
        "UPDATE notifications SET read_at = now(), archived_at = now() 
         WHERE user_id = $1 AND type = 'survey_prompt' AND payload->>'shift_id' = $2"
    )
    .bind(user_id)
    .bind(shift_id.to_string())
    .execute(&mut *tx)
    .await?;

    // 5. Log activity for the submitter
    let _ = EventLog::feedback_submitted(&mut *tx, user_id, shift_id, &shift_title, Some(f.rating)).await;

    // 6. Log feedback_received for each teammate who got kudos
    for peer_note in &peer_notes {
        if let Some(target_id_str) = peer_note.get("volunteer_id").and_then(|v| v.as_str()) {
            if let Ok(target_id) = Uuid::parse_str(target_id_str) {
                if let Some(note) = peer_note.get("note").and_then(|v| v.as_str()) {
                    let _ = EventLog::feedback_received(&mut *tx, target_id, user_id, &volunteer_name, shift_id, note).await;
                }
            }
        }
    }

    tx.commit().await?;

    Ok(Flash::success(Redirect::to("/volunteer/dashboard"), "Thank you for your feedback! ✨"))
}

// ─── Dog Application Routes ──────────────────────────────────────────────────

#[get("/dog-applications")]
pub async fn dog_applications_list(
    db: &Db,
    user: ApprovedVolunteer,
) -> AppResult<Template> {
    let applications: Vec<(Uuid, String, String, Option<DateTime<Utc>>, Option<DateTime<Utc>>)> = sqlx::query_as(
        r#"
        SELECT id, dog_name, status::text, submitted_at, created_at
        FROM dog_applications
        WHERE volunteer_id = $1
        ORDER BY created_at DESC
        "#
    )
    .bind(user.id())
    .fetch_all(&**db)
    .await?;

    Ok(Template::render(
        "volunteer/dog_applications",
        context! { user: &user.0.0, applications },
    ))
}

#[get("/dog-applications/new")]
pub async fn dog_application_new(
    db: &Db,
    user: ApprovedVolunteer,
) -> AppResult<Template> {
    let all_breeds: Vec<(Uuid, String, Option<Uuid>)> = sqlx::query_as(
        "SELECT id, name, parent_id FROM dog_types WHERE is_active = true ORDER BY path"
    )
    .fetch_all(&**db)
    .await?;

    // Get upcoming sessions with available slots
    #[derive(Debug, Serialize, FromRow)]
    struct SessionWithSlots {
        id: Uuid,
        date: NaiveDate,
        location: String,
        slots: serde_json::Value,
    }

    let sessions: Vec<SessionWithSlots> = sqlx::query_as(
        r#"
        SELECT 
            asess.id, asess.date, asess.location,
            COALESCE((
                SELECT JSON_AGG(JSON_BUILD_OBJECT(
                    'id', s.id,
                    'start_time', s.start_time,
                    'end_time', s.end_time,
                    'available', s.capacity - (SELECT COUNT(*) FROM dog_applications WHERE selected_slot_id = s.id)
                ) ORDER BY s.start_time)
                FROM assessment_slots s
                WHERE s.session_id = asess.id
            ), '[]'::json) as slots
        FROM assessment_sessions asess
        WHERE asess.date >= CURRENT_DATE
        ORDER BY asess.date ASC
        "#
    )
    .fetch_all(&**db)
    .await
    .unwrap_or_default();

    Ok(Template::render(
        "volunteer/dog_application_new",
        context! { user: &user.0.0, all_breeds, sessions },
    ))
}

#[derive(rocket::form::FromForm, Debug)]
pub(crate) struct DogApplicationForm<'r> {
    dog_name: &'r str,
    #[field(default = "")]
    breed_id: &'r str,
    #[field(default = "")]
    breed_freeform: &'r str,
    size: &'r str,
    #[field(default = "")]
    gender: &'r str,
    date_of_birth: Option<String>,
    #[field(default = "")]
    personality_desc: &'r str,
    selected_slot_id: Option<Uuid>,
}

#[post("/dog-applications", data = "<form>")]
pub async fn dog_application_create(
    db: &Db,
    user: ApprovedVolunteer,
    form: Form<DogApplicationForm<'_>>,
    email_svc: &rocket::State<crate::email::EmailService>,
) -> AppResult<Redirect> {
    let f = form.into_inner();
    let user_id = user.id();

    let breed_id = f.breed_id.parse::<Uuid>().ok();

    let size = match f.size {
        "x_small" => DogSize::XSmall,
        "small" => DogSize::Small,
        "medium" => DogSize::Medium,
        "large" => DogSize::Large,
        "x_large" => DogSize::XLarge,
        _ => DogSize::Medium,
    };

    let gender = match f.gender {
        "male" => Some(DogGender::Male),
        "female" => Some(DogGender::Female),
        _ => None,
    };

    let dob = f.date_of_birth.as_deref().filter(|s| !s.is_empty())
        .and_then(|s| NaiveDate::parse_from_str(s, "%Y-%m-%d").ok());

    let mut tx = db.begin().await?;

    // Validate slot availability if selected
    let mut status = DogApplicationStatus::Submitted;
    let mut session_info: Option<(NaiveDate, NaiveTime, String)> = None;

    if let Some(slot_id) = f.selected_slot_id {
        let info: Option<(bool, NaiveDate, NaiveTime, String)> = match sqlx::query_as(
            r#"
            SELECT 
                (aslots.capacity - (SELECT COUNT(*) FROM dog_applications WHERE selected_slot_id = $1)) > 0,
                asess.date, aslots.start_time, asess.location
            FROM assessment_slots aslots
            JOIN assessment_sessions asess ON asess.id = aslots.session_id
            WHERE aslots.id = $1
            "#
        )
        .bind(slot_id)
        .fetch_optional(&**db)
        .await? {
            Some(i) => Some(i),
            None => None,
        };

        if let Some((avail, d, t, loc)) = info {
            if avail {
                status = DogApplicationStatus::AssessmentScheduled;
                session_info = Some((d, t, loc));
            }
        }
    }

    let app_id = sqlx::query_scalar::<_, Uuid>(
        r#"
        INSERT INTO dog_applications 
            (volunteer_id, dog_name, breed_id, breed_freeform, size, gender, date_of_birth, 
             personality_desc, status, submitted_at, selected_slot_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now(), $10)
        RETURNING id
        "#
    )
    .bind(user.id())
    .bind(f.dog_name)
    .bind(breed_id)
    .bind(blank(f.breed_freeform))
    .bind(size)
    .bind(gender)
    .bind(dob)
    .bind(blank(f.personality_desc))
    .bind(status)
    .bind(f.selected_slot_id)
    .fetch_one(&mut *tx)
    .await?;

    tx.commit().await?;

    // 4. Notifications if scheduled
    if let Some((d, t, loc)) = session_info {
        let date_str = d.format("%A, %B %d, %Y").to_string();
        let time_str = t.format("%-I:%M %p").to_string();

        // Email
        let _ = email_svc.send_assessment_scheduled(
            &user.0.0.email,
            f.dog_name,
            &date_str,
            &time_str,
            &loc
        ).await;

        // In-app notification
        let _ = sqlx::query(
            "INSERT INTO notifications (user_id, type, title, body, payload)
             VALUES ($1, 'booking_confirmed', 'Assessment Scheduled', $2, $3)"
        )
        .bind(user_id)
        .bind(format!("Your evaluation for {} is scheduled for {} at {}.", f.dog_name, d.format("%b %d"), t.format("%-I:%M %p")))
        .bind(serde_json::json!({ "application_id": app_id }))
        .execute(&**db)
        .await;

        // Log event (scheduled)
        let volunteer_name: String = sqlx::query_scalar("SELECT volunteer_names FROM volunteer_profiles WHERE user_id = $1")
            .bind(user_id)
            .fetch_optional(&**db)
            .await
            .unwrap_or_default()
            .flatten()
            .unwrap_or_else(|| user.0.0.display_name.clone().unwrap_or_else(|| user.0.0.email.clone()));

        let _ = EventLog::dog_application_assessment_scheduled(
            &**db, 
            user_id, 
            app_id, 
            f.dog_name, 
            &volunteer_name,
            d,
            t,
            &loc,
            Some(user_id)
        ).await;
    }

    // Log general submission event
    let _ = EventLog::dog_application_submitted(&**db, user.id(), app_id, f.dog_name).await;

    Ok(Redirect::to("/volunteer/dog-applications"))
}

#[get("/dog-applications/<id>")]
pub async fn dog_application_detail_volunteer(
    db: &Db,
    user: ApprovedVolunteer,
    id: &str,
) -> AppResult<Template> {
    let app_id = id.parse::<Uuid>().map_err(|_| AppError::NotFound)?;

    let application: Option<(Uuid, String, String, Option<DateTime<Utc>>, Option<DateTime<Utc>>, Option<String>, Option<String>, Option<String>, DateTime<Utc>, Option<String>)> = sqlx::query_as(
        r#"
        SELECT 
            da.id, da.dog_name, da.status::text, da.submitted_at, da.reviewed_at,
            da.response_reason, 
            COALESCE(da.assessment_date::text, asess.date::text) as assessment_date,
            COALESCE(da.assessment_time::text, aslots.start_time::text) as assessment_time,
            da.created_at,
            asess.location as assessment_location
        FROM dog_applications da
        LEFT JOIN assessment_slots aslots ON aslots.id = da.selected_slot_id
        LEFT JOIN assessment_sessions asess ON asess.id = aslots.session_id
        WHERE da.id = $1 AND da.volunteer_id = $2
        "#
    )
    .bind(app_id)
    .bind(user.id())
    .fetch_optional(&**db)
    .await?;

    let application = application.ok_or(AppError::NotFound)?;

    // Get upcoming sessions with available slots for potential rescheduling
    #[derive(Debug, Serialize, FromRow)]
    struct SessionWithSlots {
        id: Uuid,
        date: NaiveDate,
        location: String,
        slots: serde_json::Value,
    }

    let sessions: Vec<SessionWithSlots> = sqlx::query_as(
        r#"
        SELECT 
            asess.id, asess.date, asess.location,
            COALESCE((
                SELECT JSON_AGG(JSON_BUILD_OBJECT(
                    'id', s.id,
                    'start_time', s.start_time,
                    'end_time', s.end_time,
                    'available', s.capacity - (SELECT COUNT(*) FROM dog_applications WHERE selected_slot_id = s.id)
                ) ORDER BY s.start_time)
                FROM assessment_slots s
                WHERE s.session_id = asess.id
            ), '[]'::json) as slots
        FROM assessment_sessions asess
        WHERE asess.date >= CURRENT_DATE
        ORDER BY asess.date ASC
        "#
    )
    .fetch_all(&**db)
    .await
    .unwrap_or_default();

    Ok(Template::render(
        "volunteer/dog_application_detail",
        context! { user: &user.0.0, application, sessions },
    ))
}

#[post("/shifts/<shift_id>/accept")]
pub async fn accept_invite(db: &Db, user: ApprovedVolunteer, shift_id: &str) -> Flash<Redirect> {
    let shift_id: Uuid = match shift_id.parse() {
        Ok(id) => id,
        Err(_) => return Flash::error(Redirect::to("/volunteer/dashboard"), "Invalid shift ID"),
    };
    let user_id = user.id();

    let mut tx = match db.begin().await {
        Ok(tx) => tx,
        Err(_) => return Flash::error(Redirect::to("/volunteer/dashboard"), "Transaction error"),
    };

    // Update assignment status
    let res = sqlx::query(
        "UPDATE shift_assignments SET status = 'confirmed', updated_at = now() 
         WHERE shift_id = $1 AND volunteer_id = $2 AND status = 'pending_confirmation'"
    )
    .bind(shift_id)
    .bind(user_id)
    .execute(&mut *tx)
    .await;

    match res {
        Ok(r) if r.rows_affected() > 0 => {
            // Get shift info and primary dog for event log
            let shift_info: (String, String, Option<Uuid>) = match sqlx::query_as(
                r#"
                SELECT s.title, a.name, sa.dog_ids[1] 
                FROM shifts s 
                JOIN agencies a ON a.id = s.agency_id 
                JOIN shift_assignments sa ON sa.shift_id = s.id
                WHERE s.id = $1 AND sa.volunteer_id = $2
                "#
            )
            .bind(shift_id)
            .bind(user_id)
            .fetch_one(&mut *tx)
            .await {
                Ok(info) => info,
                Err(_) => {
                    let _ = tx.rollback().await;
                    return Flash::error(Redirect::to("/volunteer/dashboard"), "Shift not found");
                }
            };

            // Get volunteer name
            let volunteer_name: String = sqlx::query_scalar("SELECT volunteer_names FROM volunteer_profiles WHERE user_id = $1")
                .bind(user_id)
                .fetch_optional(&mut *tx)
                .await
                .unwrap_or_default()
                .flatten()
                .unwrap_or_else(|| user.0.0.display_name.clone().unwrap_or_else(|| user.0.0.email.clone()));

            let dog_name: Option<String> = if let Some(did) = shift_info.2 {
                sqlx::query_scalar("SELECT name FROM dogs WHERE id = $1")
                    .bind(did)
                    .fetch_one(&mut *tx)
                    .await
                    .ok()
            } else {
                None
            };

            let _ = EventLog::shift_invite_accepted(
                &**db, 
                user_id, 
                shift_id, 
                shift_info.2,
                &shift_info.0, 
                &shift_info.1,
                &volunteer_name,
                dog_name.as_deref(),
                false
            ).await;

            if let Err(_) = tx.commit().await {
                return Flash::error(Redirect::to("/volunteer/dashboard"), "Failed to save confirmation");
            }

            Flash::success(Redirect::to(format!("/volunteer/shifts/{}", shift_id)), "Invite accepted! We've confirmed your spot.")
        }
        _ => {
            let _ = tx.rollback().await;
            Flash::error(Redirect::to("/volunteer/dashboard"), "Invite not found or already processed")
        }
    }
}

#[post("/shifts/<shift_id>/decline")]
pub async fn decline_invite(
    db: &Db,
    user: ApprovedVolunteer,
    shift_id: &str,
    cfg: &rocket::State<crate::config::AppConfig>,
) -> Flash<Redirect> {
    let shift_id: Uuid = match shift_id.parse() {
        Ok(id) => id,
        Err(_) => return Flash::error(Redirect::to("/volunteer/dashboard"), "Invalid shift ID"),
    };
    let user_id = user.id();

    let mut tx = match db.begin().await {
        Ok(tx) => tx,
        Err(_) => return Flash::error(Redirect::to("/volunteer/dashboard"), "Transaction error"),
    };

    // Update assignment status to cancelled
    let res = sqlx::query(
        "UPDATE shift_assignments SET status = 'cancelled', updated_at = now(), cancellation_reason = 'Invite declined' 
         WHERE shift_id = $1 AND volunteer_id = $2 AND status = 'pending_confirmation'"
    )
    .bind(shift_id)
    .bind(user_id)
    .execute(&mut *tx)
    .await;

    match res {
        Ok(r) if r.rows_affected() > 0 => {
            // Get shift info and primary dog for event log
            let shift_info: (String, String, Option<Uuid>) = match sqlx::query_as(
                r#"
                SELECT s.title, a.name, sa.dog_ids[1] 
                FROM shifts s 
                JOIN agencies a ON a.id = s.agency_id 
                JOIN shift_assignments sa ON sa.shift_id = s.id
                WHERE s.id = $1 AND sa.volunteer_id = $2
                "#
            )
            .bind(shift_id)
            .bind(user_id)
            .fetch_one(&mut *tx)
            .await {
                Ok(info) => info,
                Err(_) => {
                    let _ = tx.rollback().await;
                    return Flash::error(Redirect::to("/volunteer/dashboard"), "Shift not found");
                }
            };

            // Get volunteer name
            let volunteer_name: String = sqlx::query_scalar("SELECT volunteer_names FROM volunteer_profiles WHERE user_id = $1")
                .bind(user_id)
                .fetch_optional(&mut *tx)
                .await
                .unwrap_or_default()
                .flatten()
                .unwrap_or_else(|| user.0.0.display_name.clone().unwrap_or_else(|| user.0.0.email.clone()));

            let dog_name: Option<String> = if let Some(did) = shift_info.2 {
                sqlx::query_scalar("SELECT name FROM dogs WHERE id = $1")
                    .bind(did)
                    .fetch_one(&mut *tx)
                    .await
                    .ok()
            } else {
                None
            };

            let _ = EventLog::shift_invite_declined(
                &**db, 
                user_id, 
                shift_id, 
                shift_info.2,
                &shift_info.0, 
                &shift_info.1,
                &volunteer_name,
                dog_name.as_deref()
            ).await;

            if let Err(_) = tx.commit().await {
                return Flash::error(Redirect::to("/volunteer/dashboard"), "Failed to save decline");
            }

            // Auto-promote the next waitlisted volunteer into the freed slot
            if let Err(e) = promote_next_waitlisted(&**db, shift_id, &cfg.app_url).await {
                tracing::error!(error = %e, shift_id = %shift_id, "decline_invite: promote_next_waitlisted failed");
            }

            Flash::success(Redirect::to("/volunteer/dashboard"), "Invite declined. Thank you for letting us know!")
        }
        _ => {
            let _ = tx.rollback().await;
            Flash::error(Redirect::to("/volunteer/dashboard"), "Invite not found or already processed")
        }
    }
}

// ─── Notification dismiss ─────────────────────────────────────────────────────

/// POST /volunteer/notifications/<id>/dismiss
/// Marks a notification as read (dismisses the login alert).
#[post("/notifications/<id>/dismiss")]
pub async fn dismiss_notification(
    id: Uuid,
    user: AuthUser,
    db: &Db,
) -> AppResult<rocket::http::Status> {
    sqlx::query(
        "UPDATE notifications SET read_at = now()
         WHERE id = $1 AND user_id = $2 AND read_at IS NULL",
    )
    .bind(id)
    .bind(user.id())
    .execute(&**db)
    .await?;

    Ok(rocket::http::Status::NoContent)
}

#[derive(rocket::form::FromForm)]
pub struct RescheduleForm {
    pub selected_slot_id: Uuid,
}

#[post("/dog-applications/<app_id>/reschedule", data = "<form>")]
pub async fn dog_application_reschedule(
    db: &Db,
    user: ApprovedVolunteer,
    app_id: Uuid,
    form: Form<RescheduleForm>,
) -> AppResult<Flash<Redirect>> {
    let f = form.into_inner();
    let user_id = user.id();
    let redirect = Redirect::to(format!("/volunteer/dog-applications/{}", app_id));

    // 1. Verify application ownership
    let exists: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM dog_applications WHERE id = $1 AND volunteer_id = $2)")
        .bind(app_id)
        .bind(user_id)
        .fetch_one(&**db)
        .await?;

    if !exists {
        return Ok(Flash::error(redirect, "Application not found"));
    }

    // 2. Verify slot availability
    let is_available: bool = sqlx::query_scalar(
        r#"
        SELECT (capacity - (SELECT COUNT(*) FROM dog_applications WHERE selected_slot_id = $1)) > 0
        FROM assessment_slots
        WHERE id = $1
        "#
    )
    .bind(f.selected_slot_id)
    .fetch_one(&**db)
    .await?;

    if !is_available {
        return Ok(Flash::error(redirect, "This time slot is full. Please choose another."));
    }

    // 3. Update application
    sqlx::query(
        "UPDATE dog_applications SET selected_slot_id = $1, updated_at = now() WHERE id = $2"
    )
    .bind(f.selected_slot_id)
    .bind(app_id)
    .execute(&**db)
    .await?;

    Ok(Flash::success(redirect, "Evaluation rescheduled successfully"))
}

// ─── Message Centre ───────────────────────────────────────────────────────────

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct MessageRow {
    pub id: Uuid,
    pub notification_type: String,
    pub title: String,
    pub body: String,
    pub payload: serde_json::Value,
    pub read_at: Option<DateTime<Utc>>,
    pub archived_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub shift_id: Option<Uuid>,
    pub shift_title: Option<String>,
    pub shift_start_at: Option<DateTime<Utc>>,
}

/// GET /volunteer/messages?filter=all|unread|archived
#[get("/messages?<filter>")]
pub async fn messages_page(
    filter: Option<&str>,
    user: AuthUser,
    db: &Db,
    flash: Option<rocket::request::FlashMessage<'_>>,
) -> AppResult<Template> {
    let filter = filter.unwrap_or("all");

    let (archived_clause, read_clause) = match filter {
        "unread"   => ("AND n.archived_at IS NULL", "AND n.read_at IS NULL"),
        "archived" => ("AND n.archived_at IS NOT NULL", ""),
        _          => ("AND n.archived_at IS NULL", ""),  // "all"
    };

    let sql = format!(
        r#"
        SELECT
            n.id,
            n.type::text AS notification_type,
            n.title,
            n.body,
            n.payload,
            n.read_at,
            n.archived_at,
            n.created_at,
            (NULLIF(n.payload->>'shift_id', ''))::uuid AS shift_id,
            s.title AS shift_title,
            s.start_at AS shift_start_at
        FROM notifications n
        LEFT JOIN shifts s ON s.id = (NULLIF(n.payload->>'shift_id', ''))::uuid
        WHERE n.user_id = $1
          {archived_clause}
          {read_clause}
        ORDER BY n.created_at DESC
        LIMIT 100
        "#
    );

    let messages = sqlx::query_as::<_, MessageRow>(&sql)
        .bind(user.id())
        .fetch_all(&**db)
        .await?;

    let unread_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM notifications
         WHERE user_id = $1 AND read_at IS NULL AND archived_at IS NULL"
    )
    .bind(user.id())
    .fetch_one(&**db)
    .await?;

    let flash_msg = flash.map(|f| (f.kind().to_string(), f.message().to_string()));

    Ok(Template::render(
        "volunteer/messages",
        context! {
            user: &user.0,
            messages,
            filter,
            unread_count,
            flash_msg,
        },
    ))
}

/// POST /volunteer/messages/<id>/read  — mark one message read (HTMX)
#[post("/messages/<id>/read")]
pub async fn message_mark_read(
    id: Uuid,
    user: AuthUser,
    db: &Db,
) -> AppResult<rocket::response::content::RawHtml<String>> {
    sqlx::query(
        "UPDATE notifications SET read_at = now()
         WHERE id = $1 AND user_id = $2 AND read_at IS NULL",
    )
    .bind(id)
    .bind(user.id())
    .execute(&**db)
    .await?;

    // Return empty → HTMX outerHTML swap removes the "Unread" badge from the card
    // We signal a refresh of the nav badge count
    Ok(rocket::response::content::RawHtml(
        format!(r#"<span id="msg-read-ack-{}" class="hidden"></span>"#, id)
    ))
}

/// POST /volunteer/messages/<id>/archive  — archive one message (HTMX)
#[post("/messages/<id>/archive")]
pub async fn message_archive(
    id: Uuid,
    user: AuthUser,
    db: &Db,
) -> AppResult<rocket::response::content::RawHtml<String>> {
    sqlx::query(
        "UPDATE notifications SET archived_at = now(), read_at = COALESCE(read_at, now())
         WHERE id = $1 AND user_id = $2",
    )
    .bind(id)
    .bind(user.id())
    .execute(&**db)
    .await?;

    // Return collapsed placeholder — HTMX outerHTML swap removes card from view
    Ok(rocket::response::content::RawHtml(
        format!(r#"<div id="msg-{}" data-archived="true" class="hidden" aria-hidden="true"></div>"#, id)
    ))
}

/// POST /volunteer/messages/mark-all-read
#[post("/messages/mark-all-read")]
pub async fn messages_mark_all_read(
    user: AuthUser,
    db: &Db,
) -> AppResult<Flash<Redirect>> {
    sqlx::query(
        "UPDATE notifications SET read_at = now()
         WHERE user_id = $1 AND read_at IS NULL AND archived_at IS NULL",
    )
    .bind(user.id())
    .execute(&**db)
    .await?;

    Ok(Flash::success(
        Redirect::to("/volunteer/messages"),
        "All messages marked as read",
    ))
}

// ─── Search Locations ─────────────────────────────────────────────────────────

#[derive(rocket::form::FromForm, Debug)]
struct LocationForm<'r> {
    name: &'r str,
    address: &'r str,
}

#[post("/locations", data = "<form>")]
pub async fn location_create(
    db: &Db,
    user: ApprovedVolunteer,
    form: Form<LocationForm<'_>>,
    config: &State<AppConfig>,
) -> AppResult<Flash<Redirect>> {
    let f = form.into_inner();
    let name = f.name.trim();
    let address = f.address.trim();

    if name.is_empty() || address.is_empty() {
        return Ok(Flash::error(Redirect::to("/volunteer/profile"), "Name and address are required."));
    }
    if name.len() > 30 {
        return Ok(Flash::error(Redirect::to("/volunteer/profile"), "Location name must be 30 characters or less."));
    }

    let geo = match crate::geocoding::geocode(address, config).await {
        Ok(pt) => Some(pt),
        Err(e) => {
            tracing::warn!(error = %e, "Geocoding failed for new location");
            None
        }
    };

    let display_order: i32 = sqlx::query_scalar(
        "SELECT COALESCE(MAX(display_order), -1) + 1 FROM volunteer_locations WHERE user_id = $1"
    )
    .bind(user.id())
    .fetch_one(&**db)
    .await
    .unwrap_or(0);

    if let Some(ref pt) = geo {
        sqlx::query(
            "INSERT INTO volunteer_locations (user_id, name, address, geom, is_home, display_order, neighborhood)
             VALUES ($1, $2, $3, ST_SetSRID(ST_MakePoint($4, $5), 4326)::geography, false, $6, $7)"
        )
        .bind(user.id())
        .bind(name)
        .bind(address)
        .bind(pt.lng)
        .bind(pt.lat)
        .bind(display_order)
        .bind(pt.neighborhood.as_deref())
        .execute(&**db)
        .await?;
    } else {
        sqlx::query(
            "INSERT INTO volunteer_locations (user_id, name, address, geom, is_home, display_order)
             VALUES ($1, $2, $3, NULL, false, $4)"
        )
        .bind(user.id())
        .bind(name)
        .bind(address)
        .bind(display_order)
        .execute(&**db)
        .await?;
    }

    let msg = if geo.is_none() && config.google_maps_api_key.is_some() {
        "Location saved, but address could not be geocoded — distance filtering may not work for this location."
    } else {
        "Location added."
    };

    Ok(Flash::success(Redirect::to("/volunteer/profile"), msg))
}

#[get("/locations/<id>/edit")]
pub async fn location_edit_get(
    db: &Db,
    user: ApprovedVolunteer,
    id: &str,
    config: &State<AppConfig>,
) -> AppResult<Template> {
    let location_id = id.parse::<Uuid>().map_err(|_| AppError::NotFound)?;

    let location: Option<VolunteerLocationCard> = sqlx::query_as(
        "SELECT id, name, address, is_home, display_order,
                ST_Y(geom::geometry) AS lat, ST_X(geom::geometry) AS lng
         FROM volunteer_locations
         WHERE id = $1 AND user_id = $2",
    )
    .bind(location_id)
    .bind(user.id())
    .fetch_optional(&**db)
    .await?;

    let location = location.ok_or(AppError::NotFound)?;

    Ok(Template::render(
        "volunteer/location_edit",
        context! {
            user: &user.0.0,
            location: &location,
            google_maps_api_key: config.google_maps_api_key.as_deref().unwrap_or(""),
        },
    ))
}

#[post("/locations/<id>", data = "<form>")]
pub async fn location_update(
    db: &Db,
    user: ApprovedVolunteer,
    id: &str,
    form: Form<LocationForm<'_>>,
    config: &State<AppConfig>,
) -> AppResult<Flash<Redirect>> {
    let location_id = id.parse::<Uuid>().map_err(|_| AppError::NotFound)?;
    let f = form.into_inner();
    let address = f.address.trim();

    if address.is_empty() {
        return Ok(Flash::error(Redirect::to("/volunteer/profile"), "Address is required."));
    }

    // Verify ownership and get is_home flag
    let existing: Option<(bool,)> = sqlx::query_as(
        "SELECT is_home FROM volunteer_locations WHERE id = $1 AND user_id = $2"
    )
    .bind(location_id)
    .bind(user.id())
    .fetch_optional(&**db)
    .await?;

    let (is_home,) = existing.ok_or(AppError::NotFound)?;

    let geo = match crate::geocoding::geocode(address, config).await {
        Ok(pt) => Some(pt),
        Err(e) => {
            tracing::warn!(error = %e, "Geocoding failed on location update");
            None
        }
    };

    if let Some(ref pt) = geo {
        if is_home {
            // Home: only address can change; also sync home_geom in volunteer_profiles
            sqlx::query(
                "UPDATE volunteer_locations SET address = $2,
                         geom = ST_SetSRID(ST_MakePoint($3, $4), 4326)::geography,
                         neighborhood = $5,
                         updated_at = now()
                 WHERE id = $1"
            )
            .bind(location_id)
            .bind(address)
            .bind(pt.lng)
            .bind(pt.lat)
            .bind(pt.neighborhood.as_deref())
            .execute(&**db)
            .await?;

            let _ = sqlx::query(
                "UPDATE volunteer_profiles SET
                     home_geom = ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography
                 WHERE user_id = $1"
            )
            .bind(user.id())
            .bind(pt.lng)
            .bind(pt.lat)
            .execute(&**db)
            .await;
        } else {
            let name = f.name.trim();
            if name.is_empty() || name.len() > 30 {
                return Ok(Flash::error(Redirect::to("/volunteer/profile"), "Name must be 1–30 characters."));
            }
            sqlx::query(
                "UPDATE volunteer_locations SET name = $2, address = $3,
                         geom = ST_SetSRID(ST_MakePoint($4, $5), 4326)::geography,
                         neighborhood = $6,
                         updated_at = now()
                 WHERE id = $1"
            )
            .bind(location_id)
            .bind(name)
            .bind(address)
            .bind(pt.lng)
            .bind(pt.lat)
            .bind(pt.neighborhood.as_deref())
            .execute(&**db)
            .await?;
        }
    } else {
        if is_home {
            sqlx::query(
                "UPDATE volunteer_locations SET address = $2, geom = NULL, updated_at = now()
                 WHERE id = $1"
            )
            .bind(location_id)
            .bind(address)
            .execute(&**db)
            .await?;
        } else {
            let name = f.name.trim();
            if name.is_empty() || name.len() > 30 {
                return Ok(Flash::error(Redirect::to("/volunteer/profile"), "Name must be 1–30 characters."));
            }
            sqlx::query(
                "UPDATE volunteer_locations SET name = $2, address = $3, geom = NULL, updated_at = now()
                 WHERE id = $1"
            )
            .bind(location_id)
            .bind(name)
            .bind(address)
            .execute(&**db)
            .await?;
        }
    }

    Ok(Flash::success(Redirect::to("/volunteer/profile"), "Location updated."))
}

/// Retry geocoding for a location that previously saved with geom = NULL.
#[post("/locations/<id>/geocode")]
pub async fn location_geocode_retry(
    db: &Db,
    user: ApprovedVolunteer,
    id: &str,
    config: &rocket::State<crate::config::AppConfig>,
) -> AppResult<Flash<Redirect>> {
    let location_id = id.parse::<Uuid>().map_err(|_| AppError::NotFound)?;

    let row: Option<(String, Option<f64>)> = sqlx::query_as(
        "SELECT address, ST_Y(geom::geometry) FROM volunteer_locations WHERE id = $1 AND user_id = $2"
    )
    .bind(location_id)
    .bind(user.id())
    .fetch_optional(&**db)
    .await?;

    let (address, existing_lat) = row.ok_or(AppError::NotFound)?;

    if existing_lat.is_some() {
        return Ok(Flash::success(Redirect::to("/volunteer/profile"), "Location is already geocoded."));
    }

    match crate::geocoding::geocode(&address, config).await {
        Ok(pt) => {
            sqlx::query(
                "UPDATE volunteer_locations
                 SET geom = ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
                     neighborhood = $3,
                     updated_at = now()
                 WHERE id = $4 AND user_id = $5"
            )
            .bind(pt.lng)
            .bind(pt.lat)
            .bind(pt.neighborhood.as_deref())
            .bind(location_id)
            .bind(user.id())
            .execute(&**db)
            .await?;
            Ok(Flash::success(Redirect::to("/volunteer/profile"), "Location geocoded successfully."))
        }
        Err(e) => {
            tracing::warn!(error = %e, %address, "Geocoding retry failed");
            Ok(Flash::error(Redirect::to("/volunteer/profile"), "Could not geocode this address — check that it is complete and correct."))
        }
    }
}

#[post("/locations/<id>/delete")]
pub async fn location_delete(
    db: &Db,
    user: ApprovedVolunteer,
    id: &str,
) -> AppResult<Flash<Redirect>> {
    let location_id = id.parse::<Uuid>().map_err(|_| AppError::NotFound)?;

    let existing: Option<(bool,)> = sqlx::query_as(
        "SELECT is_home FROM volunteer_locations WHERE id = $1 AND user_id = $2"
    )
    .bind(location_id)
    .bind(user.id())
    .fetch_optional(&**db)
    .await?;

    let (is_home,) = existing.ok_or(AppError::NotFound)?;

    if is_home {
        return Ok(Flash::error(Redirect::to("/volunteer/profile"), "Home location cannot be deleted."));
    }

    sqlx::query("DELETE FROM volunteer_locations WHERE id = $1 AND user_id = $2")
        .bind(location_id)
        .bind(user.id())
        .execute(&**db)
        .await?;

    Ok(Flash::success(Redirect::to("/volunteer/profile"), "Location removed."))
}

// ─── Shift Time Preferences ───────────────────────────────────────────────────

/// Represents a time preference entry
#[derive(Debug, Serialize, FromRow)]
pub struct ShiftTimePreference {
    pub day_of_week: i32,
    pub time_slot: String,
    pub is_preferred: bool,
}

/// Get volunteer's shift time preferences
#[get("/shift-time-preferences")]
pub async fn shift_time_preferences_get(
    db: &Db,
    user: ApprovedVolunteer,
) -> AppResult<rocket::serde::json::Json<Vec<ShiftTimePreference>>> {
    let prefs: Vec<ShiftTimePreference> = sqlx::query_as(
        r#"
        SELECT day_of_week, time_slot, is_preferred
        FROM volunteer_shift_time_preferences
        WHERE user_id = $1
        ORDER BY day_of_week, time_slot
        "#
    )
    .bind(user.id())
    .fetch_all(&**db)
    .await?;

    Ok(rocket::serde::json::Json(prefs))
}

#[derive(Debug, Deserialize)]
pub struct ShiftTimePrefUpdate {
    pub day_of_week: i32,
    pub time_slot: String,
    pub is_preferred: bool,
}

/// Update volunteer's shift time preferences (replace all)
#[post("/shift-time-preferences", format = "json", data = "<prefs>")]
pub async fn shift_time_preferences_update(
    db: &Db,
    user: ApprovedVolunteer,
    prefs: rocket::serde::json::Json<Vec<ShiftTimePrefUpdate>>,
) -> AppResult<&'static str> {
    let mut tx = db.begin().await?;

    // Delete existing preferences
    sqlx::query("DELETE FROM volunteer_shift_time_preferences WHERE user_id = $1")
        .bind(user.id())
        .execute(&mut *tx)
        .await?;

    // Insert new preferences
    for pref in prefs.iter() {
        // Validate inputs
        if pref.day_of_week < 0 || pref.day_of_week > 6 {
            return Err(AppError::Validation("Invalid day of week".into()));
        }
        if !["morning", "afternoon", "evening"].contains(&pref.time_slot.as_str()) {
            return Err(AppError::Validation("Invalid time slot".into()));
        }

        sqlx::query(
            r#"
            INSERT INTO volunteer_shift_time_preferences 
                (user_id, day_of_week, time_slot, is_preferred)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (user_id, day_of_week, time_slot) 
            DO UPDATE SET is_preferred = $4, updated_at = now()
            "#
        )
        .bind(user.id())
        .bind(pref.day_of_week)
        .bind(&pref.time_slot)
        .bind(pref.is_preferred)
        .execute(&mut *tx)
        .await?;
    }

    tx.commit().await?;
    Ok("OK")
}

// ─── Search Preferences ───────────────────────────────────────────────────────

/// Persist the match_preferences toggle (called client-side on every toggle).
#[post("/match-prefs?<value>")]
pub async fn save_match_prefs(
    db: &Db,
    user: ApprovedVolunteer,
    value: bool,
) -> AppResult<rocket::serde::json::Json<serde_json::Value>> {
    use rocket::serde::json::Json;

    sqlx::query(
        "INSERT INTO search_preferences (user_id, match_preferences) \
         VALUES ($1, $2) \
         ON CONFLICT (user_id) DO UPDATE SET match_preferences = EXCLUDED.match_preferences",
    )
    .bind(user.user().id())
    .bind(value)
    .execute(&**db)
    .await?;

    Ok(Json(serde_json::json!({ "ok": true })))
}

// ─── Saved Querysets ──────────────────────────────────────────────────────────

#[derive(Debug, serde::Deserialize, rocket::FromForm)]
pub struct SaveQuerysetForm {
    pub name: String,
    pub region: Option<String>,
    pub agency_type: Option<String>,
    #[field(default = false)]
    pub open_only: bool,
    #[field(name = "match_prefs", default = false)]
    pub match_preferences: bool,
    pub location_id: Option<Uuid>,
    pub preferred_distance_km: Option<f64>,
}

/// List saved querysets as JSON (for the Alpine.js sidebar).
#[get("/querysets")]
pub async fn queryset_list(
    db: &Db,
    user: ApprovedVolunteer,
) -> AppResult<rocket::serde::json::Json<Vec<crate::models::calendar::SavedQueryset>>> {
    use crate::models::calendar::list_querysets;
    use rocket::serde::json::Json;

    let querysets = list_querysets(&**db, user.user().id()).await?;
    Ok(Json(querysets))
}

/// Save the current filter state as a named queryset (max 3 per volunteer).
#[post("/querysets", data = "<form>")]
pub async fn queryset_save(
    db: &Db,
    user: ApprovedVolunteer,
    form: Form<SaveQuerysetForm>,
) -> Result<rocket::serde::json::Json<serde_json::Value>, (rocket::http::Status, rocket::serde::json::Json<serde_json::Value>)> {
    use crate::models::calendar::{count_querysets, insert_queryset};
    use rocket::http::Status;
    use rocket::serde::json::Json;

    let user_id = user.user().id();

    let count = count_querysets(&**db, user_id).await.map_err(|e| {
        tracing::error!(error = %e, "Failed to count querysets");
        (Status::InternalServerError, Json(serde_json::json!({ "message": "Database error." })))
    })?;
    if count >= 3 {
        return Err((Status::UnprocessableEntity, Json(serde_json::json!({
            "message": "You already have 3 saved filters. Delete one before saving another."
        }))));
    }

    let name = form.name.trim().to_string();
    if name.is_empty() {
        return Err((Status::UnprocessableEntity, Json(serde_json::json!({ "message": "Filter name cannot be empty." }))));
    }

    let region = form.region.as_deref().filter(|s| !s.is_empty());
    let agency_type = form.agency_type.as_deref().filter(|s| !s.is_empty());

    let qs = insert_queryset(
        &**db,
        user_id,
        &name,
        region,
        agency_type,
        form.open_only,
        form.match_preferences,
        form.location_id,
        form.preferred_distance_km,
    )
    .await
    .map_err(|e| {
        tracing::error!(error = %e, "Failed to insert queryset");
        (Status::InternalServerError, Json(serde_json::json!({ "message": "Could not save filter." })))
    })?;

    Ok(Json(serde_json::json!({
        "id": qs.id,
        "name": qs.name,
        "is_default": qs.is_default,
    })))
}

/// Delete a saved queryset.
#[delete("/querysets/<id>")]
pub async fn queryset_delete(
    db: &Db,
    user: ApprovedVolunteer,
    id: Uuid,
) -> AppResult<rocket::serde::json::Json<serde_json::Value>> {
    use crate::models::calendar::delete_queryset;
    use rocket::serde::json::Json;

    let deleted = delete_queryset(&**db, id, user.user().id()).await?;
    if !deleted {
        return Err(AppError::NotFound);
    }
    Ok(Json(serde_json::json!({ "deleted": true })))
}

/// Set one queryset as the default (clears any previous default).
#[post("/querysets/<id>/default")]
pub async fn queryset_set_default(
    db: &Db,
    user: ApprovedVolunteer,
    id: Uuid,
) -> AppResult<rocket::serde::json::Json<serde_json::Value>> {
    use crate::models::calendar::set_default_queryset;
    use rocket::serde::json::Json;

    set_default_queryset(&**db, id, user.user().id()).await?;
    Ok(Json(serde_json::json!({ "ok": true })))
}

/// Clear the default flag (no queryset auto-applied).
#[post("/querysets/clear-default")]
pub async fn queryset_clear_default(
    db: &Db,
    user: ApprovedVolunteer,
) -> AppResult<rocket::serde::json::Json<serde_json::Value>> {
    use crate::models::calendar::clear_default_queryset;
    use rocket::serde::json::Json;

    clear_default_queryset(&**db, user.user().id()).await?;
    Ok(Json(serde_json::json!({ "ok": true })))
}

// ─── Calendar settings ────────────────────────────────────────────────────────

/// Display the volunteer's calendar subscription settings page.
#[get("/calendar")]
pub async fn calendar_settings_page(
    db: &Db,
    user: ApprovedVolunteer,
    cfg: &State<AppConfig>,
) -> AppResult<Template> {
    use crate::models::calendar::{
        get_or_create_token, list_querysets, CalendarFeedType,
    };

    let user_id = user.user().id();
    let confirmed_token =
        get_or_create_token(&**db, user_id, CalendarFeedType::VolunteerConfirmed).await?;
    let available_token =
        get_or_create_token(&**db, user_id, CalendarFeedType::VolunteerAvailable).await?;
    let querysets = list_querysets(&**db, user_id).await?;

    let base_url = &cfg.app_url;

    Ok(Template::render(
        "volunteer/calendar",
        context! {
            user: &user.user().0,
            confirmed_token: &confirmed_token.token,
            available_token: &available_token.token,
            available_token_id: available_token.id,
            follow_queryset: available_token.follow_queryset,
            follow_preferred_times: available_token.follow_preferred_times,
            selected_queryset_id: available_token.queryset_id,
            cache_generated_at: available_token.cache_generated_at,
            querysets: &querysets,
            base_url,
            confirmed_url: format!("{}/calendar/volunteer/confirmed.ics?token={}", base_url, confirmed_token.token),
            available_url: format!("{}/calendar/volunteer/available.ics?token={}", base_url, available_token.token),
        },
    ))
}

/// Regenerate a calendar token (revoke old + issue new).
#[post("/calendar/tokens/<feed_type>/regenerate")]
pub async fn calendar_token_regenerate(
    db: &Db,
    user: ApprovedVolunteer,
    feed_type: &str,
) -> AppResult<rocket::response::Redirect> {
    use crate::models::calendar::{regenerate_token, CalendarFeedType};

    let ft = match feed_type {
        "confirmed" => CalendarFeedType::VolunteerConfirmed,
        "available" => CalendarFeedType::VolunteerAvailable,
        _ => return Err(AppError::NotFound),
    };

    regenerate_token(&**db, user.user().id(), ft).await?;
    Ok(rocket::response::Redirect::to("/volunteer/calendar"))
}

/// Update the available-shifts feed configuration (toggles + queryset selection).
#[derive(Debug, serde::Deserialize, rocket::FromForm)]
pub struct AvailableCalendarConfigForm {
    #[field(default = false)]
    pub follow_queryset: bool,
    #[field(default = false)]
    pub follow_preferred_times: bool,
    pub queryset_id: Option<Uuid>,
}

#[post("/calendar/available/config", data = "<form>")]
pub async fn calendar_available_config(
    db: &Db,
    user: ApprovedVolunteer,
    form: Form<AvailableCalendarConfigForm>,
    cfg: &State<AppConfig>,
) -> AppResult<rocket::response::Redirect> {
    use crate::models::calendar::{get_or_create_token, update_available_config, CalendarFeedType};
    use crate::jobs::calendar_refresh::refresh_one;

    let user_id = user.user().id();
    let token =
        get_or_create_token(&**db, user_id, CalendarFeedType::VolunteerAvailable).await?;

    // Verify the queryset_id belongs to this volunteer (if provided)
    if let Some(qid) = form.queryset_id {
        let row: (bool,) = sqlx::query_as(
            "SELECT EXISTS(SELECT 1 FROM saved_querysets WHERE id = $1 AND volunteer_id = $2)",
        )
        .bind(qid)
        .bind(user_id)
        .fetch_one(&**db)
        .await?;
        let owned = row.0;
        if !owned {
            return Err(AppError::Forbidden);
        }
    }

    update_available_config(
        &**db,
        token.id,
        form.queryset_id,
        form.follow_queryset,
        form.follow_preferred_times,
    )
    .await?;

    // Immediately rebuild the cache so the volunteer doesn't have to wait 8h
    let updated_token =
        get_or_create_token(&**db, user_id, CalendarFeedType::VolunteerAvailable).await?;
    let base_url = &cfg.app_url;
    let _ = refresh_one(&**db, &updated_token, base_url).await;

    Ok(rocket::response::Redirect::to("/volunteer/calendar"))
}
