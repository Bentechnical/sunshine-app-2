import { config } from 'dotenv';
import { createSupabaseAdminClient } from '../src/utils/supabase/admin';

// Load environment variables
config({ path: '.env.local' });

async function testWebhook() {
  console.log('🧪 Testing Stream Chat webhook...\n');
  
  const webhookUrl = 'https://sunshinedogs.app/api/chat/webhook';
  
  // Get real appointment and user IDs from database
  const supabase = createSupabaseAdminClient();
  
  const { data: appointments } = await supabase
    .from('appointments')
    .select('id')
    .limit(1);
  
  const { data: users } = await supabase
    .from('users')
    .select('id')
    .limit(1);
  
  if (!appointments || appointments.length === 0 || !users || users.length === 0) {
    console.error('❌ Could not get appointment or user data for testing');
    return;
  }
  
  const realAppointmentId = appointments[0].id;
  const realUserId = users[0].id;
  
  console.log(`Using real appointment ID: ${realAppointmentId}`);
  console.log(`Using real user ID: ${realUserId}`);
  
  // Simulate a message.new event
  const testPayload = {
    type: 'message.new',
    message: {
      id: 'test-message-123',
      text: 'Test message from webhook',
      user: {
        id: realUserId
      }
    },
    channel: {
      custom: {
        type: 'appointment_chat',
        appointment_id: realAppointmentId
      }
    }
  };
  
  try {
    console.log('📤 Sending test webhook payload...');
    console.log('Payload:', JSON.stringify(testPayload, null, 2));
    
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(testPayload)
    });
    
    console.log(`\n📥 Response status: ${response.status}`);
    console.log(`Response headers:`, Object.fromEntries(response.headers.entries()));
    
    const responseText = await response.text();
    console.log(`Response body: ${responseText}`);
    
    if (response.ok) {
      console.log('\n✅ Webhook test successful!');
      console.log('Check the database to see if the test message was logged.');
      
      // Check if the message was actually logged
      const { data: loggedMessage } = await supabase
        .from('chat_logs')
        .select('*')
        .eq('stream_message_id', 'test-message-123')
        .single();
      
      if (loggedMessage) {
        console.log('✅ Message was successfully logged to database:', loggedMessage);
      } else {
        console.log('⚠️  Message was not found in database');
      }
    } else {
      console.log('\n❌ Webhook test failed!');
    }
    
  } catch (error) {
    console.error('❌ Error testing webhook:', error);
  }
}

testWebhook().catch(console.error); 