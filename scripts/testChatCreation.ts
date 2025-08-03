import { config } from 'dotenv';
import { createSupabaseAdminClient } from '@/utils/supabase/admin';
import { createAppointmentChat } from '@/utils/stream-chat';

// Load environment variables from .env.local
config({ path: '.env.local' });

async function testChatCreation() {
  console.log('🔍 Testing Chat Creation Setup...\n');

  // Check environment variables
  console.log('📋 Environment Variables:');
  console.log('- NEXT_PUBLIC_STREAM_CHAT_API_KEY:', process.env.NEXT_PUBLIC_STREAM_CHAT_API_KEY ? '✅ Set' : '❌ Missing');
  console.log('- STREAM_CHAT_SECRET:', process.env.STREAM_CHAT_SECRET ? '✅ Set' : '❌ Missing');
  console.log('- NEXT_PUBLIC_SUPABASE_URL:', process.env.NEXT_PUBLIC_SUPABASE_URL ? '✅ Set' : '❌ Missing');
  console.log('- SUPABASE_SERVICE_ROLE_KEY:', process.env.SUPABASE_SERVICE_ROLE_KEY ? '✅ Set' : '❌ Missing');
  console.log('- NEXT_PUBLIC_APP_URL:', process.env.NEXT_PUBLIC_APP_URL || 'https://sunshinedogs.app');
  console.log('');

  // Test Stream Chat connection
  try {
    console.log('🔗 Testing Stream Chat Connection...');
    
    if (!process.env.NEXT_PUBLIC_STREAM_CHAT_API_KEY || !process.env.STREAM_CHAT_SECRET) {
      throw new Error('Missing Stream Chat environment variables');
    }
    
    const { StreamChat } = await import('stream-chat');
    
    // Create a server-side client for testing
    const streamChatServer = StreamChat.getInstance(
      process.env.NEXT_PUBLIC_STREAM_CHAT_API_KEY,
      process.env.STREAM_CHAT_SECRET
    );
    
    // Try to query channels to test connection
    const channels = await streamChatServer.queryChannels({}, [], { state: false, watch: false });
    console.log('✅ Stream Chat connection successful');
    console.log(`   Found ${channels.length} channels\n`);
  } catch (error) {
    console.error('❌ Stream Chat connection failed:', error);
    console.log('');
  }

  // Test database connection
  try {
    console.log('🗄️ Testing Database Connection...');
    
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Missing Supabase environment variables');
    }
    
    const supabase = createSupabaseAdminClient();
    
    // Test querying appointment_chats table
    const { data, error } = await supabase
      .from('appointment_chats')
      .select('count')
      .limit(1);
    
    if (error) {
      console.error('❌ Database connection failed:', error);
    } else {
      console.log('✅ Database connection successful');
    }
    console.log('');
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    console.log('');
  }

  // Test appointment data
  try {
    console.log('📅 Testing Appointment Data...');
    
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Missing Supabase environment variables');
    }
    
    const supabase = createSupabaseAdminClient();
    
          // Get a confirmed appointment (without the problematic join)
      const { data: appointments, error } = await supabase
        .from('appointments')
        .select(`
          id,
          status,
          individual_id,
          volunteer_id,
          availability_id,
          start_time,
          end_time,
          individual:users!appointments_individual_id_fkey (
            first_name,
            last_name
          ),
          volunteer:users!appointments_volunteer_id_fkey (
            first_name,
            last_name
          )
        `)
        .eq('status', 'confirmed')
        .limit(1);

    if (error) {
      console.error('❌ Failed to fetch appointments:', error);
    } else if (!appointments || appointments.length === 0) {
      console.log('⚠️ No confirmed appointments found');
    } else {
      const appointment = appointments[0];
      console.log('✅ Found confirmed appointment:', {
        id: appointment.id,
        individual: appointment.individual,
        volunteer: appointment.volunteer,
        availability_id: appointment.availability_id,
        start_time: appointment.start_time,
        end_time: appointment.end_time
      });
    }
    console.log('');
  } catch (error) {
    console.error('❌ Failed to test appointment data:', error);
    console.log('');
  }

  console.log('🏁 Test completed');
  
  // Provide helpful guidance
  console.log('\n📝 Next Steps:');
  if (!process.env.NEXT_PUBLIC_STREAM_CHAT_API_KEY || !process.env.STREAM_CHAT_SECRET) {
    console.log('❌ Add Stream Chat environment variables to .env.local:');
    console.log('   NEXT_PUBLIC_STREAM_CHAT_API_KEY=your_api_key_here');
    console.log('   STREAM_CHAT_SECRET=your_secret_here');
  }
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.log('❌ Add Supabase environment variables to .env.local:');
    console.log('   NEXT_PUBLIC_SUPABASE_URL=your_supabase_url_here');
    console.log('   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here');
  }
  if (process.env.NEXT_PUBLIC_STREAM_CHAT_API_KEY && process.env.STREAM_CHAT_SECRET && 
      process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.log('✅ All environment variables are set. Try confirming an appointment to test chat creation.');
  }
}

// Only run if this script is executed directly
if (require.main === module) {
  testChatCreation()
    .then(() => {
      console.log('✅ All tests completed');
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Test failed:', error);
      process.exit(1);
    });
} 