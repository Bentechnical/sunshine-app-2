// scripts/cleanup.ts

// @ts-nocheck
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { clerkClient } from '@clerk/clerk-sdk-node';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Set this to true to wipe ALL records in dev
const DEV_NUKE_ALL = false; // set to true if you want all demo users/dogs gone, not just seeded test users

// 1️⃣ Delete test users from Clerk
async function deleteTestClerkUsers() {
  const usersResp = await clerkClient.users.getUserList();
  const users = usersResp.data;
  const testUsers = users.filter((u: any) =>
    u.emailAddresses?.some((ea: any) => ea.emailAddress.endsWith('+clerk_test@example.com'))
  );
  for (const user of testUsers) {
    await clerkClient.users.deleteUser(user.id);
    console.log('Deleted Clerk user:', user.id, user.emailAddresses?.[0]?.emailAddress);
  }
  return testUsers.map((u: any) => u.id);
}

// 2️⃣ Delete test users and their dogs from Supabase
async function deleteTestSupabaseUsersAndDogs() {
  if (DEV_NUKE_ALL) {
    // ⚡ Danger! Wipes all dev data!
    await supabase.from('dogs').delete().neq('id', 0); // delete all
    await supabase.from('users').delete().neq('id', 0); // delete all
    console.log('Deleted ALL users and ALL dogs from Supabase!');
    return;
  }

  // Get all user IDs with email matching your pattern
  const { data: users, error } = await supabase.from('users')
    .select('id,email')
    .like('email', '%+clerk_test@example.com');
  if (error) throw error;

  const ids = (users ?? []).map((u: any) => u.id);
  if (ids.length) {
    // Delete dogs whose volunteer_id matches any of these user IDs
    await supabase.from('dogs').delete().in('volunteer_id', ids);
    // Delete users themselves
    await supabase.from('users').delete().in('id', ids);
    console.log('Deleted users and their dogs from Supabase:', ids);
  } else {
    console.log('No test users found in Supabase.');
  }
}

// 3️⃣ (Optional) Delete test dog images from storage
async function deleteTestImages() {
  // ...same as before, if you want to also remove uploaded demo images...
}

async function cleanup() {
  try {
    await deleteTestClerkUsers();
    await deleteTestSupabaseUsersAndDogs();
    // await deleteTestImages(); // Optional
    console.log('✅ Cleanup complete.');
  } catch (err) {
    console.error('❌ Error during cleanup:', err);
  }
}

cleanup();
