// GET /api/visits/available
// Volunteers browse approved upcoming visits filtered by their travel radius.
// Query params: audience (comma-separated), requires_vsc (true/false), date_from, date_to

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
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createSupabaseAdminClient();

    // Verify caller is an approved volunteer
    const { data: volunteer, error: volunteerError } = await supabase
      .from('users')
      .select('role, status, location_lat, location_lng, travel_distance_km, vsc_document_url')
      .eq('id', userId)
      .single();

    if (volunteerError || !volunteer) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    if (volunteer.role !== 'volunteer') {
      return NextResponse.json({ error: 'Volunteer account required' }, { status: 403 });
    }
    if (volunteer.status !== 'approved') {
      return NextResponse.json({ error: 'Your account is pending approval' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const audienceFilter = searchParams.get('audience');
    const requiresVscFilter = searchParams.get('requires_vsc');
    const dateFrom = searchParams.get('date_from');
    const dateTo = searchParams.get('date_to');

    // Base query: approved upcoming visits
    const today = new Date().toISOString().split('T')[0];
    let query = supabase
      .from('visits')
      .select(`
        id, title, visit_date, start_time, end_time, address,
        location_lat, location_lng, audience_age_ranges,
        visitor_count_expected, special_needs_notes,
        volunteer_slots, requires_vsc, requires_vaccine_record,
        parking_coverage, accessibility_notes, status,
        visit_registrations(id, status)
      `)
      .eq('status', 'approved')
      .gte('visit_date', dateFrom ?? today)
      .order('visit_date', { ascending: true });

    if (dateTo) {
      query = query.lte('visit_date', dateTo);
    }

    // Filter by VSC requirement if specified
    if (requiresVscFilter === 'true') {
      query = query.eq('requires_vsc', true);
    } else if (requiresVscFilter === 'false') {
      query = query.eq('requires_vsc', false);
    }

    const { data: visits, error } = await query;
    if (error) {
      console.error('[GET /api/visits/available] Supabase error:', error);
      return NextResponse.json({ error: 'Failed to fetch visits' }, { status: 500 });
    }

    const volunteerLat = volunteer.location_lat as number | null;
    const volunteerLng = volunteer.location_lng as number | null;
    const radiusKm = (volunteer.travel_distance_km as number | null) ?? 50;

    let filtered = visits ?? [];

    // Filter by audience if specified
    if (audienceFilter) {
      const audiences = audienceFilter.split(',').map((a) => a.trim());
      filtered = filtered.filter((v) => {
        if (!v.audience_age_ranges) return true;
        return audiences.some((a) => (v.audience_age_ranges as string[]).includes(a));
      });
    }

    // Filter by distance if volunteer has location set
    if (volunteerLat !== null && volunteerLng !== null) {
      filtered = filtered.filter((v) => {
        if (v.location_lat === null || v.location_lng === null) return true; // include if not geocoded
        const dist = haversineKm(
          volunteerLat,
          volunteerLng,
          v.location_lat as number,
          v.location_lng as number
        );
        return dist <= radiusKm;
      });
    }

    // Annotate each visit with slot counts and current volunteer's registration status
    const annotated = filtered.map((v) => {
      const regs = (v.visit_registrations as any[]) ?? [];
      const confirmedCount = regs.filter((r: any) => r.status === 'confirmed').length;
      const slotsRemaining = Math.max(0, (v.volunteer_slots as number) - confirmedCount);

      return {
        id: v.id,
        title: v.title,
        visit_date: v.visit_date,
        start_time: v.start_time,
        end_time: v.end_time,
        address: v.address,
        location_lat: v.location_lat,
        location_lng: v.location_lng,
        audience_age_ranges: v.audience_age_ranges,
        visitor_count_expected: v.visitor_count_expected,
        special_needs_notes: v.special_needs_notes,
        volunteer_slots: v.volunteer_slots,
        slots_remaining: slotsRemaining,
        requires_vsc: v.requires_vsc,
        requires_vaccine_record: v.requires_vaccine_record,
        parking_coverage: v.parking_coverage,
        accessibility_notes: v.accessibility_notes,
        confirmed_count: confirmedCount,
      };
    });

    return NextResponse.json({
      visits: annotated,
      volunteer_has_vsc: !!(volunteer.vsc_document_url),
    });
  } catch (err: any) {
    console.error('[GET /api/visits/available] Unexpected error:', err.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
