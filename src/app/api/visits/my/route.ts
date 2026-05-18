// GET /api/visits/my
// Organization users retrieve their own submitted visit requests.

import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createSupabaseAdminClient } from '@/utils/supabase/admin';

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createSupabaseAdminClient();

    // Verify caller is an organization
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('role')
      .eq('id', userId)
      .single();

    if (userError || user?.role !== 'organization') {
      return NextResponse.json({ error: 'Organization account required' }, { status: 403 });
    }

    const { data: visits, error } = await supabase
      .from('visits')
      .select(`
        id, title, visit_date, start_time, end_time, address, postal_code,
        location_lat, location_lng, location_place_id,
        volunteer_slots, visitor_count_expected, status, admin_note, created_at,
        requires_vsc, requires_vaccine_record,
        guest_contact_name, guest_contact_email, guest_contact_phone,
        audience_age_ranges, special_needs_notes, approx_space_sqft,
        parking_coverage, parking_instructions, arrival_instructions, accessibility_notes,
        visit_registrations(id, status)
      `)
      .eq('organization_id', userId)
      .order('visit_date', { ascending: true });

    if (error) {
      console.error('[GET /api/visits/my] Supabase error:', error);
      return NextResponse.json({ error: 'Failed to fetch visits' }, { status: 500 });
    }

    const mapped = (visits ?? []).map(v => {
      const regs = (v.visit_registrations as any[]) ?? [];
      return {
        id: v.id,
        title: v.title,
        visit_date: v.visit_date,
        start_time: v.start_time,
        end_time: v.end_time,
        address: v.address,
        postal_code: v.postal_code ?? null,
        location_lat: v.location_lat ?? null,
        location_lng: v.location_lng ?? null,
        location_place_id: (v as any).location_place_id ?? null,
        status: v.status,
        admin_note: v.admin_note,
        created_at: v.created_at,
        max_volunteers: v.volunteer_slots,
        expected_visitors: v.visitor_count_expected ?? null,
        requires_vsc: v.requires_vsc ?? false,
        requires_vaccine: v.requires_vaccine_record ?? false,
        guest_contact_name: v.guest_contact_name ?? null,
        guest_contact_email: v.guest_contact_email ?? null,
        guest_contact_phone: v.guest_contact_phone ?? null,
        audience_age_ranges: v.audience_age_ranges ?? null,
        special_needs_notes: v.special_needs_notes ?? null,
        approx_space_sqft: v.approx_space_sqft ?? null,
        parking_coverage: v.parking_coverage ?? null,
        parking_instructions: v.parking_instructions ?? null,
        arrival_instructions: v.arrival_instructions ?? null,
        accessibility_notes: v.accessibility_notes ?? null,
        registration_counts: {
          confirmed: regs.filter((r: any) => r.status === 'confirmed').length,
          waitlisted: regs.filter((r: any) => r.status === 'waitlisted').length,
        },
      };
    });

    return NextResponse.json({ visits: mapped });
  } catch (err: any) {
    console.error('[GET /api/visits/my] Unexpected error:', err.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
