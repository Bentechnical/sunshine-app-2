import { createSupabaseServerClient } from '@/utils/supabase/server';
import { closeAppointmentChat } from '@/utils/stream-chat';

export async function closeExpiredChats() {
  const supabase = await createSupabaseServerClient();
  
  // Get appointments that ended more than 6 hours ago and have active chats
  const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);
  
  const { data: expiredChats, error } = await supabase
    .from('appointment_chats')
    .select(`
      id,
      appointment_id,
      stream_channel_id,
      appointments!inner (
        start_time,
        end_time
      )
    `)
    .eq('status', 'active')
    .lt('appointments.end_time', sixHoursAgo.toISOString());

  if (error) {
    console.error('Error fetching expired chats:', error);
    throw error;
  }

  const results = [];
  
  for (const chat of expiredChats || []) {
    try {
      // Close the chat in Stream Chat
      await closeAppointmentChat(chat.appointment_id);
      
      // Update the database record
      const { error: updateError } = await supabase
        .from('appointment_chats')
        .update({ 
          status: 'closed',
          closed_at: new Date().toISOString()
        })
        .eq('id', chat.id);
      
      if (updateError) {
        console.error(`Error updating chat ${chat.id}:`, updateError);
        results.push({ chatId: chat.id, success: false, error: updateError.message });
      } else {
        console.log(`Successfully closed chat for appointment ${chat.appointment_id}`);
        results.push({ chatId: chat.id, success: true });
      }
    } catch (error) {
      console.error(`Error closing chat ${chat.id}:`, error);
      results.push({ chatId: chat.id, success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  }

  return {
    totalProcessed: expiredChats?.length || 0,
    successful: results.filter(r => r.success).length,
    failed: results.filter(r => !r.success).length,
    results
  };
} 