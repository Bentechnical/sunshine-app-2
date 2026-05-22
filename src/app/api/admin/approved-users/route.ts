// src/app/api/admin/approved-users/route.ts
import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/utils/supabase/admin';
import { requireAdminOrPd } from '@/utils/requireAdminOrPd';

export async function GET() {
  const check = await requireAdminOrPd();
  if ('error' in check) return check.error;

  const supabase = createSupabaseAdminClient();

  try {
    // Fetch categories and users in parallel
    const [
      { data: categoryData, error: catErr },
      { data: userData, error: userErr },
    ] = await Promise.all([
      supabase.from('audience_categories').select('id, name'),
      supabase.from('users').select(`
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
        is_browsable,
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
        org_name,
        org_type,
        org_address,
        org_contact_name,
        org_contact_phone,
        fee_tier,
        assigned_region_id,
        region_assignment_method,
        pd_postal_code,
        profile_complete,
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
      .eq('profile_complete', true),
    ]);

    if (catErr || !categoryData) {
      console.error('[approved-users] Error loading audience_categories:', catErr?.message);
      return NextResponse.json({ error: 'Failed to load categories' }, { status: 500 });
    }

    if (userErr || !userData) {
      console.error('[approved-users] Error fetching data:', userErr?.message);
      return NextResponse.json({ error: 'Failed to fetch approved users' }, { status: 500 });
    }

    const categoryMap = new Map<number, string>();
    categoryData.forEach((c) => categoryMap.set(c.id, c.name));

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
        is_browsable: user.is_browsable ?? true,
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
        org_name: user.org_name,
        org_type: user.org_type,
        org_address: user.org_address,
        org_contact_name: user.org_contact_name,
        org_contact_phone: user.org_contact_phone,
        fee_tier: user.fee_tier ?? null,
        assigned_region_id: user.assigned_region_id ?? null,
        region_assignment_method: user.region_assignment_method ?? null,
        pd_postal_code: user.pd_postal_code ?? null,
        profile_complete: user.profile_complete ?? false,
      };
    });

    return NextResponse.json({ users }, { status: 200 });
  } catch (err) {
    console.error('[approved-users] Unexpected error:', err);
    return NextResponse.json({ error: 'Unexpected server error' }, { status: 500 });
  }
}
