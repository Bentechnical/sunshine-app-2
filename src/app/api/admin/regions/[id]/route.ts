// src/app/api/admin/regions/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/utils/supabase/admin';
import { requireAdminOrPd } from '@/utils/requireAdminOrPd';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const check = await requireAdminOrPd();
  if ('error' in check) return check.error;

  const { id } = await params;
  const regionId = parseInt(id, 10);
  if (isNaN(regionId)) return NextResponse.json({ error: 'Invalid region id' }, { status: 400 });

  const supabase = createSupabaseAdminClient();

  try {
    const { data, error } = await supabase
      .from('pd_regions')
      .select(`
        id, name, owner_pd_id, is_active, created_at,
        owner:users!owner_pd_id (first_name, last_name),
        pd_region_places (id, place_id, place_name, place_type, match_value, lat, lng, viewport_south, viewport_west, viewport_north, viewport_east, boundary_json, boundary_status)
      `)
      .eq('id', regionId)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: 'Region not found' }, { status: 404 });
    }

    return NextResponse.json({
      region: {
        id: data.id,
        name: data.name,
        owner_pd_id: data.owner_pd_id,
        owner_pd_name: (data.owner as any)
          ? `${(data.owner as any).first_name} ${(data.owner as any).last_name}`
          : null,
        is_active: data.is_active,
        created_at: data.created_at,
        places: ((data.pd_region_places as any[]) ?? []).map((p: any) => ({
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
      },
    });
  } catch (err: any) {
    console.error('[regions/[id] GET] Unexpected error:', err.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const check = await requireAdminOrPd();
  if ('error' in check) return check.error;

  const { id } = await params;
  const regionId = parseInt(id, 10);
  if (isNaN(regionId)) return NextResponse.json({ error: 'Invalid region id' }, { status: 400 });

  try {
    const body = await req.json();
    const updates: Record<string, any> = {};

    if (body.name !== undefined) {
      if (!body.name?.trim()) return NextResponse.json({ error: 'Name cannot be empty' }, { status: 400 });
      updates.name = body.name.trim();
    }
    if ('owner_pd_id' in body) {
      updates.owner_pd_id = body.owner_pd_id ?? null;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();

    // Validate owner_pd_id if provided
    if (updates.owner_pd_id) {
      const { data: pd, error: pdErr } = await supabase
        .from('users')
        .select('id')
        .eq('id', updates.owner_pd_id)
        .eq('role', 'pd')
        .single();
      if (pdErr || !pd) {
        return NextResponse.json({ error: 'PD not found' }, { status: 400 });
      }
    }

    const { data, error } = await supabase
      .from('pd_regions')
      .update(updates)
      .eq('id', regionId)
      .select()
      .single();

    if (error || !data) {
      console.error('[regions/[id] PATCH] Error:', error?.message);
      return NextResponse.json({ error: 'Failed to update region' }, { status: 500 });
    }

    console.log(`[regions/[id] PATCH] Updated region ${regionId}:`, updates);
    return NextResponse.json({ region: data });
  } catch (err: any) {
    console.error('[regions/[id] PATCH] Unexpected error:', err.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
