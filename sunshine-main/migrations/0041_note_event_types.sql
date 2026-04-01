-- Add new event types for note editing
-- These extend the volunteer_event_type enum

-- Note: In PostgreSQL, we need to add enum values
-- The application code expects these values to exist

ALTER TYPE volunteer_event_type ADD VALUE IF NOT EXISTS 'note_edited';
ALTER TYPE volunteer_event_type ADD VALUE IF NOT EXISTS 'note_deleted';
