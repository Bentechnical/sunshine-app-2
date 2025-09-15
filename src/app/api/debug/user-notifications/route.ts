import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { streamChatServer } from '@/utils/stream-chat';
import { createSupabaseAdminClient } from '@/utils/supabase/admin';

export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createSupabaseAdminClient();

    // Get user's appointment chats
    const { data: appointmentChats } = await supabase
      .from('appointment_chats')
      .select(`
        id,
        appointment_id,
        stream_channel_id,
        status,
        created_at,
        appointment:appointments (
          individual_id,
          volunteer_id,
          start_time
        )
      `)
      .eq('status', 'active');

    // Filter for user's chats
    const userChats = appointmentChats?.filter((chat: any) =>
      chat.appointment?.individual_id === userId ||
      chat.appointment?.volunteer_id === userId
    ) || [];

    // Get recent chat logs for user's appointments
    const appointmentIds = userChats.map(chat => chat.appointment_id);
    const { data: recentLogs } = await supabase
      .from('chat_logs')
      .select('*')
      .in('appointment_id', appointmentIds)
      .order('created_at', { ascending: false })
      .limit(10);

    // Query Stream Chat for channel details
    const streamChannelDetails = [];
    for (const chat of userChats) {
      try {
        const channel = streamChatServer.channel('messaging', chat.stream_channel_id.split(':')[1]);
        await channel.query();

        streamChannelDetails.push({
          channelId: chat.stream_channel_id,
          appointmentId: chat.appointment_id,
          memberCount: channel.data?.member_count || 0,
          messageCount: channel.state?.messages?.length || 0,
          lastMessage: channel.state?.messages?.[channel.state.messages.length - 1],
          custom: channel.data?.custom || {}
        });
      } catch (err) {
        console.warn(`Failed to query channel ${chat.stream_channel_id}:`, err);
        streamChannelDetails.push({
          channelId: chat.stream_channel_id,
          appointmentId: chat.appointment_id,
          error: err instanceof Error ? err.message : 'Unknown error'
        });
      }
    }

    return NextResponse.json({
      success: true,
      userId,
      debug: {
        totalAppointmentChats: appointmentChats?.length || 0,
        userAppointmentChats: userChats.length,
        recentLogCount: recentLogs?.length || 0,
        streamChannelCount: streamChannelDetails.length
      },
      data: {
        userChats: userChats.map(chat => ({
          appointmentId: chat.appointment_id,
          channelId: chat.stream_channel_id,
          status: chat.status,
          createdAt: chat.created_at,
          isIndividual: chat.appointment?.individual_id === userId,
          isVolunteer: chat.appointment?.volunteer_id === userId,
          appointmentTime: chat.appointment?.start_time
        })),
        recentLogs: recentLogs?.map(log => ({
          appointmentId: log.appointment_id,
          messageId: log.stream_message_id,
          senderId: log.sender_id,
          content: log.content.substring(0, 100) + '...',
          isSystem: log.is_system_message,
          createdAt: log.created_at
        })) || [],
        streamChannels: streamChannelDetails
      }
    });

  } catch (error) {
    console.error('[Debug] Error getting user notification debug info:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}