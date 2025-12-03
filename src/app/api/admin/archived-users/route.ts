// src/app/api/admin/archived-users/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/utils/supabase/admin';

export async function GET(req: NextRequest) {
  try {
    const supabase = createSupabaseAdminClient();

    // Fetch all archived users (both individuals and volunteers)
    const { data: users, error } = await supabase
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
        archived_at,
        dogs (
          dog_name,
          dog_breed,
          dog_age,
          dog_bio,
          dog_picture_url
        )
      `)
      .eq('status', 'archived')
      .order('archived_at', { ascending: false });

    if (error) {
      console.error('[archived-users] Failed to fetch archived users:', error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    console.log(`[archived-users] Found ${users?.length || 0} archived users`);

    return NextResponse.json({ users: users || [] });
  } catch (err: any) {
    console.error('[archived-users] Unexpected error:', err.message);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
