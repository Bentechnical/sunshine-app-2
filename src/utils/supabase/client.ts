//src/utils/supabase/client.ts

'use client';

import { useMemo } from 'react';
import { createClient } from '@supabase/supabase-js';
import { useSession } from '@clerk/nextjs';

export function useSupabaseClient() {
  const { session } = useSession();

  return useMemo(
    () =>
      createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          async accessToken() {
            return session?.getToken() ?? null;
          },
        }
      ),
    // Recreate only when the session identity changes (login/logout/switch)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [session?.id]
  );
}
