// POST /api/admin/managed-orgs/[id]/link
// Links an admin-managed org to a real Clerk account by transferring visits and merging profile data.

import { NextRequest, NextResponse } from 'next/server';
import { requireAdminOrPd } from '@/utils/requireAdminOrPd';
import { createSupabaseAdminClient } from '@/utils/supabase/admin';

const ORG_PROFILE_FIELDS = [
  'org_name', 'org_type', 'org_address', 'org_place_id',
  'location_lat', 'location_lng', 'postal_code',
  'org_contact_name', 'org_contact_phone',
  'fee_tier', 'profile_image', 'assigned_region_id', 'region_assignment_method',
  'default_parking_coverage', 'default_parking_instructions',
  'default_arrival_instructions', 'default_event_description',
  'default_accessibility_notes', 'default_space_sqft', 'default_dogs_needed', 'default_requires_vsc',
] as const;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const check = await requireAdminOrPd();
  if ('error' in check) return check.error;

  const { id: managedOrgId } = await params;

  try {
    const { clerk_user_id } = await req.json();

    if (!clerk_user_id || typeof clerk_user_id !== 'string') {
      return NextResponse.json({ error: 'clerk_user_id is required' }, { status: 400 });
    }

    if (clerk_user_id === managedOrgId) {
      return NextResponse.json({ error: 'Cannot link an organization to itself' }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();

    // Fetch both org records in parallel
    const [managedResult, realResult] = await Promise.all([
      supabase
        .from('users')
        .select('*')
        .eq('id', managedOrgId)
        .eq('role', 'organization')
        .eq('is_admin_managed', true)
        .single(),
      supabase
        .from('users')
        .select('*')
        .eq('id', clerk_user_id)
        .eq('role', 'organization')
        .eq('is_admin_managed', false)
        .single(),
    ]);

    if (managedResult.error || !managedResult.data) {
      return NextResponse.json({ error: 'Managed organization not found' }, { status: 404 });
    }

    if (realResult.error || !realResult.data) {
      return NextResponse.json({ error: 'Target Clerk organization account not found' }, { status: 404 });
    }

    if (realResult.data.status === 'archived') {
      return NextResponse.json({ error: 'Cannot link to an archived account' }, { status: 400 });
    }

    const managedOrg = managedResult.data;
    const realOrg = realResult.data;

    // 1. Transfer visits from managed org to real org
    const { data: updatedVisits, error: visitErr } = await supabase
      .from('visits')
      .update({ organization_id: clerk_user_id })
      .eq('organization_id', managedOrgId)
      .select('id');

    if (visitErr) {
      console.error('[link] Failed to transfer visits:', visitErr);
      return NextResponse.json({ error: 'Failed to transfer visits' }, { status: 500 });
    }

    const visitsTransferred = updatedVisits?.length ?? 0;

    // 2. Copy managed org fields to real org where real org field is NULL/empty
    const mergeData: Record<string, any> = {};
    for (const field of ORG_PROFILE_FIELDS) {
      const realValue = realOrg[field];
      const managedValue = managedOrg[field];
      if ((realValue === null || realValue === undefined || realValue === '') && managedValue != null) {
        mergeData[field] = managedValue;
      }
    }

    if (Object.keys(mergeData).length > 0) {
      const { error: mergeErr } = await supabase
        .from('users')
        .update(mergeData)
        .eq('id', clerk_user_id);

      if (mergeErr) {
        console.error('[link] Failed to merge profile data:', mergeErr);
        // Non-fatal: visits are already transferred. Log but don't fail.
      }
    }

    // 3. Delete the managed org row
    const { error: deleteErr } = await supabase
      .from('users')
      .delete()
      .eq('id', managedOrgId)
      .eq('is_admin_managed', true);

    if (deleteErr) {
      console.error('[link] Failed to delete managed org row:', deleteErr);
      // Non-fatal: visits are transferred, profile merged. Log but don't fail.
    }

    return NextResponse.json({
      success: true,
      visits_transferred: visitsTransferred,
    });
  } catch (err: any) {
    console.error('[POST /api/admin/managed-orgs/link] Unexpected error:', err.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
