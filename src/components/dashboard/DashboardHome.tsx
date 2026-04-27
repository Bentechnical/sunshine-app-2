// DashboardHome.tsx
'use client';

import DashboardHomeIndividual from './DashboardHomeIndividual';
import DashboardHomeVolunteer from './DashboardHomeVolunteer';

interface Props {
  userId: string;
  role: 'individual' | 'volunteer';
}

export default function DashboardHome({ userId, role }: Props) {
  if (role === 'volunteer') {
    return <DashboardHomeVolunteer userId={userId} role="volunteer" />;
  }

  return <DashboardHomeIndividual userId={userId} role="individual" />;
}
