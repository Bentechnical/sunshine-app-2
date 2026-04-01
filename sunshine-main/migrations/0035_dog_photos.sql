-- Add photo_asset_id to dogs table
ALTER TABLE dogs ADD COLUMN photo_asset_id UUID REFERENCES assets(id) ON DELETE SET NULL;
