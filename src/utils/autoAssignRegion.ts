// src/utils/autoAssignRegion.ts
//
// Shared utility for auto-assigning a user to a pd_region based on:
//   1. Polygon containment — user lat/lng inside a pd_region_places boundary_json polygon
//   2. If no match — returns null (admin must assign manually)
//
// Used by: approval flows, assign-org-region, assign-volunteer-region,
//          the retroactive migration script, and the auto-assign-region API route.

import { createSupabaseAdminClient } from '@/utils/supabase/admin';

export async function autoAssignRegion(userId: string): Promise<{
  region_id: number | null;
  method: 'boundary_auto' | null;
}> {
  const supabase = createSupabaseAdminClient();

  const { data: user, error: userErr } = await supabase
    .from('users')
    .select('postal_code, location_lat, location_lng')
    .eq('id', userId)
    .single();

  if (userErr || !user) {
    console.warn(`[autoAssignRegion] User ${userId} not found`);
    return { region_id: null, method: null };
  }

  if (user.location_lat == null || user.location_lng == null) {
    return { region_id: null, method: null };
  }

  const userLat = user.location_lat;
  const userLng = user.location_lng;

  // ── 1. Polygon containment via pd_region_places boundary_json ───────────────
  const { data: places } = await supabase
    .from('pd_region_places')
    .select('region_id, lat, lng, boundary_json, boundary_status')
    .eq('boundary_status', 'found');

  if (places?.length) {
    // Filter to active regions only
    const { data: activeRegions } = await supabase
      .from('pd_regions')
      .select('id')
      .eq('is_active', true);
    const activeIds = new Set((activeRegions ?? []).map((r: any) => r.id));

    for (const place of places) {
      if (!activeIds.has(place.region_id)) continue;
      if (!place.boundary_json) continue;
      if (pointInGeoJsonGeometry(userLat, userLng, place.boundary_json)) {
        console.log(`[autoAssignRegion] boundary_auto → region ${place.region_id}`);
        return { region_id: place.region_id, method: 'boundary_auto' };
      }
    }

  }

  console.log(`[autoAssignRegion] no boundary match for user ${userId} — leaving unassigned`);
  return { region_id: null, method: null };
}

// ── Point-in-polygon (ray casting) ────────────────────────────────────────────
// GeoJSON coordinates are [longitude, latitude].

function pointInRing(lat: number, lng: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1]; // lng, lat
    const xj = ring[j][0], yj = ring[j][1];
    const intersect =
      yi > lat !== yj > lat &&
      lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function pointInPolygon(lat: number, lng: number, coordinates: number[][][]): boolean {
  // coordinates[0] = outer ring, coordinates[1+] = holes
  if (!pointInRing(lat, lng, coordinates[0])) return false;
  for (let h = 1; h < coordinates.length; h++) {
    if (pointInRing(lat, lng, coordinates[h])) return false; // inside a hole
  }
  return true;
}

function pointInGeoJsonGeometry(lat: number, lng: number, geometry: any): boolean {
  if (!geometry?.type) return false;
  if (geometry.type === 'Polygon') {
    return pointInPolygon(lat, lng, geometry.coordinates);
  }
  if (geometry.type === 'MultiPolygon') {
    return geometry.coordinates.some((poly: number[][][]) => pointInPolygon(lat, lng, poly));
  }
  return false;
}

