// POST /api/public/visit-request
// No authentication required — guest organizations submit visit requests here.

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/utils/supabase/admin';
import { fromZonedTime } from 'date-fns-tz';

const EASTERN = 'America/New_York';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const {
      guest_org_name,
      guest_contact_name,
      guest_contact_email,
      guest_contact_phone,
      visit_date,
      start_time,
      end_time,
      address,
      postal_code,
      location_lat,
      location_lng,
      audience_age_ranges,
      visitor_count_expected,
      special_needs_notes,
      approx_space_sqft,
      volunteer_slots,
      parking_coverage,
      parking_instructions,
      arrival_instructions,
      accessibility_notes,
      requires_vsc,
    } = body;

    // Required fields
    if (!guest_org_name || !guest_contact_name || !guest_contact_email) {
      return NextResponse.json(
        { error: 'Organization name, contact name, and contact email are required' },
        { status: 400 }
      );
    }
    if (!visit_date || !start_time || !end_time || !address) {
      return NextResponse.json(
        { error: 'Visit date, start time, end time, and address are required' },
        { status: 400 }
      );
    }

    const supabase = createSupabaseAdminClient();

    const startTimestamp = fromZonedTime(`${visit_date}T${start_time}:00`, EASTERN).toISOString();
    const endTimestamp = fromZonedTime(`${visit_date}T${end_time}:00`, EASTERN).toISOString();

    const { data: visit, error } = await supabase
      .from('visits')
      .insert({
        organization_id: null,
        guest_org_name,
        guest_contact_name,
        guest_contact_email,
        guest_contact_phone: guest_contact_phone ?? null,
        visit_date,
        start_time: startTimestamp,
        end_time: endTimestamp,
        address,
        postal_code: postal_code ?? null,
        location_lat: location_lat ?? null,
        location_lng: location_lng ?? null,
        audience_age_ranges: audience_age_ranges ?? null,
        visitor_count_expected: visitor_count_expected ?? null,
        special_needs_notes: special_needs_notes ?? null,
        approx_space_sqft: approx_space_sqft ?? null,
        volunteer_slots: volunteer_slots ?? 1,
        parking_coverage: parking_coverage ?? null,
        parking_instructions: parking_instructions ?? null,
        arrival_instructions: arrival_instructions ?? null,
        accessibility_notes: accessibility_notes ?? null,
        requires_vsc: requires_vsc ?? false,
        requires_vaccine_record: true, // always required for all visits
        status: 'pending_review',
      })
      .select('id')
      .single();

    if (error) {
      console.error('[public/visit-request] Supabase error:', error);
      return NextResponse.json({ error: 'Failed to submit visit request' }, { status: 500 });
    }

    // TODO: Send confirmation email to guest_contact_email with visit.id as reference number
    // TODO: Notify admin/PD users of new pending visit request

    return NextResponse.json({ success: true, visitId: visit.id }, { status: 201 });
  } catch (err: any) {
    console.error('[public/visit-request] Unexpected error:', err.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
