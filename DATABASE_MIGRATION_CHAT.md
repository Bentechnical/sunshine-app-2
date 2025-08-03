# Stream Chat Integration - Database Migration Guide

This guide provides the SQL commands needed to set up the database schema for the Stream Chat integration.

## Required Environment Variables

Add these to your `.env.local` file:

```bash
# Stream Chat Configuration
STREAM_CHAT_API_KEY=your_stream_chat_api_key_here
STREAM_CHAT_SECRET=your_stream_chat_secret_here

# Cron Job Security (for auto-closing chats)
CRON_SECRET=your_random_secret_here
```

## Database Tables

### 1. Create appointment_chats table

```sql
CREATE TABLE appointment_chats (
  id SERIAL PRIMARY KEY,
  appointment_id INTEGER NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  stream_channel_id TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  closed_at TIMESTAMP WITH TIME ZONE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed')),
  created_by TEXT NOT NULL DEFAULT 'system'
);

-- Add index for performance
CREATE INDEX idx_appointment_chats_appointment_id ON appointment_chats(appointment_id);
CREATE INDEX idx_appointment_chats_status ON appointment_chats(status);
CREATE INDEX idx_appointment_chats_stream_channel_id ON appointment_chats(stream_channel_id);
```

### 2. Create chat_logs table

```sql
CREATE TABLE chat_logs (
  id SERIAL PRIMARY KEY,
  appointment_id INTEGER NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  stream_message_id TEXT NOT NULL,
  sender_id TEXT NOT NULL,
  content TEXT NOT NULL,
  message_type TEXT NOT NULL DEFAULT 'text' CHECK (message_type IN ('text', 'system', 'bot')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  is_system_message BOOLEAN DEFAULT FALSE
);

-- Add indexes for performance
CREATE INDEX idx_chat_logs_appointment_id ON chat_logs(appointment_id);
CREATE INDEX idx_chat_logs_stream_message_id ON chat_logs(stream_message_id);
CREATE INDEX idx_chat_logs_sender_id ON chat_logs(sender_id);
CREATE INDEX idx_chat_logs_created_at ON chat_logs(created_at);
```

## Row Level Security (RLS) Policies

### 1. appointment_chats RLS

```sql
-- Enable RLS
ALTER TABLE appointment_chats ENABLE ROW LEVEL SECURITY;

-- Users can view their own appointment chats
CREATE POLICY "Users can view their own appointment chats" ON appointment_chats
  FOR SELECT USING (
    appointment_id IN (
      SELECT id FROM appointments 
      WHERE individual_id = auth.uid()::text OR volunteer_id = auth.uid()::text
    )
  );

-- System can manage all chats
CREATE POLICY "System can manage all appointment chats" ON appointment_chats
  FOR ALL USING (created_by = 'system');

-- Service role has full access
CREATE POLICY "Service role has full access to appointment chats" ON appointment_chats
  FOR ALL USING (auth.role() = 'service_role');
```

### 2. chat_logs RLS

```sql
-- Enable RLS
ALTER TABLE chat_logs ENABLE ROW LEVEL SECURITY;

-- Users can view logs for their own appointments
CREATE POLICY "Users can view chat logs for their own appointments" ON chat_logs
  FOR SELECT USING (
    appointment_id IN (
      SELECT id FROM appointments 
      WHERE individual_id = auth.uid()::text OR volunteer_id = auth.uid()::text
    )
  );

-- System can manage all logs
CREATE POLICY "System can manage all chat logs" ON chat_logs
  FOR ALL USING (is_system_message = true);

-- Service role has full access
CREATE POLICY "Service role has full access to chat logs" ON chat_logs
  FOR ALL USING (auth.role() = 'service_role');
```

## Verification

After running these commands, you should see:

1. Two new tables: `appointment_chats` and `chat_logs`
2. RLS policies enabled on both tables
3. Indexes created for performance

You can verify by running:
```sql
-- Check tables exist
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' AND table_name IN ('appointment_chats', 'chat_logs');

-- Check RLS is enabled
SELECT schemaname, tablename, rowsecurity 
FROM pg_tables 
WHERE tablename IN ('appointment_chats', 'chat_logs');
```

## Chat Status Logic

### Chat Closure Rules
- **Automatic closure**: 6 hours after appointment **end time** (not start time)
- **Manual closure**: When appointments are canceled
- **Cron job**: Runs daily at 2:00 AM UTC to close expired chats

### Status Values
- **`active`**: Chat is currently available for messaging
- **`closed`**: Chat has been closed and is no longer available

### Important Notes
- **Critical Fix Applied**: The `closeExpiredChats.ts` function was fixed to check `appointments.end_time` instead of `appointments.start_time`
- **Consistency**: Admin view shows all chats, user view shows only future appointments with active chats
- **Cron Configuration**: Properly configured in `vercel.json` with daily execution
``` 