// src/app/api/admin/regions/[id]/deactivate/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/utils/supabase/admin';
import { requireAdminOrPd } from '@/utils/requireAdminOrPd';

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const check = await requireAdminOrPd();
  if ('error' in check) return check.error;

  const { id } = await params;
  const regionId = parseInt(id, 10);
  if (isNaN(regionId)) return NextResponse.json({ error: 'Invalid region id' }, { status: 400 });

  const supabase = createSupabaseAdminClient();

  try {
    // Count affected users before deactivating
    const { data: affected } = await supabase
      .from('users')
      .select('id, role')
      .eq('assigned_region_id', regionId);

    const volunteerCount = (affected ?? []).filter(u => u.role === 'volunteer').length;
    const orgCount = (affected ?? []).filter(u => u.role === 'organization').length;

    // Capture org ids before unassigning — needed to cascade onto their visits below,
    // since visits are linked to a region only through users.assigned_region_id.
    const orgIds = (affected ?? []).filter(u => u.role === 'organization').map(u => u.id);

    // Null out assigned_region_id on all affected users
    const { error: unassignErr } = await supabase
      .from('users')
      .update({ assigned_region_id: null, region_assignment_method: null })
      .eq('assigned_region_id', regionId);

    if (unassignErr) {
      console.error('[regions/deactivate] Failed to unassign users:', unassignErr.message);
      return NextResponse.json({ error: 'Failed to unassign users from region' }, { status: 500 });
    }

    // Deactivating moves the region's orgs to the unassigned pool, so their visits must
    // follow. Without this, visits keep pointing at the outgoing PD — who no longer owns
    // the region — and never surface in the admin "unassigned" filter.
    let visitsUnassigned = 0;
    if (orgIds.length > 0) {
      const { data: clearedVisits, error: visitErr } = await supabase
        .from('visits')
        .update({ assigned_pd_id: null })
        .in('organization_id', orgIds)
        .not('assigned_pd_id', 'is', null)
        .select('id');

      if (visitErr) {
        // Don't fail — users are already unassigned and the region still needs deactivating.
        console.error('[regions/deactivate] Failed to clear visits.assigned_pd_id:', visitErr.message);
      } else {
        visitsUnassigned = clearedVisits?.length ?? 0;
      }
    }

    // Mark region as inactive
    const { error: deactivateErr } = await supabase
      .from('pd_regions')
      .update({ is_active: false })
      .eq('id', regionId);

    if (deactivateErr) {
      console.error('[regions/deactivate] Failed to deactivate region:', deactivateErr.message);
      return NextResponse.json({ error: 'Failed to deactivate region' }, { status: 500 });
    }

    console.log(`[regions/deactivate] Deactivated region ${regionId}. Unassigned ${volunteerCount} volunteers, ${orgCount} orgs, ${visitsUnassigned} visits.`);
    return NextResponse.json({
      success: true,
      volunteers_unassigned: volunteerCount,
      orgs_unassigned: orgCount,
      visits_unassigned: visitsUnassigned,
    });
  } catch (err: any) {
    console.error('[regions/deactivate] Unexpected error:', err.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
