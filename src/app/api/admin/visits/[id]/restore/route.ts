// POST /api/admin/visits/[id]/restore
// Restores a cancelled visit back to approved status and recreates the Google Calendar event.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createSupabaseAdminClient } from '@/utils/supabase/admin';
import { createVisitEvent } from '@/utils/googleCalendar';

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

    const supabase = createSupabaseAdminClient();

    // Verify admin/pd
    const { data: user } = await supabase
      .from('users')
      .select('role')
      .eq('id', userId)
      .single();

    if (!user || !['admin', 'pd'].includes(user.role)) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    // Fetch the full visit for GCal recreation
    const { data: visit, error: fetchError } = await supabase
      .from('visits')
      .select(`
        id, status, title, guest_org_name, guest_contact_name, guest_contact_email,
        visit_date, start_time, end_time, address, organization_id, assigned_pd_id,
        audience_age_ranges, visitor_count_expected, event_description, accessibility_notes,
        volunteer_slots, parking_coverage, parking_instructions, arrival_instructions,
        fee_tier, fee_amount, requires_vsc, requires_vaccine_record, admin_note
      `)
      .eq('id', visitId)
      .single();

    if (fetchError || !visit) {
      return NextResponse.json({ error: 'Visit not found' }, { status: 404 });
    }

    if (visit.status !== 'cancelled') {
      return NextResponse.json({ error: 'Only cancelled visits can be restored' }, { status: 400 });
    }

    // Restore to approved
    const { error } = await supabase
      .from('visits')
      .update({ status: 'approved', admin_note: null })
      .eq('id', visitId);

    if (error) {
      console.error('[restore] Supabase error:', error);
      return NextResponse.json({ error: 'Failed to restore visit' }, { status: 500 });
    }

    // Recreate Google Calendar event in background
    const attendeeEmails: string[] = [];

    // Add org contact email
    if (visit.organization_id) {
      const { data: orgUser } = await supabase
        .from('users')
        .select('email')
        .eq('id', visit.organization_id)
        .single();
      if (orgUser?.email) attendeeEmails.push(orgUser.email);
    } else if (visit.guest_contact_email) {
      attendeeEmails.push(visit.guest_contact_email);
    }

    // Add assigned PD email
    if (visit.assigned_pd_id) {
      const { data: pdUser } = await supabase
        .from('users')
        .select('email')
        .eq('id', visit.assigned_pd_id)
        .single();
      if (pdUser?.email) attendeeEmails.push(pdUser.email);
    }

    createVisitEvent(visit as any, attendeeEmails).then(calendarEventId => {
      if (calendarEventId) {
        supabase
          .from('visits')
          .update({ google_calendar_event_id: calendarEventId })
          .eq('id', visitId)
          .then(({ error: updateErr }) => {
            if (updateErr) console.error('[restore] Failed to store calendar event ID:', updateErr);
          });
      }
    }).catch(err => console.error('[restore] Calendar event creation failed:', err));

    console.log(`[restore] Visit ${visitId} restored to approved by ${userId}`);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[restore] Unexpected error:', err.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
