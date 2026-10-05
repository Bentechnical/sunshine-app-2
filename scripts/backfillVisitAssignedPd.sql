-- Report on visits whose assigned_pd_id differs from their org's region owner.
--
-- IMPORTANT — READ BEFORE RUNNING ANYTHING HERE.
--
-- A visit's PD can be set two ways:
--   1. Automatically, as a snapshot taken at visit creation from the org's region owner
--      (POST /api/visits), and
--   2. Manually, per visit, via the PD dropdown in the admin visit detail view
--      (PATCH /api/admin/visits/[id]) — a deliberate override. A single visit can be
--      reassigned without moving the whole org to another region.
--
-- The database does NOT record which of the two produced the current value. There is no
-- equivalent of users.region_assignment_method on visits. That means a row where
-- assigned_pd_id disagrees with the region owner is EITHER a deliberate override OR a
-- stale snapshot, and this script cannot tell them apart.
--
-- Therefore: no UPDATE here is safe to run blind. An earlier version of this file applied a
-- blanket backfill, which would have wiped every deliberate per-visit override. Do not
-- reintroduce it. Review the report, decide row by row, and update by explicit visit id.
--
-- The proper fix is to add `visits.pd_assignment_method` ('region_auto' | 'manual') so the
-- distinction is recorded and the region cascade can skip manual rows. See
-- scripts/addVisitPdAssignmentMethod.sql.

-- 1. Visits whose PD differs from their org's active region owner.
--    Each row is EITHER an intentional override OR a stale snapshot. Judge individually.
SELECT v.id,
       v.status,
       v.visit_date,
       u.org_name,
       r.name                                   AS org_region,
       COALESCE(pd_now.first_name  || ' ' || pd_now.last_name,  '(none)') AS assigned_pd,
       COALESCE(pd_reg.first_name  || ' ' || pd_reg.last_name,  '(none)') AS region_owner_pd
FROM visits v
JOIN users u            ON u.id = v.organization_id
LEFT JOIN pd_regions r  ON r.id = u.assigned_region_id AND r.is_active
LEFT JOIN users pd_now  ON pd_now.id = v.assigned_pd_id
LEFT JOIN users pd_reg  ON pd_reg.id = r.owner_pd_id
WHERE v.assigned_pd_id IS DISTINCT FROM r.owner_pd_id
ORDER BY u.org_name, v.visit_date;

-- 2. The subset that is almost certainly NOT a deliberate override: assigned_pd_id points at
--    a PD who owns no active region at all. A deliberate override would normally name a
--    current PD, so these are the strongest stale-snapshot candidates.
SELECT v.id,
       v.status,
       u.org_name,
       pd_now.first_name || ' ' || pd_now.last_name AS assigned_pd_owns_no_region
FROM visits v
JOIN users u           ON u.id = v.organization_id
JOIN users pd_now      ON pd_now.id = v.assigned_pd_id
WHERE NOT EXISTS (
        SELECT 1 FROM pd_regions r
        WHERE r.owner_pd_id = v.assigned_pd_id AND r.is_active
      )
ORDER BY u.org_name, v.visit_date;

-- 3. Visits with no PD at all, excluding guest submissions (which are intentionally
--    admin-managed and never get a PD).
SELECT v.id, v.status, v.visit_date, u.org_name, r.name AS org_region
FROM visits v
JOIN users u           ON u.id = v.organization_id
LEFT JOIN pd_regions r ON r.id = u.assigned_region_id AND r.is_active
WHERE v.assigned_pd_id IS NULL
ORDER BY u.org_name, v.visit_date;

-- 4. Repair template — fill in explicit ids from the reports above. Never run unscoped.
-- UPDATE visits v
-- SET assigned_pd_id = r.owner_pd_id
-- FROM users u
-- LEFT JOIN pd_regions r ON r.id = u.assigned_region_id AND r.is_active
-- WHERE u.id = v.organization_id
--   AND v.id IN (/* explicit visit ids you have reviewed */);
