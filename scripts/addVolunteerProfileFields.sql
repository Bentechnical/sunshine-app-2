-- Migration 40 — Volunteer profiles: tiers, audience exclusions, private notes
--
-- WHY: PD feedback (Oct 2026 testing sessions) converged on wanting more visibility into
-- volunteers. Three pieces of state currently live only in PDs' heads:
--   1. How far along a volunteer is  → users.volunteer_tier
--   2. Groups a volunteer must not be placed with (post-assessment conditions)
--                                    → audience_groups + volunteer_audience_exclusions
--   3. Private observations about them → volunteer_notes
--
-- NOT in this migration:
--   * visits.supported_visit — the per-visit override that lets candidates sign up. Gating is
--     deliberately a later phase, and a column with no behaviour behind it invites confusion.
--   * visit_registrations.cancel_count — see docs/TECH_DEBT.md; wanted, but it belongs with a
--     change to the cancel route, not here.
--
-- DELIBERATELY NOT REUSED: audience_categories / volunteer_audience_preferences. Those model a
-- volunteer *preference* ("enjoys working with seniors") from the deprecated individual-matching
-- system. These model a PD-imposed *exclusion* ("must not be placed with children"). Same shape,
-- opposite meaning — sharing a table would make a row's meaning depend on which code path read it.


-- ─── 1. Volunteer tier ────────────────────────────────────────────────────────────────────────
--
-- Candidate → Regular → Mentor. Only the candidate/non-candidate boundary will gate anything;
-- Mentor additionally marks volunteers a PD can rely on to support a candidate on a visit.
--
-- NOT NULL DEFAULT 'candidate' so new volunteers are candidates with no application change. The
-- column is only meaningful for role = 'volunteer' — other roles carry the default and ignore it,
-- following the existing convention on this table (fee_tier, is_browsable, default_* etc.).

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS volunteer_tier text NOT NULL DEFAULT 'candidate';

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_volunteer_tier_check;
ALTER TABLE users
  ADD CONSTRAINT users_volunteer_tier_check
  CHECK (volunteer_tier IN ('candidate', 'regular', 'mentor'));

-- Backfill: everyone already approved predates the tier system and has effectively been operating
-- as a full volunteer, so they become 'regular'. Pending/denied/archived volunteers stay
-- 'candidate'. Without this, turning on gating later would lock out the entire existing roster.
UPDATE users
SET volunteer_tier = 'regular'
WHERE role = 'volunteer'
  AND status = 'approved';

CREATE INDEX IF NOT EXISTS users_volunteer_tier_idx
  ON users (volunteer_tier)
  WHERE role = 'volunteer';


-- ─── 2. Audience groups (lookup) ──────────────────────────────────────────────────────────────
--
-- A lookup table rather than a CHECK constraint or TS union, because the real vocabulary is coming
-- out of the assessment process later. Renaming a group, or going from three to five, is then a
-- data change rather than a migration plus a deploy.
--
-- is_active retires a group without deleting the row, which would orphan exclusions that reference
-- it. The FK below is ON DELETE RESTRICT to push toward deactivating rather than deleting.

CREATE TABLE IF NOT EXISTS audience_groups (
  id          serial PRIMARY KEY,
  slug        text NOT NULL UNIQUE,
  label       text NOT NULL,
  description text,
  sort_order  integer NOT NULL DEFAULT 0,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Provisional vocabulary — expected to be renamed once the assessment wording is confirmed.
INSERT INTO audience_groups (slug, label, description, sort_order) VALUES
  ('children',         'Children',         'Visits where children are the primary audience',                     1),
  ('seniors',          'Seniors',          'Visits in long-term care, retirement residences and seniors programs', 2),
  ('vulnerable_adults','Vulnerable adults','Visits with adults who may need a calmer or more predictable dog',   3)
ON CONFLICT (slug) DO NOTHING;

-- Lookup contents aren't sensitive, but without RLS the table is writable through the anon key —
-- anyone could rename or delete a category, and the ON DELETE RESTRICT above only protects groups
-- that are actually referenced by an exclusion. Read-only to authenticated clients; all app writes
-- go through the service role, which bypasses RLS.
ALTER TABLE audience_groups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read audience groups" ON audience_groups;
CREATE POLICY "Authenticated users can read audience groups"
  ON audience_groups FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Service role full access to audience_groups" ON audience_groups;
CREATE POLICY "Service role full access to audience_groups"
  ON audience_groups FOR ALL
  USING (auth.role() = 'service_role');


-- ─── 3. Volunteer audience exclusions ─────────────────────────────────────────────────────────
--
-- A row means: do NOT place this volunteer with this group. Absence of a row never restricts
-- anything, so the default state (no rows) is "no conditions" — which is where most volunteers
-- will stay. PD-owned: not editable by, and not visible to, the volunteer.
--
-- created_by records which PD imposed the condition. The optional note carries nuance a checkbox
-- can't ("fine with school groups, not with under-5s").

CREATE TABLE IF NOT EXISTS volunteer_audience_exclusions (
  volunteer_id text    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  group_id     integer NOT NULL REFERENCES audience_groups(id) ON DELETE RESTRICT,
  note         text,
  created_by   text    REFERENCES users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (volunteer_id, group_id)
);

ALTER TABLE volunteer_audience_exclusions ENABLE ROW LEVEL SECURITY;

-- Mirrors the visit_notes policy set: admin/PD only, service role bypass. No volunteer-facing
-- policy at all — these must never be readable by the volunteer they describe.
DROP POLICY IF EXISTS "Admins and PDs can view volunteer exclusions" ON volunteer_audience_exclusions;
CREATE POLICY "Admins and PDs can view volunteer exclusions"
  ON volunteer_audience_exclusions FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM users
    WHERE users.id = (auth.uid())::text AND users.role IN ('admin', 'pd')
  ));

DROP POLICY IF EXISTS "Admins and PDs can manage volunteer exclusions" ON volunteer_audience_exclusions;
CREATE POLICY "Admins and PDs can manage volunteer exclusions"
  ON volunteer_audience_exclusions FOR ALL
  USING (EXISTS (
    SELECT 1 FROM users
    WHERE users.id = (auth.uid())::text AND users.role IN ('admin', 'pd')
  ));

DROP POLICY IF EXISTS "Service role full access to volunteer exclusions" ON volunteer_audience_exclusions;
CREATE POLICY "Service role full access to volunteer exclusions"
  ON volunteer_audience_exclusions FOR ALL
  USING (auth.role() = 'service_role');


-- ─── 4. Volunteer notes ───────────────────────────────────────────────────────────────────────
--
-- Modelled on visit_notes, with one deliberate difference: author_id is nullable with
-- ON DELETE SET NULL rather than NOT NULL with ON DELETE CASCADE. Notes *about* a volunteer should
-- survive the PD who wrote them leaving the organisation; visit_notes cascades, which would delete
-- the record along with the author.

CREATE TABLE IF NOT EXISTS volunteer_notes (
  id           serial PRIMARY KEY,
  volunteer_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  author_id    text REFERENCES users(id) ON DELETE SET NULL,
  note_text    text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS volunteer_notes_volunteer_id_idx
  ON volunteer_notes (volunteer_id, created_at DESC);

ALTER TABLE volunteer_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins and PDs can view volunteer notes" ON volunteer_notes;
CREATE POLICY "Admins and PDs can view volunteer notes"
  ON volunteer_notes FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM users
    WHERE users.id = (auth.uid())::text AND users.role IN ('admin', 'pd')
  ));

DROP POLICY IF EXISTS "Admins and PDs can create volunteer notes" ON volunteer_notes;
CREATE POLICY "Admins and PDs can create volunteer notes"
  ON volunteer_notes FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM users
    WHERE users.id = (auth.uid())::text AND users.role IN ('admin', 'pd')
  ));

DROP POLICY IF EXISTS "Service role full access to volunteer_notes" ON volunteer_notes;
CREATE POLICY "Service role full access to volunteer_notes"
  ON volunteer_notes FOR ALL
  USING (auth.role() = 'service_role');


-- ─── Verify ───────────────────────────────────────────────────────────────────────────────────

-- Tier distribution — expect existing approved volunteers as 'regular', nothing else surprising.
SELECT role, volunteer_tier, count(*)
FROM users
WHERE role = 'volunteer'
GROUP BY role, volunteer_tier
ORDER BY volunteer_tier;

-- Seeded groups.
SELECT id, slug, label, sort_order, is_active FROM audience_groups ORDER BY sort_order;

-- Both new tables should exist and be empty.
SELECT 'volunteer_audience_exclusions' AS table_name, count(*) FROM volunteer_audience_exclusions
UNION ALL
SELECT 'volunteer_notes', count(*) FROM volunteer_notes;
