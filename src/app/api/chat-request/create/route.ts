// src/app/api/chat-request/create/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createSupabaseAdminClient } from '@/utils/supabase/admin';
import { sendTransactionalEmail } from '@/app/utils/mailer';
import { getAppUrl } from '@/app/utils/getAppUrl';

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { recipient_id, dog_id } = await request.json();

    if (!recipient_id || !dog_id) {
      return NextResponse.json(
        { error: 'recipient_id and dog_id are required' },
        { status: 400 }
      );
    }

    if (userId === recipient_id) {
      return NextResponse.json({ error: 'Cannot send a request to yourself' }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();

    // Fetch both users and the dog in parallel
    const [requesterRes, recipientRes, dogRes] = await Promise.all([
      supabase.from('users').select('first_name, email, status').eq('id', userId).single(),
      supabase.from('users').select('first_name, email, status').eq('id', recipient_id).single(),
      supabase.from('dogs').select('dog_name').eq('id', dog_id).single(),
    ]);

    if (requesterRes.error || !requesterRes.data) {
      return NextResponse.json({ error: 'Requester not found' }, { status: 404 });
    }
    if (recipientRes.error || !recipientRes.data) {
      return NextResponse.json({ error: 'Recipient not found' }, { status: 404 });
    }

    const requester = requesterRes.data;
    const recipient = recipientRes.data;
    const dogName = dogRes.data?.dog_name ?? 'the therapy dog';

    if (requester.status !== 'approved' || recipient.status !== 'approved') {
      return NextResponse.json(
        { error: 'Both users must be approved to send a chat request' },
        { status: 400 }
      );
    }

    // Check for active snooze between these two users (either direction)
    const { data: snoozeCheck } = await supabase
      .from('chat_requests')
      .select('id')
      .or(
        `and(requester_id.eq.${userId},recipient_id.eq.${recipient_id}),and(requester_id.eq.${recipient_id},recipient_id.eq.${userId})`
      )
      .gt('snoozed_until', new Date().toISOString())
      .limit(1);

    if (snoozeCheck && snoozeCheck.length > 0) {
      return NextResponse.json(
        { error: 'You cannot send a chat request to this user at this time.' },
        { status: 403 }
      );
    }

    // Check for existing pending or active requests in either direction
    const [fwd, rev] = await Promise.all([
      supabase
        .from('chat_requests')
        .select('id, status, channel_closed_at')
        .eq('requester_id', userId)
        .eq('recipient_id', recipient_id)
        .in('status', ['pending', 'accepted']),
      supabase
        .from('chat_requests')
        .select('id, status, channel_closed_at')
        .eq('requester_id', recipient_id)
        .eq('recipient_id', userId)
        .in('status', ['pending', 'accepted']),
    ]);

    const existing = [...(fwd.data ?? []), ...(rev.data ?? [])];
    const hasPending = existing.some((r) => r.status === 'pending');
    const hasActiveChat = existing.some(
      (r) => r.status === 'accepted' && !r.channel_closed_at
    );

    if (hasPending) {
      return NextResponse.json(
        { error: 'A pending request already exists between these users' },
        { status: 409 }
      );
    }
    if (hasActiveChat) {
      return NextResponse.json(
        { error: 'An active chat already exists between these users' },
        { status: 409 }
      );
    }

    // Insert the chat request
    const { data: newRequest, error: insertError } = await supabase
      .from('chat_requests')
      .insert({ requester_id: userId, recipient_id, dog_id, status: 'pending' })
      .select()
      .single();

    if (insertError) {
      console.error('[chat-request/create] Insert error:', insertError.message, insertError.details, insertError.hint);
      return NextResponse.json({ error: 'Failed to create request', details: insertError.message }, { status: 500 });
    }

    // Email the recipient (non-fatal if it fails)
    try {
      await sendTransactionalEmail({
        to: recipient.email,
        subject: `${requester.first_name} wants to chat about meeting ${dogName}`,
        templateName: 'chatRequestReceived',
        data: {
          firstName: recipient.first_name,
          requesterName: requester.first_name,
          dogName,
          dashboardLink: getAppUrl() + '/dashboard',
          year: new Date().getFullYear(),
        },
      });
    } catch (emailErr) {
      console.error('[chat-request/create] Email error (non-fatal):', emailErr);
    }

    return NextResponse.json({ success: true, request: newRequest });
  } catch (error) {
    console.error('[chat-request/create] Unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
