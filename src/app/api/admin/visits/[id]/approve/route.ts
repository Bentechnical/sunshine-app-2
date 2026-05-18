// POST /api/admin/visits/[id]/approve
// Body: { admin_note?: string }

import { NextRequest, NextResponse } from 'next/server';
import { requireAdminOrPd } from '@/utils/requireAdminOrPd';
import { createSupabaseAdminClient } from '@/utils/supabase/admin';
import { geocodePostalCodeServer } from '@/utils/geocode';
import { createVisitEvent } from '@/utils/googleCalendar';

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
        id, status, title, organization_id,
        guest_org_name, guest_contact_name, guest_contact_email, guest_contact_phone,
        visit_date, start_time, end_time, address,
        postal_code, location_lat, location_lng,
        audience_age_ranges, visitor_count_expected, special_needs_notes,
        volunteer_slots, parking_coverage, parking_instructions,
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

    // Resolve org contact email (linked account takes precedence over guest field)
    let orgContactEmail: string | null = visit.guest_contact_email ?? null;
    if (visit.organization_id) {
      const { data: orgUser } = await supabase
        .from('users')
        .select('email')
        .eq('id', visit.organization_id)
        .single();
      if (orgUser?.email) orgContactEmail = orgUser.email;
    }

    // Create Google Calendar event (non-blocking — failure won't prevent approval)
    const calendarEventId = await createVisitEvent(
      { ...visit, admin_note: adminNote ?? visit.admin_note },
      orgContactEmail,
    );
    if (calendarEventId) {
      await supabase
        .from('visits')
        .update({ google_calendar_event_id: calendarEventId })
        .eq('id', visitId);
    }

    // TODO: Send approval email to org contact

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[approve] Unexpected error:', err.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
