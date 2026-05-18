// src/utils/geocode.ts

// Client-side: calls /api/geocode route (browser-safe, saves to users table)
// Pass pdMode: true to save to pd_lat/pd_lng instead of location_lat/location_lng
export async function geocodePostalCode(postalCode: string, userId: string, pdMode = false) {
  const res = await fetch('/api/geocode', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      postal_code: postalCode,
      user_id: userId,
      pd_mode: pdMode,
    }),
  });

  if (!res.ok) {
    const error = await res.json();
    console.error('[Geo] Error response:', error);
    throw new Error('Failed to geocode postal code');
  }

  const data = await res.json();
  return { lat: data.lat, lng: data.lng };
}

// Server-side: calls Google Maps API directly (use in API routes, no user auth needed)
export async function geocodePostalCodeServer(
  postalCode: string
): Promise<{ lat: number; lng: number } | null> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    console.error('[Geo] Missing GOOGLE_MAPS_API_KEY');
    return null;
  }

  try {
    const encoded = encodeURIComponent(`${postalCode}, Canada`);
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?address=${encoded}&key=${apiKey}`
    );
    const data = await res.json();

    if (!data.results || data.results.length === 0) {
      console.warn('[Geo] No results for postal code:', postalCode);
      return null;
    }

    const { lat, lng } = data.results[0].geometry.location;
    return { lat, lng };
  } catch (err: any) {
    console.error('[Geo] Error geocoding postal code:', err.message);
    return null;
  }
}
