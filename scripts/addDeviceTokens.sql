-- Create device_tokens table for FCM push notification token storage
-- Stores one token per device installation, upserted on each app launch

CREATE TABLE IF NOT EXISTS device_tokens (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,           -- Client-generated installation ID (persists across sessions)
  push_token TEXT NOT NULL,          -- FCM registration token (can rotate)
  platform TEXT NOT NULL CHECK (platform IN ('ios', 'android')),
  environment TEXT NOT NULL DEFAULT 'production' CHECK (environment IN ('development', 'production')),
  notifications_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_seen_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE (user_id, device_id)        -- One row per device per user; upsert updates token + last_seen
);

-- Index for fast lookup when sending notifications to a user
CREATE INDEX IF NOT EXISTS device_tokens_user_id_idx ON device_tokens (user_id);

-- RLS: enabled with no user-facing policies
-- All access goes through server API routes using the service role key, which bypasses RLS
-- This blocks any direct client-side access to token data
ALTER TABLE device_tokens ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE device_tokens IS 'FCM push notification tokens per device. Upserted on app launch. Service role reads all rows to send push notifications.';
