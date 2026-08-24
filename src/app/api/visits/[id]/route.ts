// GET /api/visits/[id]
// Shared route used by org users (own visits) and volunteers (approved visits).
// Admin/PD can also access any visit.
//
// PATCH /api/visits/[id]
// Org users can edit their own pending_review or approved visits.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createSupabaseAdminClient } from '@/utils/supabase/admin';
import { fromZonedTime } from 'date-fns-tz';
import { geocodePostalCodeServer } from '@/utils/geocode';

const EASTERN = 'America/New_York';

export async function GET(
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

    // Get caller role
    const { data: caller, error: callerError } = await supabase
      .from('users')
      .select('role')
      .eq('id', userId)
      .single();

    if (callerError || !caller) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const { data: visit, error } = await supabase
      .from('visits')
      .select(`
        id, title, organization_id, guest_org_name, guest_contact_name,
        visit_date, start_time, end_time, address, location_lat, location_lng, location_place_id,
        audience_age_ranges, visitor_count_expected, special_needs_notes,
        approx_space_sqft, fee_tier, fee_amount, volunteer_slots,
        parking_coverage, parking_instructions, arrival_instructions,
        accessibility_notes, requires_vsc, requires_vaccine_record,
        status, admin_note, created_at, updated_at,
        visit_registrations(
          id, volunteer_id, status, waitlist_position, contact_shared, created_at,
          users:volunteer_id(first_name, dogs!volunteer_id(dog_name, dog_breed, dog_picture_url))
        )
      `)
      .eq('id', visitId)
      .single();

    if (error || !visit) {
      return NextResponse.json({ error: 'Visit not found' }, { status: 404 });
    }

    // Enforce access by role
    if (caller.role === 'volunteer') {
      if (visit.status !== 'approved') {
        return NextResponse.json({ error: 'Visit not found' }, { status: 404 });
      }
    } else if (caller.role === 'organization') {
      if (visit.organization_id !== userId) {
        return NextResponse.json({ error: 'Visit not found' }, { status: 404 });
      }

      const activeRegs = (visit.visit_registrations as any[]).filter((r: any) => r.status !== 'cancelled');

      const filtered = {
        ...visit,
        visit_registrations: activeRegs.map((r: any) => {
          const user = r.users ?? {};
          const dog = Array.isArray(user.dogs) ? user.dogs[0] : (user.dogs ?? null);
          return {
            id: r.id,
            status: r.status,
            volunteer_first_name: user.first_name ?? null,
            dog_name: dog?.dog_name ?? null,
            dog_breed: dog?.dog_breed ?? null,
            dog_picture_url: dog?.dog_picture_url ?? null,
          };
        }),
      };
      return NextResponse.json({ visit: filtered });
    } else if (!['admin', 'pd'].includes(caller.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    return NextResponse.json({ visit });
  } catch (err: any) {
    console.error('[GET /api/visits/[id]] Unexpected error:', err.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(
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

    // Verify caller owns this visit and it's in an editable state
    const { data: existing, error: fetchError } = await supabase
      .from('visits')
      .select('organization_id, status')
      .eq('id', visitId)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json({ error: 'Visit not found' }, { status: 404 });
    }
    if (existing.organization_id !== userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (!['pending_review', 'approved'].includes(existing.status)) {
      return NextResponse.json({ error: 'This visit cannot be edited' }, { status: 400 });
    }

    const body = await req.json();
    const {
      title,
      visit_date,
      start_time,
      end_time,
      address,
      postal_code,
      location_place_id,
      location_lat,
      location_lng,
      guest_contact_name,
      guest_contact_email,
      guest_contact_phone,
      visitor_count_expected,
      volunteer_slots,
      special_needs_notes,
      approx_space_sqft,
      audience_age_ranges,
      parking_coverage,
      parking_instructions,
      arrival_instructions,
      accessibility_notes,
      requires_vsc,
      requires_vaccine_record,
    } = body;

    const updates: Record<string, unknown> = {};
    if (title !== undefined) updates.title = title || null;
    if (address !== undefined) updates.address = address;
    // Places Autocomplete path: lat/lng/place_id provided directly
    if (location_place_id !== undefined) updates.location_place_id = location_place_id || null;
    if (location_lat !== undefined) updates.location_lat = location_lat ?? null;
    if (location_lng !== undefined) updates.location_lng = location_lng ?? null;
    // Postal code fallback path (legacy / manual entry)
    if (postal_code !== undefined && location_lat === undefined) {
      updates.postal_code = postal_code || null;
      if (postal_code) {
        const geo = await geocodePostalCodeServer(postal_code);
        if (geo) {
          updates.location_lat = geo.lat;
          updates.location_lng = geo.lng;
        }
      } else {
        updates.location_lat = null;
        updates.location_lng = null;
      }
    }
    if (guest_contact_name !== undefined) updates.guest_contact_name = guest_contact_name || null;
    if (guest_contact_email !== undefined) updates.guest_contact_email = guest_contact_email || null;
    if (guest_contact_phone !== undefined) updates.guest_contact_phone = guest_contact_phone || null;
    if (visitor_count_expected !== undefined) updates.visitor_count_expected = visitor_count_expected || null;
    if (volunteer_slots !== undefined) updates.volunteer_slots = volunteer_slots;
    if (special_needs_notes !== undefined) updates.special_needs_notes = special_needs_notes || null;
    if (approx_space_sqft !== undefined) updates.approx_space_sqft = approx_space_sqft || null;
    if (audience_age_ranges !== undefined) updates.audience_age_ranges = audience_age_ranges;
    if (parking_coverage !== undefined) updates.parking_coverage = parking_coverage || null;
    if (parking_instructions !== undefined) updates.parking_instructions = parking_instructions || null;
    if (arrival_instructions !== undefined) updates.arrival_instructions = arrival_instructions || null;
    if (accessibility_notes !== undefined) updates.accessibility_notes = accessibility_notes || null;
    if (requires_vsc !== undefined) updates.requires_vsc = requires_vsc;
    if (requires_vaccine_record !== undefined) updates.requires_vaccine_record = requires_vaccine_record;

    // Timestamps — require both date and time together
    if (visit_date !== undefined) updates.visit_date = visit_date;
    if (visit_date !== undefined && start_time !== undefined) {
      updates.start_time = fromZonedTime(`${visit_date}T${start_time}:00`, EASTERN).toISOString();
    }
    if (visit_date !== undefined && end_time !== undefined) {
      updates.end_time = fromZonedTime(`${visit_date}T${end_time}:00`, EASTERN).toISOString();
    }

    const { error: updateError } = await supabase
      .from('visits')
      .update(updates)
      .eq('id', visitId);

    if (updateError) {
      console.error('[PATCH /api/visits/[id]] Supabase error:', updateError);
      return NextResponse.json({ error: 'Failed to update visit' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[PATCH /api/visits/[id]] Unexpected error:', err.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
