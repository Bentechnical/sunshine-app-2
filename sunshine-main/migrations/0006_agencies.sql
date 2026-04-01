-- ============================================================
-- Agencies, Sites & Contacts
-- ============================================================

CREATE TABLE agencies (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name                TEXT NOT NULL,
    slug                TEXT NOT NULL UNIQUE,
    agency_type_id      UUID REFERENCES agency_types(id) ON DELETE SET NULL,
    description         TEXT,
    logo_asset_id       UUID,   -- FK → assets
    -- Portal access controls
    is_login_active     BOOL NOT NULL DEFAULT false,
    can_create_request  BOOL NOT NULL DEFAULT false,
    primary_contact_id  UUID,   -- FK → contacts (set after contacts exist)
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX agencies_slug_idx ON agencies (slug);
CREATE INDEX agencies_name_trgm_idx ON agencies USING GIN (name gin_trgm_ops);

-- ─── Contacts ────────────────────────────────────────────────
-- A contact belongs to an agency and may have a user account
-- (when is_login_active = true on their agency).

CREATE TABLE contacts (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agency_id   UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
    user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
    name        TEXT NOT NULL,
    title       TEXT,
    phone       TEXT,
    email       TEXT,
    is_primary  BOOL NOT NULL DEFAULT false,
    is_active   BOOL NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX contacts_agency_id_idx ON contacts (agency_id);
CREATE INDEX contacts_user_id_idx ON contacts (user_id);

-- Back-fill primary_contact_id FK now that contacts table exists
ALTER TABLE agencies
    ADD CONSTRAINT agencies_primary_contact_id_fk
    FOREIGN KEY (primary_contact_id) REFERENCES contacts(id) ON DELETE SET NULL;

-- ─── Client Sites (physical locations) ───────────────────────

CREATE TABLE sites (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agency_id               UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
    name                    TEXT NOT NULL,
    address                 TEXT,
    geom                    geography(POINT, 4326),
    region_id               UUID REFERENCES regions(id) ON DELETE SET NULL,
    default_parking_notes   TEXT,
    default_meeting_notes   TEXT,
    is_active               BOOL NOT NULL DEFAULT true,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX sites_agency_id_idx ON sites (agency_id);
CREATE INDEX sites_geom_idx ON sites USING GIST (geom);
CREATE INDEX sites_region_id_idx ON sites (region_id);
