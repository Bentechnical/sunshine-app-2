// DashboardHome.tsx
'use client';

import DashboardHomeIndividual from './DashboardHomeIndividual';
import DashboardHomeVolunteer from './DashboardHomeVolunteer';
import type { ActiveTab } from '@/types/navigation';

interface Props {
  userId: string;
  role: 'individual' | 'volunteer';
  setActiveTab: (tab: ActiveTab) => void;
}

export default function DashboardHome({ userId, role, setActiveTab }: Props) {
  if (role === 'volunteer') {
    return (
      <DashboardHomeVolunteer
        userId={userId}
        role="volunteer"
        setActiveTab={setActiveTab}
      />
    );
  }

  return (
    <DashboardHomeIndividual
      userId={userId}
      role="individual"
      setActiveTab={setActiveTab}
    />
  );
}
