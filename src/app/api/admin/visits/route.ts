// GET /api/admin/visits — list all visits with optional filters
// POST /api/admin/visits — manually create a visit

import { NextRequest, NextResponse } from 'next/server';
import { requireAdminOrPd } from '@/utils/requireAdminOrPd';
import { createSupabaseAdminClient } from '@/utils/supabase/admin';

export async function GET(req: NextRequest) {
  const check = await requireAdminOrPd();
  if ('error' in check) return check.error;

  try {
    const supabase = createSupabaseAdminClient();
    const { searchParams } = new URL(req.url);

    const status = searchParams.get('status');
    const dateFrom = searchParams.get('date_from');
    const dateTo = searchParams.get('date_to');

    let query = supabase
      .from('visits')
      .select(`
        id, title, organization_id, guest_org_name, guest_contact_name, guest_contact_email,
        visit_date, start_time, end_time, address, volunteer_slots,
        requires_vsc, requires_vaccine_record, status, admin_note,
        created_at, updated_at,
        visit_registrations(id, status)
      `)
      .order('visit_date', { ascending: true });

    if (status) {
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
      return {
        ...v,
        confirmed_count: confirmedCount,
        waitlist_count: waitlistCount,
        slots_remaining: Math.max(0, (v.volunteer_slots as number) - confirmedCount),
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
      postal_code,
      location_lat,
      location_lng,
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
      requires_vaccine_record,
      status,
    } = body;

    if (!visit_date || !start_time || !end_time || !address) {
      return NextResponse.json(
        { error: 'Visit date, start time, end time, and address are required' },
        { status: 400 }
      );
    }

    const startTimestamp = `${visit_date}T${start_time}:00`;
    const endTimestamp = `${visit_date}T${end_time}:00`;

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
        postal_code: postal_code ?? null,
        location_lat: location_lat ?? null,
        location_lng: location_lng ?? null,
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
        requires_vaccine_record: requires_vaccine_record ?? true,
        status: status ?? 'pending_review',
        created_by: userId,
      })
      .select('id')
      .single();

    if (error) {
      console.error('[POST /api/admin/visits] Supabase error:', error);
      return NextResponse.json({ error: 'Failed to create visit' }, { status: 500 });
    }

    // TODO: If status = 'approved', create Google Calendar event

    return NextResponse.json({ success: true, visitId: visit.id }, { status: 201 });
  } catch (err: any) {
    console.error('[POST /api/admin/visits] Unexpected error:', err.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
