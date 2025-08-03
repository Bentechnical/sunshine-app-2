import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/utils/supabase/admin';

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json();
    
    // TODO: Add Stream Chat webhook signature verification
    // For now, we'll process the webhook without verification
    // In production, you should verify the webhook signature
    
    console.log('[Stream Chat Webhook] Received event:', payload.type);
    
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
        
        console.log('[Stream Chat Webhook] Appointment chat detected:', {
          appointmentId,
          senderId,
          content: content.substring(0, 50) + '...',
          messageId
        });
        
        if (appointmentId && senderId && content) {
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
            console.error('[Stream Chat Webhook] Database error:', error);
            console.error('[Stream Chat Webhook] Error details:', {
              code: error.code,
              message: error.message,
              details: error.details,
              hint: error.hint
            });
            return NextResponse.json({ error: 'Failed to log message', details: error.message }, { status: 500 });
          }
          
          console.log(`[Stream Chat Webhook] Successfully logged message ${messageId} for appointment ${appointmentId}:`, data);
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