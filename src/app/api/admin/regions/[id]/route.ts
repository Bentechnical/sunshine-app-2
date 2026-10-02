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

    // Capture the outgoing owner before the update so we can tell whether the
    // region actually changed hands (and therefore whether to cascade).
    const { data: before } = await supabase
      .from('pd_regions')
      .select('owner_pd_id')
      .eq('id', regionId)
      .single();
    const previousOwnerPdId = before?.owner_pd_id ?? null;

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

    // Cascade an ownership change onto the region's visits.
    //
    // visits.assigned_pd_id is a denormalized snapshot taken at visit creation from the
    // org's region owner (see POST /api/visits). Nothing else refreshes it, so without
    // this cascade a region handover leaves every existing visit pointing at the outgoing
    // PD — and since the PD dashboard scopes by assigned_pd_id, the incoming PD sees an
    // empty board.
    //
    // Unlike /api/admin/assign-org-region (one org moving between regions, where leaving
    // history with the old PD is defensible), a region handover transfers the whole region:
    // all statuses cascade, so the new PD inherits the org's visit history too.
    // Pass cascade_visits: false to opt out.
    let visits_updated: number | null = null;
    const ownerChanged = 'owner_pd_id' in updates && updates.owner_pd_id !== previousOwnerPdId;
    const shouldCascade = ownerChanged && body.cascade_visits !== false;

    if (shouldCascade) {
      const newOwnerPdId: string | null = updates.owner_pd_id;

      // visits has no region column; the link is visits.organization_id → users.assigned_region_id
      const { data: orgs, error: orgErr } = await supabase
        .from('users')
        .select('id')
        .eq('role', 'organization')
        .eq('assigned_region_id', regionId);

      if (orgErr) {
        // Don't fail the request — the region update itself succeeded.
        console.error('[regions/[id] PATCH] Failed to load region orgs for cascade:', orgErr.message);
      } else {
        const orgIds = (orgs ?? []).map(o => o.id);
        if (orgIds.length === 0) {
          visits_updated = 0;
        } else {
          const { data: updatedVisits, error: visitErr } = await supabase
            .from('visits')
            .update({ assigned_pd_id: newOwnerPdId })
            .in('organization_id', orgIds)
            .select('id');

          if (visitErr) {
            console.error('[regions/[id] PATCH] Failed to cascade to visits:', visitErr.message);
          } else {
            visits_updated = updatedVisits?.length ?? 0;
          }
        }
      }

      console.log(
        `[regions/[id] PATCH] Region ${regionId} owner ${previousOwnerPdId ?? 'none'} → ` +
        `${newOwnerPdId ?? 'none'}; visits reassigned: ${visits_updated ?? 'failed'}`
      );
    }

    console.log(`[regions/[id] PATCH] Updated region ${regionId}:`, updates);
    return NextResponse.json({
      region: data,
      ...(shouldCascade ? { visits_updated, previous_owner_pd_id: previousOwnerPdId } : {}),
    });
  } catch (err: any) {
    console.error('[regions/[id] PATCH] Unexpected error:', err.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
