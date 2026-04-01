-- ============================================================
-- Shifts (core booking entity)
-- ============================================================

CREATE TYPE shift_state AS ENUM (
    'draft',
    'pending_approval',  -- agency-created, awaiting admin review
    'published',
    'invite_only',
    'hidden',            -- invisible to volunteers but assignees still see it
    'archived'
);

CREATE TYPE assignment_status AS ENUM (
    'confirmed',
    'waitlisted',
    'pending_confirmation',  -- promoted from waitlist, awaiting volunteer accept
    'cancelled'
);

CREATE TABLE shifts (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agency_id               UUID NOT NULL REFERENCES agencies(id) ON DELETE RESTRICT,
    site_id                 UUID NOT NULL REFERENCES sites(id) ON DELETE RESTRICT,
    contact_id              UUID REFERENCES contacts(id) ON DELETE SET NULL,

    title                   TEXT NOT NULL,
    description             TEXT,
    specific_requests       TEXT,
    parking_notes           TEXT,
    meeting_notes           TEXT,

    start_at                TIMESTAMPTZ NOT NULL,
    end_at                  TIMESTAMPTZ NOT NULL,
    -- Number of dog/handler slots available
    slots_requested         INT NOT NULL DEFAULT 1,
    -- Estimated number of clients (for stats)
    estimated_clients       INT,

    state                   shift_state NOT NULL DEFAULT 'draft',

    -- Compliance requirements
    requires_police_check       BOOL NOT NULL DEFAULT false,
    requires_vulnerable_check   BOOL NOT NULL DEFAULT false,

    -- Recurrence
    -- RRULE string (RFC 5545) stored on the parent shift only
    recurrence_rule         TEXT,
    recurrence_parent_id    UUID REFERENCES shifts(id) ON DELETE SET NULL,
    recurrence_seq          INT,
    -- The shift this one inherited its description from (for "pre-fill" banner)
    inherited_from_shift_id UUID REFERENCES shifts(id) ON DELETE SET NULL,

    -- Post-shift survey tracking
    volunteer_survey_sent_at    TIMESTAMPTZ,
    agency_survey_sent_at       TIMESTAMPTZ,

    created_by              UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    updated_by              UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT shift_end_after_start CHECK (end_at > start_at),
    CONSTRAINT shift_slots_positive CHECK (slots_requested > 0)
);

CREATE INDEX shifts_agency_id_idx ON shifts (agency_id);
CREATE INDEX shifts_site_id_idx ON shifts (site_id);
CREATE INDEX shifts_start_at_idx ON shifts (start_at);
CREATE INDEX shifts_state_idx ON shifts (state);
CREATE INDEX shifts_recurrence_parent_idx ON shifts (recurrence_parent_id);

-- ─── Shift Invites ───────────────────────────────────────────

CREATE TABLE shift_invites (
    shift_id        UUID NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
    volunteer_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    invited_by      UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    invited_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (shift_id, volunteer_id)
);

-- ─── Shift Assignments ───────────────────────────────────────

CREATE TABLE shift_assignments (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shift_id                UUID NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
    volunteer_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    -- Which of the volunteer's dogs are attending this shift
    dog_ids                 UUID[] NOT NULL DEFAULT '{}',
    status                  assignment_status NOT NULL DEFAULT 'confirmed',
    waitlist_position       INT,
    -- For pending_confirmation: window to accept/decline
    confirmation_deadline_at TIMESTAMPTZ,
    confirmation_token      TEXT UNIQUE,  -- JWT token in accept/decline email links
    assigned_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE (shift_id, volunteer_id)
);

CREATE INDEX shift_assignments_shift_id_idx ON shift_assignments (shift_id);
CREATE INDEX shift_assignments_volunteer_id_idx ON shift_assignments (volunteer_id);
CREATE INDEX shift_assignments_status_idx ON shift_assignments (status);

-- ─── Shift View Hashes (change detection) ────────────────────
-- When a volunteer views shift details, we store a hash of the
-- mutable content fields. On next visit, if the hash differs,
-- we highlight the changed sections.

CREATE TABLE shift_view_hashes (
    shift_id        UUID NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content_hash    TEXT NOT NULL,
    last_viewed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (shift_id, user_id)
);

-- ─── Admin Alerts ────────────────────────────────────────────

CREATE TYPE admin_alert_type AS ENUM (
    'waitlist_promote',   -- volunteer self-cancelled; waitlist available
    'shift_pending_approval',  -- agency submitted a shift for review
    'assignment_unconfirmed'   -- pending_confirmation deadline approaching
);

CREATE TABLE admin_alerts (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    alert_type              admin_alert_type NOT NULL,
    shift_id                UUID REFERENCES shifts(id) ON DELETE CASCADE,
    -- The assignment that triggered this (e.g. the cancelled slot)
    source_assignment_id    UUID REFERENCES shift_assignments(id) ON DELETE SET NULL,
    resolved_at             TIMESTAMPTZ,
    resolved_by             UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX admin_alerts_resolved_at_idx ON admin_alerts (resolved_at)
    WHERE resolved_at IS NULL;
CREATE INDEX admin_alerts_shift_id_idx ON admin_alerts (shift_id);
