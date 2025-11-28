import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/utils/supabase/admin';
import { streamChatServer } from '@/utils/stream-chat';
import { sendTransactionalEmail } from '@/app/utils/mailer';
import { formatEmailDateTime } from '@/utils/dateUtils';

/**
 * Cron job to process pending email notifications
 * Runs every 30 minutes via Vercel Cron
 *
 * Strategy:
 * 1. Find all pending notifications that are ready (scheduled_for <= now)
 * 2. Group by user_id
 * 3. For each user, grab ALL their pending notifications (look-ahead batching)
 * 4. Group by channel and check Stream Chat for unread status
 * 5. Send ONE email per user with all unread conversations
 */
export async function GET() {
  const timestamp = new Date().toISOString();
  console.log(`[Notification Cron] 🔔 ${timestamp} - Starting notification processing`);

  try {
    const supabase = createSupabaseAdminClient();
    const now = new Date();

    // Step 1: Find notifications that are ready to be processed
    const { data: readyNotifications, error: fetchError } = await supabase
      .from('pending_email_notifications')
      .select('*')
      .eq('status', 'pending')
      .lte('scheduled_for', now.toISOString());

    if (fetchError) {
      console.error(`[Notification Cron] ❌ ${timestamp} - Error fetching notifications:`, fetchError);
      return NextResponse.json({ error: 'Failed to fetch notifications' }, { status: 500 });
    }

    if (!readyNotifications || readyNotifications.length === 0) {
      console.log(`[Notification Cron] ✅ ${timestamp} - No notifications ready to process`);
      return NextResponse.json({ success: true, processed: 0 });
    }

    console.log(`[Notification Cron] 📋 ${timestamp} - Found ${readyNotifications.length} notifications ready to process`);

    // Step 2: Group by user_id to get unique users
    const userIds = [...new Set(readyNotifications.map(n => n.user_id))];
    console.log(`[Notification Cron] 👥 ${timestamp} - Processing notifications for ${userIds.length} users`);

    let totalEmailsSent = 0;
    let totalNotificationsCanceled = 0;

    // Step 3: For each user, grab ALL their pending notifications and process
    for (const userId of userIds) {
      try {
        console.log(`[Notification Cron] 🔍 ${timestamp} - Processing user ${userId}`);

        // Grab ALL pending notifications for this user (look-ahead batching)
        const { data: allUserNotifications, error: userFetchError } = await supabase
          .from('pending_email_notifications')
          .select('*')
          .eq('user_id', userId)
          .eq('status', 'pending');

        if (userFetchError || !allUserNotifications) {
          console.error(`[Notification Cron] ❌ ${timestamp} - Error fetching user notifications:`, userFetchError);
          continue;
        }

        console.log(`[Notification Cron] 📬 ${timestamp} - User ${userId} has ${allUserNotifications.length} total pending notifications`);

        // Step 4: Group by channel_id
        type NotificationType = typeof allUserNotifications[number];
        const notificationsByChannel = allUserNotifications.reduce((acc, notification) => {
          if (!acc[notification.channel_id]) {
            acc[notification.channel_id] = [];
          }
          acc[notification.channel_id].push(notification);
          return acc;
        }, {} as Record<string, NotificationType[]>);

        const conversations = [];

        // Step 5: For each channel, check if messages are still unread
        for (const [channelId, channelNotifs] of Object.entries(notificationsByChannel)) {
          const channelNotifications = channelNotifs as NotificationType[];
          try {
            console.log(`[Notification Cron] 💬 ${timestamp} - Checking channel ${channelId} for ${channelNotifications.length} messages`);

            // Get the channel from Stream Chat
            const channel = streamChatServer.channel('messaging', channelId.split(':')[1] || channelId);
            await channel.query({ state: true });

            // Check if user has read all messages by comparing last_read timestamp with latest message
            const channelState = channel.state;
            const lastMessage = channelState?.messages?.[channelState.messages.length - 1];
            const userReadState = channelState?.read?.[userId];

            let hasUnread = false;
            if (lastMessage && userReadState) {
              const lastMessageTime = new Date(lastMessage.created_at).getTime();
              const lastReadTime = new Date(userReadState.last_read).getTime();
              hasUnread = lastMessageTime > lastReadTime;

              console.log(`[Notification Cron] 📊 ${timestamp} - Channel ${channelId}:`, {
                lastMessageTime: new Date(lastMessage.created_at).toISOString(),
                lastReadTime: new Date(userReadState.last_read).toISOString(),
                hasUnread,
                lastMessageUser: lastMessage.user?.id
              });
            } else if (lastMessage && !userReadState) {
              // No read state means user hasn't read anything
              hasUnread = lastMessage.user?.id !== userId; // Only count as unread if message is from someone else
              console.log(`[Notification Cron] 📊 ${timestamp} - Channel ${channelId}: No read state for user, hasUnread=${hasUnread}`);
            } else {
              console.log(`[Notification Cron] 📊 ${timestamp} - Channel ${channelId}: No messages found`);
            }

            if (hasUnread) {
              // Messages still unread - include in email
              const appointmentId = channelNotifications[0].appointment_id;

              // Fetch appointment and user details
              const { data: appointment, error: appointmentError } = await supabase
                .from('appointments')
                .select(`
                  *,
                  individual:users!appointments_individual_id_fkey(first_name, last_name, email),
                  volunteer:users!appointments_volunteer_id_fkey(first_name, last_name, email),
                  dog:dogs(name)
                `)
                .eq('id', appointmentId)
                .single();

              if (appointmentError) {
                console.error(`[Notification Cron] ❌ ${timestamp} - Error fetching appointment ${appointmentId}:`, appointmentError);
                continue;
              }

              if (appointment) {
                // Determine sender (the person who is NOT the recipient)
                const individual = appointment.individual as any;
                const volunteer = appointment.volunteer as any;
                const isSenderVolunteer = volunteer.email !== (userId.includes('@') ? userId : undefined);

                const senderName = isSenderVolunteer
                  ? `${volunteer.first_name} ${volunteer.last_name}`
                  : `${individual.first_name} ${individual.last_name}`;

                const dogName = (appointment.dog as any)?.name || 'Unknown Dog';

                // Format appointment time
                const appointmentTime = formatEmailDateTime(appointment.start_time);

                // Get latest message content
                const latestNotification = [...channelNotifications].sort(
                  (a: NotificationType, b: NotificationType) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
                )[0];

                const { data: latestMessage } = await supabase
                  .from('chat_logs')
                  .select('content')
                  .eq('stream_message_id', latestNotification.stream_message_id)
                  .single();

                conversations.push({
                  senderName,
                  dogName,
                  appointmentTime,
                  messageCount: channelNotifications.length,
                  latestMessage: latestMessage?.content || 'New message',
                  appointmentId
                });

                // Mark all notifications for this channel as sent
                const notificationIds = channelNotifications.map((n: NotificationType) => n.id);
                await supabase
                  .from('pending_email_notifications')
                  .update({ status: 'sent', sent_at: now.toISOString() })
                  .in('id', notificationIds);

                console.log(`[Notification Cron] ✅ ${timestamp} - Marked ${notificationIds.length} notifications as sent for channel ${channelId}`);
              }
            } else {
              // Messages already read - cancel notifications
              const notificationIds = channelNotifications.map((n: NotificationType) => n.id);
              await supabase
                .from('pending_email_notifications')
                .update({ status: 'canceled' })
                .in('id', notificationIds);

              totalNotificationsCanceled += notificationIds.length;
              console.log(`[Notification Cron] ⏭️ ${timestamp} - Canceled ${notificationIds.length} notifications for channel ${channelId} (already read)`);
            }
          } catch (channelError) {
            console.error(`[Notification Cron] ❌ ${timestamp} - Error processing channel ${channelId}:`, channelError);
            // Continue processing other channels
          }
        }

        // Step 6: Send email if there are unread conversations
        if (conversations.length > 0) {
          try {
            // Get user details for email
            const { data: user } = await supabase
              .from('users')
              .select('first_name, last_name, email')
              .eq('id', userId)
              .single();

            if (user && user.email) {
              await sendTransactionalEmail({
                to: user.email,
                subject: conversations.length === 1
                  ? `You have unread messages from ${conversations[0].senderName}`
                  : `You have unread messages in ${conversations.length} conversations`,
                templateName: 'unreadMessageNotification',
                data: {
                  recipientName: user.first_name,
                  conversationCount: conversations.length,
                  conversations,
                  appUrl: process.env.NEXT_PUBLIC_APP_URL || 'https://app.sunshinedogs.app',
                  year: new Date().getFullYear()
                }
              });

              totalEmailsSent++;
              console.log(`[Notification Cron] 📧 ${timestamp} - Sent email to ${user.email} for ${conversations.length} conversation(s)`);
            }
          } catch (emailError) {
            console.error(`[Notification Cron] ❌ ${timestamp} - Error sending email to user ${userId}:`, emailError);
          }
        }
      } catch (userError) {
        console.error(`[Notification Cron] ❌ ${timestamp} - Error processing user ${userId}:`, userError);
        // Continue processing other users
      }
    }

    console.log(`[Notification Cron] ✅ ${timestamp} - Processing complete:`, {
      emailsSent: totalEmailsSent,
      notificationsCanceled: totalNotificationsCanceled
    });

    return NextResponse.json({
      success: true,
      emailsSent: totalEmailsSent,
      notificationsCanceled: totalNotificationsCanceled
    });

  } catch (error) {
    console.error(`[Notification Cron] ❌ ${timestamp} - Fatal error:`, error);
    return NextResponse.json(
      { error: 'Failed to process notifications', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
