// scripts/list-recent-users.ts
// List all recent user registrations

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

async function listRecentUsers() {
  console.log(`\n📋 Fetching recent user registrations...\n`);

  // Get users from the last 7 days, ordered by created date
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const { data: users, error } = await supabase
    .from('users')
    .select('*')
    .gte('created_at', sevenDaysAgo.toISOString())
    .order('created_at', { ascending: false });

  if (error) {
    console.error('❌ Error fetching users:', error);
    return;
  }

  if (!users || users.length === 0) {
    console.log('❌ No users found in the last 7 days');
    return;
  }

  console.log(`✅ Found ${users.length} user(s) in the last 7 days:\n`);

  for (const user of users) {
    const profileStatus = user.profile_complete ? '✅ Complete' : '⏳ Incomplete';
    const approvalStatus = user.status === 'approved' ? '✅ Approved' :
                          user.status === 'denied' ? '❌ Denied' :
                          '⏳ Pending';

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`👤 ${user.first_name} ${user.last_name}`);
    console.log(`   ID: ${user.id}`);
    console.log(`   📧 Email: ${user.email}`);
    console.log(`   🎭 Role: ${user.role || 'not set'}`);
    console.log(`   📋 Profile: ${profileStatus}`);
    console.log(`   ✓  Status: ${approvalStatus}`);
    console.log(`   📅 Created: ${new Date(user.created_at).toLocaleString()}`);

    if (user.updated_at !== user.created_at) {
      console.log(`   📝 Updated: ${new Date(user.updated_at).toLocaleString()}`);
    }

    if (user.profile_complete && user.status === 'pending') {
      console.log(`   ⚠️  AWAITING APPROVAL - Admin notification should have been sent`);
    }

    console.log('');
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Summary
  const pendingApproval = users.filter(u => u.profile_complete && u.status === 'pending');
  if (pendingApproval.length > 0) {
    console.log(`⚠️  ${pendingApproval.length} user(s) awaiting approval:`);
    pendingApproval.forEach(u => {
      console.log(`   - ${u.first_name} ${u.last_name} (${u.role}) - completed ${new Date(u.updated_at).toLocaleString()}`);
    });
  }
}

listRecentUsers()
  .then(() => {
    console.log('\n✅ Done\n');
    process.exit(0);
  })
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
