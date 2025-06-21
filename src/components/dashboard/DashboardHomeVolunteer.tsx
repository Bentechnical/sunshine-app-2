// src/components/dashboard/DashboardHomeVolunteer.tsx
'use client';

import AnnouncementBanner from './fragments/AnnouncementBanner';
import AppointmentSummaryCard from './fragments/AppointmentCardSummary';
import TherapyDogCard from './fragments/TherapyDogCard';
import ProfileCardBlock from './fragments/ProfileCardBlock';
import type { ActiveTab } from '@/types/navigation';

interface Props {
  userId: string;
  role: 'volunteer';
  setActiveTab: (tab: ActiveTab) => void;
}

export default function DashboardHomeVolunteer({ userId, role, setActiveTab }: Props) {
  return (
    <div className="flex flex-col gap-2 px-2 md:px-4 h-auto lg:h-[90vh] pb-4">
      <div className="shrink-0">
        <AnnouncementBanner message="Reminder: Confirm upcoming appointments at least 24 hours in advance." />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-y-2 lg:gap-2 flex-1">
        <div className="col-span-2 flex flex-col gap-2 lg:max-h-[90vh] lg:overflow-y-auto">
          <div className="rounded-2xl bg-white p-2">
            <AppointmentSummaryCard role={role} setActiveTab={setActiveTab} />
          </div>
          <div className="rounded-2xl bg-white p-2">
            <ProfileCardBlock />
          </div>
        </div>

        <div className="col-span-1 rounded-2xl bg-white shadow p-2 lg:max-h-[90vh] lg:overflow-y-auto">
          <TherapyDogCard />
        </div>
      </div>
    </div>
  );
}
