-- Track email verification separately from magic-link auth
ALTER TABLE users ADD COLUMN email_verified_at TIMESTAMPTZ;

COMMENT ON COLUMN users.email_verified_at IS
    'Set when the user first successfully verifies via magic link.
     NULL means unverified. Used for the portal help bar alert.';
