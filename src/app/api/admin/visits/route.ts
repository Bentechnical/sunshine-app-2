// GET /api/admin/visits — list all visits with optional filters
// POST /api/admin/visits — manually create a visit

import { NextRequest, NextResponse } from 'next/server';
import { requireAdminOrPd } from '@/utils/requireAdminOrPd';
import { createSupabaseAdminClient } from '@/utils/supabase/admin';
import { fromZonedTime } from 'date-fns-tz';
import { geocodePostalCodeServer } from '@/utils/geocode';
import { createVisitEvent } from '@/utils/googleCalendar';

const EASTERN = 'America/New_York';

export async function GET(req: NextRequest) {
  const check = await requireAdminOrPd();
  if ('error' in check) return check.error;

  try {
    const supabase = createSupabaseAdminClient();
    const { searchParams } = new URL(req.url);

    const status = searchParams.get('status');
    const scope = searchParams.get('scope'); // 'active' | 'past'
    const dateFrom = searchParams.get('date_from');
    const dateTo = searchParams.get('date_to');

    const now = new Date().toISOString();

    // scope=past: most recent first; everything else: soonest first
    const ascending = scope !== 'past';

    let query = supabase
      .from('visits')
      .select(`
        id, title, organization_id, guest_org_name, guest_contact_name, guest_contact_email,
        visit_date, start_time, end_time, address, volunteer_slots,
        requires_vsc, requires_vaccine_record, status, admin_note,
        assigned_pd_id,
        created_at, updated_at,
        org:organization_id(profile_image, org_name),
        visit_registrations(id, status)
      `)
      .order('visit_date', { ascending });

    if (scope === 'active') {
      // Approved visits whose end_time is in the future
      query = query.eq('status', 'approved').gt('end_time', now);
    } else if (scope === 'past') {
      // Approved visits that have ended (cleanup not yet run) + all completed visits
      query = query.in('status', ['approved', 'completed']).lte('end_time', now);
    } else if (status) {
      query = query.eq('status', status);
    }

    if (dateFrom) {
      query = query.gte('visit_date', dateFrom);
    }
    if (dateTo) {
      query = query.lte('visit_date', dateTo);
    }

    const { data: visits, error } = await query;
    if (error) {
      console.error('[GET /api/admin/visits] Supabase error:', error);
      return NextResponse.json({ error: 'Failed to fetch visits' }, { status: 500 });
    }

    // Annotate with slot counts
    const annotated = (visits ?? []).map((v) => {
      const regs = (v.visit_registrations as any[]) ?? [];
      const confirmedCount = regs.filter((r: any) => r.status === 'confirmed').length;
      const waitlistCount = regs.filter((r: any) => r.status === 'waitlisted').length;
      const org = (v as any).org as { profile_image: string | null; org_name: string | null } | null;
      return {
        ...v,
        confirmed_count: confirmedCount,
        waitlist_count: waitlistCount,
        slots_remaining: Math.max(0, (v.volunteer_slots as number) - confirmedCount),
        org_profile_image: org?.profile_image ?? null,
        org_name: org?.org_name ?? null,
        org: undefined,
        visit_registrations: undefined,
      };
    });

    return NextResponse.json({ visits: annotated });
  } catch (err: any) {
    console.error('[GET /api/admin/visits] Unexpected error:', err.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const check = await requireAdminOrPd();
  if ('error' in check) return check.error;
  const { userId } = check;

  try {
    const supabase = createSupabaseAdminClient();
    const body = await req.json();

    const {
      title,
      organization_id,
      guest_org_name,
      guest_contact_name,
      guest_contact_email,
      guest_contact_phone,
      visit_date,
      start_time,
      end_time,
      address,
      location_place_id,
      location_lat,
      location_lng,
      postal_code,
      audience_age_ranges,
      visitor_count_expected,
      special_needs_notes,
      approx_space_sqft,
      fee_tier,
      fee_amount,
      volunteer_slots,
      parking_coverage,
      parking_instructions,
      arrival_instructions,
      accessibility_notes,
      requires_vsc,
      status,
      assigned_pd_id,
    } = body;

    if (!visit_date || !start_time || !end_time || !address) {
      return NextResponse.json(
        { error: 'Visit date, start time, end time, and address are required' },
        { status: 400 }
      );
    }

    const startTimestamp = fromZonedTime(`${visit_date}T${start_time}:00`, EASTERN).toISOString();
    const endTimestamp = fromZonedTime(`${visit_date}T${end_time}:00`, EASTERN).toISOString();

    // Use lat/lng from Places selection if provided; fall back to postal code geocoding
    let resolvedLat = location_lat ?? null;
    let resolvedLng = location_lng ?? null;
    if (!resolvedLat && !resolvedLng && postal_code) {
      const geo = await geocodePostalCodeServer(postal_code);
      if (geo) {
        resolvedLat = geo.lat;
        resolvedLng = geo.lng;
      }
    }

    const { data: visit, error } = await supabase
      .from('visits')
      .insert({
        title: title ?? null,
        organization_id: organization_id ?? null,
        guest_org_name: guest_org_name ?? null,
        guest_contact_name: guest_contact_name ?? null,
        guest_contact_email: guest_contact_email ?? null,
        guest_contact_phone: guest_contact_phone ?? null,
        visit_date,
        start_time: startTimestamp,
        end_time: endTimestamp,
        address,
        location_place_id: location_place_id ?? null,
        postal_code: postal_code ?? null,
        location_lat: resolvedLat,
        location_lng: resolvedLng,
        audience_age_ranges: audience_age_ranges ?? null,
        visitor_count_expected: visitor_count_expected ?? null,
        special_needs_notes: special_needs_notes ?? null,
        approx_space_sqft: approx_space_sqft ?? null,
        fee_tier: fee_tier ?? null,
        fee_amount: fee_amount ?? null,
        volunteer_slots: volunteer_slots ?? 1,
        parking_coverage: parking_coverage ?? null,
        parking_instructions: parking_instructions ?? null,
        arrival_instructions: arrival_instructions ?? null,
        accessibility_notes: accessibility_notes ?? null,
        requires_vsc: requires_vsc ?? false,
        requires_vaccine_record: true, // always required for all visits
        status: status ?? 'pending_review',
        assigned_pd_id: assigned_pd_id ?? null,
        created_by: userId,
      })
      .select('id')
      .single();

    if (error) {
      console.error('[POST /api/admin/visits] Supabase error:', error);
      return NextResponse.json({ error: 'Failed to create visit' }, { status: 500 });
    }

    // If created as approved, create Google Calendar event in background
    if ((status ?? 'pending_review') === 'approved') {
      const { data: fullVisit } = await supabase
        .from('visits')
        .select(`
          id, title, guest_org_name, guest_contact_name, guest_contact_email, guest_contact_phone,
          address, start_time, end_time, audience_age_ranges, visitor_count_expected,
          special_needs_notes, accessibility_notes, volunteer_slots, parking_coverage, parking_instructions,
          arrival_instructions, fee_tier, fee_amount, requires_vsc, requires_vaccine_record,
          admin_note, assigned_pd_id
        `)
        .eq('id', visit.id)
        .single();

      if (fullVisit) {
        // Collect attendee emails (org contact + assigned PD)
        const attendeeEmails: string[] = [];
        if (fullVisit.guest_contact_email) attendeeEmails.push(fullVisit.guest_contact_email);
        if (fullVisit.assigned_pd_id) {
          const { data: pdUser } = await supabase
            .from('users')
            .select('email')
            .eq('id', fullVisit.assigned_pd_id)
            .single();
          if (pdUser?.email) attendeeEmails.push(pdUser.email);
        }

        createVisitEvent(fullVisit as any, attendeeEmails).then(calendarEventId => {
          if (calendarEventId) {
            supabase
              .from('visits')
              .update({ google_calendar_event_id: calendarEventId })
              .eq('id', visit.id)
              .then(({ error: updateErr }) => {
                if (updateErr) console.error('[POST /api/admin/visits] Failed to store calendar event ID:', updateErr);
              });
          }
        }).catch(err => console.error('[POST /api/admin/visits] Calendar event creation failed:', err));
      }
    }

    return NextResponse.json({ success: true, visitId: visit.id }, { status: 201 });
  } catch (err: any) {
    console.error('[POST /api/admin/visits] Unexpected error:', err.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
