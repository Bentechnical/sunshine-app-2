// POST /api/visits/[id]/cancel-registration
// Volunteer cancels their own registration for a visit.
// Body: { reason?: string }

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createSupabaseAdminClient } from '@/utils/supabase/admin';
import { removeAttendeeFromEvent, refreshVisitEventDescription } from '@/utils/googleCalendar';
import { promoteNextWaitlisted } from '@/utils/promoteNextWaitlisted';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const visitId = parseInt(id, 10);
    if (isNaN(visitId)) {
      return NextResponse.json({ error: 'Invalid visit ID' }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const reason = body.reason ?? null;

    const supabase = createSupabaseAdminClient();

    // Find the volunteer's active registration
    const { data: registration, error: regError } = await supabase
      .from('visit_registrations')
      .select('id, status')
      .eq('visit_id', visitId)
      .eq('volunteer_id', userId)
      .neq('status', 'cancelled')
      .maybeSingle();

    if (regError || !registration) {
      return NextResponse.json({ error: 'No active registration found for this visit' }, { status: 404 });
    }

    const wasConfirmed = registration.status === 'confirmed';

    // Cancel the registration
    const { error: cancelError } = await supabase
      .from('visit_registrations')
      .update({
        status: 'cancelled',
        cancellation_reason: reason,
        cancelled_at: new Date().toISOString(),
      })
      .eq('id', registration.id);

    if (cancelError) {
      console.error('[POST cancel-registration] Supabase error:', cancelError);
      return NextResponse.json({ error: 'Failed to cancel registration' }, { status: 500 });
    }

    // If the cancelled registration was confirmed, notify admin/PD
    // and check if there are waitlisted volunteers to promote
    if (wasConfirmed) {
      // Get visit details for context
      const { data: visit } = await supabase
        .from('visits')
        .select('id, title, visit_date, start_time, google_calendar_event_id')
        .eq('id', visitId)
        .single();

      // Remove volunteer from Google Calendar event and refresh description
      if ((visit as any)?.google_calendar_event_id) {
        const { data: volunteerUser } = await supabase
          .from('users')
          .select('email')
          .eq('id', userId)
          .single();
        if (volunteerUser?.email) {
          await removeAttendeeFromEvent((visit as any).google_calendar_event_id, volunteerUser.email);
        }
        refreshVisitEventDescription(visitId).catch(err =>
          console.error('[cancel-registration] Failed to refresh GCal description:', err)
        );
      }

      // TODO: Notify admin/PD of volunteer cancellation
      // TODO: If within 72h of visit_date, flag as URGENT in notification

      // Promote next waitlisted volunteer (if any)
      const { promoted } = await promoteNextWaitlisted(supabase, visitId);
      if (!promoted) {
        console.log(`[cancel-registration] Visit ${visitId} has an open slot with no waitlist`);
      }
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[POST cancel-registration] Unexpected error:', err.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
