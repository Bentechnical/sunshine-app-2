// src/app/api/admin/regions/[id]/places/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/utils/supabase/admin';
import { requireAdminOrPd } from '@/utils/requireAdminOrPd';

// ── Nominatim boundary fetch ──────────────────────────────────────────────────
// Called once per place on save; result is cached permanently in boundary_json.
// OSM attribution required wherever boundary polygons are displayed.

async function fetchNominatimBoundary(placeName: string, lat: number, lng: number): Promise<{
  geometry: any | null;
  osm_id: string | null;
  osm_type: string | null;
}> {
  try {
    const url = new URL('https://nominatim.openstreetmap.org/search');
    url.searchParams.set('format', 'geojson');
    url.searchParams.set('polygon_geojson', '1');
    url.searchParams.set('q', `${placeName}, Ontario, Canada`);
    url.searchParams.set('countrycodes', 'ca');
    url.searchParams.set('limit', '5');

    const res = await fetch(url.toString(), {
      headers: {
        'User-Agent': 'SunshineTherapyDogs/1.0 (admin boundary lookup)',
        'Accept-Language': 'en',
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) return { geometry: null, osm_id: null, osm_type: null };

    const data = await res.json();
    const features: any[] = (data.features ?? []).filter(
      (f: any) => f.geometry?.type === 'Polygon' || f.geometry?.type === 'MultiPolygon'
    );

    if (!features.length) return { geometry: null, osm_id: null, osm_type: null };

    // Prefer features whose bounding box contains our coordinates (disambiguation)
    const containing = features.filter((f: any) => {
      const [minLng, minLat, maxLng, maxLat] = f.bbox ?? [];
      return lat >= minLat && lat <= maxLat && lng >= minLng && lng <= maxLng;
    });
    const candidates = containing.length ? containing : features;

    // Among candidates: prefer class=boundary, then smallest area (most specific)
    const sorted = [...candidates].sort((a: any, b: any) => {
      const aBound = a.properties?.class === 'boundary' ? 0 : 1;
      const bBound = b.properties?.class === 'boundary' ? 0 : 1;
      if (aBound !== bBound) return aBound - bBound;
      const areaA = ((a.bbox?.[2] ?? 0) - (a.bbox?.[0] ?? 0)) * ((a.bbox?.[3] ?? 0) - (a.bbox?.[1] ?? 0));
      const areaB = ((b.bbox?.[2] ?? 0) - (b.bbox?.[0] ?? 0)) * ((b.bbox?.[3] ?? 0) - (b.bbox?.[1] ?? 0));
      return areaA - areaB;
    });

    const best = sorted[0];
    return {
      geometry: best.geometry,
      osm_id: best.properties?.osm_id?.toString() ?? null,
      osm_type: best.properties?.osm_type ?? null,
    };
  } catch (err: any) {
    console.warn('[regions/places POST] Nominatim fetch failed:', err.message);
    return { geometry: null, osm_id: null, osm_type: null };
  }
}

// ── POST /api/admin/regions/[id]/places ───────────────────────────────────────

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const check = await requireAdminOrPd();
  if ('error' in check) return check.error;

  const { id } = await params;
  const regionId = parseInt(id, 10);
  if (isNaN(regionId)) return NextResponse.json({ error: 'Invalid region id' }, { status: 400 });

  try {
    const {
      place_id,
      place_name,
      place_type,
      match_value,
      lat,
      lng,
      viewport_south,
      viewport_west,
      viewport_north,
      viewport_east,
    } = await req.json();

    if (!place_id || !place_name || !place_type || !match_value) {
      return NextResponse.json({ error: 'place_id, place_name, place_type, and match_value are required' }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();

    // Insert the place first — Nominatim fetch happens after, so save never fails due to boundary issues
    const { data, error } = await supabase
      .from('pd_region_places')
      .insert({
        region_id: regionId,
        place_id,
        place_name,
        place_type,
        match_value,
        lat: lat ?? null,
        lng: lng ?? null,
        viewport_south: viewport_south ?? null,
        viewport_west: viewport_west ?? null,
        viewport_north: viewport_north ?? null,
        viewport_east: viewport_east ?? null,
        boundary_status: 'pending',
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: `"${place_name}" is already added to this region` }, { status: 409 });
      }
      console.error('[regions/places POST] Error:', error.message);
      return NextResponse.json({ error: 'Failed to add place' }, { status: 500 });
    }

    // Fetch OSM boundary — non-blocking update; requires lat/lng to disambiguate
    let boundaryResult: Awaited<ReturnType<typeof fetchNominatimBoundary>> = { geometry: null, osm_id: null, osm_type: null };
    if (lat != null && lng != null) {
      boundaryResult = await fetchNominatimBoundary(place_name, lat, lng);
    }

    const { data: updated } = await supabase
      .from('pd_region_places')
      .update({
        boundary_json: boundaryResult.geometry ?? null,
        boundary_status: boundaryResult.geometry ? 'found' : 'not_found',
        boundary_osm_id: boundaryResult.osm_id,
        boundary_osm_type: boundaryResult.osm_type,
      })
      .eq('id', data.id)
      .select()
      .single();

    console.log(`[regions/places POST] Added "${place_name}" to region ${regionId} — boundary: ${boundaryResult.geometry ? 'found' : 'not_found'}`);
    return NextResponse.json({ place: updated ?? data }, { status: 201 });
  } catch (err: any) {
    console.error('[regions/places POST] Unexpected error:', err.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
