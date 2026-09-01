// POST /api/admin/visits/[id]/send-details
// Admin/PD manually sends visit details email to a specific registered volunteer.

import { NextRequest, NextResponse } from 'next/server';
import { requireAdminOrPd } from '@/utils/requireAdminOrPd';
import { createSupabaseAdminClient } from '@/utils/supabase/admin';
import { sendTransactionalEmail } from '@/app/utils/mailer';
import { getAppUrl } from '@/app/utils/getAppUrl';

const PARKING_COVERAGE_LABELS: Record<string, string> = {
  free_on_site: 'Free parking on-site',
  reimbursed_on_site: 'Volunteers pay — reimbursed on-site',
  invoice: 'Volunteers pay — added to invoice',
};

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

    const { volunteer_id } = await req.json();
    if (!volunteer_id) {
      return NextResponse.json({ error: 'volunteer_id is required' }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();

    // Load the visit
    const { data: visit, error: visitError } = await supabase
      .from('visits')
      .select(`
        id, title, guest_org_name, visit_date, start_time, end_time, address,
        parking_coverage, parking_instructions, arrival_instructions,
        accessibility_notes, event_description,
        guest_contact_name, guest_contact_email, guest_contact_phone
      `)
      .eq('id', visitId)
      .single();

    if (visitError || !visit) {
      return NextResponse.json({ error: 'Visit not found' }, { status: 404 });
    }

    // Verify the volunteer is registered for this visit
    const { data: registration } = await supabase
      .from('visit_registrations')
      .select('id, status')
      .eq('visit_id', visitId)
      .eq('volunteer_id', volunteer_id)
      .in('status', ['confirmed', 'waitlisted'])
      .maybeSingle();

    if (!registration) {
      return NextResponse.json({ error: 'Volunteer is not registered for this visit' }, { status: 400 });
    }

    // Get volunteer info
    const { data: volunteerUser } = await supabase
      .from('users')
      .select('email, first_name')
      .eq('id', volunteer_id)
      .single();

    if (!volunteerUser?.email) {
      return NextResponse.json({ error: 'Volunteer email not found' }, { status: 404 });
    }

    const v = visit as any;
    const visitTitle = v.title || v.guest_org_name || 'Therapy Dog Visit';
    const formattedDate = new Date(v.visit_date).toLocaleDateString('en-CA', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });
    const formattedTime = [
      new Date(v.start_time).toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit', hour12: true }),
      new Date(v.end_time).toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit', hour12: true }),
    ].join(' – ');

    const rawCoverage = v.parking_coverage as string | null;
    const visitAddressMapLink = v.address
      ? `https://maps.google.com/?q=${encodeURIComponent(v.address)}`
      : null;

    await sendTransactionalEmail({
      to: volunteerUser.email,
      subject: `Visit Details: ${visitTitle} — Sunshine Therapy Dogs`,
      templateName: 'visitSignupConfirmed',
      data: {
        firstName: volunteerUser.first_name || 'there',
        visitTitle,
        visitDate: formattedDate,
        visitTime: formattedTime,
        visitAddress: v.address,
        visitAddressMapLink,
        parkingCoverage: rawCoverage ? (PARKING_COVERAGE_LABELS[rawCoverage] ?? rawCoverage) : null,
        parkingInstructions: v.parking_instructions || null,
        arrivalInstructions: v.arrival_instructions || null,
        accessibilityNotes: v.accessibility_notes || null,
        eventDescription: v.event_description || null,
        contactName: v.guest_contact_name || null,
        contactEmail: v.guest_contact_email || null,
        contactPhone: v.guest_contact_phone || null,
        dashboardLink: `${getAppUrl()}/dashboard/visits`,
        year: new Date().getFullYear(),
      },
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[POST send-details] Unexpected error:', err.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
