-- Add agency_id to assets table to support agency-level visibility
ALTER TABLE assets ADD COLUMN agency_id UUID REFERENCES agencies(id) ON DELETE SET NULL;
CREATE INDEX assets_agency_id_idx ON assets (agency_id);
