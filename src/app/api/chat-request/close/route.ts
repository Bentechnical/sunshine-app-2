// src/app/api/chat-request/close/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createSupabaseAdminClient } from '@/utils/supabase/admin';
import { streamChatServer } from '@/utils/stream-chat';

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { chat_request_id } = await request.json();
    if (!chat_request_id) {
      return NextResponse.json({ error: 'chat_request_id is required' }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();

    const { data: chatRequest, error: fetchError } = await supabase
      .from('chat_requests')
      .select('id, requester_id, recipient_id, channel_id, channel_closed_at, status')
      .eq('id', chat_request_id)
      .single();

    if (fetchError || !chatRequest) {
      return NextResponse.json({ error: 'Chat request not found' }, { status: 404 });
    }

    // Either participant can close
    if (chatRequest.requester_id !== userId && chatRequest.recipient_id !== userId) {
      return NextResponse.json({ error: 'Not a participant in this chat' }, { status: 403 });
    }

    if (chatRequest.channel_closed_at) {
      return NextResponse.json({ error: 'Chat is already closed' }, { status: 400 });
    }

    if (chatRequest.status !== 'accepted') {
      return NextResponse.json({ error: 'Chat is not active' }, { status: 400 });
    }

    // Send a closing message in Stream and archive the channel
    if (chatRequest.channel_id) {
      try {
        const channel = streamChatServer.channel('messaging', chatRequest.channel_id);
        await channel.sendMessage({
          text: 'This conversation has been closed. Either participant can start a new chat request if you want to connect again. 🐕',
          user_id: 'sunshine-bot',
        } as any);
        await channel.update({ status: 'closed' } as any);
      } catch (streamErr) {
        console.error('[chat-request/close] Stream error (non-fatal):', streamErr);
      }
    }

    const { error: updateError } = await supabase
      .from('chat_requests')
      .update({ channel_closed_at: new Date().toISOString() })
      .eq('id', chat_request_id);

    if (updateError) {
      console.error('[chat-request/close] Update error:', updateError);
      return NextResponse.json({ error: 'Failed to close chat' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[chat-request/close] Unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
