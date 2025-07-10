// src/app/api/admin/approved-users/route.ts
import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/utils/supabase/admin';

export async function GET() {
  const supabase = createSupabaseAdminClient();

  try {
    // Fetch category lookup table
    const { data: categoryData, error: catErr } = await supabase
      .from('audience_categories')
      .select('id, name');

    if (catErr || !categoryData) {
      console.error('[approved-users] Error loading audience_categories:', catErr?.message);
      return NextResponse.json({ error: 'Failed to load categories' }, { status: 500 });
    }

    const categoryMap = new Map<number, string>();
    categoryData.forEach((c) => categoryMap.set(c.id, c.name));

    // Fetch approved users with dog + audience join tables
    const { data: userData, error: userErr } = await supabase
      .from('users')
      .select(`
        id,
        first_name,
        last_name,
        email,
        role,
        phone_number,
        city,
        postal_code,
        bio,
        profile_image,
        travel_distance_km,
        status,
        dogs (
          dog_name,
          dog_breed,
          dog_bio,
          dog_picture_url,
          dog_age
        ),
        volunteer_audience_preferences (
          category_id
        ),
        individual_audience_tags (
          category_id
        )
      `)
      .eq('status', 'approved');

    if (userErr || !userData) {
      console.error('[approved-users] Error fetching data:', userErr?.message);
      return NextResponse.json({ error: 'Failed to fetch approved users' }, { status: 500 });
    }

    // Map raw results into normalized structure
    const users = userData.map((user) => {
      const audience_ids =
        user.role === 'volunteer'
          ? user.volunteer_audience_preferences?.map((entry: any) => entry.category_id) || []
          : user.individual_audience_tags?.map((entry: any) => entry.category_id) || [];

      const audience_categories = audience_ids
        .map((id: number) => categoryMap.get(id))
        .filter(Boolean);

      return {
        id: user.id,
        first_name: user.first_name,
        last_name: user.last_name,
        email: user.email,
        role: user.role,
        phone_number: user.phone_number,
        city: user.city,
        postal_code: user.postal_code,
        bio: user.bio,
        profile_image: user.profile_image,
        travel_distance_km: user.travel_distance_km,
        dogs: user.dogs || [],
        audience_categories,
      };
    });

    return NextResponse.json({ users }, { status: 200 });
  } catch (err) {
    console.error('[approved-users] Unexpected error:', err);
    return NextResponse.json({ error: 'Unexpected server error' }, { status: 500 });
  }
}
