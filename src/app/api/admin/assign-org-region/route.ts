// src/app/api/admin/assign-org-region/route.ts
// Replaces /api/admin/assign-org-pd (which referenced users.assigned_pd_id, now removed).
// Assigns or unassigns a region to an org. Optionally cascades to update
// visits.assigned_pd_id for that org's active visits.
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/utils/supabase/admin';
import { requireAdminOrPd } from '@/utils/requireAdminOrPd';

export async function POST(req: NextRequest) {
  const check = await requireAdminOrPd();
  if ('error' in check) return check.error;

  try {
    const { org_id, region_id, cascade_visits } = await req.json();

    if (!org_id) return NextResponse.json({ error: 'org_id is required' }, { status: 400 });

    const supabase = createSupabaseAdminClient();

    // If region_id provided, validate it exists and is active
    let ownerPdId: string | null = null;
    if (region_id != null) {
      const { data: region, error: regErr } = await supabase
        .from('pd_regions')
        .select('id, owner_pd_id, is_active')
        .eq('id', region_id)
        .single();

      if (regErr || !region) {
        return NextResponse.json({ error: 'Region not found' }, { status: 400 });
      }
      if (!region.is_active) {
        return NextResponse.json({ error: 'Cannot assign to an inactive region' }, { status: 400 });
      }
      ownerPdId = region.owner_pd_id;
    }

    // Update the org's assigned region
    const { error: orgError } = await supabase
      .from('users')
      .update({ assigned_region_id: region_id ?? null, region_assignment_method: 'manual' })
      .eq('id', org_id)
      .eq('role', 'organization');

    if (orgError) {
      console.error('[assign-org-region] Failed to update org:', orgError.message);
      return NextResponse.json({ error: 'Failed to update organization' }, { status: 500 });
    }

    // Optionally cascade to all active visits for this org
    // Sets visits.assigned_pd_id = region's owner PD (null if region has no owner or unassigning)
    let visits_updated = 0;
    if (cascade_visits) {
      const { data: updated, error: visitError } = await supabase
        .from('visits')
        .update({ assigned_pd_id: ownerPdId })
        .eq('organization_id', org_id)
        .in('status', ['pending_review', 'approved'])
        .select('id');

      if (visitError) {
        console.error('[assign-org-region] Failed to cascade to visits:', visitError.message);
        // Don't fail — org was updated successfully
      } else {
        visits_updated = updated?.length ?? 0;
      }
    }

    console.log(`[assign-org-region] Org ${org_id} → region ${region_id ?? 'unassigned'}, cascade: ${cascade_visits}, visits updated: ${visits_updated}`);
    return NextResponse.json({ success: true, visits_updated });
  } catch (err: any) {
    console.error('[assign-org-region] Unexpected error:', err.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
