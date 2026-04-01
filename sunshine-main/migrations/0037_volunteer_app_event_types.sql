-- Add volunteer application event types to volunteer_event_type
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'volunteer_event_type' AND e.enumlabel = 'vol_application_started') THEN
        ALTER TYPE volunteer_event_type ADD VALUE 'vol_application_started';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'volunteer_event_type' AND e.enumlabel = 'vol_application_submitted') THEN
        ALTER TYPE volunteer_event_type ADD VALUE 'vol_application_submitted';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'volunteer_event_type' AND e.enumlabel = 'vol_application_under_review') THEN
        ALTER TYPE volunteer_event_type ADD VALUE 'vol_application_under_review';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'volunteer_event_type' AND e.enumlabel = 'vol_application_pending_vsc') THEN
        ALTER TYPE volunteer_event_type ADD VALUE 'vol_application_pending_vsc';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'volunteer_event_type' AND e.enumlabel = 'vol_application_pending_background') THEN
        ALTER TYPE volunteer_event_type ADD VALUE 'vol_application_pending_background';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'volunteer_event_type' AND e.enumlabel = 'vol_application_pending_assessment') THEN
        ALTER TYPE volunteer_event_type ADD VALUE 'vol_application_pending_assessment';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'volunteer_event_type' AND e.enumlabel = 'vol_application_assessment_scheduled') THEN
        ALTER TYPE volunteer_event_type ADD VALUE 'vol_application_assessment_scheduled';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'volunteer_event_type' AND e.enumlabel = 'vol_application_approved') THEN
        ALTER TYPE volunteer_event_type ADD VALUE 'vol_application_approved';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'volunteer_event_type' AND e.enumlabel = 'vol_application_rejected') THEN
        ALTER TYPE volunteer_event_type ADD VALUE 'vol_application_rejected';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'volunteer_event_type' AND e.enumlabel = 'vol_application_withdrawn') THEN
        ALTER TYPE volunteer_event_type ADD VALUE 'vol_application_withdrawn';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'volunteer_event_type' AND e.enumlabel = 'invite_link_created') THEN
        ALTER TYPE volunteer_event_type ADD VALUE 'invite_link_created';
    END IF;
END$$;
