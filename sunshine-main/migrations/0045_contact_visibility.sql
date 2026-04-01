-- Add visibility settings for contacts
CREATE TYPE contact_visibility_type AS ENUM ('visible', 'hidden', 'lead_up');

ALTER TABLE contacts 
ADD COLUMN phone_visibility contact_visibility_type NOT NULL DEFAULT 'hidden',
ADD COLUMN email_visibility contact_visibility_type NOT NULL DEFAULT 'hidden';
