-- Migration 41 — Add `supported_visit` to `visits`
--
-- WHY: candidate volunteers (users.volunteer_tier = 'candidate', Migration 40) may only join a
-- visit that has support available. There are two ways a visit qualifies:
--
--   1. supported_visit = true  — the PD has ticked "Supported visit" on the visit, meaning they're
--      making themselves available if needed. Also serves as a general manual override to open a
--      visit to candidates for any reason.
--   2. a mentor is already confirmed on it — evaluated live from visit_registrations, not stored.
--
-- Only (1) needs a column. (2) is derived, because storing it would mean recomputing a cached flag
-- every time anyone registers, cancels, or is promoted — five write paths and a guaranteed source
-- of drift. The cost is a count query at signup time, which is cheap.
--
-- DEFAULT false is deliberate: a visit is not supported unless someone says so. The alternative
-- (defaulting true) would silently open every historic visit to candidates.
--
-- Note this flag is only ever *read* for candidates. Regular and mentor volunteers ignore it
-- entirely, so ticking it on a visit with no candidates changes nothing.

ALTER TABLE visits
  ADD COLUMN IF NOT EXISTS supported_visit boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN visits.supported_visit IS
  'PD has marked this visit as open to candidate volunteers (they are available to support). '
  'Candidates may also join a visit where a mentor is already confirmed — that is derived live, not stored.';

-- Verify: every existing visit should be false, and nothing else should have changed.
SELECT supported_visit, count(*)
FROM visits
GROUP BY supported_visit
ORDER BY supported_visit;
