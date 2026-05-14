import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createSupabaseAdminClient } from '@/utils/supabase/admin';

export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = createSupabaseAdminClient();

    const { data: user, error: userError } = await supabase
      .from('users')
      .select('role')
      .eq('id', userId)
      .single();

    if (userError || user?.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const [apptChatsRes, chatRequestsRes] = await Promise.all([
      supabase.from('appointment_chats').select('unread_count'),
      supabase.from('chat_requests').select('unread_count_admin'),
    ]);

    const appointmentChatsUnread = (apptChatsRes.data ?? []).reduce(
      (sum, row) => sum + (row.unread_count || 0),
      0
    );

    const chatRequestsUnread = (chatRequestsRes.data ?? []).reduce(
      (sum, row) => sum + (row.unread_count_admin || 0),
      0
    );

    return NextResponse.json({
      appointmentChatsUnread,
      chatRequestsUnread,
      total: appointmentChatsUnread + chatRequestsUnread,
    });
  } catch (error) {
    console.error('[Admin Unread Counts API] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
