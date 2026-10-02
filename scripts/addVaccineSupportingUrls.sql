-- Add vaccine_supporting_urls column to dogs table
-- Stores additional supporting vaccine documents (e.g., booster records, vet letters)
-- These are reviewed alongside the primary vaccine_record_url but have no independent compliance lifecycle.

ALTER TABLE dogs ADD COLUMN IF NOT EXISTS vaccine_supporting_urls TEXT[] DEFAULT '{}';

COMMENT ON COLUMN dogs.vaccine_supporting_urls IS 'Array of Supabase Storage paths for additional vaccine supporting documents. Reviewed alongside primary vaccine_record_url.';
