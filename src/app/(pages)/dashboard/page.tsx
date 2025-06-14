// src/app/(pages)/dashboard/page.tsx
'use client';

import { useEffect, useState, useCallback } from 'react';
import { useUser } from '@clerk/clerk-react';
import { useRouter } from 'next/navigation';
import { useSupabaseClient } from '@/utils/supabase/client';

import DashboardLayout from '@/components/layout/DashboardLayout';
import ProfileTab from '@/components/profile/ProfileTab';
import MeetWithDog from '@/components/visits/MeetWithDog';
import MyVisits from '@/components/visits/MyVisits';
import VolunteerAvailability from '@/components/availability/VolunteerAvailability';
import EditDogProfile from '@/components/dog/EditDogProfile';
import MessagingTab from '@/components/messaging/MessagingTab';

import { ActiveTab } from '@/types/navigation';

export default function DashboardPage() {
  const { user } = useUser();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<ActiveTab>('profile');
  const [selectedDogId, setSelectedDogId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      router.push('/sign-in');
    }
  }, [user, router]);

  const role = user?.publicMetadata?.role as 'individual' | 'volunteer' | 'admin' | undefined;
  const userId = user?.id ?? '';
  const profileImage = user?.imageUrl ?? '';

  // ✅ Memoize setter to avoid render loop in DogDirectory
  const handleSelectDog = useCallback<React.Dispatch<React.SetStateAction<string | null>>>(
  (idOrSetter) => {
    setSelectedDogId(idOrSetter);
  },
  []
);

  if (!user || !role) return null;

  const renderActiveTabContent = () => {
    switch (activeTab) {
      case 'profile':
        return <ProfileTab />;
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
            <EditDogProfile />
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
