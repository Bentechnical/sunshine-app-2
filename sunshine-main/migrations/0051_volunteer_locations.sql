-- ============================================================
-- Named volunteer search locations
-- ============================================================

CREATE TABLE volunteer_locations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,           -- e.g. "Home", "OFFICE"
    address         TEXT NOT NULL,           -- full text address as entered
    geom            geography(POINT, 4326),  -- NULL if geocoding failed/skipped
    is_home         BOOL NOT NULL DEFAULT false,
    display_order   INT  NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX volunteer_locations_user_id_idx
    ON volunteer_locations (user_id);

CREATE INDEX volunteer_locations_geom_idx
    ON volunteer_locations USING GIST (geom);

-- At most one is_home=true per user
CREATE UNIQUE INDEX volunteer_locations_one_home_per_user
    ON volunteer_locations (user_id)
    WHERE is_home = true;
