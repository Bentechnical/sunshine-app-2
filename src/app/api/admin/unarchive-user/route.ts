// src/app/api/admin/unarchive-user/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/utils/supabase/admin';

export async function POST(req: NextRequest) {
  try {
    const supabase = createSupabaseAdminClient();
    const body = await req.json();

    console.log('[unarchive-user] Incoming body:', body);

    const { user_id } = body;

    if (!user_id) {
      console.error('[unarchive-user] Missing user_id');
      return NextResponse.json({ error: 'Missing user_id' }, { status: 400 });
    }

    // Fetch user details
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, first_name, last_name, role, status')
      .eq('id', user_id)
      .single();

    if (userError || !user) {
      console.error('[unarchive-user] Failed to fetch user:', userError?.message);
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Check if user is actually archived
    if (user.status !== 'archived') {
      return NextResponse.json({ error: 'User is not archived' }, { status: 400 });
    }

    // Restore user to approved status
    const { error: unarchiveError } = await supabase
      .from('users')
      .update({
        status: 'approved',
        archived_at: null,
      })
      .eq('id', user_id);

    if (unarchiveError) {
      console.error('[unarchive-user] Failed to unarchive user:', unarchiveError.message);
      return NextResponse.json({ error: unarchiveError.message }, { status: 500 });
    }

    // If volunteer, restore their dog too
    if (user.role === 'volunteer') {
      const { error: dogError } = await supabase
        .from('dogs')
        .update({ status: 'approved' })
        .eq('volunteer_id', user_id);

      if (dogError) {
        console.error('[unarchive-user] Failed to restore dog:', dogError.message);
        // Continue anyway, user is unarchived
      }
    }

    console.log(`[unarchive-user] Successfully unarchived user ${user_id}`);

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[unarchive-user] Unexpected error:', err.message);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
