-- ============================================================
-- Dog Registration Applications & Approval Workflow
-- ============================================================

-- Application status enum
CREATE TYPE dog_application_status AS ENUM (
    'draft',                    -- Application being filled out
    'submitted',                -- Submitted, awaiting admin review
    'under_review',             -- Admin is reviewing
    'assessment_scheduled',     -- Assessment appointment scheduled
    'assessment_completed',     -- Assessment done, awaiting decision
    'approved',                 -- Approved - dog can attend shifts
    'rejected',                 -- Rejected - reason provided
    'withdrawn'                 -- Volunteer withdrew application
);

-- Template rejection/response reasons for admins
CREATE TABLE dog_application_response_templates (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category        TEXT NOT NULL,  -- 'rejection', 'approval', 'assessment', 'general'
    label           TEXT NOT NULL,  -- Display label
    body            TEXT NOT NULL,  -- Template text
    is_active       BOOL NOT NULL DEFAULT true,
    sort_order      INT NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Dog applications table
CREATE TABLE dog_applications (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    volunteer_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Dog Information (copied/linked from dogs table)
    dog_id                  UUID REFERENCES dogs(id) ON DELETE SET NULL, -- Linked once approved
    dog_name                TEXT NOT NULL,
    breed_id                UUID REFERENCES dog_types(id) ON DELETE SET NULL,
    breed_freeform          TEXT,
    size                    dog_size NOT NULL,
    age_years               NUMERIC(3,1),
    personality_desc        TEXT,
    
    -- Application Status
    status                  dog_application_status NOT NULL DEFAULT 'draft',
    status_changed_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    status_changed_by       UUID REFERENCES users(id) ON DELETE SET NULL,
    
    -- Assessment Scheduling
    assessment_date         DATE,
    assessment_time         TIME,
    assessment_location     TEXT,
    assessment_notes        TEXT,
    
    -- Review & Decision
    reviewed_at             TIMESTAMPTZ,
    reviewed_by             UUID REFERENCES users(id) ON DELETE SET NULL,
    response_template_id    UUID REFERENCES dog_application_response_templates(id) ON DELETE SET NULL,
    response_reason         TEXT,  -- Custom reason or template body
    response_notes          TEXT,  -- Internal admin notes
    
    -- Application Metadata
    submitted_at            TIMESTAMPTZ,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX dog_applications_volunteer_id_idx ON dog_applications (volunteer_id);
CREATE INDEX dog_applications_status_idx ON dog_applications (status);
CREATE INDEX dog_applications_created_at_idx ON dog_applications (created_at DESC);
CREATE INDEX dog_applications_dog_id_idx ON dog_applications (dog_id);

-- Comments
COMMENT ON TABLE dog_applications IS 'Dog registration applications with approval workflow';
COMMENT ON COLUMN dog_applications.status IS 'Current state in the approval workflow';
COMMENT ON COLUMN dog_applications.dog_id IS 'Linked dog record (populated once approved)';

-- ============================================================
-- Seed Template Responses
-- ============================================================

INSERT INTO dog_application_response_templates (category, label, body, sort_order) VALUES
-- Approval templates
('approval', 'Standard Approval', 'Congratulations! Your dog has been approved for therapy work. You can now sign up for shifts through the volunteer portal.', 1),
('approval', 'Approval with Conditions', 'Your dog has been approved with the following conditions: [add details]. Please review the guidelines before signing up for shifts.', 2),

-- Assessment templates
('assessment', 'Schedule Assessment', 'We would like to schedule an assessment for your dog. Please contact us to arrange a convenient time.', 1),
('assessment', 'Assessment Reminder', 'This is a reminder that your dog assessment is scheduled for [date] at [time] at [location].', 2),

-- Rejection templates
('rejection', 'Temperament Concerns', 'After careful evaluation, we have concerns about your dog''s temperament for therapy work at this time. We recommend additional socialization training and welcome a reapplication in 6 months.', 1),
('rejection', 'Health Requirements', 'Your application does not currently meet our health requirements. Please ensure all vaccinations are up to date and obtain a veterinary clearance letter.', 2),
('rejection', 'Age Requirement', 'Your dog does not currently meet our minimum age requirement of 1 year for therapy work. We welcome your application once your dog reaches the appropriate age.', 3),
('rejection', 'Training Needed', 'We believe your dog would benefit from additional obedience training before participating in therapy work. We recommend completing a certified training program and reapplying.', 4),
('rejection', 'High Volume', 'Due to high application volume in your area, we are unable to accept new therapy dog teams at this time. Please check back in 3-6 months.', 5),
('rejection', 'Incomplete Application', 'Your application is incomplete. Please provide the missing information and resubmit.', 6),

-- General templates
('general', 'Request More Info', 'Thank you for your application. Could you please provide additional information about [specific request]?', 1);

-- ============================================================
-- Trigger to update status_changed_at automatically
-- ============================================================

CREATE OR REPLACE FUNCTION update_dog_application_status_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
        NEW.status_changed_at = now();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER dog_application_status_change
    BEFORE UPDATE ON dog_applications
    FOR EACH ROW
    EXECUTE FUNCTION update_dog_application_status_timestamp();

-- ============================================================
-- View for pending applications (convenience)
-- ============================================================

CREATE VIEW pending_dog_applications AS
SELECT 
    da.*,
    u.email AS volunteer_email,
    vp.volunteer_names,
    dt.name AS breed_name
FROM dog_applications da
JOIN users u ON u.id = da.volunteer_id
JOIN volunteer_profiles vp ON vp.user_id = da.volunteer_id
LEFT JOIN dog_types dt ON dt.id = da.breed_id
WHERE da.status IN ('submitted', 'under_review', 'assessment_scheduled', 'assessment_completed')
ORDER BY da.submitted_at ASC;
