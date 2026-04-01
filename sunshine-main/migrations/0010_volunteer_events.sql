-- ============================================================
-- Volunteer Event Log (Audit Trail)
-- ============================================================

CREATE TYPE volunteer_event_type AS ENUM (
    'profile_created',           -- New volunteer profile created
    'profile_updated',           -- Profile fields changed
    'profile_deactivated',       -- Account deactivated
    'profile_reactivated',       -- Account reactivated
    'dog_added',                 -- New dog registered
    'dog_updated',               -- Dog info changed
    'dog_deactivated',           -- Dog retired
    'dog_reactivated',           -- Dog reactivated
    'shift_joined',              -- Volunteered for shift
    'shift_confirmed',           -- Waitlist -> confirmed
    'shift_cancelled',           -- Cancelled participation
    'waitlist_joined',           -- Added to waitlist
    'waitlist_promoted',         -- Promoted from waitlist
    'waitlist_declined',         -- Declined promotion
    'contacted_by_admin',        -- Admin reached out
    'feedback_submitted',        -- Volunteer submitted survey
    'feedback_received',         -- Peer note about volunteer
    'note_added'                 -- Admin note added
);

CREATE TABLE volunteer_events (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    event_type      volunteer_event_type NOT NULL,
    
    -- Related entities (nullable depending on event type)
    shift_id        UUID REFERENCES shifts(id) ON DELETE SET NULL,
    dog_id          UUID REFERENCES dogs(id) ON DELETE SET NULL,
    related_user_id UUID REFERENCES users(id) ON DELETE SET NULL, -- for feedback_received
    
    -- Context data as JSONB for flexibility
    metadata        JSONB NOT NULL DEFAULT '{}',
    
    -- Who triggered this event (NULL for system-generated)
    created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX volunteer_events_user_id_idx ON volunteer_events (user_id, created_at DESC);
CREATE INDEX volunteer_events_type_idx ON volunteer_events (event_type);
CREATE INDEX volunteer_events_shift_id_idx ON volunteer_events (shift_id);
CREATE INDEX volunteer_events_created_at_idx ON volunteer_events (created_at DESC);

-- Comments explaining metadata structure per event type
COMMENT ON TABLE volunteer_events IS 'Audit trail for all volunteer-related activities. 
Metadata structure by type:
- profile_updated: {changed_fields: ["bio", "volunteer_names"]}
- dog_added/dog_updated: {dog_name: "Buddy", changed_fields: [...]}
- shift_joined/shift_confirmed/shift_cancelled: {shift_title: "...", agency_name: "..."}
- feedback_submitted: {shift_id: "...", rating: 5}
- feedback_received: {from_volunteer_id: "...", note_preview: "..."}
- contacted_by_admin: {method: "email", subject: "..."}';
