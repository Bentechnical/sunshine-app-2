import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createSupabaseAdminClient } from '@/utils/supabase/admin';
import { streamChatServer } from '@/utils/stream-chat';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ channelId: string }> }
) {
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

    const { channelId } = await params;

    const channel = streamChatServer.channel('messaging', channelId);
    const result = await channel.query({
      messages: { limit: 200 },
    });

    const messages = (result.messages ?? []).map((msg) => ({
      id: msg.id,
      text: msg.text ?? '',
      user_id: msg.user?.id ?? '',
      user_name: msg.user?.name ?? msg.user?.id ?? 'Unknown',
      created_at: msg.created_at,
      is_system: msg.type === 'system' || msg.user?.id === 'sunshine-bot',
    }));

    return NextResponse.json({ messages });
  } catch (error) {
    console.error('[Admin Chat Request Messages API] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch messages' }, { status: 500 });
  }
}
