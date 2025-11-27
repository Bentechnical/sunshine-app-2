import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/utils/supabase/admin';
import { EMAIL_NOTIFICATION_DELAY_MS } from '@/utils/notificationConfig';

export async function POST(request: NextRequest) {
  const timestamp = new Date().toISOString();
  console.log(`[Stream Chat Webhook] 🔗 ${timestamp} - Webhook request received:`, {
    method: request.method,
    url: request.url,
    timestamp,
    headers: {
      'content-type': request.headers.get('content-type'),
      'user-agent': request.headers.get('user-agent'),
      host: request.headers.get('host'),
      origin: request.headers.get('origin'),
      'x-forwarded-for': request.headers.get('x-forwarded-for'),
      'x-vercel-id': request.headers.get('x-vercel-id')
    }
  });

  try {
    const payload = await request.json();

    // TODO: Add Stream Chat webhook signature verification
    // For now, we'll process the webhook without verification
    // In production, you should verify the webhook signature

    console.log(`[Stream Chat Webhook] ✅ ${timestamp} - Received event:`, {
      type: payload.type,
      hasMessage: !!payload.message,
      hasChannel: !!payload.channel,
      messageId: payload.message?.id,
      channelId: payload.channel?.id,
      channelCustom: payload.channel?.custom
    });
    
    // Only process message.new events for appointment chats
    if (payload.type === 'message.new') {
      const message = payload.message;
      const channel = payload.channel;
      
      console.log('[Stream Chat Webhook] Processing message:', {
        messageId: message.id,
        channelType: channel?.custom?.type,
        appointmentId: channel?.custom?.appointment_id
      });
      
      // Check if this is an appointment chat
      if (channel?.custom?.type === 'appointment_chat') {
        const appointmentId = channel.custom.appointment_id;
        const senderId = message.user?.id;
        const content = message.text || '';
        const messageId = message.id;
        
        console.log(`[Stream Chat Webhook] 🎯 ${timestamp} - Appointment chat detected:`, {
          appointmentId,
          senderId,
          content: content.substring(0, 50) + '...',
          messageId,
          channelType: channel?.custom?.type,
          allCustomFields: channel?.custom
        });

        if (appointmentId && senderId && content) {
          // Skip logging system/bot messages (no user ID in database)
          if (senderId === 'system') {
            console.log(`[Stream Chat Webhook] ⏭️  ${timestamp} - Skipping system message (no user in DB)`);
            return NextResponse.json({ success: true, skipped: 'system message' });
          }

          console.log(`[Stream Chat Webhook] 💾 ${timestamp} - Attempting database insert...`);

          const supabase = createSupabaseAdminClient();

          // Log the message to our database
          const { data, error } = await supabase
            .from('chat_logs')
            .insert({
              appointment_id: appointmentId,
              stream_message_id: messageId,
              sender_id: senderId,
              content: content,
              message_type: 'text',
              is_system_message: false
            })
            .select();

          if (error) {
            console.error(`[Stream Chat Webhook] ❌ ${timestamp} - Database error:`, error);
            console.error(`[Stream Chat Webhook] ❌ ${timestamp} - Error details:`, {
              code: error.code,
              message: error.message,
              details: error.details,
              hint: error.hint,
              appointmentId,
              senderId,
              messageId
            });
            return NextResponse.json({ error: 'Failed to log message', details: error.message }, { status: 500 });
          }

          console.log(`[Stream Chat Webhook] ✅ ${timestamp} - Successfully logged message ${messageId} for appointment ${appointmentId}:`, data);

          // Create pending email notification for recipient
          // Determine recipient (the member who is NOT the sender)
          // Webhook payload includes members array directly in the channel object
          const channelMembers = channel.members || [];
          const recipientId = channelMembers.find((memberId: string) => memberId !== senderId);

          console.log(`[Stream Chat Webhook] 🔍 ${timestamp} - Channel members debug:`, {
            allMembers: channelMembers,
            senderId,
            recipientId
          });

          if (recipientId) {
            const scheduledFor = new Date(Date.now() + EMAIL_NOTIFICATION_DELAY_MS);

            const { error: notificationError } = await supabase
              .from('pending_email_notifications')
              .insert({
                user_id: recipientId,
                appointment_id: appointmentId,
                stream_message_id: messageId,
                channel_id: channel.id,
                scheduled_for: scheduledFor.toISOString(),
                status: 'pending'
              });

            if (notificationError) {
              // Log error but don't fail the webhook - notification is nice-to-have
              console.error(`[Stream Chat Webhook] ⚠️ ${timestamp} - Failed to create pending notification:`, notificationError);
            } else {
              console.log(`[Stream Chat Webhook] 📧 ${timestamp} - Created pending notification for ${recipientId}, scheduled for ${scheduledFor.toISOString()}`);
            }
          } else {
            console.warn(`[Stream Chat Webhook] ⚠️ ${timestamp} - Could not determine recipient for notification`);
          }
        } else {
          console.warn('[Stream Chat Webhook] Missing required fields:', {
            appointmentId: !!appointmentId,
            senderId: !!senderId,
            content: !!content
          });
        }
      } else {
        console.log('[Stream Chat Webhook] Not an appointment chat, skipping');
      }
    }
    
    return NextResponse.json({ success: true });
    
  } catch (error) {
    console.error('[Stream Chat Webhook] Error:', error);
    return NextResponse.json(
      { error: 'Failed to process webhook', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
} 