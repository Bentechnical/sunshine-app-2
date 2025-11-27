-- Create table to track pending email notifications for unread messages
CREATE TABLE IF NOT EXISTS pending_email_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  appointment_id INTEGER NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  stream_message_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  scheduled_for TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'canceled')),
  sent_at TIMESTAMP WITH TIME ZONE,
  UNIQUE(user_id, stream_message_id)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_pending_notifications_scheduled
  ON pending_email_notifications(scheduled_for)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_pending_notifications_user_id
  ON pending_email_notifications(user_id);

CREATE INDEX IF NOT EXISTS idx_pending_notifications_status
  ON pending_email_notifications(status);

CREATE INDEX IF NOT EXISTS idx_pending_notifications_appointment_id
  ON pending_email_notifications(appointment_id);

-- Add RLS policies for pending_email_notifications
ALTER TABLE pending_email_notifications ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view their own pending notifications" ON pending_email_notifications;
DROP POLICY IF EXISTS "Service role can access pending_email_notifications" ON pending_email_notifications;

-- Users can view their own pending notifications
CREATE POLICY "Users can view their own pending notifications" ON pending_email_notifications
  FOR SELECT USING (user_id = auth.uid()::text);

-- Service role has full access (needed for webhook and cron job)
CREATE POLICY "Service role can access pending_email_notifications" ON pending_email_notifications
  FOR ALL USING (auth.role() = 'service_role');
