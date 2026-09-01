// PATCH /api/admin/edit-org/[id]
// Admin edits a real (non-managed) organization's profile and visit defaults.
// Email is excluded — it's tied to the Clerk account and cannot be changed here.

import { NextRequest, NextResponse } from 'next/server';
import { requireAdminOrPd } from '@/utils/requireAdminOrPd';
import { createSupabaseAdminClient } from '@/utils/supabase/admin';
import { autoAssignRegion } from '@/utils/autoAssignRegion';

const VALID_TIERS = ['tier_500', 'tier_200', 'tier_0'];

const ALLOWED_FIELDS = [
  'org_name', 'org_type', 'org_address', 'org_place_id',
  'location_lat', 'location_lng', 'postal_code',
  'org_contact_name', 'org_contact_phone',
  'fee_tier', 'profile_image',
  'default_parking_coverage', 'default_parking_instructions',
  'default_arrival_instructions', 'default_event_description',
  'default_accessibility_notes', 'default_space_sqft', 'default_dogs_needed', 'default_requires_vsc',
];

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const check = await requireAdminOrPd();
  if ('error' in check) return check.error;

  const { id } = await params;

  try {
    const supabase = createSupabaseAdminClient();

    // Verify the target is a real org (not admin-managed)
    const { data: existing, error: fetchErr } = await supabase
      .from('users')
      .select('id, org_name')
      .eq('id', id)
      .eq('role', 'organization')
      .single();

    if (fetchErr || !existing) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
    }

    const body = await req.json();

    const updateData: Record<string, any> = {};
    for (const field of ALLOWED_FIELDS) {
      if (field in body) {
        updateData[field] = body[field] ?? null;
      }
    }

    if (updateData.fee_tier && !VALID_TIERS.includes(updateData.fee_tier)) {
      return NextResponse.json({ error: 'Invalid fee_tier value' }, { status: 400 });
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    const { error } = await supabase
      .from('users')
      .update(updateData)
      .eq('id', id);

    if (error) {
      console.error('[PATCH /api/admin/edit-org] Supabase error:', error);
      return NextResponse.json({ error: 'Failed to update organization' }, { status: 500 });
    }

    // Re-run auto-assign region if address/location changed
    let assigned_region_id: number | null = null;
    if ('location_lat' in updateData || 'location_lng' in updateData) {
      const regionResult = await autoAssignRegion(id);
      if (regionResult.region_id) {
        await supabase
          .from('users')
          .update({
            assigned_region_id: regionResult.region_id,
            region_assignment_method: regionResult.method,
          })
          .eq('id', id);
        assigned_region_id = regionResult.region_id;
      }
    }

    return NextResponse.json({ success: true, assigned_region_id });
  } catch (err: any) {
    console.error('[PATCH /api/admin/edit-org] Unexpected error:', err.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
