-- ============================================================
-- Saved shift-board querysets (volunteer filter presets)
-- ============================================================
-- Volunteers can save up to 3 named filter presets from the
-- shifts board. One may be marked as the default (auto-applied
-- on page load when no query params are present).

CREATE TABLE saved_querysets (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    volunteer_id            UUID NOT NULL REFERENCES volunteer_profiles(user_id) ON DELETE CASCADE,
    name                    TEXT NOT NULL,

    -- Mirrors ShiftFilters fields
    region                  TEXT,           -- region slug
    agency_type             TEXT,           -- agency type slug
    open_only               BOOL NOT NULL DEFAULT false,
    match_preferences       BOOL NOT NULL DEFAULT false,
    location_id             UUID REFERENCES volunteer_locations(id) ON DELETE SET NULL,
    preferred_distance_km   FLOAT8,

    is_default              BOOL NOT NULL DEFAULT false,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX saved_querysets_volunteer_idx ON saved_querysets(volunteer_id);

-- At most one default per volunteer (partial unique index)
CREATE UNIQUE INDEX saved_querysets_one_default
    ON saved_querysets(volunteer_id)
    WHERE is_default = true;
