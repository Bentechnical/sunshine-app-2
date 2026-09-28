import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/utils/supabase/admin';
import { requireAdminOrPd } from '@/utils/requireAdminOrPd';

export async function GET() {
  const check = await requireAdminOrPd();
  if ('error' in check) return check.error;
  const { userId, role } = check;

  const supabase = createSupabaseAdminClient();

  // Fetch approved volunteers with their dog's vaccine status (lightweight: only IDs + verification fields)
  let query = supabase
    .from('users')
    .select('id, vsc_verification_status, dogs(vaccine_verification_status)')
    .eq('role', 'volunteer')
    .eq('status', 'approved');

  if (role === 'pd') {
    const { data: ownedRegions } = await supabase
      .from('pd_regions')
      .select('id')
      .eq('owner_pd_id', userId)
      .eq('is_active', true);

    const regionIds = (ownedRegions ?? []).map((r: any) => r.id);
    if (!regionIds.length) {
      return NextResponse.json({ count: 0 });
    }
    query = query.in('assigned_region_id', regionIds);
  }

  const { data, error } = await query;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Count volunteers where VSC or vaccine (on their dog) is pending_review
  const count = (data ?? []).filter((u: any) => {
    if (u.vsc_verification_status === 'pending_review') return true;
    const dog = Array.isArray(u.dogs) ? u.dogs[0] : u.dogs;
    return dog?.vaccine_verification_status === 'pending_review';
  }).length;

  return NextResponse.json({ count });
}
