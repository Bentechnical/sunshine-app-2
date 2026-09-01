// POST /api/admin/managed-orgs
// Admin creates an organization record without a Clerk account.

import { NextRequest, NextResponse } from 'next/server';
import { requireAdminOrPd } from '@/utils/requireAdminOrPd';
import { createSupabaseAdminClient } from '@/utils/supabase/admin';
import { autoAssignRegion } from '@/utils/autoAssignRegion';
import { randomUUID } from 'crypto';

const VALID_TIERS = ['tier_500', 'tier_200', 'tier_0'];

export async function POST(req: NextRequest) {
  const check = await requireAdminOrPd();
  if ('error' in check) return check.error;

  try {
    const body = await req.json();
    const {
      org_name,
      org_type,
      org_address,
      org_place_id,
      location_lat,
      location_lng,
      postal_code,
      org_contact_name,
      org_contact_phone,
      email,
      fee_tier,
      profile_image,
      default_parking_coverage,
      default_parking_instructions,
      default_arrival_instructions,
      default_event_description,
      default_accessibility_notes,
      default_space_sqft,
      default_dogs_needed,
      default_requires_vsc,
    } = body;

    if (!org_name || typeof org_name !== 'string' || !org_name.trim()) {
      return NextResponse.json({ error: 'org_name is required' }, { status: 400 });
    }

    if (fee_tier && !VALID_TIERS.includes(fee_tier)) {
      return NextResponse.json({ error: 'Invalid fee_tier value' }, { status: 400 });
    }

    const syntheticId = `managed_${randomUUID()}`;
    const supabase = createSupabaseAdminClient();

    const { error } = await supabase.from('users').insert({
      id: syntheticId,
      role: 'organization',
      status: 'approved',
      profile_complete: true,
      is_admin_managed: true,
      org_name: org_name.trim(),
      org_type: org_type || null,
      org_address: org_address || null,
      org_place_id: org_place_id || null,
      location_lat: location_lat ?? null,
      location_lng: location_lng ?? null,
      postal_code: postal_code || null,
      org_contact_name: org_contact_name || null,
      org_contact_phone: org_contact_phone || null,
      email: email || `${syntheticId}@managed.local`,
      fee_tier: fee_tier || null,
      profile_image: profile_image || null,
      first_name: org_contact_name || org_name.trim(),
      last_name: '',
      default_parking_coverage: default_parking_coverage || null,
      default_parking_instructions: default_parking_instructions || null,
      default_arrival_instructions: default_arrival_instructions || null,
      default_event_description: default_event_description || null,
      default_accessibility_notes: default_accessibility_notes || null,
      default_space_sqft: default_space_sqft ?? null,
      default_dogs_needed: default_dogs_needed ?? null,
      default_requires_vsc: default_requires_vsc ?? null,
    });

    if (error) {
      console.error('[POST /api/admin/managed-orgs] Supabase error:', error);
      return NextResponse.json({ error: 'Failed to create managed organization' }, { status: 500 });
    }

    // Auto-assign region based on lat/lng if address was provided
    let assigned_region_id: number | null = null;
    if (location_lat != null && location_lng != null) {
      const regionResult = await autoAssignRegion(syntheticId);
      if (regionResult.region_id) {
        await supabase
          .from('users')
          .update({
            assigned_region_id: regionResult.region_id,
            region_assignment_method: regionResult.method,
          })
          .eq('id', syntheticId);
        assigned_region_id = regionResult.region_id;
      }
    }

    return NextResponse.json({ success: true, id: syntheticId, assigned_region_id }, { status: 201 });
  } catch (err: any) {
    console.error('[POST /api/admin/managed-orgs] Unexpected error:', err.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
