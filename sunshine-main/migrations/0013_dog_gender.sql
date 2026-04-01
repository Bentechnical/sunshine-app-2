-- ============================================================
-- Add gender field to dogs and dog_applications tables
-- ============================================================

CREATE TYPE dog_gender AS ENUM ('male', 'female');

ALTER TABLE dogs ADD COLUMN gender dog_gender;

ALTER TABLE dog_applications ADD COLUMN gender dog_gender;

COMMENT ON COLUMN dogs.gender IS 'Dog gender for therapy dog identification';
COMMENT ON COLUMN dog_applications.gender IS 'Dog gender for therapy dog identification';
