// POST /api/visits/[id]/cancel
// Organization cancels their own visit.
// Body: { action: 'cancel' | 'delete' }

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createSupabaseAdminClient } from '@/utils/supabase/admin';
import { cancelVisitEvent } from '@/utils/googleCalendar';
import { sendTransactionalEmail } from '@/app/utils/mailer';
import { getAppUrl } from '@/app/utils/getAppUrl';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const visitId = parseInt(id, 10);
    if (isNaN(visitId)) return NextResponse.json({ error: 'Invalid visit ID' }, { status: 400 });

    const body = await req.json().catch(() => ({}));
    const action = body.action ?? 'cancel';
    const cancelReason = typeof body.cancel_reason === 'string' ? body.cancel_reason.trim() : null;

    const supabase = createSupabaseAdminClient();

    // Verify caller is the org that owns this visit
    const { data: user } = await supabase
      .from('users')
      .select('role')
      .eq('id', userId)
      .single();

    if (!user || user.role !== 'organization') {
      return NextResponse.json({ error: 'Organization account required' }, { status: 403 });
    }

    const { data: visit, error: fetchError } = await supabase
      .from('visits')
      .select('id, status, title, guest_org_name, visit_date, start_time, end_time, address, organization_id, google_calendar_event_id')
      .eq('id', visitId)
      .single();

    if (fetchError || !visit) {
      return NextResponse.json({ error: 'Visit not found' }, { status: 404 });
    }
    if (visit.organization_id !== userId) {
      return NextResponse.json({ error: 'You can only cancel your own visits' }, { status: 403 });
    }
    if (!['pending_review', 'approved'].includes(visit.status as string)) {
      return NextResponse.json({ error: 'This visit cannot be cancelled in its current state' }, { status: 400 });
    }

    // Fetch active registrations
    const { data: registrations } = await supabase
      .from('visit_registrations')
      .select('id, volunteer_id, status')
      .eq('visit_id', visitId)
      .in('status', ['confirmed', 'waitlisted']);

    const hasActiveRegs = (registrations?.length ?? 0) > 0;

    // Delete path — only allowed with no active registrations
    if (action === 'delete') {
      if (hasActiveRegs) {
        return NextResponse.json({ error: 'Cannot delete a visit with registered volunteers' }, { status: 400 });
      }

      // Remove Google Calendar event
      if ((visit as any).google_calendar_event_id) {
        await cancelVisitEvent((visit as any).google_calendar_event_id);
      }

      // Delete any cancelled registrations (FK constraint)
      await supabase
        .from('visit_registrations')
        .delete()
        .eq('visit_id', visitId);

      const { error: deleteError } = await supabase
        .from('visits')
        .delete()
        .eq('id', visitId);

      if (deleteError) {
        console.error('[org cancel] Delete error:', deleteError);
        return NextResponse.json({ error: 'Failed to delete visit' }, { status: 500 });
      }

      console.log(`[org cancel] Visit ${visitId} permanently deleted by org ${userId}`);
      return NextResponse.json({ success: true, action: 'deleted' });
    }

    // Cancel path
    const { error } = await supabase
      .from('visits')
      .update({ status: 'cancelled', ...(cancelReason ? { admin_note: cancelReason } : {}) })
      .eq('id', visitId);

    if (error) {
      console.error('[org cancel] Supabase error:', error);
      return NextResponse.json({ error: 'Failed to cancel visit' }, { status: 500 });
    }

    // Remove Google Calendar event
    if ((visit as any).google_calendar_event_id) {
      await cancelVisitEvent((visit as any).google_calendar_event_id);
    }

    // Notify registered volunteers
    if (hasActiveRegs) {
      const volunteerIds = registrations!.map(r => r.volunteer_id);
      const { data: volunteers } = await supabase
        .from('users')
        .select('id, email, first_name')
        .in('id', volunteerIds);

      const visitTitle = visit.title || visit.guest_org_name || 'Therapy Dog Visit';
      const formattedDate = new Date(visit.visit_date).toLocaleDateString('en-CA', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      });
      const formattedTime = [
        new Date(visit.start_time).toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit', hour12: true }),
        new Date(visit.end_time).toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit', hour12: true }),
      ].join(' – ');

      if (volunteers) {
        for (const vol of volunteers) {
          if (!vol.email) continue;
          sendTransactionalEmail({
            to: vol.email,
            subject: `Visit cancelled — ${visitTitle}`,
            templateName: 'visitCancelledVolunteer',
            data: {
              firstName: vol.first_name || 'there',
              visitTitle,
              visitDate: formattedDate,
              visitTime: formattedTime,
              visitAddress: visit.address,
              dashboardLink: `${getAppUrl()}/dashboard/visits`,
              year: new Date().getFullYear(),
            },
          }).catch(err => console.error(`[org cancel] Failed to email volunteer ${vol.id}:`, err));
        }
      }

      // Mark registrations as cancelled
      await supabase
        .from('visit_registrations')
        .update({ status: 'cancelled', cancellation_reason: 'Visit cancelled by organization', cancelled_at: new Date().toISOString() })
        .eq('visit_id', visitId)
        .in('status', ['confirmed', 'waitlisted']);
    }

    console.log(`[org cancel] Visit ${visitId} cancelled by org ${userId}, ${registrations?.length ?? 0} volunteers notified`);
    return NextResponse.json({ success: true, action: 'cancelled', notified_count: registrations?.length ?? 0 });
  } catch (err: any) {
    console.error('[org cancel] Unexpected error:', err.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
