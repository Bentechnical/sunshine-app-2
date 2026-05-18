// src/app/(pages)/dashboard/browse-visits/page.tsx
'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import BrowseOrgVisits from '@/components/visits/BrowseOrgVisits';

type BrowseTab = 'browse' | 'my-events';

export default function BrowseVisitsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const visitParam = searchParams.get('visit');
  const selectedVisitId = visitParam ? parseInt(visitParam, 10) : null;
  const activeTab = (searchParams.get('tab') ?? 'browse') as BrowseTab;

  const handleSelectVisit = (id: number) => {
    const tabPart = activeTab !== 'browse' ? `&tab=${activeTab}` : '';
    router.push(`/dashboard/browse-visits?visit=${id}${tabPart}`);
  };

  const handleBackFromVisit = () => {
    router.back();
  };

  const handleTabChange = (tab: BrowseTab) => {
    if (tab === 'browse') {
      router.push('/dashboard/browse-visits');
    } else {
      router.push(`/dashboard/browse-visits?tab=${tab}`);
    }
  };

  return (
    <main className="grow p-4 page-enter">
      <BrowseOrgVisits
        selectedVisitId={selectedVisitId}
        activeTab={activeTab}
        onSelectVisit={handleSelectVisit}
        onBackFromVisit={handleBackFromVisit}
        onTabChange={handleTabChange}
      />
      <div className="md:hidden pb-20" />
    </main>
  );
}
