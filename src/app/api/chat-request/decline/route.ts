// src/app/api/chat-request/decline/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createSupabaseAdminClient } from '@/utils/supabase/admin';

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { request_id } = await request.json();
    if (!request_id) {
      return NextResponse.json({ error: 'request_id is required' }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();

    const { data: chatRequest, error: fetchError } = await supabase
      .from('chat_requests')
      .select('id, recipient_id, status')
      .eq('id', request_id)
      .single();

    if (fetchError || !chatRequest) {
      return NextResponse.json({ error: 'Chat request not found' }, { status: 404 });
    }

    if (chatRequest.recipient_id !== userId) {
      return NextResponse.json({ error: 'Only the recipient can decline a request' }, { status: 403 });
    }

    if (chatRequest.status !== 'pending') {
      return NextResponse.json(
        { error: `Request is already ${chatRequest.status}` },
        { status: 400 }
      );
    }

    const { error: updateError } = await supabase
      .from('chat_requests')
      .update({ status: 'declined', responded_at: new Date().toISOString() })
      .eq('id', request_id);

    if (updateError) {
      console.error('[chat-request/decline] Update error:', updateError);
      return NextResponse.json({ error: 'Failed to decline request' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[chat-request/decline] Unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
