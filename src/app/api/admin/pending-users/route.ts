// src/app/api/admin/pending-users/route.ts
import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/utils/supabase/admin';
import { requireAdmin } from '@/utils/requireAdmin';

export async function GET() {
  const check = await requireAdmin();
  if ('error' in check) return check.error;

  const supabase = createSupabaseAdminClient();

  const { data, error } = await supabase
    .from('users')
    .select(`
      id, first_name, last_name, email, phone_number, city, postal_code,
      bio, role, profile_image, travel_distance_km, status,
      pronouns, birthday, physical_address, other_pets_on_site, other_pets_description,
      third_party_available, additional_information, liability_waiver_accepted, liability_waiver_accepted_at,
      visit_recipient_type, relationship_to_recipient, dependant_name,
      org_name, org_type, org_address, org_contact_name, org_contact_phone,
      dogs (
        dog_name, dog_breed, dog_bio, dog_picture_url, dog_age, status
      )
    `)
    .eq('status', 'pending')
    .eq('profile_complete', true);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ users: data });
}
