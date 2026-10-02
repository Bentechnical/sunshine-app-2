-- Backfill visits.assigned_pd_id from the owning region.
--
-- WHY: visits.assigned_pd_id is a denormalized snapshot taken at visit creation from the
-- org's region owner (POST /api/visits). Until the cascade was added to
-- PATCH /api/admin/regions/[id] and .../deactivate, changing a region's owner PD left every
-- existing visit pointing at the outgoing PD. Because the PD dashboard scopes by
-- assigned_pd_id (client-side), those visits were invisible to the incoming PD.
--
-- This script re-derives the correct value for all visits that belong to an org with an
-- assigned region, and clears it for visits whose org has no region.
--
-- SAFE TO RE-RUN. Run the SELECTs first and eyeball the counts.

-- 1. Preview: visits whose assigned_pd_id disagrees with their org's region owner
SELECT v.id,
       v.status,
       u.org_name,
       r.name              AS region_name,
       v.assigned_pd_id    AS current_pd,
       r.owner_pd_id       AS should_be_pd
FROM visits v
JOIN users u ON u.id = v.organization_id
LEFT JOIN pd_regions r ON r.id = u.assigned_region_id AND r.is_active
WHERE v.assigned_pd_id IS DISTINCT FROM r.owner_pd_id
ORDER BY u.org_name, v.visit_date;

-- 2. Preview: guest visits (no org account) — these never get a PD at all.
--    POST /api/public/visit-request does not set assigned_pd_id, so they are invisible to
--    every PD dashboard. Not fixed here; needs a product decision on how to route them.
SELECT id, guest_org_name, visit_date, status, assigned_pd_id
FROM visits
WHERE organization_id IS NULL
ORDER BY visit_date;

-- 3. Apply the backfill.
UPDATE visits v
SET assigned_pd_id = r.owner_pd_id
FROM users u
LEFT JOIN pd_regions r ON r.id = u.assigned_region_id AND r.is_active
WHERE u.id = v.organization_id
  AND v.assigned_pd_id IS DISTINCT FROM r.owner_pd_id;

-- 4. Verify: should return zero rows.
SELECT count(*) AS still_mismatched
FROM visits v
JOIN users u ON u.id = v.organization_id
LEFT JOIN pd_regions r ON r.id = u.assigned_region_id AND r.is_active
WHERE v.assigned_pd_id IS DISTINCT FROM r.owner_pd_id;
