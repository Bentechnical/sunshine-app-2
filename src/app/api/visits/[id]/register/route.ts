// POST /api/visits/[id]/register
// Approved volunteer signs up for or joins the waitlist for a visit.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createSupabaseAdminClient } from '@/utils/supabase/admin';
import { addAttendeeToEvent } from '@/utils/googleCalendar';
import { sendTransactionalEmail } from '@/app/utils/mailer';
import { getAppUrl } from '@/app/utils/getAppUrl';

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

    const supabase = createSupabaseAdminClient();

    // Verify caller is an approved volunteer
    const { data: volunteer, error: volunteerError } = await supabase
      .from('users')
      .select('role, status, vsc_document_url')
      .eq('id', userId)
      .single();

    if (volunteerError || !volunteer) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    if (volunteer.role !== 'volunteer') {
      return NextResponse.json({ error: 'Volunteer account required' }, { status: 403 });
    }
    if (volunteer.status !== 'approved') {
      return NextResponse.json({ error: 'Your account is pending approval' }, { status: 403 });
    }

    // Load the visit
    const { data: visit, error: visitError } = await supabase
      .from('visits')
      .select('id, status, volunteer_slots, requires_vsc, requires_vaccine_record, google_calendar_event_id')
      .eq('id', visitId)
      .single();

    if (visitError || !visit) {
      return NextResponse.json({ error: 'Visit not found' }, { status: 404 });
    }
    if (visit.status !== 'approved') {
      return NextResponse.json({ error: 'This visit is not open for registration' }, { status: 400 });
    }

    // Check compliance requirements
    if (visit.requires_vsc && !volunteer.vsc_document_url) {
      return NextResponse.json(
        { error: 'This visit requires a VSC document. Please upload your VSC before signing up.' },
        { status: 403 }
      );
    }

    if (visit.requires_vaccine_record) {
      // Check dog vaccine record
      const { data: dog } = await supabase
        .from('dogs')
        .select('vaccine_record_url')
        .eq('volunteer_id', userId)
        .neq('status', 'archived')
        .maybeSingle();

      if (!dog?.vaccine_record_url) {
        return NextResponse.json(
          { error: 'This visit requires a dog vaccine record. Please upload your dog\'s vaccine record before signing up.' },
          { status: 403 }
        );
      }
    }

    // Check if already registered (any non-cancelled status)
    const { data: existing } = await supabase
      .from('visit_registrations')
      .select('id, status')
      .eq('visit_id', visitId)
      .eq('volunteer_id', userId)
      .maybeSingle();

    if (existing && existing.status !== 'cancelled') {
      return NextResponse.json(
        { error: 'You are already registered for this visit' },
        { status: 409 }
      );
    }

    // Count current confirmed registrations to determine slot availability
    const { count: confirmedCount } = await supabase
      .from('visit_registrations')
      .select('id', { count: 'exact', head: true })
      .eq('visit_id', visitId)
      .eq('status', 'confirmed');

    const slotsAvailable = (confirmedCount ?? 0) < (visit.volunteer_slots as number);
    const newStatus = slotsAvailable ? 'confirmed' : 'waitlisted';

    let waitlistPosition: number | null = null;
    if (!slotsAvailable) {
      const { count: waitlistCount } = await supabase
        .from('visit_registrations')
        .select('id', { count: 'exact', head: true })
        .eq('visit_id', visitId)
        .eq('status', 'waitlisted');
      waitlistPosition = (waitlistCount ?? 0) + 1;
    }

    // Upsert (handles the case where a prior cancelled registration exists)
    const { data: registration, error: regError } = existing
      ? await supabase
          .from('visit_registrations')
          .update({
            status: newStatus,
            waitlist_position: waitlistPosition,
            cancellation_reason: null,
            cancelled_at: null,
          })
          .eq('id', existing.id)
          .select('id, status, waitlist_position')
          .single()
      : await supabase
          .from('visit_registrations')
          .insert({
            visit_id: visitId,
            volunteer_id: userId,
            status: newStatus,
            waitlist_position: waitlistPosition,
          })
          .select('id, status, waitlist_position')
          .single();

    if (regError) {
      console.error('[POST /api/visits/[id]/register] Supabase error:', regError);
      return NextResponse.json({ error: 'Failed to register for visit' }, { status: 500 });
    }

    // Add volunteer as attendee on Google Calendar event (confirmed only)
    if (newStatus === 'confirmed' && (visit as any).google_calendar_event_id) {
      const { data: volunteerUser } = await supabase
        .from('users')
        .select('email')
        .eq('id', userId)
        .single();
      if (volunteerUser?.email) {
        await addAttendeeToEvent((visit as any).google_calendar_event_id, volunteerUser.email);
      }
    }

    // Send confirmation email to volunteer
    const { data: volunteerUser } = await supabase
      .from('users')
      .select('email, first_name')
      .eq('id', userId)
      .single();

    if (volunteerUser?.email) {
      const visitTitle = (visit as any).title || (visit as any).guest_org_name || 'Therapy Dog Visit';
      const formattedDate = new Date((visit as any).visit_date).toLocaleDateString('en-CA', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      });
      const formattedTime = [
        new Date((visit as any).start_time).toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit', hour12: true }),
        new Date((visit as any).end_time).toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit', hour12: true }),
      ].join(' – ');

      sendTransactionalEmail({
        to: volunteerUser.email,
        subject: newStatus === 'confirmed'
          ? 'You\'re signed up for a visit — Sunshine Therapy Dogs'
          : 'You\'ve been added to the waitlist — Sunshine Therapy Dogs',
        templateName: newStatus === 'confirmed' ? 'visitSignupConfirmed' : 'visitWaitlisted',
        data: {
          firstName: volunteerUser.first_name || 'there',
          visitTitle,
          visitDate: formattedDate,
          visitTime: formattedTime,
          visitAddress: (visit as any).address,
          waitlistPosition: waitlistPosition ?? undefined,
          dashboardLink: `${getAppUrl()}/dashboard/visits`,
          year: new Date().getFullYear(),
        },
      }).catch(err => console.error('[register] Failed to send volunteer email:', err));
    }

    return NextResponse.json({
      success: true,
      status: newStatus,
      waitlist_position: waitlistPosition,
      registration_id: registration.id,
    });
  } catch (err: any) {
    console.error('[POST /api/visits/[id]/register] Unexpected error:', err.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
