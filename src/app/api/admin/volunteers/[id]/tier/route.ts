// PATCH /api/admin/volunteers/[id]/tier — set a volunteer's tier (candidate / regular / mentor).
//
// Its own route rather than a general-purpose PATCH on the volunteer, so the set of fields an
// admin surface can write stays explicit. Region, browsability and archiving already have their
// own endpoints (assign-volunteer-region, set-browsable, archive-user).

import { NextRequest, NextResponse } from 'next/server';
import { requireAdminOrPd } from '@/utils/requireAdminOrPd';
import { createSupabaseAdminClient } from '@/utils/supabase/admin';

const TIERS = ['candidate', 'regular', 'mentor'] as const;
type Tier = typeof TIERS[number];

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const check = await requireAdminOrPd();
  if ('error' in check) return check.error;

  try {
    const { id: volunteerId } = await params;
    const { volunteer_tier } = await req.json() as { volunteer_tier?: string };

    if (!volunteer_tier || !TIERS.includes(volunteer_tier as Tier)) {
      return NextResponse.json(
        { error: `volunteer_tier must be one of: ${TIERS.join(', ')}` },
        { status: 400 }
      );
    }

    const supabase = createSupabaseAdminClient();

    // Guard the role explicitly. volunteer_tier lives on the shared users table and carries a
    // default for every role, so without this an org or PD id would be silently writable.
    const { data: target } = await supabase
      .from('users')
      .select('id, role')
      .eq('id', volunteerId)
      .maybeSingle();

    if (!target) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    if (target.role !== 'volunteer') {
      return NextResponse.json(
        { error: 'Tier can only be set on volunteer accounts' },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from('users')
      .update({ volunteer_tier })
      .eq('id', volunteerId);

    if (error) {
      console.error('[PATCH volunteer tier] Supabase error:', error.message);
      return NextResponse.json({ error: 'Failed to update tier' }, { status: 500 });
    }

    return NextResponse.json({ success: true, volunteer_tier });
  } catch (err: any) {
    console.error('[PATCH volunteer tier] Unexpected error:', err.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
