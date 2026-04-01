# Shift Search Expansion — Implementation Plan

_Last updated: 2026-03-23_

---

## Table of Contents

1. [Overview](#overview)
2. [Database Migrations](#database-migrations)
3. [Rust Source Files](#rust-source-files)
4. [Templates](#templates)
5. [Routes](#routes)
6. [Implementation Phases](#implementation-phases)
7. [Decisions and Trade-offs](#decisions-and-trade-offs)

---

## Overview

This plan covers six interconnected feature areas:

| # | Feature | Impact |
|---|---------|--------|
| 1 | Address collection at registration | New field in Step 1 form + geocoding on submit |
| 2 | Named alternate search locations on profile | New DB table + CRUD UI |
| 3 | `search_preferences` extension | Two new FK/value columns |
| 4 | Shifts listing filter enhancement | Location dropdown + distance slider + active filter summary |
| 5 | Map view toggle on shifts page | Google Maps JS API integration |
| 6 | Geocoding service module | Reusable async geocoder wrapping Google Maps Geocoding API |

**Key constraint:** `reqwest` is already in `Cargo.toml` with `json` and `rustls-tls` features — no new HTTP client dependency is needed. The next available migration number is `0049`.

---

## Database Migrations

### Migration 0049 — `volunteer_locations` table

```sql
-- migrations/0049_volunteer_locations.sql

CREATE TABLE volunteer_locations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,          -- e.g. "Home", "OFFICE"
    address         TEXT NOT NULL,          -- full text address as entered
    geom            geography(POINT, 4326), -- NULL if geocoding failed
    is_home         BOOL NOT NULL DEFAULT false,
    display_order   INT  NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX volunteer_locations_user_id_idx
    ON volunteer_locations (user_id);

CREATE INDEX volunteer_locations_geom_idx
    ON volunteer_locations USING GIST (geom);

-- Enforce at most one is_home=true per user at DB level
CREATE UNIQUE INDEX volunteer_locations_one_home_per_user
    ON volunteer_locations (user_id)
    WHERE is_home = true;
```

### Migration 0050 — Extend `search_preferences`

```sql
-- migrations/0050_search_preferences_location.sql

ALTER TABLE search_preferences
    ADD COLUMN preferred_location_id UUID
        REFERENCES volunteer_locations(id) ON DELETE SET NULL,
    ADD COLUMN preferred_distance_km NUMERIC(6,2);
```

### Migration 0053 — Add `street_address` to `volunteer_applications`

```sql
-- migrations/0053_application_street_address.sql

ALTER TABLE volunteer_applications
    ADD COLUMN street_address TEXT;
```

_Rationale: the existing `city` and `postal_code` columns remain for backward compatibility. `street_address` holds the full geocodable address entered in Step 1._

### Migration 0052 — Drop `address_encrypted` and `address_display` from `volunteer_profiles`

```sql
-- migrations/0052_drop_volunteer_address_columns.sql

ALTER TABLE volunteer_profiles
    DROP COLUMN IF EXISTS address_encrypted,
    DROP COLUMN IF EXISTS address_display;
```

### Note on `site_lat` / `site_lng`

No schema change needed — `ST_X` / `ST_Y` extract lat/lng from the existing `sites.geom` column at query time.

---

## Rust Source Files

### New files

| File | Purpose |
|------|---------|
| `src/geocoding.rs` | Geocoding service module |
| `src/models/volunteer_location.rs` | Model struct and DB helpers for `volunteer_locations` |

### Modified files

| File | Changes |
|------|---------|
| `src/config.rs` | Add `google_maps_api_key: Option<String>` field |
| `src/models/mod.rs` | Add `pub mod volunteer_location;` |
| `src/routes/apply.rs` | Step 1 form: add `street_address` field; call geocoder on submit; create Home location at approval |
| `src/routes/volunteer.rs` | Profile: load/render locations + new CRUD routes; extend `shifts_listing` with location+distance filter; add `site_lat`/`site_lng` to `ShiftCard`; save/load `search_preferences` |
| `src/bin/seed.rs` | Populate `volunteer_locations` Home rows from existing lat/lng coordinates |
| `src/main.rs` | Pass `google_maps_api_key` from `AppConfig` to template context |

---

### `src/geocoding.rs` — interface

```rust
/// Result of a successful geocode.
#[derive(Debug, Clone)]
pub struct GeoPoint {
    pub lat: f64,
    pub lng: f64,
}

/// Geocode a free-text address using the Google Maps Geocoding API.
///
/// Returns `Ok(GeoPoint)` on success.
/// Returns `Err(...)` if the network call fails, the API returns no results,
/// or the response cannot be parsed.
///
/// Callers treat errors as non-fatal: save the address text, set geom = NULL,
/// and surface a warning to the user.
pub async fn geocode_address(address: &str, api_key: &str) -> anyhow::Result<GeoPoint>
```

Internally: build URL `https://maps.googleapis.com/maps/api/geocode/json?address=<encoded>&key=<key>`, issue `reqwest::get`, deserialize JSON, extract `results[0].geometry.location.{lat,lng}`.

### `src/models/volunteer_location.rs` — structs

```rust
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct VolunteerLocation {
    pub id: Uuid,
    pub user_id: Uuid,
    pub name: String,
    pub address: String,
    // geom stored as geography; extracted as lat/lng pair in queries
    pub is_home: bool,
    pub display_order: i32,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// Lightweight view for dropdowns and listings (includes lat/lng extracted by query).
#[derive(Debug, Serialize, FromRow)]
pub struct VolunteerLocationCard {
    pub id: Uuid,
    pub name: String,
    pub address: String,
    pub is_home: bool,
    pub display_order: i32,
    pub lat: Option<f64>,
    pub lng: Option<f64>,
}
```

Use `ST_Y(geom::geometry) AS lat, ST_X(geom::geometry) AS lng` in SELECT to extract coordinates.

### `src/routes/volunteer.rs` — `ShiftCard` extension

Add two fields after `my_waitlist_position`:

```rust
pub site_lat: Option<f64>,
pub site_lng: Option<f64>,
```

Populated in the shifts query via:

```sql
ST_Y(si.geom::geometry) AS site_lat,
ST_X(si.geom::geometry) AS site_lng,
```

### `src/config.rs` — new field

```rust
pub google_maps_api_key: Option<String>,
```

Loaded in `from_env()` as:

```rust
google_maps_api_key: std::env::var("GOOGLE_MAPS_API_KEY").ok(),
```

---

## Templates

### New templates

| File | Purpose |
|------|---------|
| `templates/volunteer/partials/location_row.html.tera` | One row in the "Search Locations" list (name, address, Edit/Delete buttons) |

### Modified templates

| File | Changes |
|------|---------|
| `templates/apply/step1_personal.html.tera` | Add `street_address` text input below Phone; add geocoding warning flash area |
| `templates/volunteer/profile.html.tera` | Add "Search Locations" section after Profile form card and before Dogs |
| `templates/volunteer/shifts.html.tera` | Add location dropdown + distance slider above shift list; map view toggle + Google Maps canvas; extend Alpine data with `site_lat`/`site_lng`; update pagination links to preserve `location_id` and `preferred_distance_km` params |

---

## Routes

### New routes (all mounted under `/volunteer`)

| Method | Path | Handler | Description |
|--------|------|---------|-------------|
| `POST` | `/volunteer/locations` | `location_create` | Create a new named location (geocodes on server) |
| `GET` | `/volunteer/locations/<id>/edit` | `location_edit_get` | Show edit form for a location |
| `POST` | `/volunteer/locations/<id>` | `location_update` | Update name/address (re-geocodes) |
| `POST` | `/volunteer/locations/<id>/delete` | `location_delete` | Delete location (forbidden if `is_home = true`) |

### Modified routes

| Route | Changes |
|-------|---------|
| `GET /volunteer/shifts` | Add `location_id: Option<Uuid>` and `preferred_distance_km: Option<f64>` query params; load volunteer's named locations; load/save `search_preferences`; return total + filtered shift counts; add `site_lat`/`site_lng` to query |
| `GET /volunteer/profile` | Load `volunteer_locations` rows for the user; pass to template |
| `POST /apply/step/1` | Accept `street_address`; save to `volunteer_applications.street_address` |
| Admin approval route | After creating `volunteer_profile`: geocode `street_address`, update `home_geom`, insert Home `volunteer_location` row |

---

## Implementation Phases

Work is ordered so each phase is independently deployable and testable. Migrations must be run before the code that depends on them.

---

### Phase 1 — Geocoding Service (Foundation)

**Goal:** A working geocoding function other phases depend on.

1. Add `google_maps_api_key: Option<String>` to `AppConfig` in `src/config.rs`. Read from `GOOGLE_MAPS_API_KEY` env var, defaulting to `None`.
2. Add `GOOGLE_MAPS_API_KEY=` as an empty placeholder to `.env.bak`.
3. Create `src/geocoding.rs`:
   - Define `GeoPoint { lat: f64, lng: f64 }`.
   - Implement `async fn geocode_address(address: &str, api_key: &str) -> anyhow::Result<GeoPoint>`.
   - Use `reqwest::get` to fetch the Geocoding API JSON.
   - Parse `results[0].geometry.location.lat` and `.lng`.
   - Return `Err` if `results` is empty or status is not `"OK"`.
   - Log `tracing::warn!` on failure.
4. Register `pub mod geocoding;` in `src/main.rs`.

---

### Phase 2 — `volunteer_locations` Table, Model, and Address Column Cleanup

**Goal:** New table exists with constraints; model can be queried; `address_display` and `address_encrypted` removed from codebase.

1. Write and apply `migrations/0049_volunteer_locations.sql`.
2. Write and apply `migrations/0050_search_preferences_location.sql`.
3. Write and apply `migrations/0052_drop_volunteer_address_columns.sql`.
4. Create `src/models/volunteer_location.rs` with `VolunteerLocation` and `VolunteerLocationCard` structs.
5. Add `pub mod volunteer_location;` to `src/models/mod.rs`.
6. Remove `address_display` from all source files. Files to touch:
   - `src/models/volunteer.rs` — remove field from `VolunteerProfile` and `VolunteerDetail` structs
   - `src/routes/volunteer.rs` — remove from `ProfileUpdateForm`, SELECT queries, UPDATE query, and change-tracking diff logic
   - `src/routes/admin.rs` — remove from `VolunteerEditForm`, all SELECT/INSERT/UPDATE queries, change-tracking diff, and the misused alias `vp.address_display as volunteer_phone` (line ~6497)
   - `src/main.rs` — remove the `"address_display" => "Location"` label mapping entry
   - `src/bin/seed.rs` — remove `address_display` from the `volunteer_profiles` INSERT and seed data tuples
   - All Tera templates that render `address_display` (check `templates/admin/volunteer_detail.html.tera`, `volunteer_edit.html.tera`, `user_edit.html.tera`, `volunteers.html.tera`, `templates/volunteer/profile.html.tera`)
7. Update `src/bin/seed.rs`: after each `volunteer_profiles` INSERT, also insert a Home `volunteer_locations` row using the existing lat/lng seed data:

```sql
INSERT INTO volunteer_locations
    (user_id, name, address, geom, is_home, display_order)
VALUES
    ($1, 'Home', $2, ST_SetSRID(ST_MakePoint($3, $4), 4326)::geography, true, 0)
```

Where `$2` is the volunteer's street address string (use the city/area name from seed data as a placeholder until real addresses are added), `$3` is `lng`, `$4` is `lat`.

---

### Phase 3 — Address Collection at Registration

**Goal:** Step 1 collects a full street address. On approval, a Home location row is created.

1. Apply `migrations/0053_application_street_address.sql`.
2. Extend `Step1Form` in `src/routes/apply.rs` with `street_address: Option<&'r str>`.
3. In `step1_post`: save `street_address` in the `UPDATE volunteer_applications` SQL.
4. Update `templates/apply/step1_personal.html.tera`: add "Home Address" input below Phone with helptext "Used only to find nearby shifts. We do not share your address."
5. In the admin application approval handler (`src/routes/admin.rs`), after creating `volunteer_profile`:
   - Read `street_address` from `volunteer_applications`.
   - If non-empty and API key configured: call `geocode_address`. Update `volunteer_profiles.home_geom`. Insert row into `volunteer_locations` with `is_home = true`, `name = 'Home'`, using `ON CONFLICT DO NOTHING`.
   - Geocoding failure is non-fatal: log warning, continue.

---

### Phase 4 — Named Alternate Locations on Profile

**Goal:** Volunteers manage named search locations from their profile page.

1. Extend `profile_page` handler to load `volunteer_locations`:

```sql
SELECT id, name, address, is_home, display_order,
       ST_Y(geom::geometry) AS lat, ST_X(geom::geometry) AS lng
FROM volunteer_locations
WHERE user_id = $1
ORDER BY display_order ASC, created_at ASC
```

2. Create four new handlers in `src/routes/volunteer.rs`:

**`location_create` (POST `/volunteer/locations`)**
- Form: `name: &str`, `address: &str`.
- Validate: name non-empty (max 20 chars), address non-empty.
- Geocode if API key configured. Failure → `geom = NULL`, set flash warning.
- INSERT row. Set `display_order` = `(SELECT COALESCE(MAX(display_order), -1) + 1 FROM volunteer_locations WHERE user_id = $1)`.
- Redirect to `/volunteer/profile`.

**`location_edit_get` (GET `/volunteer/locations/<id>/edit`)**
- Verify ownership (`WHERE id = $1 AND user_id = $2`).
- Render edit form (separate page, simplest approach).

**`location_update` (POST `/volunteer/locations/<id>`)**
- Verify ownership.
- If `is_home = true`: only allow updating `address`, not `name` (enforce in handler).
- If address changed and API key configured: re-geocode.
- If `is_home = true` and geocode succeeds: also update `volunteer_profiles.home_geom`.
- UPDATE row, redirect to `/volunteer/profile`.

**`location_delete` (POST `/volunteer/locations/<id>/delete`)**
- Verify ownership.
- Reject if `is_home = true` (flash error: "Home location cannot be deleted").
- DELETE row (FK `ON DELETE SET NULL` clears any `search_preferences.preferred_location_id` automatically).
- Redirect to `/volunteer/profile`.

3. Register all four routes in `routes()`.

4. Update `templates/volunteer/profile.html.tera`: add "Search Locations" section after Profile form card, before Dogs.

```
## Search Locations
Helptext: "These locations are only used as starting points for shift distance filters."

[List of existing locations — name, address, Edit/Delete (Delete hidden for is_home)]

[Add Location form — name + address inputs + Save button]
```

---

### Phase 5 — Shifts Listing Filter Enhancement

**Goal:** Location dropdown + distance slider above the shift list; filter summary with match counts; preferences persisted.

1. Extend `ShiftFilters` and the `#[get]` macro in `src/routes/volunteer.rs`:

```rust
pub struct ShiftFilters {
    pub region: Option<String>,
    pub distance_km: Option<f64>,         // legacy, keep
    pub agency_type: Option<String>,
    pub page: Option<i64>,
    pub location_id: Option<Uuid>,        // NEW
    pub preferred_distance_km: Option<f64>, // NEW (slider value)
}
```

2. Add `site_lat: Option<f64>` and `site_lng: Option<f64>` to `ShiftCard`.

3. Rewrite `shifts_listing` body:

**A — Load saved preferences**
```sql
SELECT preferred_location_id, preferred_distance_km
FROM search_preferences WHERE user_id = $1
```

**B — Resolve effective location and distance**
- If `location_id` in URL: use it. Effective distance = URL `preferred_distance_km` or saved pref or default 10.0 km.
- Else if saved `preferred_location_id` is non-null: use that with saved distance or default.
- Else: no location filter.

Resolve geom for active location:
```sql
SELECT ST_AsText(geom)
FROM volunteer_locations
WHERE id = $1 AND user_id = $2
```

**C — Save preferences when URL params changed**
```sql
INSERT INTO search_preferences (user_id, preferred_location_id, preferred_distance_km)
VALUES ($1, $2, $3)
ON CONFLICT (user_id) DO UPDATE
SET preferred_location_id = EXCLUDED.preferred_location_id,
    preferred_distance_km = EXCLUDED.preferred_distance_km,
    updated_at = now()
```

**D — Two counts: total eligible + filtered**

Run a count query with all compliance/visibility filters but WITHOUT the location/distance filter to get `total_count`. Run a second count WITH the location/distance filter to get `filtered_count`.

**E — Main paged query**
Add to SELECT:
```sql
ST_Y(si.geom::geometry) AS site_lat,
ST_X(si.geom::geometry) AS site_lng,
```

**F — Load locations for dropdown**
```sql
SELECT id, name, address, is_home, display_order,
       ST_Y(geom::geometry) AS lat, ST_X(geom::geometry) AS lng
FROM volunteer_locations
WHERE user_id = $1
ORDER BY display_order, created_at
```

Add to context: `locations`, `current_location_id`, `current_preferred_distance_km`, `filtered_count`, `total_count`, `google_maps_api_key`.

4. Update `templates/volunteer/shifts.html.tera`:

**Filter block** (above shift list, below heading):

```html
<div class="bg-white rounded-xl border border-gray-100 p-4 mb-4 space-y-3">
  <form method="get" action="/volunteer/shifts" id="location-filter-form">
    <!-- Preserve other params -->
    <input type="hidden" name="region" value="{{ current_region | default(value='') }}">
    <input type="hidden" name="agency_type" value="{{ current_agency_type | default(value='') }}">

    <!-- Location dropdown -->
    <div>
      <label class="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wider">
        Distance from
      </label>
      <select name="location_id" onchange="this.form.submit()"
              class="border border-gray-200 rounded-lg px-3 py-2 text-sm">
        <option value="">No location filter</option>
        {% for loc in locations %}
        <option value="{{ loc.id }}"
          {% if current_location_id == loc.id %}selected{% endif %}>
          {{ loc.name }}{% if not loc.is_home %} — {{ loc.address | truncate(length=30) }}{% endif %}
        </option>
        {% endfor %}
      </select>
    </div>

    <!-- Distance slider (only shown if a location is selected) -->
    {% if current_location_id %}
    <div>
      <label class="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wider">
        Within <span id="dist-label">{{ current_preferred_distance_km | default(value=10) }} km</span>
      </label>
      <input type="range" name="preferred_distance_km"
             min="3" max="20" step="1"
             value="{{ current_preferred_distance_km | default(value=10) }}"
             oninput="document.getElementById('dist-label').textContent = this.value + ' km'"
             onchange="this.form.submit()"
             class="w-full accent-sunshine-500">
    </div>
    {% endif %}
  </form>

  <!-- Active filter summary -->
  {% if current_location_id %}
  <div class="flex items-center justify-between text-sm text-gray-600">
    <span>
      Showing {{ filtered_count }} of {{ total_count }} shifts within
      {{ current_preferred_distance_km | default(value=10) }} km
    </span>
    <a href="?region={{ current_region | default(value='') }}&agency_type={{ current_agency_type | default(value='') }}"
       class="text-sunshine-600 hover:underline text-xs">
      Clear location filter
    </a>
  </div>
  {% endif %}
</div>
```

Update pagination links to carry `location_id` and `preferred_distance_km`.

---

### Phase 6 — Map View

**Goal:** Toggle to Google Maps canvas showing filtered shift locations as markers.

1. Pass `google_maps_api_key` from `AppConfig` state into the `shifts_listing` template context.

2. Update `templates/volunteer/shifts.html.tera`:

**Toggle button** (in heading row):

```html
{% if google_maps_api_key %}
<div class="flex rounded-lg border border-gray-200 overflow-hidden text-sm font-medium">
  <button @click="view = 'list'"
          :class="view === 'list' ? 'bg-sunshine-500 text-white' : 'bg-white text-gray-600'"
          class="px-3 py-1.5 transition-colors">List</button>
  <button @click="view = 'map'; loadMap()"
          :class="view === 'map' ? 'bg-sunshine-500 text-white' : 'bg-white text-gray-600'"
          class="px-3 py-1.5 transition-colors">Map</button>
</div>
{% endif %}
```

**Map canvas** (shown when `view === 'map'`):

```html
{% if google_maps_api_key %}
<div x-show="view === 'map'" x-cloak
     class="rounded-2xl overflow-hidden border border-gray-100 shadow-sm"
     style="height: 600px;">
  <div id="shifts-map" class="w-full h-full"></div>
</div>
{% endif %}
```

**Shift data for map + lazy load script** (in `{% block scripts %}`):

```js
{% if google_maps_api_key %}
const SHIFTS_MAP_DATA = [
  {% for s in shifts %}
  {% if s.site_lat and s.site_lng %}
  {
    id: '{{ s.id }}',
    lat: {{ s.site_lat }},
    lng: {{ s.site_lng }},
    title: '{{ s.title | escape }}',
    agency: '{{ s.agency_name | escape }}',
    site: '{{ s.site_name | escape }}',
    start_at: '{{ s.start_at }}',
    slots_requested: {{ s.slots_requested }},
    slots_confirmed: {{ s.slots_confirmed }},
  },
  {% endif %}
  {% endfor %}
];

function initShiftsMap() {
  const mapEl = document.getElementById('shifts-map');
  if (!mapEl || !SHIFTS_MAP_DATA.length) return;

  const avgLat = SHIFTS_MAP_DATA.reduce((s, p) => s + p.lat, 0) / SHIFTS_MAP_DATA.length;
  const avgLng = SHIFTS_MAP_DATA.reduce((s, p) => s + p.lng, 0) / SHIFTS_MAP_DATA.length;

  const map = new google.maps.Map(mapEl, {
    center: { lat: avgLat, lng: avgLng },
    zoom: 11,
  });

  const infoWindow = new google.maps.InfoWindow();

  // Group shifts by site location to avoid overlapping markers
  const byLocation = new Map();
  SHIFTS_MAP_DATA.forEach(shift => {
    const key = `${shift.lat},${shift.lng}`;
    if (!byLocation.has(key)) byLocation.set(key, []);
    byLocation.get(key).push(shift);
  });

  byLocation.forEach((shifts, key) => {
    const [lat, lng] = key.split(',').map(Number);
    const marker = new google.maps.Marker({
      map,
      position: { lat, lng },
      title: shifts[0].site,
    });
    marker.addListener('click', () => {
      const content = shifts.map(s => {
        const start = new Date(s.start_at).toLocaleString('en-CA', {
          month: 'short', day: 'numeric', hour: 'numeric', minute: 'numeric',
        });
        return `<div style="margin-bottom:8px">
          <strong>${s.agency}</strong><br>
          <span style="font-size:0.85em;color:#555">${s.title}</span><br>
          <span style="font-size:0.85em">${start} · ${s.slots_confirmed}/${s.slots_requested} filled</span><br>
          <a href="/volunteer/shifts/${s.id}"
             style="color:#d97706;font-weight:600;font-size:0.85em">View →</a>
        </div>`;
      }).join('<hr style="margin:6px 0">');
      infoWindow.setContent(`<div style="max-width:240px"><strong>${shifts[0].site}</strong><br><br>${content}</div>`);
      infoWindow.open(map, marker);
    });
  });
}

function loadMap() {
  if (window._mapsLoaded) return;
  window._mapsLoaded = true;
  const script = document.createElement('script');
  script.src = 'https://maps.googleapis.com/maps/api/js?key={{ google_maps_api_key }}&callback=initShiftsMap';
  script.async = true;
  script.defer = true;
  document.head.appendChild(script);
}
{% endif %}
```

3. Extend the Alpine `volunteerShifts` component to track `view`:

```js
function volunteerShifts(config) {
  return {
    view: 'list',   // 'list' | 'map'
    showFilters: false,
    // ... existing fields ...
  }
}
```

---

## Decisions and Trade-offs

### 1. Geocoding happens at approval, not at Step 1 submission

Geocoding is deferred to admin approval (when `volunteer_profile` is created) to keep Step 1 fast and avoid wasting API quota on rejected applications. The `street_address` is stored in `volunteer_applications` for use at approval time.

**Sync:** When a volunteer updates their Home location on the profile page, the `location_update` handler also updates `volunteer_profiles.home_geom` to keep both in sync.

### 2. Location filter and region filter are not mutually exclusive

Both can be active simultaneously. The SQL ANDs them together. The Active Filter Summary shows both. A future enhancement could enforce mutual exclusivity.

### 3. Preferences saved only when URL params are present

Preferences are only written to `search_preferences` when the user actively sets params via URL. Loading the page with no params reads saved preferences without re-writing, avoiding unnecessary writes on every page view.

### 4. `preferred_location_id` FK uses `ON DELETE SET NULL`

Deleting a location gracefully clears the saved preference rather than blocking deletion.

### 5. No schema change for `site_lat`/`site_lng`

`ST_Y(si.geom::geometry)` / `ST_X(si.geom::geometry)` at query time eliminates any schema change. Returns `NULL` for any site without a geom.

### 6. Google Maps JS loaded lazily

The Maps JS API (~250 KB) is injected into the DOM only when the user first clicks "Map View", via the `loadMap()` function.

### 7. `reqwest` client reuse

Initial implementation uses per-call `reqwest::get`. For production, pass a shared `reqwest::Client` as Rocket state to avoid per-call connection pool overhead. Acceptable initially since geocoding is only called on form submissions.

### 8. Drop `address_encrypted` and `address_display` from `volunteer_profiles`

Both columns are being removed:

- `address_encrypted` — already has zero references in source code; exists only in the migration schema. Application-layer encryption is not warranted given the access model.
- `address_display` — a vague "Scarborough"-style area string. Not useful as a stored column; if a display-friendly area name is ever needed it should be derived at render time (reverse lookup against `regions.geom` via PostGIS).

A drop migration is included in Phase 2. All code references to `address_display` must be removed as part of that phase. See the Phase 2 task list for the full set of files to touch.

### 9. Migration numbering

**Next available migration is `0049`.** Check whether any migrations from 0049 onward exist before applying these, and renumber upward if needed.

---

## Critical Files

| File | Why critical |
|------|-------------|
| `src/routes/volunteer.rs` | `shifts_listing`, `profile_page`, all new location CRUD handlers |
| `src/routes/apply.rs` | Step 1 form extension; approval path geocoding |
| `src/routes/admin.rs` | Approval handler where Home location is created |
| `src/config.rs` | `google_maps_api_key` field pattern |
| `templates/volunteer/shifts.html.tera` | Filter block, map canvas, Alpine extension, pagination |
| `templates/volunteer/profile.html.tera` | "Search Locations" section |
| `src/bin/seed.rs` | Home location seeding from existing lat/lng data |
