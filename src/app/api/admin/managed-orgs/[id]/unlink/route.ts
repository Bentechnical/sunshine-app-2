// POST /api/admin/managed-orgs/[id]/unlink
// Detaches a real org's visit history into a new admin-managed org.
// Use case: org contact person leaves, admin transfers visit history to a managed entity,
// then can later link it to a new person's account.

import { NextRequest, NextResponse } from 'next/server';
import { requireAdminOrPd } from '@/utils/requireAdminOrPd';
import { createSupabaseAdminClient } from '@/utils/supabase/admin';
import { randomUUID } from 'crypto';

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

  const { id: realOrgId } = await params;

  try {
    const supabase = createSupabaseAdminClient();

    // Fetch the real org
    const { data: realOrg, error: fetchErr } = await supabase
      .from('users')
      .select('*')
      .eq('id', realOrgId)
      .eq('role', 'organization')
      .eq('is_admin_managed', false)
      .single();

    if (fetchErr || !realOrg) {
      return NextResponse.json({ error: 'Organization account not found' }, { status: 404 });
    }

    // Create a new managed org copying the real org's profile data
    const syntheticId = `managed_${randomUUID()}`;
    const managedOrgData: Record<string, any> = {
      id: syntheticId,
      role: 'organization',
      status: 'approved',
      profile_complete: true,
      is_admin_managed: true,
      first_name: realOrg.org_contact_name || realOrg.org_name || realOrg.first_name,
      last_name: '',
      email: `${syntheticId}@managed.local`,
    };

    for (const field of ORG_PROFILE_FIELDS) {
      if (realOrg[field] != null) {
        managedOrgData[field] = realOrg[field];
      }
    }

    const { error: insertErr } = await supabase.from('users').insert(managedOrgData);

    if (insertErr) {
      console.error('[unlink] Failed to create managed org:', insertErr);
      return NextResponse.json({ error: 'Failed to create managed organization' }, { status: 500 });
    }

    // Transfer visits from real org to managed org
    const { data: updatedVisits, error: visitErr } = await supabase
      .from('visits')
      .update({ organization_id: syntheticId })
      .eq('organization_id', realOrgId)
      .select('id');

    if (visitErr) {
      console.error('[unlink] Failed to transfer visits:', visitErr);
      // Rollback: delete the managed org we just created
      await supabase.from('users').delete().eq('id', syntheticId);
      return NextResponse.json({ error: 'Failed to transfer visits' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      managed_org_id: syntheticId,
      visits_transferred: updatedVisits?.length ?? 0,
    });
  } catch (err: any) {
    console.error('[POST /api/admin/managed-orgs/unlink] Unexpected error:', err.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
