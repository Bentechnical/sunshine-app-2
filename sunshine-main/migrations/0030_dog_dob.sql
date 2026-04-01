-- Change age_years to date_of_birth
ALTER TABLE dogs DROP COLUMN IF EXISTS age_years CASCADE;
ALTER TABLE dogs ADD COLUMN IF NOT EXISTS date_of_birth DATE;

-- Update dog applications as well if they have age
ALTER TABLE dog_applications DROP COLUMN IF EXISTS age_years CASCADE;
ALTER TABLE dog_applications ADD COLUMN IF NOT EXISTS date_of_birth DATE;
