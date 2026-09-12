// src/components/dashboard/DashboardHomeVolunteer.tsx
'use client';

import { useState } from 'react';
import TherapyDogCard from './fragments/TherapyDogCard';
import ProfileCardBlock from './fragments/ProfileCardBlock';
import ComplianceBanner from './fragments/ComplianceBanner';

interface Props {
  userId: string;
  role: 'volunteer';
}

export default function DashboardHomeVolunteer({}: Props) {
  const [openDocsTrigger, setOpenDocsTrigger] = useState(0);

  return (
    <div className="flex flex-col gap-2 px-2 md:px-4 h-auto lg:h-[90vh] pb-4">
      <div className="shrink-0">
        <ComplianceBanner onUploadClick={() => setOpenDocsTrigger(c => c + 1)} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-y-2 lg:gap-2 flex-1">
        <div className="col-span-2 flex flex-col gap-2 lg:max-h-[90vh] lg:overflow-y-auto">
          <div className="rounded-2xl bg-white shadow p-2">
            <ProfileCardBlock openDocumentsTrigger={openDocsTrigger} />
          </div>
        </div>

        <div className="col-span-1 rounded-2xl bg-white shadow p-2 lg:max-h-[90vh] lg:overflow-y-auto">
          <TherapyDogCard onOpenDocuments={() => setOpenDocsTrigger(c => c + 1)} />
        </div>
      </div>
    </div>
  );
}
