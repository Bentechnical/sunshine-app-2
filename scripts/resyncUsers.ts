// scripts/resyncUsers.ts

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { clerkClient } from '@clerk/clerk-sdk-node';
import { createClient } from '@supabase/supabase-js';
import type { User } from '@clerk/backend';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function resyncAllUsers() {
  let users: User[] = [];
  const pageSize = 100;
  let offset = 0;

  while (true) {
    const page = await clerkClient.users.getUserList({
      limit: pageSize,
      offset,
    });

    const pageUsers = page.data;
    users = users.concat(pageUsers);

    if (pageUsers.length < pageSize) break; // done
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
      console.log(`✅ Synced user ${id} as '${role}'`);
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
