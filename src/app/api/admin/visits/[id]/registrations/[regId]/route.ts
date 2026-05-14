// DELETE /api/admin/visits/[id]/registrations/[regId]
// Remove a volunteer from a visit (admin/PD only).
// Body: { admin_note?: string }

import { NextRequest, NextResponse } from 'next/server';
import { requireAdminOrPd } from '@/utils/requireAdminOrPd';
import { createSupabaseAdminClient } from '@/utils/supabase/admin';

export async function DELETE(
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

    const body = await req.json().catch(() => ({}));
    const adminNote = body.admin_note ?? null;

    const supabase = createSupabaseAdminClient();

    // Verify registration exists and belongs to this visit
    const { data: registration, error: fetchError } = await supabase
      .from('visit_registrations')
      .select('id, volunteer_id, status')
      .eq('id', registrationId)
      .eq('visit_id', visitId)
      .single();

    if (fetchError || !registration) {
      return NextResponse.json({ error: 'Registration not found' }, { status: 404 });
    }
    if (registration.status === 'cancelled') {
      return NextResponse.json({ error: 'Registration is already cancelled' }, { status: 400 });
    }

    const wasConfirmed = registration.status === 'confirmed';

    // Mark as cancelled with admin note instead of hard-deleting (preserve history)
    const { error } = await supabase
      .from('visit_registrations')
      .update({
        status: 'cancelled',
        admin_note: adminNote,
        cancelled_at: new Date().toISOString(),
      })
      .eq('id', registrationId);

    if (error) {
      console.error('[DELETE registration] Supabase error:', error);
      return NextResponse.json({ error: 'Failed to remove volunteer from visit' }, { status: 500 });
    }

    // TODO: Send notification email to volunteer (removed from visit)
    // TODO: If was confirmed, remove from Google Calendar event
    // If was confirmed, check for waitlist volunteers to notify
    if (wasConfirmed) {
      const { data: nextWaitlisted } = await supabase
        .from('visit_registrations')
        .select('id, volunteer_id, waitlist_position')
        .eq('visit_id', visitId)
        .eq('status', 'waitlisted')
        .order('waitlist_position', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (nextWaitlisted) {
        // TODO: Send waitlist promotion email to nextWaitlisted.volunteer_id
        console.log(`[DELETE registration] Waitlist promotion needed for volunteer ${nextWaitlisted.volunteer_id} on visit ${visitId}`);
      }
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[DELETE registration] Unexpected error:', err.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
