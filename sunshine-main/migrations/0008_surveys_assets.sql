-- ============================================================
-- Post-Shift Surveys & Assets
-- ============================================================

CREATE TYPE asset_visibility AS ENUM (
    'private',    -- uploader only (default before admin review)
    'curated',    -- admin-promoted to the shared photo stream
    'hidden'      -- admin-hidden from all streams
);

CREATE TABLE assets (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    uploader_id     UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    shift_id        UUID REFERENCES shifts(id) ON DELETE SET NULL,
    storage_key     TEXT NOT NULL UNIQUE,  -- S3/R2 object key
    mime_type       TEXT NOT NULL,
    size_bytes      BIGINT NOT NULL,
    visibility      asset_visibility NOT NULL DEFAULT 'private',
    -- Caption / alt text
    caption         TEXT,
    promoted_at     TIMESTAMPTZ,
    promoted_by     UUID REFERENCES users(id) ON DELETE SET NULL,
    uploaded_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX assets_shift_id_idx ON assets (shift_id);
CREATE INDEX assets_uploader_id_idx ON assets (uploader_id);
CREATE INDEX assets_visibility_idx ON assets (visibility);

-- Back-fill asset FKs on other tables
ALTER TABLE volunteer_profiles
    ADD CONSTRAINT volunteer_profiles_profile_pic_asset_id_fk
    FOREIGN KEY (profile_pic_asset_id) REFERENCES assets(id) ON DELETE SET NULL;

ALTER TABLE agencies
    ADD CONSTRAINT agencies_logo_asset_id_fk
    FOREIGN KEY (logo_asset_id) REFERENCES assets(id) ON DELETE SET NULL;

-- ─── Volunteer Post-Shift Feedback ───────────────────────────

CREATE TABLE volunteer_surveys (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shift_id                UUID NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
    volunteer_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    notes                   TEXT,
    rating                  SMALLINT CHECK (rating BETWEEN 1 AND 5),
    -- Override for clients_served stat; takes precedence over shift.estimated_clients
    clients_served_override INT,
    -- Optional peer notes (collapsible in UI)
    peer_notes              JSONB,  -- [{volunteer_id, note}]
    photo_asset_ids         UUID[] NOT NULL DEFAULT '{}',
    submitted_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE (shift_id, volunteer_id)
);

CREATE INDEX volunteer_surveys_shift_id_idx ON volunteer_surveys (shift_id);
CREATE INDEX volunteer_surveys_volunteer_id_idx ON volunteer_surveys (volunteer_id);

-- Full-text search on notes
CREATE INDEX volunteer_surveys_notes_trgm_idx
    ON volunteer_surveys USING GIN (notes gin_trgm_ops);

-- ─── Agency Post-Shift Survey ─────────────────────────────────

CREATE TABLE agency_surveys (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shift_id                UUID NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
    contact_id              UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    notes                   TEXT,
    rating                  SMALLINT CHECK (rating BETWEEN 1 AND 5),
    -- Agency's reported count (highest precedence for stats)
    actual_clients_served   INT,
    submitted_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE (shift_id, contact_id)
);

CREATE INDEX agency_surveys_shift_id_idx ON agency_surveys (shift_id);
CREATE INDEX agency_surveys_notes_trgm_idx
    ON agency_surveys USING GIN (notes gin_trgm_ops);
