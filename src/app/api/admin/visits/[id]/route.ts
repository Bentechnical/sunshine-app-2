// GET /api/admin/visits/[id] — full visit details
// PATCH /api/admin/visits/[id] — edit visit details

import { NextRequest, NextResponse } from 'next/server';
import { requireAdminOrPd } from '@/utils/requireAdminOrPd';
import { createSupabaseAdminClient } from '@/utils/supabase/admin';

export async function GET(
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

    const supabase = createSupabaseAdminClient();

    const { data: visit, error } = await supabase
      .from('visits')
      .select(`
        *,
        visit_registrations(
          id, volunteer_id, status, waitlist_position,
          contact_shared, admin_note, cancellation_reason, cancelled_at, created_at,
          users:volunteer_id(first_name, last_name, email, phone_number,
            dogs(id, dog_name, dog_breed))
        ),
        visit_notes(id, author_id, note_text, created_at,
          users:author_id(first_name, last_name))
      `)
      .eq('id', visitId)
      .single();

    if (error || !visit) {
      return NextResponse.json({ error: 'Visit not found' }, { status: 404 });
    }

    return NextResponse.json({ visit });
  } catch (err: any) {
    console.error('[GET /api/admin/visits/[id]] Unexpected error:', err.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(
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

    const supabase = createSupabaseAdminClient();
    const body = await req.json();

    // Only allow updating specific fields
    const allowedFields = [
      'title', 'visit_date', 'start_time', 'end_time', 'address',
      'location_lat', 'location_lng', 'audience_age_ranges',
      'visitor_count_expected', 'special_needs_notes', 'approx_space_sqft',
      'fee_tier', 'fee_amount', 'volunteer_slots', 'parking_coverage',
      'parking_instructions', 'arrival_instructions', 'accessibility_notes',
      'requires_vsc', 'requires_vaccine_record', 'organization_id',
      'guest_org_name', 'guest_contact_name', 'guest_contact_email', 'guest_contact_phone',
    ];

    const updates: Record<string, any> = {};
    for (const field of allowedFields) {
      if (field in body) {
        updates[field] = body[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    const { error } = await supabase
      .from('visits')
      .update(updates)
      .eq('id', visitId);

    if (error) {
      console.error('[PATCH /api/admin/visits/[id]] Supabase error:', error);
      return NextResponse.json({ error: 'Failed to update visit' }, { status: 500 });
    }

    // TODO: If time/date/address changed and visit is approved, update Google Calendar event

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[PATCH /api/admin/visits/[id]] Unexpected error:', err.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
