-- Add dog_retired to volunteer_event_type enum
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'volunteer_event_type' AND e.enumlabel = 'dog_retired') THEN
        ALTER TYPE volunteer_event_type ADD VALUE 'dog_retired';
    END IF;
END
$$;
