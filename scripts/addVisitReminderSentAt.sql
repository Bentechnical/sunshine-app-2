-- Add reminder_sent_at column to visit_registrations
-- Used by the visit-reminders cron to track which volunteers have been sent
-- a 48-hour reminder email, preventing duplicate sends.

ALTER TABLE visit_registrations
ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ DEFAULT NULL;
