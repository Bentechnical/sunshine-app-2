-- Role Change Audit Log Table
-- This table tracks all changes to user roles for debugging and audit purposes

CREATE TABLE IF NOT EXISTS role_change_audit (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  old_role TEXT,
  new_role TEXT NOT NULL,
  source TEXT NOT NULL, -- 'clerk_webhook_created', 'clerk_webhook_updated', 'profile_complete_form', 'edit_profile_form', etc.
  changed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  metadata JSONB -- Store additional context like email, webhook event type, etc.
);

-- Index for fast lookups by user
CREATE INDEX IF NOT EXISTS idx_role_change_audit_user_id ON role_change_audit(user_id);

-- Index for fast lookups by timestamp
CREATE INDEX IF NOT EXISTS idx_role_change_audit_changed_at ON role_change_audit(changed_at DESC);

-- Add RLS policies
ALTER TABLE role_change_audit ENABLE ROW LEVEL SECURITY;

-- Only admins can read the audit log (use service role key)
CREATE POLICY "Only service role can read audit log"
  ON role_change_audit
  FOR SELECT
  USING (false); -- Regular users cannot read this table

-- Only service role can insert audit entries
CREATE POLICY "Only service role can insert audit entries"
  ON role_change_audit
  FOR INSERT
  WITH CHECK (false); -- Regular users cannot insert

-- Allow service role full access
CREATE POLICY "Service role has full access to audit log"
  ON role_change_audit
  FOR ALL
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE role_change_audit IS 'Audit log for tracking all user role changes. Used for debugging unexpected role changes.';
COMMENT ON COLUMN role_change_audit.source IS 'The source/trigger of the role change (e.g., clerk_webhook_created, profile_complete_form, etc.)';
COMMENT ON COLUMN role_change_audit.metadata IS 'Additional context about the change (email, event type, etc.)';