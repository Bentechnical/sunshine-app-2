// src/app/(pages)/dashboard/meet/page.tsx
'use client';

import MeetWithDog from '@/components/visits/MeetWithDog';

export default function MeetPage() {
  return (
    <main className="flex-grow p-4">
      <MeetWithDog />
      <div className="md:hidden pb-20" />
    </main>
  );
}
