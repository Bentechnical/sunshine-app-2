// POST /api/admin/visits/[id]/registrations/[regId]/promote
// Move a waitlisted volunteer into an open spot (admin/PD only). Sends the visitWaitlistPromoted email.

import { NextRequest, NextResponse } from 'next/server';
import { requireAdminOrPd } from '@/utils/requireAdminOrPd';
import { createSupabaseAdminClient } from '@/utils/supabase/admin';
import { promoteWaitlistedRegistration } from '@/utils/promoteWaitlisted';
import { recalcVisitStaffing } from '@/utils/recalcVisitStaffing';

export async function POST(
  _req: NextRequest,
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

    const supabase = createSupabaseAdminClient();

    const { data: visit, error: visitError } = await supabase
      .from('visits')
      .select('id, status, volunteer_slots')
      .eq('id', visitId)
      .single();

    if (visitError || !visit) {
      return NextResponse.json({ error: 'Visit not found' }, { status: 404 });
    }
    if (visit.status !== 'approved') {
      return NextResponse.json({ error: 'Only approved visits can have volunteers promoted' }, { status: 400 });
    }

    const { data: registration } = await supabase
      .from('visit_registrations')
      .select('id, status')
      .eq('id', registrationId)
      .eq('visit_id', visitId)
      .maybeSingle();

    if (!registration) {
      return NextResponse.json({ error: 'Registration not found' }, { status: 404 });
    }
    if (registration.status !== 'waitlisted') {
      return NextResponse.json({ error: 'This volunteer is no longer on the waitlist' }, { status: 409 });
    }

    const { count: confirmedCount } = await supabase
      .from('visit_registrations')
      .select('id', { count: 'exact', head: true })
      .eq('visit_id', visitId)
      .eq('status', 'confirmed');

    if ((confirmedCount ?? 0) >= (visit.volunteer_slots as number)) {
      return NextResponse.json(
        { error: 'This visit is full. Remove a volunteer or raise the maximum number of dogs before promoting.' },
        { status: 409 }
      );
    }

    const { promoted } = await promoteWaitlistedRegistration(supabase, visitId, registrationId);
    if (!promoted) {
      return NextResponse.json({ error: 'Failed to promote volunteer' }, { status: 500 });
    }

    await recalcVisitStaffing(supabase, visitId);

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[POST promote] Unexpected error:', err.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
