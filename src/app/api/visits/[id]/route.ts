// GET /api/visits/[id]
// Shared route used by org users (own visits) and volunteers (approved visits).
// Admin/PD can also access any visit.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createSupabaseAdminClient } from '@/utils/supabase/admin';

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
        visit_date, start_time, end_time, address, location_lat, location_lng,
        audience_age_ranges, visitor_count_expected, special_needs_notes,
        approx_space_sqft, fee_tier, fee_amount, volunteer_slots,
        parking_coverage, parking_instructions, arrival_instructions,
        accessibility_notes, requires_vsc, requires_vaccine_record,
        status, admin_note, created_at, updated_at,
        visit_registrations(id, volunteer_id, status, waitlist_position, contact_shared, created_at)
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
      // Org users see limited volunteer info — first name + dog name only (no contact)
      // Contact info filtered below unless contact_shared = true for this org's visit
      const filtered = {
        ...visit,
        visit_registrations: (visit.visit_registrations as any[])
          .filter((r: any) => r.status !== 'cancelled')
          .map((r: any) => ({
            id: r.id,
            status: r.status,
            // Volunteer contact details omitted — returned via separate admin action when contact_shared=true
          })),
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
