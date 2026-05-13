// src/contexts/UserProfileContext.tsx
// Fetches the Supabase user profile (role, status, profileComplete) once per session
// and exposes it via context so any component can read it without re-fetching.
'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useUser } from '@clerk/nextjs';
import { useSupabaseClient } from '@/utils/supabase/client';

interface UserProfileValue {
  role: 'admin' | 'volunteer' | 'individual' | 'organization' | 'pd' | null;
  status: 'pending' | 'approved' | 'denied' | 'archived' | null;
  profileComplete: boolean;
  loading: boolean;
}

const UserProfileContext = createContext<UserProfileValue>({
  role: null,
  status: null,
  profileComplete: false,
  loading: true,
});

export function UserProfileProvider({ children }: { children: ReactNode }) {
  const { user } = useUser();
  const supabase = useSupabaseClient();

  const [role, setRole] = useState<UserProfileValue['role']>(null);
  const [status, setStatus] = useState<UserProfileValue['status']>(null);
  const [profileComplete, setProfileComplete] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      // Reset on sign-out
      setRole(null);
      setStatus(null);
      setProfileComplete(false);
      setLoading(false);
      return;
    }

    const fetchProfile = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('users')
        .select('role, status, profile_complete')
        .eq('id', user.id)
        .single();

      if (error) {
        // PGRST116 = no row found — expected for new users whose profile doesn't exist yet
        if (error.code !== 'PGRST116') {
          console.error('[UserProfileContext] Error fetching user profile:', error.message, error.code);
        }
      } else if (data) {
        setRole(data.role);
        setStatus(data.status);
        setProfileComplete(data.profile_complete ?? false);
      }

      setLoading(false);
    };

    fetchProfile();
  }, [user?.id]); // Only re-fetch when the logged-in user changes

  return (
    <UserProfileContext.Provider value={{ role, status, profileComplete, loading }}>
      {children}
    </UserProfileContext.Provider>
  );
}

export function useUserProfileContext() {
  return useContext(UserProfileContext);
}
