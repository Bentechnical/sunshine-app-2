-- ============================================================
-- Geographic Regions
-- Seeded from Toronto Open Data (158 neighbourhoods dissolved
-- into 7 zones) + Statistics Canada CSDs for GTA / S. Ontario.
-- Admins can add custom polygons via the Leaflet.draw editor.
-- ============================================================

CREATE TYPE region_source AS ENUM (
    'toronto_open_data',
    'statcan_2021',
    'admin_custom'
);

CREATE TABLE regions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            TEXT NOT NULL,
    slug            TEXT NOT NULL UNIQUE,
    source          region_source NOT NULL DEFAULT 'admin_custom',
    -- original identifier from upstream dataset (e.g. CSDUID, neighbourhood number)
    source_code     TEXT,
    geom            geography(MULTIPOLYGON, 4326) NOT NULL,
    display_order   INT NOT NULL DEFAULT 0,
    is_active       BOOL NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX regions_geom_idx ON regions USING GIST (geom);
CREATE INDEX regions_slug_idx ON regions (slug);
