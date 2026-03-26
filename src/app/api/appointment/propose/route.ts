import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createSupabaseAdminClient } from '@/utils/supabase/admin';
import { streamChatServer } from '@/utils/stream-chat';

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const {
      chat_request_id,
      start_time,
      duration_minutes,
      location_type,
      location_details,
      notes,
      replacing_appointment_id, // optional: cancel this appointment before creating the new one
    } = await request.json();

    if (!chat_request_id || !start_time || !duration_minutes || !location_type) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();

    // Fetch chat request and verify user is a participant
    const { data: chatRequest } = await supabase
      .from('chat_requests')
      .select('id, requester_id, recipient_id, channel_id, status')
      .eq('id', chat_request_id)
      .single();

    if (!chatRequest) {
      return NextResponse.json({ error: 'Chat request not found' }, { status: 404 });
    }
    if (chatRequest.status !== 'accepted') {
      return NextResponse.json({ error: 'Chat request is not active' }, { status: 400 });
    }
    if (chatRequest.requester_id !== userId && chatRequest.recipient_id !== userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const isModification = !!replacing_appointment_id;

    if (isModification) {
      // Cancel the existing appointment before proposing new details
      const { error: cancelError } = await supabase
        .from('appointments')
        .update({ status: 'canceled' })
        .eq('id', replacing_appointment_id)
        .in('status', ['confirmed', 'pending']); // only cancel if still active

      if (cancelError) {
        console.error('[appointment/propose] Failed to cancel existing appointment:', cancelError);
        return NextResponse.json({ error: 'Failed to cancel existing appointment' }, { status: 500 });
      }
    } else {
      // Check no active appointment already exists for this chat
      const { data: existing } = await supabase
        .from('appointments')
        .select('id')
        .eq('chat_request_id', chat_request_id)
        .in('status', ['pending', 'confirmed'])
        .maybeSingle();

      if (existing) {
        return NextResponse.json(
          { error: 'An active appointment already exists for this chat. Confirm or decline it first.' },
          { status: 409 }
        );
      }
    }

    // Determine individual_id and volunteer_id from user roles
    const [requesterRes, recipientRes] = await Promise.all([
      supabase.from('users').select('id, role, first_name').eq('id', chatRequest.requester_id).single(),
      supabase.from('users').select('id, role, first_name').eq('id', chatRequest.recipient_id).single(),
    ]);

    const requester = requesterRes.data;
    const recipient = recipientRes.data;

    if (!requester || !recipient) {
      return NextResponse.json({ error: 'Could not load user data' }, { status: 500 });
    }

    const individualId = requester.role === 'individual' ? requester.id : recipient.id;
    const volunteerId = requester.role === 'volunteer' ? requester.id : recipient.id;

    // Calculate end_time
    const endTime = new Date(new Date(start_time).getTime() + duration_minutes * 60 * 1000).toISOString();

    // Create the appointment
    const { data: appointment, error: insertError } = await supabase
      .from('appointments')
      .insert({
        individual_id: individualId,
        volunteer_id: volunteerId,
        start_time,
        end_time: endTime,
        duration_minutes,
        location_type,
        location_details: location_details || null,
        notes: notes || null,
        proposed_by: userId,
        proposed_at: new Date().toISOString(),
        status: 'pending',
        chat_request_id,
      })
      .select()
      .single();

    if (insertError) {
      console.error('[appointment/propose] Insert error:', insertError);
      return NextResponse.json({ error: 'Failed to create appointment' }, { status: 500 });
    }

    // Post a system message to the Stream channel
    if (chatRequest.channel_id) {
      try {
        const proposerName = userId === requester.id ? requester.first_name : recipient.first_name;
        const tz = 'America/New_York';
        const d = new Date(start_time);
        const dateStr = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(d);
        const timeStr = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit', hour12: true }).format(d);

        const locationLabel =
          location_type === 'individual_address' ? "Individual's home" :
          location_type === 'public' ? 'Public location' : 'Other';
        const locationText = location_details
          ? `${locationLabel}: ${location_details}`
          : locationLabel;

        const intro = isModification
          ? `✏️ ${proposerName} proposed changes to the visit:`
          : `📅 ${proposerName} proposed a visit:`;

        const messageText = [
          intro,
          `📆 ${dateStr} at ${timeStr}`,
          `📍 ${locationText}`,
          notes ? `📝 ${notes}` : null,
          `\nUse the "Confirm Visit" or "Decline" buttons above the chat to respond.`,
        ].filter(Boolean).join('\n');

        const channel = streamChatServer.channel('messaging', chatRequest.channel_id);
        await channel.sendMessage({
          text: messageText,
          user_id: 'sunshine-bot',
          type: 'regular',
        });
      } catch (msgError) {
        console.warn('[appointment/propose] Failed to post system message:', msgError);
      }
    }

    return NextResponse.json({ appointment });
  } catch (error) {
    console.error('[appointment/propose]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
