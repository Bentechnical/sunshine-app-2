// src/components/dashboard/DashboardHomeIndividual.tsx
'use client';

import AnnouncementBanner from './fragments/AnnouncementBanner';
import NextAppointmentCard from './fragments/NextAppointmentCard';
import SuggestedDogsPreview from './fragments/SuggestedDogsPreview';
import ProfileCardBlock from './fragments/ProfileCardBlock';
import type { ActiveTab } from '@/types/navigation';

interface Props {
  userId: string;
  role: 'individual';
  setActiveTab: (tab: ActiveTab) => void;
}

export default function DashboardHomeIndividual({ userId, role, setActiveTab }: Props) {
  return (
    <div className="flex flex-col gap-2 px-2 md:px-4 h-auto lg:h-[90vh] pb-4">
      {/* Banner */}
      <div className="shrink-0">
        <AnnouncementBanner userType="individual" />
      </div>

      {/* Main grid: 1/3 left column, 2/3 right column */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-y-2 lg:gap-2 flex-1">

        {/* Left Column: Upcoming Appointment */}
        <div className="col-span-1 rounded-2xl bg-white shadow p-2 max-h-[90vh] overflow-y-auto">
          <NextAppointmentCard role={role} setActiveTab={setActiveTab} />
        </div>

        {/* Right Column: Profile */}
        <div className="col-span-2 flex flex-col gap-2 lg:max-h-[90vh] lg:overflow-y-auto">
          <div className="rounded-2xl bg-white p-2">
            <ProfileCardBlock />
          </div>
        </div>
      </div>
    </div>
  );
}
