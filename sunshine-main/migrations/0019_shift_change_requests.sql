-- ============================================================
-- Shift Change Requests (Agency -> Admin)
-- ============================================================

CREATE TYPE change_request_status AS ENUM (
    'pending',
    'approved',
    'rejected',
    'cancelled'
);

CREATE TABLE shift_change_requests (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shift_id            UUID NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
    requested_by        UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    
    -- JSON payload of changes: { "start_at": "...", "end_at": "...", "site_id": "...", "slots_requested": 3 }
    requested_changes   JSONB NOT NULL,
    
    reason              TEXT,
    
    status              change_request_status NOT NULL DEFAULT 'pending',
    
    admin_notes         TEXT,
    processed_at        TIMESTAMPTZ,
    processed_by        UUID REFERENCES users(id) ON DELETE SET NULL,
    
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX shift_change_requests_shift_id_idx ON shift_change_requests (shift_id) WHERE status = 'pending';
CREATE INDEX shift_change_requests_status_idx ON shift_change_requests (status);

-- Add to admin_alert_type if needed, or just use a query for now.
-- Let's add a new alert type for better visibility.
ALTER TYPE admin_alert_type ADD VALUE 'shift_change_request';
