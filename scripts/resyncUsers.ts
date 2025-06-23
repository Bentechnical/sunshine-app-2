// scripts/resyncUsers.ts

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { clerkClient } from '@clerk/clerk-sdk-node';
import { createClient } from '@supabase/supabase-js';
import type { User } from '@clerk/backend';

console.log("🔑 Loaded secret key:", process.env.CLERK_SECRET_KEY);


const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function resyncAllUsers() {
  let users: User[] = [];
  const pageSize = 100;
  let offset = 0;

  console.log('🔍 Fetching users from Clerk...');

  while (true) {
    const page = await clerkClient.users.getUserList({
      limit: pageSize,
      offset,
    });

    console.log(`📦 Page ${offset / pageSize + 1}: ${page.data.length} users`);

    if (page.data.length > 0 && offset === 0) {
      const preview = page.data[0];
      console.log('👤 Sample user:', {
        id: preview.id,
        email: preview.emailAddresses?.[0]?.emailAddress,
        createdAt: preview.createdAt,
      });
    }

    users = users.concat(page.data);

    if (page.data.length < pageSize) break;
    offset += pageSize;
  }

  console.log(`🔁 Resyncing ${users.length} users...`);

  for (const user of users) {
    const {
      id,
      emailAddresses,
      firstName,
      lastName,
      imageUrl,
      publicMetadata,
      unsafeMetadata,
      phoneNumbers,
    } = user;

    const email = emailAddresses?.[0]?.emailAddress ?? null;
    const phone = phoneNumbers?.[0]?.phoneNumber ?? null;
    const role =
      typeof publicMetadata?.role === 'string'
        ? publicMetadata.role
        : 'individual';

    const { error } = await supabase.from('users').upsert({
      id,
      first_name: firstName ?? null,
      last_name: lastName ?? null,
      email,
      role,
      bio: unsafeMetadata?.bio ?? null,
      created_at: new Date(),
      updated_at: new Date(),
      profile_image: imageUrl ?? null,
      phone_number: phone ?? null,
    });

    if (error) {
      console.error(`❌ Failed to update user ${id}:`, error.message);
    } else {
      console.log(`✅ Synced user ${id} (${email}) as '${role}'`);
    }
  }
}

resyncAllUsers()
  .then(() => {
    console.log('🏁 Done syncing all users');
    process.exit(0);
  })
  .catch((err) => {
    console.error('🔥 Unexpected error:', err);
    process.exit(1);
  });
