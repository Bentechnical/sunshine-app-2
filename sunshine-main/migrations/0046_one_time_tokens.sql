-- One-time setup tokens for super-admin initialization
CREATE TABLE one_time_tokens (
    token       TEXT PRIMARY KEY,
    purpose     TEXT NOT NULL, -- e.g. 'super_admin_setup'
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at  TIMESTAMPTZ NOT NULL,
    used_at     TIMESTAMPTZ
);

CREATE INDEX one_time_tokens_purpose_idx ON one_time_tokens (purpose) WHERE used_at IS NULL;
