// PATCH /api/admin/update-org-fee-tier
// Admin sets the fee tier for an organization account.

import { NextRequest, NextResponse } from 'next/server';
import { requireAdminOrPd } from '@/utils/requireAdminOrPd';
import { createSupabaseAdminClient } from '@/utils/supabase/admin';

const VALID_TIERS = ['tier_500', 'tier_200', 'tier_0'];

export async function PATCH(req: NextRequest) {
  const check = await requireAdminOrPd();
  if ('error' in check) return check.error;

  try {
    const { org_id, fee_tier } = await req.json();

    if (!org_id) {
      return NextResponse.json({ error: 'org_id is required' }, { status: 400 });
    }
    if (fee_tier !== null && !VALID_TIERS.includes(fee_tier)) {
      return NextResponse.json({ error: 'Invalid fee_tier value' }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();

    const { error } = await supabase
      .from('users')
      .update({ fee_tier: fee_tier ?? null })
      .eq('id', org_id)
      .eq('role', 'organization');

    if (error) {
      console.error('[PATCH /api/admin/update-org-fee-tier] Supabase error:', error);
      return NextResponse.json({ error: 'Failed to update fee tier' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[PATCH /api/admin/update-org-fee-tier] Unexpected error:', err.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
