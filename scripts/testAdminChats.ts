import { config } from 'dotenv';
import { createSupabaseAdminClient } from '../src/utils/supabase/admin';

// Load environment variables
config({ path: '.env.local' });

async function testAdminChats() {
  console.log('🧪 Testing Admin Chat Functionality');
  console.log('===================================\n');

  try {
    const supabase = createSupabaseAdminClient();

    // Test 1: Check if tables exist
    console.log('1. Checking database tables...');
    
    const { data: tables, error: tablesError } = await supabase
      .from('information_schema.tables')
      .select('table_name')
      .eq('table_schema', 'public')
      .in('table_name', ['appointment_chats', 'chat_logs', 'appointments', 'users', 'dogs']);

    if (tablesError) {
      console.error('   ❌ Error checking tables:', tablesError);
    } else {
      console.log('   ✅ Tables found:', tables?.map(t => t.table_name).join(', '));
    }

    // Test 2: Check appointment_chats data
    console.log('\n2. Checking appointment_chats data...');
    
    const { data: chats, error: chatsError } = await supabase
      .from('appointment_chats')
      .select('*')
      .limit(5);

    if (chatsError) {
      console.error('   ❌ Error fetching appointment_chats:', chatsError);
    } else {
      console.log(`   ✅ Found ${chats?.length || 0} appointment chats`);
      if (chats && chats.length > 0) {
        console.log('   📋 Sample chat:', {
          id: chats[0].id,
          appointment_id: chats[0].appointment_id,
          status: chats[0].status,
          created_at: chats[0].created_at
        });
      }
    }

    // Test 3: Check chat_logs data
    console.log('\n3. Checking chat_logs data...');
    
    const { data: logs, error: logsError } = await supabase
      .from('chat_logs')
      .select('*')
      .limit(5);

    if (logsError) {
      console.error('   ❌ Error fetching chat_logs:', logsError);
    } else {
      console.log(`   ✅ Found ${logs?.length || 0} chat logs`);
      if (logs && logs.length > 0) {
        console.log('   📋 Sample log:', {
          id: logs[0].id,
          appointment_id: logs[0].appointment_id,
          sender_id: logs[0].sender_id,
          message_type: logs[0].message_type,
          created_at: logs[0].created_at
        });
      }
    }

    // Test 4: Check appointments with chat data
    console.log('\n4. Checking appointments with chat data...');
    
    const { data: appointments, error: appointmentsError } = await supabase
      .from('appointments')
      .select(`
        *,
        chat:appointment_chats (
          id,
          status,
          stream_channel_id
        )
      `)
      .eq('status', 'confirmed')
      .limit(5);

    if (appointmentsError) {
      console.error('   ❌ Error fetching appointments:', appointmentsError);
    } else {
      console.log(`   ✅ Found ${appointments?.length || 0} confirmed appointments`);
      const appointmentsWithChats = appointments?.filter(a => a.chat && a.chat.length > 0) || [];
      console.log(`   💬 ${appointmentsWithChats.length} appointments have chat channels`);
    }

    // Test 5: Check RLS policies
    console.log('\n5. Checking RLS policies...');
    
    const { data: policies, error: policiesError } = await supabase
      .from('pg_policies')
      .select('tablename, policyname')
      .in('tablename', ['appointment_chats', 'chat_logs'])
      .like('policyname', '%admin%');

    if (policiesError) {
      console.error('   ❌ Error checking policies:', policiesError);
    } else {
      console.log(`   ✅ Found ${policies?.length || 0} admin policies`);
      policies?.forEach(policy => {
        console.log(`      📋 ${policy.tablename}: ${policy.policyname}`);
      });
    }

    // Test 6: Check admin users
    console.log('\n6. Checking admin users...');
    
    const { data: admins, error: adminsError } = await supabase
      .from('users')
      .select('id, first_name, last_name, role')
      .eq('role', 'admin')
      .limit(5);

    if (adminsError) {
      console.error('   ❌ Error fetching admin users:', adminsError);
    } else {
      console.log(`   ✅ Found ${admins?.length || 0} admin users`);
      admins?.forEach(admin => {
        console.log(`      👤 ${admin.first_name} ${admin.last_name} (${admin.id})`);
      });
    }

    // Summary
    console.log('\n📊 Summary:');
    console.log('   • Tables exist and are accessible');
    console.log('   • Appointment chats:', chats?.length || 0);
    console.log('   • Chat logs:', logs?.length || 0);
    console.log('   • Confirmed appointments with chats:', appointments?.filter(a => a.chat && a.chat.length > 0).length || 0);
    console.log('   • Admin policies:', policies?.length || 0);
    console.log('   • Admin users:', admins?.length || 0);

    // Recommendations
    console.log('\n💡 Recommendations:');
    
    if ((chats?.length || 0) === 0) {
      console.log('   ⚠️  No appointment chats found. Check if:');
      console.log('      • Appointments are being confirmed');
      console.log('      • Chat channels are being created');
      console.log('      • Chat creation API is working');
    }
    
    if ((logs?.length || 0) === 0) {
      console.log('   ⚠️  No chat logs found. Check if:');
      console.log('      • Stream Chat webhook is configured');
      console.log('      • Webhook is receiving message events');
      console.log('      • Messages are being sent in chats');
    }
    
    if ((policies?.length || 0) === 0) {
      console.log('   ⚠️  No admin policies found. Run:');
      console.log('      • scripts/fixAdminChatPolicies.sql');
    }

    if ((admins?.length || 0) === 0) {
      console.log('   ⚠️  No admin users found. Create an admin user first.');
    }

    console.log('\n✅ Admin chat test completed!');

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

// Run the test
if (require.main === module) {
  testAdminChats()
    .then(() => {
      console.log('\n🎉 Admin chat functionality test complete!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Test execution failed:', error);
      process.exit(1);
    });
}

export { testAdminChats }; 