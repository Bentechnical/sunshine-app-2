-- Add shift-specific event types to volunteer_event_type
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'volunteer_event_type' AND e.enumlabel = 'shift_created') THEN
        ALTER TYPE volunteer_event_type ADD VALUE 'shift_created';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'volunteer_event_type' AND e.enumlabel = 'shift_updated') THEN
        ALTER TYPE volunteer_event_type ADD VALUE 'shift_updated';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'volunteer_event_type' AND e.enumlabel = 'shift_published') THEN
        ALTER TYPE volunteer_event_type ADD VALUE 'shift_published';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'volunteer_event_type' AND e.enumlabel = 'shift_archived') THEN
        ALTER TYPE volunteer_event_type ADD VALUE 'shift_archived';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'volunteer_event_type' AND e.enumlabel = 'contact_added') THEN
        ALTER TYPE volunteer_event_type ADD VALUE 'contact_added';
    END IF;
END$$;
