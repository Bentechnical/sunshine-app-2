// src/app/api/user/auto-assign-region/route.ts
// Called by ProfileCompleteForm after upsert to auto-assign the user to a region.
// Any authenticated user may call this for their own record only.

import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { autoAssignRegion } from '@/utils/autoAssignRegion';
import { createSupabaseAdminClient } from '@/utils/supabase/admin';

export async function POST() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createSupabaseAdminClient();

  // Only assign if not already assigned
  const { data: user } = await supabase
    .from('users')
    .select('role, assigned_region_id')
    .eq('id', userId)
    .single();

  if (!user || (user.role !== 'volunteer' && user.role !== 'organization')) {
    return NextResponse.json({ assigned: false, reason: 'not_applicable' });
  }

  if (user.assigned_region_id) {
    return NextResponse.json({ assigned: false, reason: 'already_assigned', region_id: user.assigned_region_id });
  }

  const { region_id, method } = await autoAssignRegion(userId);

  if (!region_id) {
    return NextResponse.json({ assigned: false, reason: 'no_match' });
  }

  const { error } = await supabase
    .from('users')
    .update({ assigned_region_id: region_id, region_assignment_method: method })
    .eq('id', userId);

  if (error) {
    console.error('[user/auto-assign-region] Failed to write:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  console.log(`[user/auto-assign-region] Assigned region ${region_id} (${method}) to ${userId}`);
  return NextResponse.json({ assigned: true, region_id, method });
}
