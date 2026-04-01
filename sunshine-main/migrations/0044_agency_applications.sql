-- ============================================================
-- Agency Applications
-- ============================================================

CREATE TYPE agency_application_status AS ENUM (
    'submitted',
    'under_review',
    'approved',
    'rejected',
    'withdrawn'
);

CREATE TABLE agency_applications (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_name                TEXT NOT NULL,
    org_type_id             UUID REFERENCES agency_types(id),
    contact_name            TEXT NOT NULL,
    contact_email           TEXT NOT NULL,
    contact_phone           TEXT NOT NULL,
    address                 TEXT NOT NULL,
    city                    TEXT NOT NULL,
    postal_code             TEXT NOT NULL,
    region_id               UUID REFERENCES regions(id),
    
    website                 TEXT,
    description             TEXT,
    
    visit_frequency         TEXT,
    preferred_days          TEXT,
    preferred_times         TEXT,
    
    status                  agency_application_status NOT NULL DEFAULT 'submitted',
    status_changed_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    
    reviewed_at             TIMESTAMPTZ,
    reviewed_by             UUID REFERENCES users(id),
    review_notes            TEXT,
    rejection_reason        TEXT,
    
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX agency_applications_status_idx ON agency_applications (status);
CREATE INDEX agency_applications_org_name_idx ON agency_applications (org_name);

COMMENT ON TABLE agency_applications IS
    'Applications from new agencies/facilities wanting to join the program.';
