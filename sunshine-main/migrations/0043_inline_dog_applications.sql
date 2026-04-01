-- Migration: Inline dog applications into volunteer application flow
-- Adds dog fields to volunteer_applications for streamlined registration

-- ============================================================
-- Step 1: Add new status values to volunteer_application_status
-- ============================================================

-- Note: PostgreSQL enum alterations use ALTER TYPE ... ADD VALUE
-- These are transaction-safe in PostgreSQL 9.1+

DO $$
BEGIN
    -- Add 'dog_registration_completed' if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum 
        WHERE enumlabel = 'dog_registration_completed' 
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'volunteer_application_status')
    ) THEN
        ALTER TYPE volunteer_application_status ADD VALUE 'dog_registration_completed' AFTER 'questionnaire_completed';
    END IF;

    -- Add 'dog_registration_skipped' if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum 
        WHERE enumlabel = 'dog_registration_skipped' 
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'volunteer_application_status')
    ) THEN
        ALTER TYPE volunteer_application_status ADD VALUE 'dog_registration_skipped' AFTER 'dog_registration_completed';
    END IF;
END $$;

-- ============================================================
-- Step 2: Add dog fields to volunteer_applications table
-- ============================================================

-- Flag to track if volunteer has a dog (for non-dog volunteers)
ALTER TABLE volunteer_applications 
    ADD COLUMN IF NOT EXISTS has_dog BOOLEAN DEFAULT NULL;

-- Dog information fields (NULL when has_dog is false or NULL)
ALTER TABLE volunteer_applications 
    ADD COLUMN IF NOT EXISTS dog_name VARCHAR(100) DEFAULT NULL;

ALTER TABLE volunteer_applications 
    ADD COLUMN IF NOT EXISTS dog_breed_id UUID DEFAULT NULL 
    REFERENCES dog_types(id) ON DELETE SET NULL;

ALTER TABLE volunteer_applications 
    ADD COLUMN IF NOT EXISTS dog_breed_freeform VARCHAR(200) DEFAULT NULL;

ALTER TABLE volunteer_applications 
    ADD COLUMN IF NOT EXISTS dog_size dog_size DEFAULT NULL;

ALTER TABLE volunteer_applications 
    ADD COLUMN IF NOT EXISTS dog_gender dog_gender DEFAULT NULL;

ALTER TABLE volunteer_applications 
    ADD COLUMN IF NOT EXISTS dog_date_of_birth DATE DEFAULT NULL;

ALTER TABLE volunteer_applications 
    ADD COLUMN IF NOT EXISTS dog_personality_desc TEXT DEFAULT NULL;

-- Optional: Photo asset reference for dog photo during application
ALTER TABLE volunteer_applications 
    ADD COLUMN IF NOT EXISTS dog_photo_asset_id UUID DEFAULT NULL 
    REFERENCES assets(id) ON DELETE SET NULL;

-- ============================================================
-- Step 3: Migrate existing data from dog_applications
-- ============================================================

-- For volunteers who already have dog applications in progress,
-- copy the data to their volunteer_application record

UPDATE volunteer_applications va
SET 
    has_dog = true,
    dog_name = da.dog_name,
    dog_breed_id = da.breed_id,
    dog_breed_freeform = da.breed_freeform,
    dog_size = da.size,
    dog_gender = da.gender,
    dog_date_of_birth = da.date_of_birth,
    dog_personality_desc = da.personality_desc
FROM dog_applications da
WHERE va.user_id = da.volunteer_id
  AND da.status IN ('draft', 'submitted', 'under_review', 'pending_assessment')
  AND va.status IN ('questionnaire_completed', 'submitted', 'under_review');

-- ============================================================
-- Step 4: Add comment to document the dog_applications table deprecation
-- ============================================================

COMMENT ON TABLE dog_applications IS 
    'DEPRECATED: New dog registrations should use volunteer_applications.dog_* fields. This table is maintained for historical data only. See migration 0041 for the inline dog application flow.';

-- ============================================================
-- Step 5: Create index for efficient lookups by dog breed
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_volunteer_applications_dog_breed_id 
    ON volunteer_applications(dog_breed_id) 
    WHERE dog_breed_id IS NOT NULL;

-- Also update dog_applications table reference if it exists (for consistency)
-- Note: dog_applications table still references dog_types, not dog_breeds

CREATE INDEX IF NOT EXISTS idx_volunteer_applications_has_dog 
    ON volunteer_applications(has_dog) 
    WHERE has_dog IS NOT NULL;
