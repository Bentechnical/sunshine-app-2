-- Note versioning for volunteer applications and other entities
-- Tracks history of notes with who changed them and when

CREATE TABLE note_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type TEXT NOT NULL, -- 'volunteer_application', 'dog_application', 'user', etc.
    entity_id UUID NOT NULL,   -- the ID of the entity the note belongs to
    field_name TEXT NOT NULL,  -- 'review_notes', 'admin_notes', etc.
    content TEXT,              -- the note content (NULL if deleted)
    previous_version_id UUID REFERENCES note_versions(id),
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX note_versions_entity_idx ON note_versions (entity_type, entity_id, created_at DESC);
CREATE INDEX note_versions_created_by_idx ON note_versions (created_by);

COMMENT ON TABLE note_versions IS 'Version history for notes and comments on various entities';

-- Add event types for note editing
-- Note: Added to volunteer_event_type enum via application code

-- View to get latest note version for each entity/field
CREATE VIEW latest_note_versions AS
SELECT DISTINCT ON (entity_type, entity_id, field_name)
    id,
    entity_type,
    entity_id,
    field_name,
    content,
    created_by,
    created_at
FROM note_versions
ORDER BY entity_type, entity_id, field_name, created_at DESC;
