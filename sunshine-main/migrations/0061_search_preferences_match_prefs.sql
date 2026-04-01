ALTER TABLE search_preferences
    ADD COLUMN IF NOT EXISTS match_preferences BOOL NOT NULL DEFAULT false;
