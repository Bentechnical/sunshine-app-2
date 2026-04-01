-- Message center: allow volunteers to archive notifications
ALTER TABLE notifications ADD COLUMN archived_at TIMESTAMPTZ;

CREATE INDEX notifications_inbox_idx
    ON notifications (user_id, created_at DESC)
    WHERE archived_at IS NULL;
