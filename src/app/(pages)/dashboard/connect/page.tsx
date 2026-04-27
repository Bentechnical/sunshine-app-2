// src/app/(pages)/dashboard/connect/page.tsx
'use client';

import IndividualDirectory from '@/components/individual/IndividualDirectory';

export default function ConnectPage() {
  return (
    <main className="flex-grow">
      <IndividualDirectory />
      <div className="md:hidden pb-20" />
    </main>
  );
}
