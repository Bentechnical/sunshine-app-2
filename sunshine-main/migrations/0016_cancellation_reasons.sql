-- ============================================================
-- Cancellation Reasons & Enhanced Admin Notifications
-- ============================================================

-- Add cancellation reason fields to shift_assignments
ALTER TABLE shift_assignments 
    ADD COLUMN IF NOT EXISTS cancellation_reason TEXT,
    ADD COLUMN IF NOT EXISTS cancellation_note TEXT,
    ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;

-- Create index for cancellation queries
CREATE INDEX IF NOT EXISTS shift_assignments_cancelled_at_idx 
    ON shift_assignments (cancelled_at) 
    WHERE cancelled_at IS NOT NULL;

-- ============================================================
-- Admin Notifications for Cancellations
-- ============================================================

-- Add new notification type for admin vacancy invites
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'vacancy_invite';

-- Add vacancy tracking table (for admin to fill cancelled spots)
CREATE TABLE IF NOT EXISTS shift_vacancies (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shift_id                UUID NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
    -- The cancelled assignment that created this vacancy
    source_assignment_id    UUID REFERENCES shift_assignments(id) ON DELETE SET NULL,
    -- Who cancelled (for tracking)
    cancelled_by_volunteer_id UUID REFERENCES users(id) ON DELETE SET NULL,
    cancellation_reason     TEXT,
    cancellation_note       TEXT,
    -- Status: open, inviting, filled, expired
    status                  VARCHAR(20) NOT NULL DEFAULT 'open',
    -- When admin invited someone specific
    invited_volunteer_id    UUID REFERENCES users(id) ON DELETE SET NULL,
    invited_at              TIMESTAMPTZ,
    -- When vacancy was filled or closed
    filled_at               TIMESTAMPTZ,
    filled_by_assignment_id UUID REFERENCES shift_assignments(id) ON DELETE SET NULL,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS shift_vacancies_shift_id_idx ON shift_vacancies (shift_id);
CREATE INDEX IF NOT EXISTS shift_vacancies_status_idx ON shift_vacancies (status) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS shift_vacancies_invited_volunteer_id_idx ON shift_vacancies (invited_volunteer_id) WHERE invited_volunteer_id IS NOT NULL;

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_shift_vacancies_updated_at ON shift_vacancies;
CREATE TRIGGER update_shift_vacancies_updated_at
    BEFORE UPDATE ON shift_vacancies
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
