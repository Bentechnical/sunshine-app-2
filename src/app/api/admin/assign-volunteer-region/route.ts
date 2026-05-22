// src/app/api/admin/assign-volunteer-region/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/utils/supabase/admin';
import { requireAdminOrPd } from '@/utils/requireAdminOrPd';

export async function POST(req: NextRequest) {
  const check = await requireAdminOrPd();
  if ('error' in check) return check.error;

  try {
    const { volunteer_id, region_id } = await req.json();

    if (!volunteer_id) return NextResponse.json({ error: 'volunteer_id is required' }, { status: 400 });

    const supabase = createSupabaseAdminClient();

    // If region_id provided, validate it exists and is active
    if (region_id != null) {
      const { data: region, error: regErr } = await supabase
        .from('pd_regions')
        .select('id, is_active')
        .eq('id', region_id)
        .single();

      if (regErr || !region) {
        return NextResponse.json({ error: 'Region not found' }, { status: 400 });
      }
      if (!region.is_active) {
        return NextResponse.json({ error: 'Cannot assign to an inactive region' }, { status: 400 });
      }
    }

    const { error } = await supabase
      .from('users')
      .update({ assigned_region_id: region_id ?? null, region_assignment_method: 'manual' })
      .eq('id', volunteer_id)
      .eq('role', 'volunteer');

    if (error) {
      console.error('[assign-volunteer-region] Failed to update volunteer:', error.message);
      return NextResponse.json({ error: 'Failed to update volunteer' }, { status: 500 });
    }

    console.log(`[assign-volunteer-region] Volunteer ${volunteer_id} → region ${region_id ?? 'unassigned'}`);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[assign-volunteer-region] Unexpected error:', err.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
