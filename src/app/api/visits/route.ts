// POST /api/visits
// Organization account holders submit a visit request.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createSupabaseAdminClient } from '@/utils/supabase/admin';

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createSupabaseAdminClient();

    // Verify caller is an approved organization
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('role, status')
      .eq('id', userId)
      .single();

    if (userError || !user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    if (user.role !== 'organization') {
      return NextResponse.json({ error: 'Organization account required' }, { status: 403 });
    }
    if (user.status !== 'approved') {
      return NextResponse.json({ error: 'Your account is pending approval' }, { status: 403 });
    }

    const body = await req.json();
    const {
      title,
      visit_date,
      start_time,
      end_time,
      address,
      postal_code,
      guest_contact_name,
      guest_contact_email,
      guest_contact_phone,
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
      requires_vaccine_record,
    } = body;

    if (!visit_date || !start_time || !end_time || !address) {
      return NextResponse.json(
        { error: 'Visit date, start time, end time, and address are required' },
        { status: 400 }
      );
    }

    // Combine visit_date + time into full ISO timestamps
    const startTimestamp = `${visit_date}T${start_time}:00`;
    const endTimestamp = `${visit_date}T${end_time}:00`;

    const { data: visit, error } = await supabase
      .from('visits')
      .insert({
        organization_id: userId,
        created_by: userId,
        title: title ?? null,
        visit_date,
        start_time: startTimestamp,
        end_time: endTimestamp,
        address,
        postal_code: postal_code ?? null,
        guest_contact_name: guest_contact_name ?? null,
        guest_contact_email: guest_contact_email ?? null,
        guest_contact_phone: guest_contact_phone ?? null,
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
        requires_vaccine_record: requires_vaccine_record ?? true,
        status: 'pending_review',
      })
      .select('id')
      .single();

    if (error) {
      console.error('[POST /api/visits] Supabase error:', error);
      return NextResponse.json({ error: 'Failed to submit visit request' }, { status: 500 });
    }

    // TODO: Send confirmation email to org contact
    // TODO: Notify admin/PD of new pending visit request

    return NextResponse.json({ success: true, visitId: visit.id }, { status: 201 });
  } catch (err: any) {
    console.error('[POST /api/visits] Unexpected error:', err.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
