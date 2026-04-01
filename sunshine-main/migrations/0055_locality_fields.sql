-- ============================================================
-- Add neighborhood/locality text field to geocoded address tables
-- Populated from Google Geocoding API address_components:
--   neighborhood → sublocality_level_1 → sublocality → locality
-- ============================================================

ALTER TABLE volunteer_locations ADD COLUMN neighborhood TEXT;
ALTER TABLE sites               ADD COLUMN neighborhood TEXT;
