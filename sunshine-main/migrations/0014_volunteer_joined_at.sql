-- Migration to replace years_volunteering with joined_at date
ALTER TABLE volunteer_profiles ADD COLUMN joined_at DATE;

-- Initialize joined_at with the account creation date
UPDATE volunteer_profiles SET joined_at = created_at::DATE;

-- Make it NOT NULL for future entries
ALTER TABLE volunteer_profiles ALTER COLUMN joined_at SET NOT NULL;
ALTER TABLE volunteer_profiles ALTER COLUMN joined_at SET DEFAULT CURRENT_DATE;

-- Remove old field
ALTER TABLE volunteer_profiles DROP COLUMN years_volunteering;
