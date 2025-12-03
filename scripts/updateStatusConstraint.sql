-- Update the status check constraint to include 'archived'
-- First, drop the existing constraint
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_status_check;

-- Add the new constraint with 'archived' included
ALTER TABLE users ADD CONSTRAINT users_status_check
  CHECK (status IN ('pending', 'approved', 'denied', 'archived'));

-- Verify the constraint was updated
SELECT con.conname, pg_get_constraintdef(con.oid)
FROM pg_constraint con
JOIN pg_class rel ON rel.oid = con.conrelid
WHERE rel.relname = 'users' AND con.conname = 'users_status_check';
