-- Remove address_display and address_encrypted from volunteer_profiles.
-- address_display (vague area string) is vestigial — if an area label is
-- needed it should be derived from geom at render time.
-- address_encrypted has no code references and is superseded by volunteer_locations.
ALTER TABLE volunteer_profiles
    DROP COLUMN IF EXISTS address_encrypted,
    DROP COLUMN IF EXISTS address_display;
