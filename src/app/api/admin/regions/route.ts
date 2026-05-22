// src/app/api/admin/regions/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/utils/supabase/admin';
import { requireAdminOrPd } from '@/utils/requireAdminOrPd';

export async function GET() {
  const check = await requireAdminOrPd();
  if ('error' in check) return check.error;

  const supabase = createSupabaseAdminClient();

  try {
    const [{ data: regions, error: regErr }, { data: userCounts, error: countErr }] = await Promise.all([
      supabase
        .from('pd_regions')
        .select(`
          id, name, owner_pd_id, is_active, created_at,
          owner:users!owner_pd_id (first_name, last_name),
          pd_region_places (id, place_id, place_name, place_type, match_value, lat, lng, viewport_south, viewport_west, viewport_north, viewport_east, boundary_json, boundary_status)
        `)
        .order('name'),
      supabase
        .from('users')
        .select('assigned_region_id, role')
        .in('role', ['volunteer', 'organization'])
        .not('assigned_region_id', 'is', null),
    ]);

    if (regErr || countErr) {
      console.error('[regions GET] Error fetching regions:', regErr?.message ?? countErr?.message);
      return NextResponse.json({ error: 'Failed to fetch regions' }, { status: 500 });
    }

    // Build per-region counts from user data
    const volunteerCounts: Record<number, number> = {};
    const orgCounts: Record<number, number> = {};
    for (const u of (userCounts ?? [])) {
      const rid = u.assigned_region_id;
      if (!rid) continue;
      if (u.role === 'volunteer') volunteerCounts[rid] = (volunteerCounts[rid] ?? 0) + 1;
      if (u.role === 'organization') orgCounts[rid] = (orgCounts[rid] ?? 0) + 1;
    }

    const result = (regions ?? []).map((r: any) => ({
      id: r.id,
      name: r.name,
      owner_pd_id: r.owner_pd_id,
      owner_pd_name: r.owner
        ? `${r.owner.first_name} ${r.owner.last_name}`
        : null,
      is_active: r.is_active,
      created_at: r.created_at,
      places: (r.pd_region_places ?? []).map((p: any) => ({
        id: p.id,
        place_id: p.place_id,
        place_name: p.place_name,
        place_type: p.place_type,
        match_value: p.match_value,
        lat: p.lat,
        lng: p.lng,
        viewport_south: p.viewport_south,
        viewport_west: p.viewport_west,
        viewport_north: p.viewport_north,
        viewport_east: p.viewport_east,
        boundary_json: p.boundary_json ?? null,
        boundary_status: p.boundary_status ?? null,
      })),
      volunteer_count: volunteerCounts[r.id] ?? 0,
      org_count: orgCounts[r.id] ?? 0,
    }));

    return NextResponse.json({ regions: result });
  } catch (err: any) {
    console.error('[regions GET] Unexpected error:', err.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const check = await requireAdminOrPd();
  if ('error' in check) return check.error;

  try {
    const { name, owner_pd_id } = await req.json();

    if (!name?.trim()) {
      return NextResponse.json({ error: 'Region name is required' }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();

    // Validate owner_pd_id if provided
    if (owner_pd_id) {
      const { data: pd, error: pdErr } = await supabase
        .from('users')
        .select('id')
        .eq('id', owner_pd_id)
        .eq('role', 'pd')
        .single();
      if (pdErr || !pd) {
        return NextResponse.json({ error: 'PD not found' }, { status: 400 });
      }
    }

    const { data, error } = await supabase
      .from('pd_regions')
      .insert({ name: name.trim(), owner_pd_id: owner_pd_id ?? null })
      .select()
      .single();

    if (error) {
      console.error('[regions POST] Error creating region:', error.message);
      return NextResponse.json({ error: 'Failed to create region' }, { status: 500 });
    }

    console.log(`[regions POST] Created region "${name}" (id: ${data.id})`);
    return NextResponse.json({ region: data }, { status: 201 });
  } catch (err: any) {
    console.error('[regions POST] Unexpected error:', err.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
