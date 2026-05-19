// src/app/api/admin/assign-org-pd/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/utils/supabase/admin';
import { requireAdminOrPd } from '@/utils/requireAdminOrPd';

export async function POST(req: NextRequest) {
  const check = await requireAdminOrPd();
  if ('error' in check) return check.error;

  try {
    const { org_id, pd_id, cascade_visits } = await req.json();

    if (!org_id) {
      return NextResponse.json({ error: 'Missing org_id' }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();

    // Validate pd_id if provided (must be an active PD)
    if (pd_id) {
      const { data: pd, error: pdErr } = await supabase
        .from('users')
        .select('id')
        .eq('id', pd_id)
        .eq('role', 'pd')
        .eq('status', 'approved')
        .single();

      if (pdErr || !pd) {
        return NextResponse.json({ error: 'PD not found or not approved' }, { status: 400 });
      }
    }

    // Update the org's assigned PD
    const { error: orgError } = await supabase
      .from('users')
      .update({ assigned_pd_id: pd_id ?? null })
      .eq('id', org_id)
      .eq('role', 'organization');

    if (orgError) {
      console.error('[assign-org-pd] Failed to update org:', orgError.message);
      return NextResponse.json({ error: 'Failed to update organization' }, { status: 500 });
    }

    // Optionally cascade to all active visits for this org
    let visits_updated = 0;
    if (cascade_visits) {
      const { data: updated, error: visitError } = await supabase
        .from('visits')
        .update({ assigned_pd_id: pd_id ?? null })
        .eq('organization_id', org_id)
        .in('status', ['pending_review', 'approved'])
        .select('id');

      if (visitError) {
        console.error('[assign-org-pd] Failed to cascade to visits:', visitError.message);
        // Don't fail the whole request — org was updated
      } else {
        visits_updated = updated?.length ?? 0;
      }
    }

    console.log(`[assign-org-pd] Org ${org_id} → PD ${pd_id ?? 'unassigned'}, cascade: ${cascade_visits}, visits updated: ${visits_updated}`);

    return NextResponse.json({ success: true, visits_updated });
  } catch (err: any) {
    console.error('[assign-org-pd] Unexpected error:', err.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
