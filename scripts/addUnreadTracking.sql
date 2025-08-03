-- Create table to track which messages each user has read
CREATE TABLE IF NOT EXISTS message_read_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  appointment_id INTEGER NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  last_read_message_id TEXT,
  last_read_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, appointment_id)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_message_read_status_user_id ON message_read_status(user_id);
CREATE INDEX IF NOT EXISTS idx_message_read_status_appointment_id ON message_read_status(appointment_id);
CREATE INDEX IF NOT EXISTS idx_message_read_status_last_read_at ON message_read_status(last_read_at);

-- Add RLS policies for message_read_status
ALTER TABLE message_read_status ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view their own read status" ON message_read_status;
DROP POLICY IF EXISTS "Users can update their own read status" ON message_read_status;
DROP POLICY IF EXISTS "Users can insert their own read status" ON message_read_status;
DROP POLICY IF EXISTS "Service role can access message_read_status" ON message_read_status;

-- Users can view their own read status
CREATE POLICY "Users can view their own read status" ON message_read_status
  FOR SELECT USING (user_id = auth.uid()::text);

-- Users can update their own read status
CREATE POLICY "Users can update their own read status" ON message_read_status
  FOR UPDATE USING (user_id = auth.uid()::text);

-- Users can insert their own read status
CREATE POLICY "Users can insert their own read status" ON message_read_status
  FOR INSERT WITH CHECK (user_id = auth.uid()::text);

-- Service role can access all read status
CREATE POLICY "Service role can access message_read_status" ON message_read_status
  FOR ALL USING (auth.role() = 'service_role');

-- Initialize read status for existing appointments
INSERT INTO message_read_status (user_id, appointment_id, last_read_at)
SELECT DISTINCT 
  CASE 
    WHEN a.individual_id IS NOT NULL THEN a.individual_id::text
    WHEN a.volunteer_id IS NOT NULL THEN a.volunteer_id::text
  END as user_id,
  a.id as appointment_id,
  NOW() as last_read_at
FROM appointments a
WHERE a.status = 'confirmed'
  AND EXISTS (SELECT 1 FROM appointment_chats ac WHERE ac.appointment_id = a.id)
ON CONFLICT (user_id, appointment_id) DO NOTHING; 