-- Add separate field for agency suggestions in volunteer surveys
ALTER TABLE volunteer_surveys ADD COLUMN IF NOT EXISTS suggestions_for_agency TEXT;
