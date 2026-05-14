// src/app/(pages)/dashboard/browse-visits/page.tsx
'use client';

import BrowseOrgVisits from '@/components/visits/BrowseOrgVisits';

export default function BrowseVisitsPage() {
  return (
    <main className="flex-grow p-4 page-enter">
      <BrowseOrgVisits />
      <div className="md:hidden pb-20" />
    </main>
  );
}
