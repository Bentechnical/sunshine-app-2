// src/app/(pages)/dashboard/page.tsx
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@clerk/clerk-react';
import { SignOutButton } from '@clerk/nextjs';
import DashboardHome from '@/components/dashboard/DashboardHome';
import PendingChatRequests from '@/components/chat/PendingChatRequests';
import { useUserProfile } from '@/hooks/useUserProfile';

export default function DashboardHomePage() {
  const { user } = useUser();
  const { role } = useUserProfile();
  const router = useRouter();

  const userId = user?.id ?? '';

  useEffect(() => {
    if (role === 'admin') {
      router.replace('/dashboard/admin');
    }
  }, [role, router]);

  if (!user || !role || role === 'admin') return null;

  return (
    <main className="flex-grow p-4 page-enter">
      <PendingChatRequests />
      <DashboardHome
        userId={userId}
        role={role as 'volunteer' | 'individual'}
      />

      {/* Mobile logout — home tab only */}
      <div className="md:hidden mt-8 pt-6 border-t border-gray-200 pb-8">
        <SignOutButton>
          <button
            data-slot="button"
            className="inline-flex items-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] bg-red-600 hover:bg-red-700 text-white w-full px-4 py-3"
          >
            Log Out
          </button>
        </SignOutButton>
      </div>

      {/* Mobile bottom spacing */}
      <div className="md:hidden pb-20" />
    </main>
  );
}
