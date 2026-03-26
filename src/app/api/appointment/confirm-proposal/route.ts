import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createSupabaseAdminClient } from '@/utils/supabase/admin';
import { streamChatServer } from '@/utils/stream-chat';

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { appointment_id } = await request.json();
    if (!appointment_id) {
      return NextResponse.json({ error: 'appointment_id is required' }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();

    // Fetch appointment with chat request info
    const { data: appointment } = await supabase
      .from('appointments')
      .select(`
        id, status, proposed_by, start_time, duration_minutes,
        individual_id, volunteer_id, chat_request_id,
        chat_request:chat_requests!appointments_chat_request_id_fkey(
          channel_id, requester_id, recipient_id
        )
      `)
      .eq('id', appointment_id)
      .single();

    if (!appointment) {
      return NextResponse.json({ error: 'Appointment not found' }, { status: 404 });
    }
    if (appointment.status !== 'pending') {
      return NextResponse.json(
        { error: `Appointment is already ${appointment.status}` },
        { status: 400 }
      );
    }

    // Verify user is a participant in the chat
    const chatRequest = Array.isArray(appointment.chat_request)
      ? appointment.chat_request[0]
      : appointment.chat_request;

    if (!chatRequest) {
      return NextResponse.json({ error: 'Chat request not found' }, { status: 404 });
    }
    if (chatRequest.requester_id !== userId && chatRequest.recipient_id !== userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    // Only the non-proposer can confirm
    if (appointment.proposed_by === userId) {
      return NextResponse.json(
        { error: 'You cannot confirm your own proposal' },
        { status: 400 }
      );
    }

    // Confirm the appointment
    const { data: updated, error: updateError } = await supabase
      .from('appointments')
      .update({ status: 'confirmed', confirmed_at: new Date().toISOString() })
      .eq('id', appointment_id)
      .select()
      .single();

    if (updateError) {
      console.error('[confirm-proposal] Update error:', updateError);
      return NextResponse.json({ error: 'Failed to confirm appointment' }, { status: 500 });
    }

    // Post system message to Stream channel
    if (chatRequest.channel_id) {
      try {
        const tz = 'America/New_York';
        const d = new Date(appointment.start_time);
        const dateStr = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(d);
        const timeStr = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit', hour12: true }).format(d);

        const channel = streamChatServer.channel('messaging', chatRequest.channel_id);
        await channel.sendMessage({
          text: `✅ Visit confirmed! See you on ${dateStr} at ${timeStr}.`,
          user_id: 'sunshine-bot',
          type: 'regular',
        });
      } catch (msgError) {
        console.warn('[confirm-proposal] Failed to post system message:', msgError);
      }
    }

    return NextResponse.json({ appointment: updated });
  } catch (error) {
    console.error('[confirm-proposal]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
