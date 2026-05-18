'use client';

import { useEffect, useState } from 'react';
import { useUser } from '@clerk/clerk-react';
import { useSupabaseClient } from '@/utils/supabase/client';
import ProfileCompleteForm from '@/components/profile/ProfileCompleteForm';
import PdCompleteForm from '@/components/profile/PdCompleteForm';

export default function ProfileCompletePage() {
  const { user, isLoaded } = useUser();
  const supabase = useSupabaseClient();
  const [role, setRole] = useState<string | null | undefined>(undefined); // undefined = still loading

  useEffect(() => {
    if (!isLoaded || !user) return;
    supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()
      .then(({ data }) => setRole(data?.role ?? null));
  }, [isLoaded, user, supabase]);

  // Still determining role
  if (role === undefined || !isLoaded) {
    return (
      <div className="flex items-center justify-center min-h-dvh bg-gray-100">
        <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (role === 'pd') return <PdCompleteForm />;
  return <ProfileCompleteForm />;
}
