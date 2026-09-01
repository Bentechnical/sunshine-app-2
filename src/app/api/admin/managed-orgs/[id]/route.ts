// PATCH/DELETE /api/admin/managed-orgs/[id]
// Admin edits or deletes an admin-managed organization.

import { NextRequest, NextResponse } from 'next/server';
import { requireAdminOrPd } from '@/utils/requireAdminOrPd';
import { createSupabaseAdminClient } from '@/utils/supabase/admin';
import { autoAssignRegion } from '@/utils/autoAssignRegion';

const VALID_TIERS = ['tier_500', 'tier_200', 'tier_0'];

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const check = await requireAdminOrPd();
  if ('error' in check) return check.error;

  const { id } = await params;

  try {
    const supabase = createSupabaseAdminClient();

    // Verify the target is an admin-managed org
    const { data: existing, error: fetchErr } = await supabase
      .from('users')
      .select('id')
      .eq('id', id)
      .eq('role', 'organization')
      .eq('is_admin_managed', true)
      .single();

    if (fetchErr || !existing) {
      return NextResponse.json({ error: 'Managed organization not found' }, { status: 404 });
    }

    const body = await req.json();
    const allowedFields = [
      'org_name', 'org_type', 'org_address', 'org_place_id',
      'location_lat', 'location_lng', 'postal_code',
      'org_contact_name', 'org_contact_phone', 'email',
      'fee_tier', 'profile_image',
      'default_parking_coverage', 'default_parking_instructions',
      'default_arrival_instructions', 'default_event_description',
      'default_accessibility_notes', 'default_space_sqft', 'default_dogs_needed', 'default_requires_vsc',
    ];

    const updateData: Record<string, any> = {};
    for (const field of allowedFields) {
      if (field in body) {
        updateData[field] = body[field] ?? null;
      }
    }

    if (updateData.fee_tier && !VALID_TIERS.includes(updateData.fee_tier)) {
      return NextResponse.json({ error: 'Invalid fee_tier value' }, { status: 400 });
    }

    // Keep first_name in sync with contact name or org name
    if (updateData.org_contact_name !== undefined || updateData.org_name !== undefined) {
      updateData.first_name = updateData.org_contact_name || updateData.org_name || existing.id;
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    const { error } = await supabase
      .from('users')
      .update(updateData)
      .eq('id', id)
      .eq('is_admin_managed', true);

    if (error) {
      console.error('[PATCH /api/admin/managed-orgs] Supabase error:', error);
      return NextResponse.json({ error: 'Failed to update managed organization' }, { status: 500 });
    }

    // Re-run auto-assign region if address/location changed
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
      }
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[PATCH /api/admin/managed-orgs] Unexpected error:', err.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const check = await requireAdminOrPd();
  if ('error' in check) return check.error;

  const { id } = await params;

  try {
    const supabase = createSupabaseAdminClient();

    // Verify the target is an admin-managed org
    const { data: existing, error: fetchErr } = await supabase
      .from('users')
      .select('id')
      .eq('id', id)
      .eq('role', 'organization')
      .eq('is_admin_managed', true)
      .single();

    if (fetchErr || !existing) {
      return NextResponse.json({ error: 'Managed organization not found' }, { status: 404 });
    }

    // Check for active visits
    const { count, error: countErr } = await supabase
      .from('visits')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', id)
      .in('status', ['pending_review', 'approved']);

    if (countErr) {
      console.error('[DELETE /api/admin/managed-orgs] Error checking visits:', countErr);
      return NextResponse.json({ error: 'Failed to check active visits' }, { status: 500 });
    }

    if (count && count > 0) {
      return NextResponse.json(
        { error: `Cannot delete: organization has ${count} active visit(s). Cancel or complete them first.` },
        { status: 409 }
      );
    }

    // Delete the managed org row (historical visits get organization_id = NULL via ON DELETE SET NULL)
    const { error } = await supabase
      .from('users')
      .delete()
      .eq('id', id)
      .eq('is_admin_managed', true);

    if (error) {
      console.error('[DELETE /api/admin/managed-orgs] Supabase error:', error);
      return NextResponse.json({ error: 'Failed to delete managed organization' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[DELETE /api/admin/managed-orgs] Unexpected error:', err.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
