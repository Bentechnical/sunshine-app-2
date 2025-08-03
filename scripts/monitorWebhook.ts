import { config } from 'dotenv';
import { createSupabaseAdminClient } from '../src/utils/supabase/admin';

// Load environment variables
config({ path: '.env.local' });

async function monitorWebhook() {
  console.log('🔍 Monitoring webhook activity...\n');
  console.log('📝 Send a message in the chat interface, then press Enter to check for new messages');
  console.log('Press Ctrl+C to exit\n');
  
  const supabase = createSupabaseAdminClient();
  let lastCheck = new Date();
  
  // Function to check for new messages
  const checkForNewMessages = async () => {
    try {
      const { data: newMessages, error } = await supabase
        .from('chat_logs')
        .select('*')
        .gte('created_at', lastCheck.toISOString())
        .order('created_at', { ascending: false });
      
      if (error) {
        console.error('❌ Error checking for new messages:', error);
        return;
      }
      
      if (newMessages && newMessages.length > 0) {
        console.log(`✅ Found ${newMessages.length} new message(s)!`);
        newMessages.forEach((msg, index) => {
          console.log(`${index + 1}. Appointment: ${msg.appointment_id}`);
          console.log(`   Sender: ${msg.sender_id}`);
          console.log(`   Content: ${msg.content}`);
          console.log(`   Created: ${msg.created_at}`);
          console.log(`   Stream ID: ${msg.stream_message_id}`);
          console.log('');
        });
      } else {
        console.log('⏳ No new messages found since last check');
      }
      
      lastCheck = new Date();
      
    } catch (error) {
      console.error('❌ Error in monitoring:', error);
    }
  };
  
  // Set up monitoring
  const interval = setInterval(checkForNewMessages, 2000); // Check every 2 seconds
  
  // Handle user input
  process.stdin.on('data', (data) => {
    if (data.toString().trim() === '') {
      checkForNewMessages();
    }
  });
  
  // Handle cleanup
  process.on('SIGINT', () => {
    console.log('\n🛑 Stopping webhook monitoring...');
    clearInterval(interval);
    process.exit(0);
  });
  
  // Initial check
  await checkForNewMessages();
}

monitorWebhook().catch(console.error); 