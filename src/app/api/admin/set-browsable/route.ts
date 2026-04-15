import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/utils/supabase/admin';

export async function POST(request: NextRequest) {
  try {
    const { user_id, is_browsable } = await request.json();

    if (!user_id || typeof is_browsable !== 'boolean') {
      return NextResponse.json({ error: 'user_id and is_browsable required' }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();

    const { error } = await supabase
      .from('users')
      .update({ is_browsable })
      .eq('id', user_id);

    if (error) {
      console.error('[set-browsable] Error updating user:', error);
      return NextResponse.json({ error: 'Failed to update user' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[set-browsable] Unexpected error:', err);
    return NextResponse.json({ error: 'Unexpected server error' }, { status: 500 });
  }
}
