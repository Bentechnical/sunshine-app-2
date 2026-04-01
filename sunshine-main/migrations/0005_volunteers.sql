-- ============================================================
-- Volunteer Profiles & Dogs
-- ============================================================

CREATE TYPE dog_size AS ENUM ('x_small', 'small', 'medium', 'large', 'x_large');

CREATE TABLE volunteer_profiles (
    user_id                 UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    -- Supports "Jane & Bob Smith" for couples/pairings
    volunteer_names         TEXT NOT NULL DEFAULT '',
    bio                     TEXT,
    years_volunteering      NUMERIC(4,1),
    -- Address stored encrypted (AES-256-GCM via app layer); admin-only
    address_encrypted       BYTEA,
    address_display         TEXT,   -- non-identifying display (e.g. "Scarborough")
    home_geom               geography(POINT, 4326),  -- derived from address for distance calc
    -- Admin-set compliance fields
    has_vulnerable_sector_check BOOL NOT NULL DEFAULT false,
    has_police_check            BOOL NOT NULL DEFAULT false,
    -- Profile photo
    profile_pic_asset_id    UUID,   -- FK → assets added after assets table
    -- Watched agencies for quick notification opt-in
    watched_agency_ids      UUID[] NOT NULL DEFAULT '{}',
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX volunteer_profiles_home_geom_idx
    ON volunteer_profiles USING GIST (home_geom);

-- ─── Search Preferences ──────────────────────────────────────

CREATE TABLE search_preferences (
    user_id                 UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    -- NULL = use home_geom + max_distance_km; non-null = use region polygons
    preferred_region_ids    UUID[] NOT NULL DEFAULT '{}',
    max_distance_km         NUMERIC(6,2),
    preferred_agency_type_ids UUID[] NOT NULL DEFAULT '{}',
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Dogs ────────────────────────────────────────────────────

CREATE TABLE dogs (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    volunteer_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name                TEXT NOT NULL,
    breed_id            UUID REFERENCES dog_types(id) ON DELETE SET NULL,
    breed_freeform      TEXT,   -- fallback if breed not in taxonomy
    size                dog_size NOT NULL,
    age_years           NUMERIC(3,1),
    personality_desc    TEXT,
    is_primary          BOOL NOT NULL DEFAULT true,
    is_active           BOOL NOT NULL DEFAULT true,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX dogs_volunteer_id_idx ON dogs (volunteer_id);

-- Enforce at most one primary dog per volunteer at DB level
CREATE UNIQUE INDEX dogs_one_primary_per_volunteer
    ON dogs (volunteer_id)
    WHERE is_primary = true AND is_active = true;
