import { config } from 'dotenv';
import { createSupabaseAdminClient } from '../src/utils/supabase/admin';

// Load environment variables
config({ path: '.env.local' });

async function testAdminChatLogs() {
  console.log('🧪 Testing admin chat logs API...\n');
  
  // First, let's check what messages exist in the database
  const supabase = createSupabaseAdminClient();
  
  console.log('📊 Checking all messages in chat_logs table...');
  const { data: allMessages, error: allError } = await supabase
    .from('chat_logs')
    .select('*')
    .order('created_at', { ascending: false });
  
  if (allError) {
    console.error('❌ Error fetching all messages:', allError);
    return;
  }
  
  console.log(`✅ Found ${allMessages?.length || 0} total messages`);
  allMessages?.forEach((msg, index) => {
    console.log(`${index + 1}. Appointment: ${msg.appointment_id}, Content: ${msg.content.substring(0, 50)}...`);
  });
  
  // Test the admin API endpoint for appointment 105
  console.log('\n🌐 Testing admin API endpoint for appointment 105...');
  
  const response = await fetch('https://sunshinedogs.app/api/admin/chats/105/logs', {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });
  
  console.log(`Response status: ${response.status}`);
  
  if (response.ok) {
    const data = await response.json();
    console.log('✅ API Response:', JSON.stringify(data, null, 2));
  } else {
    const errorText = await response.text();
    console.log('❌ API Error:', errorText);
  }
  
  // Also test with a different appointment that has messages
  if (allMessages && allMessages.length > 0) {
    const testAppointmentId = allMessages[0].appointment_id;
    console.log(`\n🌐 Testing admin API endpoint for appointment ${testAppointmentId}...`);
    
    const response2 = await fetch(`https://sunshinedogs.app/api/admin/chats/${testAppointmentId}/logs`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    console.log(`Response status: ${response2.status}`);
    
    if (response2.ok) {
      const data2 = await response2.json();
      console.log('✅ API Response:', JSON.stringify(data2, null, 2));
    } else {
      const errorText2 = await response2.text();
      console.log('❌ API Error:', errorText2);
    }
  }
}

testAdminChatLogs().catch(console.error); 