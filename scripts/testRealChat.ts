import { config } from 'dotenv';
import { createSupabaseAdminClient } from '../src/utils/supabase/admin';

// Load environment variables
config({ path: '.env.local' });

async function testRealChat() {
  console.log('🔍 Testing real chat message logging...\n');
  
  const supabase = createSupabaseAdminClient();
  
  try {
    // Check for recent messages in chat_logs
    console.log('📊 Checking for recent messages in chat_logs table...');
    const { data: recentMessages, error: messagesError } = await supabase
      .from('chat_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10);
    
    if (messagesError) {
      console.error('❌ Error fetching recent messages:', messagesError);
      return;
    }
    
    console.log(`📝 Found ${recentMessages?.length || 0} recent messages in chat_logs`);
    
    if (recentMessages && recentMessages.length > 0) {
      console.log('\n📋 Recent messages:');
      recentMessages.forEach((msg, index) => {
        console.log(`${index + 1}. Appointment: ${msg.appointment_id}`);
        console.log(`   Sender: ${msg.sender_id}`);
        console.log(`   Content: ${msg.content?.substring(0, 50)}...`);
        console.log(`   Created: ${msg.created_at}`);
        console.log(`   Stream ID: ${msg.stream_message_id}`);
        console.log('');
      });
    } else {
      console.log('⚠️  No recent messages found in chat_logs table');
      console.log('This means Stream Chat webhook is not configured or not working');
    }
    
    // Check appointment_chats to see which ones should have messages
    console.log('\n💬 Checking appointment chats...');
    const { data: appointmentChats, error: chatsError } = await supabase
      .from('appointment_chats')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(5);
    
    if (chatsError) {
      console.error('❌ Error fetching appointment chats:', chatsError);
      return;
    }
    
    console.log(`📊 Found ${appointmentChats?.length || 0} appointment chats`);
    
    if (appointmentChats && appointmentChats.length > 0) {
      console.log('\n🔍 Checking for messages in each chat:');
      for (const chat of appointmentChats) {
        const { data: chatMessages, error: chatMessagesError } = await supabase
          .from('chat_logs')
          .select('*')
          .eq('appointment_id', chat.appointment_id);
        
        if (chatMessagesError) {
          console.error(`❌ Error fetching messages for appointment ${chat.appointment_id}:`, chatMessagesError);
        } else {
          console.log(`   Appointment ${chat.appointment_id}: ${chatMessages?.length || 0} messages`);
        }
      }
    }
    
    // Instructions for webhook configuration
    console.log('\n🔧 Webhook Configuration Instructions:');
    console.log('1. Go to https://dashboard.getstream.io/');
    console.log('2. Navigate to your app (API key: aaef4ckxmwub)');
    console.log('3. Go to "Webhooks" section');
    console.log('4. Add webhook with URL: https://sunshinedogs.app/api/chat/webhook');
    console.log('5. Select events: message.new');
    console.log('6. Select channel types: appointment_chat');
    console.log('7. Save and test');
    
  } catch (error) {
    console.error('❌ Unexpected error:', error);
  }
}

testRealChat().catch(console.error); 