// src/app/(pages)/dashboard/visits/page.tsx
'use client';

import { useUser } from '@clerk/clerk-react';
import MyVisits from '@/components/visits/MyVisits';
import { useUserProfile } from '@/hooks/useUserProfile';

export default function VisitsPage() {
  const { user } = useUser();
  const { role } = useUserProfile();

  if (!user || !role) return null;

  return (
    <main className="flex-grow p-4">
      <MyVisits userId={user.id} role={role as 'volunteer' | 'individual'} />
      <div className="md:hidden pb-20" />
    </main>
  );
}
