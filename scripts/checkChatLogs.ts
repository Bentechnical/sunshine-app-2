import { config } from 'dotenv';
import { createSupabaseAdminClient } from '../src/utils/supabase/admin';

// Load environment variables
config({ path: '.env.local' });

async function checkChatLogs() {
  console.log('🔍 Checking chat logs in database...\n');
  
  const supabase = createSupabaseAdminClient();
  
  try {
    // Check if chat_logs table exists and has data
    const { data: chatLogs, error: chatLogsError } = await supabase
      .from('chat_logs')
      .select('*')
      .limit(10);
    
    if (chatLogsError) {
      console.error('❌ Error fetching chat logs:', chatLogsError);
      return;
    }
    
    console.log(`📊 Found ${chatLogs?.length || 0} messages in chat_logs table`);
    
    if (chatLogs && chatLogs.length > 0) {
      console.log('\n📝 Sample messages:');
      chatLogs.forEach((log, index) => {
        console.log(`${index + 1}. Appointment: ${log.appointment_id}`);
        console.log(`   Sender: ${log.sender_id}`);
        console.log(`   Content: ${log.content?.substring(0, 50)}...`);
        console.log(`   Type: ${log.message_type}`);
        console.log(`   Created: ${log.created_at}`);
        console.log('');
      });
    } else {
      console.log('⚠️  No messages found in chat_logs table');
    }
    
    // Check appointment_chats table
    const { data: appointmentChats, error: appointmentChatsError } = await supabase
      .from('appointment_chats')
      .select('*')
      .limit(5);
    
    if (appointmentChatsError) {
      console.error('❌ Error fetching appointment chats:', appointmentChatsError);
      return;
    }
    
    console.log(`📊 Found ${appointmentChats?.length || 0} appointment chats`);
    
    if (appointmentChats && appointmentChats.length > 0) {
      console.log('\n💬 Sample appointment chats:');
      appointmentChats.forEach((chat, index) => {
        console.log(`${index + 1}. Appointment: ${chat.appointment_id}`);
        console.log(`   Channel ID: ${chat.channel_id}`);
        console.log(`   Created: ${chat.created_at}`);
        console.log('');
      });
    }
    
    // Check if there are any messages for specific appointment chats
    if (appointmentChats && appointmentChats.length > 0) {
      const firstAppointmentId = appointmentChats[0].appointment_id;
      console.log(`🔍 Checking messages for appointment ${firstAppointmentId}...`);
      
      const { data: messagesForAppointment, error: messagesError } = await supabase
        .from('chat_logs')
        .select('*')
        .eq('appointment_id', firstAppointmentId);
      
      if (messagesError) {
        console.error('❌ Error fetching messages for appointment:', messagesError);
      } else {
        console.log(`📝 Found ${messagesForAppointment?.length || 0} messages for appointment ${firstAppointmentId}`);
      }
    }
    
    // Check webhook configuration
    console.log('\n🔧 Checking webhook configuration...');
    console.log('Webhook URL should be: https://sunshinedogs.app/api/chat/webhook');
    console.log('Make sure this is configured in Stream Chat dashboard');
    console.log('Event types needed: message.new');
    
  } catch (error) {
    console.error('❌ Unexpected error:', error);
  }
}

checkChatLogs().catch(console.error); 