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
        pronouns,
        birthday,
        physical_address,
        other_pets_on_site,
        other_pets_description,
        third_party_available,
        additional_information,
        liability_waiver_accepted,
        liability_waiver_accepted_at,
        visit_recipient_type,
        relationship_to_recipient,
        dependant_name,
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
      .eq('status', 'approved')
      .eq('profile_complete', true);

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
        // New individual user fields
        pronouns: user.pronouns,
        birthday: user.birthday,
        physical_address: user.physical_address,
        other_pets_on_site: user.other_pets_on_site,
        other_pets_description: user.other_pets_description,
        third_party_available: user.third_party_available,
        additional_information: user.additional_information,
        liability_waiver_accepted: user.liability_waiver_accepted,
        liability_waiver_accepted_at: user.liability_waiver_accepted_at,
        // Visit recipient fields
        visit_recipient_type: user.visit_recipient_type,
        relationship_to_recipient: user.relationship_to_recipient,
        dependant_name: user.dependant_name,
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
