import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createSupabaseAdminClient } from '@/utils/supabase/admin';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id: chatRequestId } = await params;
    const supabase = createSupabaseAdminClient();

    // Verify user is a participant
    const { data: chatRequest } = await supabase
      .from('chat_requests')
      .select('id, requester_id, recipient_id')
      .eq('id', chatRequestId)
      .single();

    if (!chatRequest) {
      return NextResponse.json({ error: 'Chat request not found' }, { status: 404 });
    }
    if (chatRequest.requester_id !== userId && chatRequest.recipient_id !== userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Find the active (pending or confirmed) appointment for this chat
    const { data: appointment } = await supabase
      .from('appointments')
      .select(`
        id,
        status,
        start_time,
        duration_minutes,
        location_type,
        location_details,
        notes,
        proposed_by,
        proposed_at,
        confirmed_at,
        individual_id,
        volunteer_id
      `)
      .eq('chat_request_id', chatRequestId)
      .in('status', ['pending', 'confirmed'])
      .order('proposed_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    return NextResponse.json({ appointment: appointment ?? null });
  } catch (error) {
    console.error('[chat-request appointment GET]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
