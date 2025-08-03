import { config } from 'dotenv';
import { createSupabaseAdminClient } from '../src/utils/supabase/admin';

// Load environment variables
config({ path: '.env.local' });

async function checkDatabasePermissions() {
  console.log('🔍 Checking database permissions and RLS policies...\n');
  
  const supabase = createSupabaseAdminClient();
  
  try {
    // Check if we can read from chat_logs table
    console.log('📖 Testing read access to chat_logs table...');
    const { data: readTest, error: readError } = await supabase
      .from('chat_logs')
      .select('count(*)')
      .limit(1);
    
    if (readError) {
      console.error('❌ Read access failed:', readError);
    } else {
      console.log('✅ Read access successful');
    }
    
    // Check if we can insert into chat_logs table
    console.log('\n📝 Testing insert access to chat_logs table...');
    
    // First, get a real appointment ID
    const { data: appointments, error: appointmentsError } = await supabase
      .from('appointments')
      .select('id')
      .limit(1);
    
    if (appointmentsError || !appointments || appointments.length === 0) {
      console.error('❌ Could not get appointment ID for testing:', appointmentsError);
      return;
    }
    
    const realAppointmentId = appointments[0].id;
    console.log(`Using real appointment ID: ${realAppointmentId}`);
    
    // Get a real user ID
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id')
      .limit(1);
    
    if (usersError || !users || users.length === 0) {
      console.error('❌ Could not get user ID for testing:', usersError);
      return;
    }
    
    const realUserId = users[0].id;
    console.log(`Using real user ID: ${realUserId}`);
    
    const testInsert = {
      appointment_id: realAppointmentId,
      stream_message_id: 'test-insert-123',
      sender_id: realUserId,
      content: 'Test insert message',
      message_type: 'text',
      is_system_message: false
    };
    
    const { data: insertTest, error: insertError } = await supabase
      .from('chat_logs')
      .insert(testInsert)
      .select();
    
    if (insertError) {
      console.error('❌ Insert access failed:', insertError);
      console.error('Error details:', {
        code: insertError.code,
        message: insertError.message,
        details: insertError.details,
        hint: insertError.hint
      });
    } else {
      console.log('✅ Insert access successful');
      console.log('Inserted data:', insertTest);
      
      // Clean up test data
      console.log('\n🧹 Cleaning up test data...');
      const { error: deleteError } = await supabase
        .from('chat_logs')
        .delete()
        .eq('stream_message_id', 'test-insert-123');
      
      if (deleteError) {
        console.error('❌ Cleanup failed:', deleteError);
      } else {
        console.log('✅ Test data cleaned up');
      }
    }
    
    // Check table structure
    console.log('\n📋 Checking chat_logs table structure...');
    const { data: tableInfo, error: tableError } = await supabase
      .rpc('get_table_info', { table_name: 'chat_logs' })
      .single();
    
    if (tableError) {
      console.log('ℹ️  Could not get table info via RPC, checking manually...');
      // Try a simple select to see what columns exist
      const { data: columns, error: columnsError } = await supabase
        .from('chat_logs')
        .select('*')
        .limit(0);
      
      if (columnsError) {
        console.error('❌ Could not check table structure:', columnsError);
      } else {
        console.log('✅ Table structure check passed');
      }
    } else {
      console.log('Table info:', tableInfo);
    }
    
    // Check RLS policies
    console.log('\n🔐 Checking RLS policies...');
    console.log('Note: RLS policies are typically managed through Supabase dashboard');
    console.log('Make sure there are policies that allow inserts for the service role');
    
  } catch (error) {
    console.error('❌ Unexpected error:', error);
  }
}

checkDatabasePermissions().catch(console.error); 