-- Add review tracking to surveys
ALTER TABLE volunteer_surveys ADD COLUMN reviewed_at TIMESTAMPTZ;
ALTER TABLE volunteer_surveys ADD COLUMN reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE agency_surveys ADD COLUMN reviewed_at TIMESTAMPTZ;
ALTER TABLE agency_surveys ADD COLUMN reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX volunteer_surveys_reviewed_at_idx ON volunteer_surveys (reviewed_at) WHERE reviewed_at IS NULL;
CREATE INDEX agency_surveys_reviewed_at_idx ON agency_surveys (reviewed_at) WHERE reviewed_at IS NULL;
