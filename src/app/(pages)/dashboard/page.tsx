// src/app/(pages)/dashboard/page.tsx
'use client';

import { useEffect, useState, useCallback } from 'react';
import { useUser } from '@clerk/clerk-react';
import { useRouter } from 'next/navigation';

import DashboardLayout from '@/components/layout/DashboardLayout';
import DashboardHome from '@/components/dashboard/DashboardHome';
import MeetWithDog from '@/components/visits/MeetWithDog';
import MyVisits from '@/components/visits/MyVisits';
import VolunteerAvailability from '@/components/availability/VolunteerAvailability';
import MessagingTab from '@/components/messaging/MessagingTab';

import { useUserRole } from '@/hooks/useUserRole';
import { ActiveTab } from '@/types/navigation';

export default function DashboardPage() {
  const { user } = useUser();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard-home');
  const [selectedDogId, setSelectedDogId] = useState<string | null>(null);
  const { role, loading } = useUserRole();

  const userId = user?.id ?? '';
  const profileImage = user?.imageUrl ?? '';

  // Redirect logic
  useEffect(() => {
    if (!user) {
      router.push('/sign-in');
    } else if (role === 'admin') {
      router.push('/dashboard/admin');
    }
  }, [user, router, role]);

  const handleSelectDog = useCallback<React.Dispatch<React.SetStateAction<string | null>>>(
    (idOrSetter) => setSelectedDogId(idOrSetter),
    []
  );

  // Guard render until we have the user and non-admin role
  if (!user || loading) return null;
  if (!role || role === 'admin') return null;

  const renderActiveTabContent = () => {
    switch (activeTab) {
      case 'dashboard-home':
        return <DashboardHome userId={userId} role={role as 'volunteer' | 'individual'} setActiveTab={setActiveTab} />;
      case 'meet-with-dog':
        return (
          <MeetWithDog
            selectedDogId={selectedDogId}
            setSelectedDogId={handleSelectDog}
          />
        );
      case 'my-visits':
        return <MyVisits userId={userId} role={role as 'volunteer' | 'individual'} />;
      case 'my-therapy-dog':
        return (
          <div className="space-y-6">
            <VolunteerAvailability userId={userId} />
          </div>
        );
      case 'messaging':
        return <MessagingTab />;
      default:
        return <p>Unknown tab</p>;
    }
  };

  return (
    <DashboardLayout
      profileImage={profileImage}
      role={role}
      activeTab={activeTab}
      setActiveTab={setActiveTab}
    >
      <main className="flex-grow p-4">{renderActiveTabContent()}</main>
    </DashboardLayout>
  );
}
