-- ============================================================
-- Notifications
-- ============================================================

CREATE TYPE notification_type AS ENUM (
    'booking_confirmed',
    'booking_cancelled',
    'shift_updated',
    'waitlist_promoted',
    'waitlist_promote_declined',  -- volunteer declined promotion
    'survey_prompt',
    'admin_message',
    'agency_message',             -- admin relayed a message from agency to volunteers
    'system'
);

CREATE TYPE delivery_channel AS ENUM ('email', 'sms', 'push');
CREATE TYPE delivery_status AS ENUM ('queued', 'sent', 'failed', 'skipped');

CREATE TABLE notifications (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type            notification_type NOT NULL,
    title           TEXT NOT NULL,
    body            TEXT NOT NULL,
    -- Arbitrary contextual data (shift_id, assignment_id, etc.)
    payload         JSONB NOT NULL DEFAULT '{}',
    -- NULL = unread
    read_at         TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX notifications_user_id_idx ON notifications (user_id);
CREATE INDEX notifications_read_at_idx ON notifications (read_at)
    WHERE read_at IS NULL;
CREATE INDEX notifications_created_at_idx ON notifications (created_at DESC);

-- ─── Delivery Records ─────────────────────────────────────────

CREATE TABLE notification_deliveries (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    notification_id     UUID NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
    channel             delivery_channel NOT NULL,
    status              delivery_status NOT NULL DEFAULT 'queued',
    -- Provider message ID (Brevo message ID, Twilio SID, etc.)
    provider_message_id TEXT,
    error_message       TEXT,
    queued_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    sent_at             TIMESTAMPTZ
);

CREATE INDEX notification_deliveries_notification_id_idx
    ON notification_deliveries (notification_id);
CREATE INDEX notification_deliveries_status_idx
    ON notification_deliveries (status)
    WHERE status = 'queued';

-- ─── System Settings ─────────────────────────────────────────

CREATE TABLE system_settings (
    key         TEXT PRIMARY KEY,
    value       TEXT NOT NULL,
    description TEXT,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by  UUID REFERENCES users(id) ON DELETE SET NULL
);

INSERT INTO system_settings (key, value, description) VALUES
    ('post_shift_trigger_hours',    '2',  'Hours after shift ends before volunteer survey prompt is sent'),
    ('agency_survey_trigger_hours', '24', 'Hours after shift ends before agency survey prompt is sent'),
    ('survey_window_days',          '7',  'Days after shift that surveys can still be submitted'),
    ('confirmation_window_hours',   '48', 'Hours a waitlisted volunteer has to accept/decline promotion');
