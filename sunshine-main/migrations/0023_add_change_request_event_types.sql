-- Add shift change request event types to volunteer_event_type
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'volunteer_event_type' AND e.enumlabel = 'shift_change_requested') THEN
        ALTER TYPE volunteer_event_type ADD VALUE 'shift_change_requested';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'volunteer_event_type' AND e.enumlabel = 'shift_change_approved') THEN
        ALTER TYPE volunteer_event_type ADD VALUE 'shift_change_approved';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'volunteer_event_type' AND e.enumlabel = 'shift_change_rejected') THEN
        ALTER TYPE volunteer_event_type ADD VALUE 'shift_change_rejected';
    END IF;
END$$;
