-- ============================================================
-- Volunteer Application Pipeline & Invitation Links
-- ============================================================

-- Volunteer application status machine
CREATE TYPE volunteer_application_status AS ENUM (
    'started',                    -- Email entered, account created
    'personal_info_completed',    -- Step 1 done
    'questionnaire_completed',    -- Step 2 done
    'submitted',                  -- Applicant submitted for review
    'under_review',               -- Admin reviewing
    'pending_vsc',                -- Waiting for Vulnerable Sector Check
    'pending_background_check',   -- Waiting for background check
    'pending_assessment',         -- Ready for in-person assessment
    'assessment_scheduled',       -- Assessment booked
    'approved',                   -- Fully approved
    'rejected',                   -- Rejected with reason
    'withdrawn'                   -- Applicant withdrew
);

-- ============================================================
-- Invitation Links (admin-created)
-- ============================================================

CREATE TABLE volunteer_invite_links (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug                    TEXT UNIQUE,
    label                   TEXT NOT NULL,
    source_tag              TEXT,
    -- Auto-greenlighting flags
    auto_approve_vsc        BOOL NOT NULL DEFAULT false,
    auto_approve_background BOOL NOT NULL DEFAULT false,
    auto_approve_dog_health BOOL NOT NULL DEFAULT false,
    -- Visibility flags for each auto-approval
    vsc_flag_visible        BOOL NOT NULL DEFAULT false,
    background_flag_visible BOOL NOT NULL DEFAULT false,
    dog_health_flag_visible BOOL NOT NULL DEFAULT false,
    -- Constraints
    expires_at              TIMESTAMPTZ,
    max_uses                INT,
    use_count               INT NOT NULL DEFAULT 0,
    is_active               BOOL NOT NULL DEFAULT true,
    created_by              UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX volunteer_invite_links_slug_idx ON volunteer_invite_links (slug) WHERE slug IS NOT NULL;
CREATE INDEX volunteer_invite_links_active_idx ON volunteer_invite_links (is_active, expires_at);

COMMENT ON TABLE volunteer_invite_links IS
    'Admin-created invitation links with optional slugs, source tagging,
     auto-greenlighting flags, expiry, and use count tracking.';

-- ============================================================
-- Volunteer Applications
-- ============================================================

CREATE TABLE volunteer_applications (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                 UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    invite_link_id          UUID REFERENCES volunteer_invite_links(id) ON DELETE SET NULL,

    -- Step 1: Personal Info
    full_name               TEXT,
    phone                   TEXT,
    city                    TEXT,
    postal_code             TEXT,

    -- Step 2: Questionnaire
    motivation              TEXT,
    experience              TEXT,
    availability            TEXT,
    has_dog                 BOOL,
    dog_breed_freeform      TEXT,

    -- Step 3: Agreements
    agreed_code_of_conduct  BOOL NOT NULL DEFAULT false,
    agreed_photo_release    BOOL NOT NULL DEFAULT false,
    agreed_liability_waiver BOOL NOT NULL DEFAULT false,
    agreements_signed_at    TIMESTAMPTZ,

    -- Status machine
    status                  volunteer_application_status NOT NULL DEFAULT 'started',
    status_changed_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    status_changed_by       UUID REFERENCES users(id) ON DELETE SET NULL,

    -- Admin review
    reviewed_at             TIMESTAMPTZ,
    reviewed_by             UUID REFERENCES users(id) ON DELETE SET NULL,
    review_notes            TEXT,
    rejection_reason        TEXT,

    -- Flag overrides (copied from invite link or set manually by admin)
    vsc_waived              BOOL NOT NULL DEFAULT false,
    background_check_waived BOOL NOT NULL DEFAULT false,
    dog_health_check_waived BOOL NOT NULL DEFAULT false,
    vsc_waived_visible          BOOL NOT NULL DEFAULT false,
    background_waived_visible   BOOL NOT NULL DEFAULT false,
    dog_health_waived_visible   BOOL NOT NULL DEFAULT false,

    -- Assessment link (reuses existing assessment_slots)
    selected_slot_id        UUID REFERENCES assessment_slots(id) ON DELETE SET NULL,

    -- Timestamps
    submitted_at            TIMESTAMPTZ,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX volunteer_applications_user_id_idx ON volunteer_applications (user_id);
CREATE INDEX volunteer_applications_status_idx ON volunteer_applications (status);
CREATE INDEX volunteer_applications_created_at_idx ON volunteer_applications (created_at DESC);
CREATE INDEX volunteer_applications_invite_link_idx ON volunteer_applications (invite_link_id);

-- Prevent duplicate active applications per user
CREATE UNIQUE INDEX volunteer_applications_one_active_per_user
    ON volunteer_applications (user_id)
    WHERE status NOT IN ('approved', 'rejected', 'withdrawn');

COMMENT ON TABLE volunteer_applications IS
    'Multi-step application pipeline for new volunteer onboarding.
     Status machine: started → personal_info_completed → questionnaire_completed
     → submitted → under_review → pending_vsc → pending_background_check
     → pending_assessment → assessment_scheduled → approved | rejected | withdrawn';

-- ============================================================
-- Trigger: auto-update status_changed_at on status transitions
-- ============================================================

CREATE OR REPLACE FUNCTION update_vol_application_status_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
        NEW.status_changed_at = now();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER volunteer_application_status_change
    BEFORE UPDATE ON volunteer_applications
    FOR EACH ROW
    EXECUTE FUNCTION update_vol_application_status_timestamp();

-- ============================================================
-- Convenience view for pending applications
-- ============================================================

CREATE VIEW pending_volunteer_applications AS
SELECT
    va.*,
    u.email AS applicant_email,
    vil.label AS invite_link_label,
    vil.source_tag
FROM volunteer_applications va
JOIN users u ON u.id = va.user_id
LEFT JOIN volunteer_invite_links vil ON vil.id = va.invite_link_id
WHERE va.status IN (
    'submitted', 'under_review', 'pending_vsc',
    'pending_background_check', 'pending_assessment', 'assessment_scheduled'
)
ORDER BY va.submitted_at ASC NULLS LAST;
