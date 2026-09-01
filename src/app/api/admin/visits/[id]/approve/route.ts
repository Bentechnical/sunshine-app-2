// POST /api/admin/visits/[id]/approve
// Body: { admin_note?: string }

import { NextRequest, NextResponse } from 'next/server';
import { requireAdminOrPd } from '@/utils/requireAdminOrPd';
import { createSupabaseAdminClient } from '@/utils/supabase/admin';
import { geocodePostalCodeServer } from '@/utils/geocode';
import { createVisitEvent } from '@/utils/googleCalendar';
import { sendTransactionalEmail } from '@/app/utils/mailer';
import { getAppUrl } from '@/app/utils/getAppUrl';

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
      .select(`
        id, status, title, organization_id, assigned_pd_id,
        guest_org_name, guest_contact_name, guest_contact_email, guest_contact_phone,
        visit_date, start_time, end_time, address,
        postal_code, location_lat, location_lng,
        audience_age_ranges, visitor_count_expected, event_description,
        accessibility_notes, volunteer_slots, parking_coverage, parking_instructions,
        arrival_instructions, fee_tier, fee_amount,
        requires_vsc, requires_vaccine_record, admin_note
      `)
      .eq('id', visitId)
      .single();

    if (fetchError || !visit) {
      return NextResponse.json({ error: 'Visit not found' }, { status: 404 });
    }
    if (visit.status !== 'pending_review') {
      return NextResponse.json({ error: 'Only pending_review visits can be approved' }, { status: 400 });
    }

    const approvalUpdate: Record<string, unknown> = { status: 'approved', admin_note: adminNote };

    // Geocode postal code if lat/lng not already set
    if (!visit.location_lat && !visit.location_lng && visit.postal_code) {
      const geo = await geocodePostalCodeServer(visit.postal_code);
      if (geo) {
        approvalUpdate.location_lat = geo.lat;
        approvalUpdate.location_lng = geo.lng;
      }
    }

    const { error } = await supabase
      .from('visits')
      .update(approvalUpdate)
      .eq('id', visitId);

    if (error) {
      console.error('[approve] Supabase error:', error);
      return NextResponse.json({ error: 'Failed to approve visit' }, { status: 500 });
    }

    // Resolve org contact info (linked account takes precedence over guest fields)
    let orgContactEmail: string | null = visit.guest_contact_email ?? null;
    let orgName: string = visit.guest_org_name ?? '';
    let contactName: string = visit.guest_contact_name ?? '';
    let isAccountHolder = false;

    if (visit.organization_id) {
      const { data: orgUser } = await supabase
        .from('users')
        .select('email, org_name, org_contact_name')
        .eq('id', visit.organization_id)
        .single();
      if (orgUser) {
        if (orgUser.email) orgContactEmail = orgUser.email;
        if (orgUser.org_name) orgName = orgUser.org_name;
        if (orgUser.org_contact_name) contactName = orgUser.org_contact_name;
        isAccountHolder = true;
      }
    }

    // Use event-specific contact name if provided
    if (visit.guest_contact_name) contactName = visit.guest_contact_name;

    // Resolve assigned PD email for calendar invite
    let pdEmail: string | null = null;
    if ((visit as any).assigned_pd_id) {
      const { data: pdUser } = await supabase
        .from('users')
        .select('email')
        .eq('id', (visit as any).assigned_pd_id)
        .single();
      if (pdUser?.email) pdEmail = pdUser.email;
    }

    // Create Google Calendar event in background — does not block the response
    const attendeeEmails = [orgContactEmail, pdEmail].filter((e): e is string => !!e);
    createVisitEvent(
      { ...visit, admin_note: adminNote ?? visit.admin_note } as any,
      attendeeEmails,
    ).then(calendarEventId => {
      if (calendarEventId) {
        supabase
          .from('visits')
          .update({ google_calendar_event_id: calendarEventId })
          .eq('id', visitId)
          .then(({ error }) => {
            if (error) console.error('[approve] Failed to store calendar event ID:', error);
          });
      }
    }).catch(err => console.error('[approve] Calendar event creation failed:', err));

    // Send approval email to org contact
    if (orgContactEmail) {
      const ccEmail = visit.guest_contact_email && visit.guest_contact_email !== orgContactEmail
        ? visit.guest_contact_email
        : undefined;

      const formattedDate = new Date(visit.visit_date).toLocaleDateString('en-CA', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      });
      const formattedTime = [
        new Date(visit.start_time).toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit', hour12: true }),
        new Date(visit.end_time).toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit', hour12: true }),
      ].join(' – ');

      sendTransactionalEmail({
        to: orgContactEmail,
        ...(ccEmail ? { cc: ccEmail } : {}),
        subject: 'Your visit request has been approved — Sunshine Therapy Dogs',
        templateName: 'visitApproved',
        data: {
          contactName: contactName || 'there',
          orgName: orgName || 'your organization',
          visitDate: formattedDate,
          visitTime: formattedTime,
          visitAddress: visit.address,
          visitAddressMapLink: visit.address ? `https://maps.google.com/?q=${encodeURIComponent(visit.address)}` : null,
          adminNote: adminNote || visit.admin_note || null,
          dashboardLink: isAccountHolder ? `${getAppUrl()}/dashboard/organization` : null,
          year: new Date().getFullYear(),
        },
      }).catch(err => console.error('[approve] Failed to send approval email:', err));
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[approve] Unexpected error:', err.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
