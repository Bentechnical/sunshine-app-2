-- Add archived_at column to users table
-- The existing 'status' field (TEXT type) will be set to 'archived' when a user is archived
-- This timestamp tracks when the archiving occurred

ALTER TABLE users ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP WITH TIME ZONE NULL;

-- Add comment for documentation
COMMENT ON COLUMN users.archived_at IS 'Timestamp when user was archived. NULL means user is active. When archived, user.status is set to "archived".';

-- Note: The 'status' column already exists as TEXT type and accepts values:
-- 'pending', 'approved', 'denied', and now 'archived'

-- Verify the column was added
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'users' AND column_name = 'archived_at';
