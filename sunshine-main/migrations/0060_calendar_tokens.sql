-- ============================================================
-- Calendar feed tokens
-- ============================================================
-- Each user gets one active token per feed type.
-- Tokens are opaque 32-byte hex strings embedded in webcal:// URLs.
-- They never expire unless the user explicitly regenerates them
-- (which revokes the old token and creates a new one).
--
-- Feed types:
--   volunteer_confirmed  — a volunteer's own confirmed shifts
--   volunteer_available  — open shifts matching their saved queryset/prefs
--   agency_shifts        — all shifts for the contact's agencies
--   admin_global         — all shifts across all agencies

CREATE TYPE calendar_feed_type AS ENUM (
    'volunteer_confirmed',
    'volunteer_available',
    'agency_shifts',
    'admin_global'
);

CREATE TABLE calendar_tokens (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                 UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    feed_type               calendar_feed_type NOT NULL,

    -- 64-char hex string (32 random bytes), embedded in the webcal URL
    token                   TEXT NOT NULL UNIQUE,

    -- volunteer_available only: which saved queryset to apply
    queryset_id             UUID REFERENCES saved_querysets(id) ON DELETE SET NULL,
    -- Two independent toggles controlling what the available-shifts feed filters on
    follow_queryset         BOOL NOT NULL DEFAULT true,
    follow_preferred_times  BOOL NOT NULL DEFAULT true,

    -- Cached iCal body for volunteer_available (rebuilt every 8h by background job,
    -- and on-demand when the volunteer changes their feed config)
    cached_ical             TEXT,
    cache_generated_at      TIMESTAMPTZ,

    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_accessed_at        TIMESTAMPTZ,
    revoked_at              TIMESTAMPTZ
);

CREATE INDEX calendar_tokens_token_idx ON calendar_tokens(token);
CREATE INDEX calendar_tokens_user_type_idx ON calendar_tokens(user_id, feed_type);

-- Enforce one active (non-revoked) token per user per feed type
CREATE UNIQUE INDEX calendar_tokens_one_active
    ON calendar_tokens(user_id, feed_type)
    WHERE revoked_at IS NULL;
