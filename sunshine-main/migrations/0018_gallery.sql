-- ============================================================
-- Gallery: photo upload, tagging, starring
-- ============================================================

-- 1. Storage backend enum + new columns on assets
CREATE TYPE storage_backend AS ENUM ('local', 's3');

ALTER TABLE assets
    ADD COLUMN storage_backend storage_backend NOT NULL DEFAULT 's3',
    ADD COLUMN thumb_key        TEXT,       -- path to 400×400 WebP thumbnail
    ADD COLUMN width_px         INT,
    ADD COLUMN height_px        INT;

-- 2. Agency contacts can attach photos to their post-shift survey
ALTER TABLE agency_surveys
    ADD COLUMN photo_asset_ids UUID[] NOT NULL DEFAULT '{}';

-- 3. User-facing stars (separate from admin curation via promoted_at)
CREATE TABLE asset_stars (
    asset_id   UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    user_id    UUID NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
    starred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (asset_id, user_id)
);

CREATE INDEX asset_stars_user_idx ON asset_stars (user_id);

-- 4. Volunteer / dog tags inside images
CREATE TABLE asset_tags (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_id      UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    tagged_by     UUID NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
    volunteer_id  UUID REFERENCES users(id) ON DELETE CASCADE,
    dog_id        UUID REFERENCES dogs(id)  ON DELETE CASCADE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (
        (volunteer_id IS NOT NULL AND dog_id IS NULL) OR
        (volunteer_id IS NULL     AND dog_id IS NOT NULL)
    )
);

CREATE UNIQUE INDEX asset_tags_vol_unique ON asset_tags (asset_id, volunteer_id) WHERE volunteer_id IS NOT NULL;
CREATE UNIQUE INDEX asset_tags_dog_unique ON asset_tags (asset_id, dog_id)       WHERE dog_id IS NOT NULL;
CREATE INDEX asset_tags_vol_idx           ON asset_tags (volunteer_id);
CREATE INDEX asset_tags_dog_idx           ON asset_tags (dog_id);
