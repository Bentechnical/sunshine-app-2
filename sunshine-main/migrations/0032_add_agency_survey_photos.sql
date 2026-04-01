-- Add photo_asset_ids to agency_surveys
ALTER TABLE agency_surveys ADD COLUMN IF NOT EXISTS photo_asset_ids UUID[] NOT NULL DEFAULT '{}';
