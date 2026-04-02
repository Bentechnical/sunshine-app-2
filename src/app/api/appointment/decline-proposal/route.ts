import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createSupabaseAdminClient } from '@/utils/supabase/admin';
import { streamChatServer } from '@/utils/stream-chat';
import { sendTransactionalEmail } from '@/app/utils/mailer';

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { appointment_id, cancellation_reason } = await request.json();
    if (!appointment_id) {
      return NextResponse.json({ error: 'appointment_id is required' }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();

    const { data: appointment } = await supabase
      .from('appointments')
      .select(`
        id, status, proposed_by, start_time,
        chat_request:chat_requests!appointments_chat_request_id_fkey(
          channel_id, requester_id, recipient_id
        )
      `)
      .eq('id', appointment_id)
      .single();

    if (!appointment) {
      return NextResponse.json({ error: 'Appointment not found' }, { status: 404 });
    }
    if (!['pending', 'confirmed'].includes(appointment.status)) {
      return NextResponse.json(
        { error: `Appointment is already ${appointment.status}` },
        { status: 400 }
      );
    }

    const chatRequest = Array.isArray(appointment.chat_request)
      ? appointment.chat_request[0]
      : appointment.chat_request;

    if (!chatRequest) {
      return NextResponse.json({ error: 'Chat request not found' }, { status: 404 });
    }
    if (chatRequest.requester_id !== userId && chatRequest.recipient_id !== userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { error: updateError } = await supabase
      .from('appointments')
      .update({
        status: 'canceled',
        cancellation_reason: cancellation_reason || null,
      })
      .eq('id', appointment_id);

    if (updateError) {
      console.error('[decline-proposal] Update error:', updateError);
      return NextResponse.json({ error: 'Failed to cancel appointment' }, { status: 500 });
    }

    // Post system message
    if (chatRequest.channel_id) {
      try {
        const wasConfirmed = appointment.status === 'confirmed';
        const isCancelByProposer = appointment.proposed_by === userId;

        const text = wasConfirmed
          ? '❌ The confirmed visit was canceled. You can propose a new time below.'
          : isCancelByProposer
            ? '❌ The visit proposal was withdrawn.'
            : '❌ The visit proposal was declined. Feel free to propose a new time.';

        const channel = streamChatServer.channel('messaging', chatRequest.channel_id);
        await channel.sendMessage({
          text,
          user_id: 'sunshine-bot',
          type: 'regular',
        });
      } catch (msgError) {
        console.warn('[decline-proposal] Failed to post system message:', msgError);
      }
    }

    // Email the OTHER party (not the one who declined/withdrew)
    // If proposer withdrew → email the non-proposer
    // If non-proposer declined → email the proposer
    const otherUserId = userId === chatRequest.requester_id
      ? chatRequest.recipient_id
      : chatRequest.requester_id;
    try {
      const [actorRes, otherRes] = await Promise.all([
        supabase.from('users').select('first_name').eq('id', userId).single(),
        supabase.from('users').select('first_name, email').eq('id', otherUserId).single(),
      ]);
      if (otherRes.data?.email) {
        const tz = 'America/New_York';
        const d = new Date(appointment.start_time);
        const appointmentTime = new Intl.DateTimeFormat('en-US', {
          timeZone: tz, weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
          hour: 'numeric', minute: '2-digit', hour12: true,
        }).format(d);

        await sendTransactionalEmail({
          to: otherRes.data.email,
          subject: `${actorRes.data?.first_name ?? 'Your partner'} declined the visit proposal`,
          templateName: 'appointmentProposalDeclined',
          data: {
            firstName: otherRes.data.first_name,
            otherPartyName: actorRes.data?.first_name ?? 'Your partner',
            appointmentTime,
            dashboardLink: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard`,
            year: new Date().getFullYear(),
          },
        });
      }
    } catch (emailErr) {
      console.warn('[decline-proposal] Failed to send email:', emailErr);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[decline-proposal]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
