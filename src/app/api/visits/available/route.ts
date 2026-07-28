// GET /api/visits/available
// Volunteers browse approved upcoming visits.
// Returns registration status, distance, and org profile for each visit.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createSupabaseAdminClient } from '@/utils/supabase/admin';

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLng = (lng2 - lng1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export async function GET(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = createSupabaseAdminClient();

    // Verify caller is an approved volunteer
    const { data: volunteer, error: volunteerError } = await supabase
      .from('users')
      .select('role, status, location_lat, location_lng, travel_distance_km, vsc_document_url')
      .eq('id', userId)
      .single();

    if (volunteerError || !volunteer) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    if (volunteer.role !== 'volunteer') return NextResponse.json({ error: 'Volunteer account required' }, { status: 403 });
    if (volunteer.status !== 'approved') return NextResponse.json({ error: 'Your account is pending approval' }, { status: 403 });

    // Check if volunteer's dog has a vaccine record
    const { data: dog } = await supabase
      .from('dogs')
      .select('vaccine_record_url')
      .eq('volunteer_id', userId)
      .neq('status', 'archived')
      .maybeSingle();
    const volunteerHasVaccine = !!(dog?.vaccine_record_url);

    const { searchParams } = new URL(req.url);
    const audienceFilter = searchParams.get('audience');
    const requiresVscFilter = searchParams.get('requires_vsc');
    const dateFrom = searchParams.get('date_from');
    const dateTo = searchParams.get('date_to');

    const today = new Date().toISOString().split('T')[0];
    let query = supabase
      .from('visits')
      .select(`
        id, title, visit_date, start_time, end_time, address,
        organization_id, guest_org_name,
        location_lat, location_lng, location_place_id, audience_age_ranges,
        visitor_count_expected, special_needs_notes,
        volunteer_slots, requires_vsc, requires_vaccine_record,
        parking_coverage, parking_instructions, arrival_instructions,
        accessibility_notes, status,
        visit_registrations(id, volunteer_id, status, waitlist_position)
      `)
      .eq('status', 'approved')
      .gte('visit_date', dateFrom ?? today)
      .order('visit_date', { ascending: true });

    if (dateTo) query = query.lte('visit_date', dateTo);
    if (requiresVscFilter === 'true') query = query.eq('requires_vsc', true);
    else if (requiresVscFilter === 'false') query = query.eq('requires_vsc', false);

    const { data: visits, error } = await query;
    if (error) {
      console.error('[GET /api/visits/available] Supabase error:', error);
      return NextResponse.json({ error: 'Failed to fetch visits' }, { status: 500 });
    }

    let filtered = visits ?? [];

    if (audienceFilter) {
      const audiences = audienceFilter.split(',').map(a => a.trim());
      filtered = filtered.filter(v => {
        if (!v.audience_age_ranges) return true;
        return audiences.some(a => (v.audience_age_ranges as string[]).includes(a));
      });
    }

    const volunteerLat = volunteer.location_lat as number | null;
    const volunteerLng = volunteer.location_lng as number | null;

    // Fetch org profiles for visits that belong to an org account
    const orgIds = [...new Set(filtered.map(v => v.organization_id).filter(Boolean))] as string[];
    let orgProfileMap: Record<string, { org_name: string | null; profile_image: string | null }> = {};
    if (orgIds.length > 0) {
      const { data: orgs } = await supabase
        .from('users')
        .select('id, org_name, profile_image')
        .in('id', orgIds);
      orgProfileMap = Object.fromEntries(
        (orgs ?? []).map(o => [o.id, { org_name: o.org_name ?? null, profile_image: o.profile_image ?? null }])
      );
    }

    const annotated = filtered.map(v => {
      const regs = (v.visit_registrations as any[]) ?? [];
      const confirmedCount = regs.filter((r: any) => r.status === 'confirmed').length;
      const waitlistedCount = regs.filter((r: any) => r.status === 'waitlisted').length;
      const slotsRemaining = Math.max(0, (v.volunteer_slots as number) - confirmedCount);

      // This volunteer's own registration (if any)
      const myReg = regs.find((r: any) => r.volunteer_id === userId && r.status !== 'cancelled') ?? null;

      // Distance from volunteer's location to visit (if both have geocodes)
      let distanceKm: number | null = null;
      if (volunteerLat !== null && volunteerLng !== null && v.location_lat !== null && v.location_lng !== null) {
        distanceKm = Math.round(
          haversineKm(volunteerLat, volunteerLng, v.location_lat as number, v.location_lng as number) * 10
        ) / 10;
      }

      const orgProfile = v.organization_id ? (orgProfileMap[v.organization_id as string] ?? null) : null;

      return {
        id: v.id,
        title: v.title,
        visit_date: v.visit_date,
        start_time: v.start_time,
        end_time: v.end_time,
        address: v.address,
        location_lat: v.location_lat as number | null,
        location_lng: v.location_lng as number | null,
        location_place_id: (v as any).location_place_id as string | null ?? null,
        distance_km: distanceKm,
        volunteer_slots: v.volunteer_slots,
        slots_remaining: slotsRemaining,
        confirmed_count: confirmedCount,
        waitlisted_count: waitlistedCount,
        requires_vsc: v.requires_vsc,
        requires_vaccine_record: v.requires_vaccine_record,
        parking_coverage: v.parking_coverage,
        parking_instructions: v.parking_instructions,
        arrival_instructions: v.arrival_instructions,
        accessibility_notes: v.accessibility_notes,
        special_needs_notes: v.special_needs_notes,
        visitor_count_expected: v.visitor_count_expected,
        audience_age_ranges: v.audience_age_ranges,
        org_name: orgProfile?.org_name ?? (v.guest_org_name as string | null) ?? null,
        org_profile_image: orgProfile?.profile_image ?? null,
        my_registration_status: myReg?.status ?? null,
        my_waitlist_position: myReg?.waitlist_position ?? null,
      };
    });

    const maxDistance = volunteer.travel_distance_km as number | null;
    const withinRange = maxDistance !== null && volunteerLat !== null && volunteerLng !== null
      ? annotated.filter(v => v.distance_km === null || v.distance_km <= maxDistance)
      : annotated;

    return NextResponse.json({
      visits: withinRange,
      volunteer_has_vsc: !!(volunteer.vsc_document_url),
      volunteer_has_vaccine: volunteerHasVaccine,
      volunteer_location_set: volunteerLat !== null && volunteerLng !== null,
    });
  } catch (err: any) {
    console.error('[GET /api/visits/available] Unexpected error:', err.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
