// GET /api/org/profile — return the authenticated org user's own profile fields
// PATCH /api/org/profile — update the authenticated org user's profile fields

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createSupabaseAdminClient } from '@/utils/supabase/admin';

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from('users')
      .select('org_name, org_type, org_address, org_place_id, location_lat, location_lng, org_contact_name, org_contact_phone, postal_code, profile_image')
      .eq('id', userId)
      .eq('role', 'organization')
      .single();

    if (error || !data) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    return NextResponse.json({ profile: data });
  } catch (err: any) {
    console.error('[GET /api/org/profile] Unexpected error:', err.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = createSupabaseAdminClient();

    const { data: user, error: userError } = await supabase
      .from('users')
      .select('role')
      .eq('id', userId)
      .single();

    if (userError || user?.role !== 'organization') {
      return NextResponse.json({ error: 'Organization account required' }, { status: 403 });
    }

    const body = await req.json();
    const { org_name, org_type, org_address, org_place_id, location_lat, location_lng, org_contact_name, org_contact_phone, postal_code, profile_image } = body;

    const updates: Record<string, unknown> = {};
    if (org_name !== undefined) updates.org_name = org_name || null;
    if (org_type !== undefined) updates.org_type = org_type || null;
    if (org_address !== undefined) updates.org_address = org_address || null;
    if (org_place_id !== undefined) updates.org_place_id = org_place_id || null;
    if (location_lat !== undefined) updates.location_lat = location_lat ?? null;
    if (location_lng !== undefined) updates.location_lng = location_lng ?? null;
    if (org_contact_name !== undefined) updates.org_contact_name = org_contact_name || null;
    if (org_contact_phone !== undefined) updates.org_contact_phone = org_contact_phone || null;
    if (postal_code !== undefined) updates.postal_code = postal_code || null;
    if (profile_image !== undefined) updates.profile_image = profile_image || null;

    const { error } = await supabase.from('users').update(updates).eq('id', userId);

    if (error) {
      console.error('[PATCH /api/org/profile] Supabase error:', error);
      return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[PATCH /api/org/profile] Unexpected error:', err.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
