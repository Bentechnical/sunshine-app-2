-- Allow admins to dismiss a shift from the feedback collection queue
ALTER TABLE shifts ADD COLUMN feedback_dismissed_at TIMESTAMPTZ;
