// src/app/(pages)/dashboard/browse-visits/page.tsx
'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import BrowseOrgVisits from '@/components/visits/BrowseOrgVisits';

export default function BrowseVisitsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const visitParam = searchParams.get('visit');
  const selectedVisitId = visitParam ? parseInt(visitParam, 10) : null;

  return (
    <main className="grow p-4 page-enter">
      <BrowseOrgVisits
        selectedVisitId={selectedVisitId}
        activeTab="browse"
        hideTabs
        onSelectVisit={id => router.push(`/dashboard/browse-visits?visit=${id}`)}
        onBackFromVisit={() => router.back()}
      />
      <div className="md:hidden pb-20" />
    </main>
  );
}
