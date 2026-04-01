-- Add dog application event types to volunteer_event_type
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'volunteer_event_type' AND e.enumlabel = 'dog_application_submitted') THEN
        ALTER TYPE volunteer_event_type ADD VALUE 'dog_application_submitted';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'volunteer_event_type' AND e.enumlabel = 'dog_application_under_review') THEN
        ALTER TYPE volunteer_event_type ADD VALUE 'dog_application_under_review';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'volunteer_event_type' AND e.enumlabel = 'pending_assessment') THEN
        ALTER TYPE volunteer_event_type ADD VALUE 'pending_assessment';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'volunteer_event_type' AND e.enumlabel = 'dog_application_assessment_scheduled') THEN
        ALTER TYPE volunteer_event_type ADD VALUE 'dog_application_assessment_scheduled';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'volunteer_event_type' AND e.enumlabel = 'dog_application_assessment_completed') THEN
        ALTER TYPE volunteer_event_type ADD VALUE 'dog_application_assessment_completed';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'volunteer_event_type' AND e.enumlabel = 'dog_application_approved') THEN
        ALTER TYPE volunteer_event_type ADD VALUE 'dog_application_approved';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'volunteer_event_type' AND e.enumlabel = 'dog_application_rejected') THEN
        ALTER TYPE volunteer_event_type ADD VALUE 'dog_application_rejected';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'volunteer_event_type' AND e.enumlabel = 'dog_application_withdrawn') THEN
        ALTER TYPE volunteer_event_type ADD VALUE 'dog_application_withdrawn';
    END IF;
END$$;
