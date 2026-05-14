// PATCH /api/admin/visits/[id]/registrations/[regId]/contact-sharing
// Toggle whether volunteer contact info is shared with the org for this specific visit.
// Body: { contact_shared: boolean }

import { NextRequest, NextResponse } from 'next/server';
import { requireAdminOrPd } from '@/utils/requireAdminOrPd';
import { createSupabaseAdminClient } from '@/utils/supabase/admin';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; regId: string }> }
) {
  const check = await requireAdminOrPd();
  if ('error' in check) return check.error;

  try {
    const { id, regId } = await params;
    const visitId = parseInt(id, 10);
    const registrationId = parseInt(regId, 10);
    if (isNaN(visitId) || isNaN(registrationId)) {
      return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
    }

    const body = await req.json();
    if (typeof body.contact_shared !== 'boolean') {
      return NextResponse.json({ error: 'contact_shared (boolean) is required' }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();

    const { error } = await supabase
      .from('visit_registrations')
      .update({ contact_shared: body.contact_shared })
      .eq('id', registrationId)
      .eq('visit_id', visitId);

    if (error) {
      console.error('[PATCH contact-sharing] Supabase error:', error);
      return NextResponse.json({ error: 'Failed to update contact sharing' }, { status: 500 });
    }

    return NextResponse.json({ success: true, contact_shared: body.contact_shared });
  } catch (err: any) {
    console.error('[PATCH contact-sharing] Unexpected error:', err.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
