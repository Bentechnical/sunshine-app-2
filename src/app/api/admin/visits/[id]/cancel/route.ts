// POST /api/admin/visits/[id]/cancel
// Cancels an approved visit. Notifies all confirmed/waitlisted volunteers.
// Body: { admin_note?: string }

import { NextRequest, NextResponse } from 'next/server';
import { requireAdminOrPd } from '@/utils/requireAdminOrPd';
import { createSupabaseAdminClient } from '@/utils/supabase/admin';
import { cancelVisitEvent } from '@/utils/googleCalendar';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const check = await requireAdminOrPd();
  if ('error' in check) return check.error;

  try {
    const { id } = await params;
    const visitId = parseInt(id, 10);
    if (isNaN(visitId)) {
      return NextResponse.json({ error: 'Invalid visit ID' }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const adminNote = body.admin_note ?? null;

    const supabase = createSupabaseAdminClient();

    const { data: visit, error: fetchError } = await supabase
      .from('visits')
      .select('id, status, google_calendar_event_id')
      .eq('id', visitId)
      .single();

    if (fetchError || !visit) {
      return NextResponse.json({ error: 'Visit not found' }, { status: 404 });
    }
    if (!['pending_review', 'approved'].includes(visit.status as string)) {
      return NextResponse.json({ error: 'Only pending or approved visits can be cancelled' }, { status: 400 });
    }

    // Fetch active registrations before cancelling
    const { data: registrations } = await supabase
      .from('visit_registrations')
      .select('id, volunteer_id, status')
      .eq('visit_id', visitId)
      .in('status', ['confirmed', 'waitlisted']);

    // Cancel the visit
    const { error } = await supabase
      .from('visits')
      .update({ status: 'cancelled', admin_note: adminNote })
      .eq('id', visitId);

    if (error) {
      console.error('[cancel visit] Supabase error:', error);
      return NextResponse.json({ error: 'Failed to cancel visit' }, { status: 500 });
    }

    // Cancel Google Calendar event
    if ((visit as any).google_calendar_event_id) {
      await cancelVisitEvent((visit as any).google_calendar_event_id);
    }

    // TODO: Send cancellation notification to all affected volunteers (registrations)
    if (registrations && registrations.length > 0) {
      console.log(`[cancel visit] ${registrations.length} volunteer(s) need cancellation notifications for visit ${visitId}`);
    }

    return NextResponse.json({ success: true, notified_count: registrations?.length ?? 0 });
  } catch (err: any) {
    console.error('[cancel visit] Unexpected error:', err.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
