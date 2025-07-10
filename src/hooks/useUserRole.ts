// src/hooks/useUserRole.ts
import { useEffect, useState } from 'react';
import { useUser } from '@clerk/nextjs';
import { useSupabaseClient } from '@/utils/supabase/client';

export function useUserRole() {
  const { user } = useUser();
  const supabase = useSupabaseClient();
  const [role, setRole] = useState<'admin' | 'volunteer' | 'individual' | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchRole = async () => {
      if (!user) return;

      const { data, error } = await supabase
        .from('users')
        .select('role')
        .eq('id', user.id)
        .single();

      if (!error && data?.role) {
        setRole(data.role);
      } else {
        console.error('Failed to fetch user role from Supabase:', error);
      }

      setLoading(false);
    };

    fetchRole();
  }, [user, supabase]);

  return { role, loading };
}
