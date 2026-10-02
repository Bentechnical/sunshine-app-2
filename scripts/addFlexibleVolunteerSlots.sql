-- Flexible volunteer slots: a visit now has a range of dogs (min_volunteers..volunteer_slots).
--   volunteer_slots  = maximum; signups beyond this are waitlisted (unchanged meaning)
--   min_volunteers   = minimum confirmed teams for the visit to go ahead
-- Orgs only ever enter one number, which seeds both; admins/PDs widen it into a range.
--
-- Also adds the columns used by the hourly "visit is going ahead" org email:
--   min_reached_at       = when confirmed count last rose to >= min_volunteers (NULL while below)
--   staffed_notified_at  = when the org was emailed; the email is sent at most once per visit

ALTER TABLE visits ADD COLUMN IF NOT EXISTS min_volunteers INTEGER;
ALTER TABLE visits ADD COLUMN IF NOT EXISTS min_reached_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE visits ADD COLUMN IF NOT EXISTS staffed_notified_at TIMESTAMPTZ DEFAULT NULL;

UPDATE visits SET min_volunteers = volunteer_slots WHERE min_volunteers IS NULL;

-- Fill min from max when omitted, and never let min exceed max.
CREATE OR REPLACE FUNCTION visits_normalize_min_volunteers()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.min_volunteers IS NULL THEN
    NEW.min_volunteers := NEW.volunteer_slots;
  END IF;
  IF NEW.min_volunteers > NEW.volunteer_slots THEN
    NEW.min_volunteers := NEW.volunteer_slots;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_visits_normalize_min_volunteers ON visits;
CREATE TRIGGER trg_visits_normalize_min_volunteers
  BEFORE INSERT OR UPDATE OF min_volunteers, volunteer_slots ON visits
  FOR EACH ROW EXECUTE FUNCTION visits_normalize_min_volunteers();

ALTER TABLE visits ALTER COLUMN min_volunteers SET NOT NULL;

ALTER TABLE visits DROP CONSTRAINT IF EXISTS visits_min_volunteers_check;
ALTER TABLE visits ADD CONSTRAINT visits_min_volunteers_check
  CHECK (min_volunteers >= 1 AND min_volunteers <= volunteer_slots);

-- Backfill staffing state for existing visits.
UPDATE visits v
SET min_reached_at = NOW()
WHERE v.min_reached_at IS NULL
  AND (SELECT COUNT(*) FROM visit_registrations r
       WHERE r.visit_id = v.id AND r.status = 'confirmed') >= v.min_volunteers;

-- Existing visits at their minimum already received the old "fully staffed" email
-- (min = max until now), so don't email them again.
UPDATE visits
SET staffed_notified_at = NOW()
WHERE min_reached_at IS NOT NULL AND staffed_notified_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_visits_pending_staffed_notification
  ON visits(min_reached_at)
  WHERE staffed_notified_at IS NULL AND min_reached_at IS NOT NULL;

COMMENT ON COLUMN visits.min_volunteers IS 'Minimum confirmed volunteer teams for the visit to go ahead. volunteer_slots is the maximum.';
COMMENT ON COLUMN visits.min_reached_at IS 'When the confirmed count last reached min_volunteers; NULL while below. Drives the delayed org "going ahead" email.';
COMMENT ON COLUMN visits.staffed_notified_at IS 'When the org was sent the "going ahead" email. Sent at most once per visit.';
