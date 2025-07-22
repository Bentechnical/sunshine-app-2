// src/hooks/useUserProfile.ts

import { useEffect, useState } from 'react';
import { useUser } from '@clerk/nextjs';
import { useSupabaseClient } from '@/utils/supabase/client';

export function useUserProfile() {
  const { user } = useUser();
  const supabase = useSupabaseClient();
  const [role, setRole] = useState<'admin' | 'volunteer' | 'individual' | null>(null);
  const [status, setStatus] = useState<'pending' | 'approved' | 'denied' | null>(null);
  const [profileComplete, setProfileComplete] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchProfile = async () => {
      if (!user) return;

      const { data, error } = await supabase
        .from('users')
        .select('role, status, profile_complete')
        .eq('id', user.id)
        .single();

      if (error || !data) {
        console.error('Error fetching user profile:', error);
      } else {
        setRole(data.role);
        setStatus(data.status);
        setProfileComplete(data.profile_complete ?? false);
      }

      setLoading(false);
    };

    fetchProfile();
  }, [user, supabase]);

  return { role, status, profileComplete, loading };
}