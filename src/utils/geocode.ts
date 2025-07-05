// src/utils/geocode.ts
export async function geocodePostalCode(postalCode: string, userId: string) {
  const res = await fetch('/api/geocode', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      postal_code: postalCode,
      user_id: userId,
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
