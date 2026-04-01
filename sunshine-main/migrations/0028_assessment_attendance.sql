-- ============================================================
-- Assessment Attendance & Admin Notes
-- ============================================================

-- Add attendance tracking and admin-only notes to dog_applications
CREATE TYPE assessment_attendance_status AS ENUM ('pending', 'attended', 'no_show');

ALTER TABLE dog_applications 
ADD COLUMN assessment_attendance assessment_attendance_status NOT NULL DEFAULT 'pending',
ADD COLUMN assessment_admin_notes TEXT;

-- Add assessment_no_show to volunteer_event_type
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'volunteer_event_type' AND e.enumlabel = 'assessment_no_show') THEN
        ALTER TYPE volunteer_event_type ADD VALUE 'assessment_no_show';
    END IF;
END$$;
