// src/app/api/geocode/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/utils/supabase/admin';
import { getAuth } from '@clerk/nextjs/server';

export async function POST(req: NextRequest) {
  try {
    const { userId } = getAuth(req);
    const { postal_code, user_id } = await req.json();

    if (!postal_code || !user_id) {
      return NextResponse.json({ error: 'Missing postal_code or user_id' }, { status: 400 });
    }

    // 🔒 Security: Ensure users can only update their own location
    if (!userId || user_id !== userId) {
      console.warn('[Geocode API] Unauthorized geocode attempt', { userId, user_id });
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      console.error('[Geocode API] Missing GOOGLE_MAPS_API_KEY');
      return NextResponse.json({ error: 'Missing API key' }, { status: 500 });
    }

    const encodedAddress = encodeURIComponent(`${postal_code}, Canada`);
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodedAddress}&key=${apiKey}`;

    const geoRes = await fetch(url);
    const geoData = await geoRes.json();

    if (!geoData.results || geoData.results.length === 0) {
      return NextResponse.json({ error: 'No geocoding results found' }, { status: 404 });
    }

    const location = geoData.results[0].geometry.location;
    const { lat, lng } = location;

    const supabase = createSupabaseAdminClient();
    const { error } = await supabase
      .from('users')
      .update({
        location_lat: lat,
        location_lng: lng,
      })
      .eq('id', user_id);

    if (error) {
      console.error('[Geocode API] Supabase error:', error);
      return NextResponse.json({ error: 'Failed to update user location' }, { status: 500 });
    }

    return NextResponse.json({ success: true, lat, lng });
  } catch (err: any) {
    console.error('[Geocode API] Fatal error:', err.message || err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
