-- Volunteer preferred shift times (3 time slots x 7 days = 21 possible preferences)
CREATE TABLE volunteer_shift_time_preferences (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    day_of_week     INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6), -- 0=Sunday, 6=Saturday
    time_slot       TEXT NOT NULL CHECK (time_slot IN ('morning', 'afternoon', 'evening')),
    is_preferred    BOOL NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(user_id, day_of_week, time_slot)
);

CREATE INDEX volunteer_shift_time_prefs_user_idx ON volunteer_shift_time_preferences(user_id);

COMMENT ON TABLE volunteer_shift_time_preferences IS 'Stores volunteer preferred shift times as a 3x7 grid (morning/afternoon/evening x Sun-Sat)';
COMMENT ON COLUMN volunteer_shift_time_preferences.day_of_week IS '0=Sunday, 1=Monday, ..., 6=Saturday';
COMMENT ON COLUMN volunteer_shift_time_preferences.time_slot IS 'morning (6AM-12PM), afternoon (12PM-5PM), evening (5PM-9PM)';
