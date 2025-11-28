// scripts/check-user-registration.ts
// Quick diagnostic script to check a user's registration details

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkUserRegistration(searchTerm: string) {
  console.log(`\n🔍 Searching for user: "${searchTerm}"\n`);

  // Check if searchTerm looks like a user ID
  let query;
  if (searchTerm.startsWith('user_')) {
    query = supabase.from('users').select('*').eq('id', searchTerm);
  } else {
    // Search for user by first name, last name, or email
    query = supabase.from('users').select('*')
      .or(`first_name.ilike.%${searchTerm}%,last_name.ilike.%${searchTerm}%,email.ilike.%${searchTerm}%`);
  }

  const { data: users, error } = await query;

  if (error) {
    console.error('❌ Error fetching user:', error);
    return;
  }

  if (!users || users.length === 0) {
    console.log('❌ No users found matching:', searchTerm);
    return;
  }

  console.log(`✅ Found ${users.length} user(s):\n`);

  for (const user of users) {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`👤 Name: ${user.first_name} ${user.last_name}`);
    console.log(`📧 Email: ${user.email}`);
    console.log(`🎭 Role: ${user.role}`);
    console.log(`✅ Profile Complete: ${user.profile_complete ? 'Yes' : 'No'}`);
    console.log(`📋 Status: ${user.status || 'pending'}`);
    console.log(`📅 Created: ${new Date(user.created_at).toLocaleString()}`);
    console.log(`📅 Updated: ${new Date(user.updated_at).toLocaleString()}`);

    if (user.profile_complete) {
      const profileCompleteTime = new Date(user.updated_at);
      console.log(`\n⏰ Profile completed at: ${profileCompleteTime.toLocaleString()}`);
      console.log(`📍 This is when the admin notification SHOULD have been sent`);
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  }

  // Check role change audit log
  console.log('\n📝 Checking role change audit log...\n');

  for (const user of users) {
    const { data: auditLogs } = await supabase
      .from('role_change_audit')
      .select('*')
      .eq('user_id', user.id)
      .order('changed_at', { ascending: false });

    if (auditLogs && auditLogs.length > 0) {
      console.log(`Role changes for ${user.first_name}:`);
      auditLogs.forEach(log => {
        console.log(`  - ${log.old_role || 'null'} → ${log.new_role} at ${new Date(log.changed_at).toLocaleString()}`);
        console.log(`    Source: ${log.source}`);
      });
    } else {
      console.log(`No role change logs found for ${user.first_name}`);
    }
  }
}

// Get search term from command line args
const searchTerm = process.argv[2] || 'Vicky';

checkUserRegistration(searchTerm)
  .then(() => {
    console.log('\n✅ Diagnostic complete\n');
    console.log('Next steps:');
    console.log('1. Check Vercel logs around the "Profile completed at" timestamp');
    console.log('2. Search Vercel logs for: "notify-new-user" or "admin notification"');
    console.log('3. Check Resend dashboard for emails sent to ben@sunshinetherapydogs.ca');
    process.exit(0);
  })
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
