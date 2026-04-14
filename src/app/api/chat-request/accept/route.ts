// src/app/api/chat-request/accept/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createSupabaseAdminClient } from '@/utils/supabase/admin';
import { streamChatServer } from '@/utils/stream-chat';
import { sendTransactionalEmail } from '@/app/utils/mailer';
import { getAppUrl } from '@/app/utils/getAppUrl';

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { request_id } = await request.json();
    if (!request_id) {
      return NextResponse.json({ error: 'request_id is required' }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();

    // Fetch the chat request with both users and dog
    const { data: chatRequest, error: fetchError } = await supabase
      .from('chat_requests')
      .select('id, requester_id, recipient_id, dog_id, status')
      .eq('id', request_id)
      .single();

    if (fetchError || !chatRequest) {
      return NextResponse.json({ error: 'Chat request not found' }, { status: 404 });
    }

    if (chatRequest.recipient_id !== userId) {
      return NextResponse.json({ error: 'Only the recipient can accept a request' }, { status: 403 });
    }

    if (chatRequest.status !== 'pending') {
      return NextResponse.json(
        { error: `Request is already ${chatRequest.status}` },
        { status: 400 }
      );
    }

    // Fetch both users and dog for channel metadata and email
    const [requesterRes, recipientRes, dogRes] = await Promise.all([
      supabase.from('users').select('first_name, email, role').eq('id', chatRequest.requester_id).single(),
      supabase.from('users').select('first_name, email, role').eq('id', chatRequest.recipient_id).single(),
      chatRequest.dog_id
        ? supabase.from('dogs').select('dog_name').eq('id', chatRequest.dog_id).single()
        : Promise.resolve({ data: null }),
    ]);

    const requester = requesterRes.data;
    const recipient = recipientRes.data;
    const dogName = dogRes.data?.dog_name ?? 'the therapy dog';

    // Determine individual/volunteer names for channel metadata
    const individualName =
      requester?.role === 'individual' ? requester.first_name : recipient?.first_name ?? '';
    const volunteerName =
      requester?.role === 'volunteer' ? requester.first_name : recipient?.first_name ?? '';

    // Create Stream Chat channel
    const channelId = `cr-${request_id.replace(/-/g, '')}`;
    const channel = streamChatServer.channel('messaging', channelId, {
      members: [chatRequest.requester_id, chatRequest.recipient_id],
      created_by: { id: userId },
      ...({
        custom: {
          chat_request_id: request_id,
          dog_name: dogName,
          individual_name: individualName,
          volunteer_name: volunteerName,
          type: 'chat_request',
        },
      } as any),
    });

    await channel.create();

    // Send a welcome message
    await channel.sendMessage({
      text: `Hi! Your chat is now open. Use this conversation to introduce yourselves and arrange a visit with ${dogName}. 🐕`,
      user_id: 'sunshine-bot',
    } as any);

    // Update chat_requests record
    const now = new Date().toISOString();
    const { error: updateError } = await supabase
      .from('chat_requests')
      .update({
        status: 'accepted',
        responded_at: now,
        channel_id: channelId,
        channel_created_at: now,
      })
      .eq('id', request_id);

    if (updateError) {
      console.error('[chat-request/accept] Update error:', updateError);
      return NextResponse.json({ error: 'Failed to update request' }, { status: 500 });
    }

    // Email the requester (non-fatal)
    if (requester?.email) {
      try {
        await sendTransactionalEmail({
          to: requester.email,
          subject: `${recipient?.first_name ?? 'Someone'} accepted your chat request`,
          templateName: 'chatRequestAccepted',
          data: {
            firstName: requester.first_name,
            recipientName: recipient?.first_name ?? 'your match',
            dogName,
            dashboardLink: getAppUrl() + '/dashboard',
            year: new Date().getFullYear(),
          },
        });
      } catch (emailErr) {
        console.error('[chat-request/accept] Email error (non-fatal):', emailErr);
      }
    }

    return NextResponse.json({ success: true, channel_id: channelId });
  } catch (error) {
    console.error('[chat-request/accept] Unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
