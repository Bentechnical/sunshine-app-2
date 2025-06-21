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
import EditDogProfile from '@/components/dog/EditDogProfile';
import MessagingTab from '@/components/messaging/MessagingTab';

import { ActiveTab } from '@/types/navigation';

export default function DashboardPage() {
  const { user } = useUser();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard-home');
  const [selectedDogId, setSelectedDogId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      router.push('/sign-in');
    }
  }, [user, router]);

  const role = user?.publicMetadata?.role as 'individual' | 'volunteer' | 'admin' | undefined;
  const userId = user?.id ?? '';
  const profileImage = user?.imageUrl ?? '';

  const handleSelectDog = useCallback<React.Dispatch<React.SetStateAction<string | null>>>(
    (idOrSetter) => setSelectedDogId(idOrSetter),
    []
  );

  if (!user || !role || role === 'admin') return null;

  const renderActiveTabContent = () => {
    switch (activeTab) {
      case 'dashboard-home':
        return <DashboardHome userId={userId} role={role} setActiveTab={setActiveTab} />;
      case 'meet-with-dog':
        return (
          <MeetWithDog
            selectedDogId={selectedDogId}
            setSelectedDogId={handleSelectDog}
          />
        );
      case 'my-visits':
        return <MyVisits userId={userId} role={role} />;
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
