// src/app/api/admin/pending-users/route.ts
import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/utils/supabase/admin';
import { requireAdminOrPd } from '@/utils/requireAdminOrPd';

export async function GET() {
  const check = await requireAdminOrPd();
  if ('error' in check) return check.error;
  const { userId, role } = check;

  const supabase = createSupabaseAdminClient();

  let query = supabase
    .from('users')
    .select(`
      id, first_name, last_name, email, phone_number, city, postal_code,
      bio, role, profile_image, travel_distance_km, status,
      pronouns, birthday, physical_address, other_pets_on_site, other_pets_description,
      third_party_available, additional_information, liability_waiver_accepted, liability_waiver_accepted_at,
      visit_recipient_type, relationship_to_recipient, dependant_name,
      org_name, org_type, org_address, org_contact_name, org_contact_phone, fee_tier,
      assigned_region_id, region_assignment_method,
      vsc_document_url, vsc_date_issued, vsc_renewal_due,
      dogs (
        dog_name, dog_breed, dog_bio, dog_picture_url, dog_age, status,
        vaccine_record_url, vaccine_expiry_date
      )
    `)
    .eq('status', 'pending')
    .eq('profile_complete', true);

  if (role === 'pd') {
    // PDs only see pending users assigned to a region they own
    const { data: ownedRegions } = await supabase
      .from('pd_regions')
      .select('id')
      .eq('owner_pd_id', userId)
      .eq('is_active', true);

    const regionIds = (ownedRegions ?? []).map((r: any) => r.id);

    if (!regionIds.length) {
      return NextResponse.json({ users: [] });
    }

    query = query.in('assigned_region_id', regionIds);
  }

  const { data, error } = await query;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ users: data });
}
