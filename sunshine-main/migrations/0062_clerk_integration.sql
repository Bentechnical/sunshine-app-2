-- Add Clerk user ID for external auth linking
ALTER TABLE users ADD COLUMN IF NOT EXISTS clerk_id TEXT UNIQUE;
CREATE INDEX IF NOT EXISTS users_clerk_id_idx ON users(clerk_id) WHERE clerk_id IS NOT NULL;
