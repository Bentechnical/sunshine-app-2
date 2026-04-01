-- ============================================================
-- Dog Assessment Sessions & Slots
-- ============================================================

-- Add 'pending_assessment' to dog_application_status
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'dog_application_status' AND e.enumlabel = 'pending_assessment') THEN
        ALTER TYPE dog_application_status ADD VALUE 'pending_assessment' AFTER 'under_review';
    END IF;
END$$;

-- Assessment Sessions (Days/Locations where assessments happen)
CREATE TABLE assessment_sessions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date                DATE NOT NULL,
    location            TEXT NOT NULL,
    notes               TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Individual Time Slots within a session
CREATE TABLE assessment_slots (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id          UUID NOT NULL REFERENCES assessment_sessions(id) ON DELETE CASCADE,
    start_time          TIME NOT NULL,
    end_time            TIME NOT NULL,
    capacity            INT NOT NULL DEFAULT 1,
    is_roster_finalized BOOL NOT NULL DEFAULT false,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Link applications to specific slots
ALTER TABLE dog_applications ADD COLUMN selected_slot_id UUID REFERENCES assessment_slots(id) ON DELETE SET NULL;

CREATE INDEX dog_applications_slot_idx ON dog_applications (selected_slot_id);
CREATE INDEX assessment_slots_session_idx ON assessment_slots (session_id);
CREATE INDEX assessment_sessions_date_idx ON assessment_sessions (date);
