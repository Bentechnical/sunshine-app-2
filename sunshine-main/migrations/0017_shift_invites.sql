-- Add shift_invite and vacancy_invite to notification_type
-- Note: vacancy_invite might already be in use but we should ensure both are present in the enum.
-- Since PostgreSQL doesn't support IF NOT EXISTS for ADD VALUE, we use a DO block.

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'notification_type' AND e.enumlabel = 'shift_invite') THEN
        ALTER TYPE notification_type ADD VALUE 'shift_invite';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'notification_type' AND e.enumlabel = 'vacancy_invite') THEN
        ALTER TYPE notification_type ADD VALUE 'vacancy_invite';
    END IF;
END$$;

-- Add shift_invited to volunteer_event_type
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'volunteer_event_type' AND e.enumlabel = 'shift_invited') THEN
        ALTER TYPE volunteer_event_type ADD VALUE 'shift_invited';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'volunteer_event_type' AND e.enumlabel = 'shift_invite_accepted') THEN
        ALTER TYPE volunteer_event_type ADD VALUE 'shift_invite_accepted';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'volunteer_event_type' AND e.enumlabel = 'shift_invite_declined') THEN
        ALTER TYPE volunteer_event_type ADD VALUE 'shift_invite_declined';
    END IF;
END$$;
