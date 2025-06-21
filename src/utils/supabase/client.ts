//src/utils/supabase/client.ts

'use client';

import { createClient } from '@supabase/supabase-js';
import { useSession } from '@clerk/nextjs';

export function useSupabaseClient() {
  const { session } = useSession();

  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, // Use the anon key here
    {
      async accessToken() {
        return session?.getToken() ?? null;
      },
    }
  );
}
