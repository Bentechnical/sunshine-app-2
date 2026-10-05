-- Migration 39 — Add `pd_assignment_method` to `visits`
--
-- WHY: visits.assigned_pd_id can be set two ways, and until now the database recorded no
-- difference between them:
--   1. 'region_auto' — snapshotted at creation from the org's region owner (POST /api/visits)
--   2. 'manual'      — set deliberately per visit via the PD dropdown in the admin visit
--                      detail view (PATCH /api/admin/visits/[id]). A single visit can be
--                      reassigned without moving the whole org to another region.
--
-- Without this column, the region-handover cascade in PATCH /api/admin/regions/[id] cannot
-- tell a deliberate override from a stale snapshot, so it would overwrite every override.
-- This mirrors the existing `users.region_assignment_method` pattern.

ALTER TABLE visits
  ADD COLUMN IF NOT EXISTS pd_assignment_method text NOT NULL DEFAULT 'region_auto';

ALTER TABLE visits DROP CONSTRAINT IF EXISTS visits_pd_assignment_method_check;
ALTER TABLE visits
  ADD CONSTRAINT visits_pd_assignment_method_check
  CHECK (pd_assignment_method IN ('region_auto', 'manual'));

-- Backfill: treat any existing divergence from the org's region owner as a deliberate
-- override. This is the conservative reading — it preserves current behaviour rather than
-- assuming those rows are stale, and the cascade will leave them alone from now on.
UPDATE visits v
SET pd_assignment_method = 'manual'
FROM users u
LEFT JOIN pd_regions r ON r.id = u.assigned_region_id AND r.is_active
WHERE u.id = v.organization_id
  AND v.assigned_pd_id IS DISTINCT FROM r.owner_pd_id;

CREATE INDEX IF NOT EXISTS visits_pd_assignment_method_idx
  ON visits (pd_assignment_method)
  WHERE pd_assignment_method = 'manual';

-- Verify: how many visits are now protected from the region cascade.
SELECT pd_assignment_method, count(*)
FROM visits
GROUP BY pd_assignment_method
ORDER BY pd_assignment_method;
