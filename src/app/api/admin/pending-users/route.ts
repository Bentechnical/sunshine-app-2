// src/app/api/admin/pending-users/route.ts
import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/utils/supabase/admin';

export async function GET() {
  const supabase = createSupabaseAdminClient();

  const { data, error } = await supabase
    .from('users')
    .select(`
      id, first_name, last_name, email, phone_number, city, postal_code,
      bio, role, profile_image, travel_distance_km, status,
      dogs (
        dog_name, dog_breed, dog_bio, dog_picture_url, dog_age, status
      )
    `)
    .eq('status', 'pending');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ users: data });
}
