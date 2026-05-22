// src/app/(pages)/dashboard/visits/page.tsx
'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useUser } from '@clerk/clerk-react';
import { useUserProfile } from '@/hooks/useUserProfile';
import MyVisits from '@/components/visits/MyVisits';
import BrowseOrgVisits from '@/components/visits/BrowseOrgVisits';
import { Suspense } from 'react';

type MyVisitsTab = 'group' | 'individual';

function VisitsPageInner() {
  const { user } = useUser();
  const { role } = useUserProfile();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [activeTab, setActiveTab] = useState<MyVisitsTab>('group');

  const visitParam = searchParams.get('visit');
  const selectedVisitId = visitParam ? parseInt(visitParam, 10) : null;

  if (!user || !role) return null;

  // Individuals only have individual appointments — skip tabs entirely
  if (role === 'individual') {
    return (
      <main className="grow p-4 page-enter">
        <MyVisits userId={user.id} role="individual" />
        <div className="md:hidden pb-20" />
      </main>
    );
  }

  return (
    <main className="grow p-4 page-enter">
      {/* Tab switcher */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl mb-5">
        <button
          onClick={() => setActiveTab('group')}
          className={`flex-1 px-3 py-2 rounded-lg text-sm font-semibold transition-all ${
            activeTab === 'group' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Group Visits
        </button>
        <button
          onClick={() => setActiveTab('individual')}
          className={`flex-1 px-3 py-2 rounded-lg text-sm font-semibold transition-all ${
            activeTab === 'individual' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Individual Appointments
        </button>
      </div>

      {activeTab === 'group' && (
        <BrowseOrgVisits
          selectedVisitId={selectedVisitId}
          activeTab="my-events"
          hideTabs
          onSelectVisit={id => router.push(`/dashboard/visits?visit=${id}`)}
          onBackFromVisit={() => router.back()}
        />
      )}

      {activeTab === 'individual' && (
        <MyVisits userId={user.id} role="volunteer" hideHeader />
      )}

      <div className="md:hidden pb-20" />
    </main>
  );
}

export default function VisitsPage() {
  return (
    <Suspense fallback={null}>
      <VisitsPageInner />
    </Suspense>
  );
}
