-- ============================================================
-- Users & Authentication
-- ============================================================

CREATE TYPE user_role AS ENUM ('volunteer', 'agency_contact', 'admin');

CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email           TEXT NOT NULL UNIQUE,
    role            user_role NOT NULL DEFAULT 'volunteer',
    display_name    TEXT,
    is_active       BOOL NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX users_email_idx ON users (email);

-- ─── Sessions (60-day rolling) ───────────────────────────────

CREATE TABLE sessions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    -- token stored as a secure random hex string in the cookie
    token_hash      TEXT NOT NULL UNIQUE,
    user_agent      TEXT,
    ip_address      INET,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_active_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at      TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '60 days')
);

CREATE INDEX sessions_token_hash_idx ON sessions (token_hash);
CREATE INDEX sessions_user_id_idx ON sessions (user_id);
CREATE INDEX sessions_expires_at_idx ON sessions (expires_at);

-- ─── Magic Links ─────────────────────────────────────────────

CREATE TABLE magic_links (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email           TEXT NOT NULL,
    -- JWT token stored as signed claim; jti stored here for revocation
    jti             TEXT NOT NULL UNIQUE,
    used_at         TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at      TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '15 minutes')
);

CREATE INDEX magic_links_jti_idx ON magic_links (jti);
CREATE INDEX magic_links_expires_at_idx ON magic_links (expires_at);

-- ─── Passkeys (WebAuthn) ─────────────────────────────────────

CREATE TABLE passkey_credentials (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    -- webauthn-rs serialises the full Passkey struct as JSON
    credential      JSONB NOT NULL,
    -- human-readable label shown in credential manager UI
    label           TEXT NOT NULL DEFAULT 'My device',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_used_at    TIMESTAMPTZ
);

CREATE INDEX passkey_credentials_user_id_idx ON passkey_credentials (user_id);

-- ─── OAuth Accounts ──────────────────────────────────────────

CREATE TABLE oauth_accounts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider        TEXT NOT NULL,   -- 'google'
    provider_id     TEXT NOT NULL,
    access_token    TEXT,            -- stored encrypted in practice
    refresh_token   TEXT,
    token_expires_at TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (provider, provider_id)
);

-- ─── Notification Preferences ────────────────────────────────

CREATE TABLE notification_preferences (
    user_id             UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    email_enabled       BOOL NOT NULL DEFAULT true,
    sms_enabled         BOOL NOT NULL DEFAULT false,
    sms_phone           TEXT,
    -- granular opt-outs
    notify_booking_confirm   BOOL NOT NULL DEFAULT true,
    notify_booking_cancel    BOOL NOT NULL DEFAULT true,
    notify_shift_update      BOOL NOT NULL DEFAULT true,
    notify_waitlist_promote  BOOL NOT NULL DEFAULT true,
    notify_survey_prompt     BOOL NOT NULL DEFAULT true,
    notify_admin_message     BOOL NOT NULL DEFAULT true,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
