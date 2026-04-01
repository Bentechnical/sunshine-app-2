-- Add optional message field to volunteer_invite_links
ALTER TABLE volunteer_invite_links ADD COLUMN message TEXT;

COMMENT ON COLUMN volunteer_invite_links.message IS 'Optional welcome message shown to applicants who use this link.';
