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

import { useUserProfile } from '@/hooks/useUserProfile';
import { ActiveTab } from '@/types/navigation';
import { useSupabaseClient } from '@/utils/supabase/client';

export default function DashboardPage() {
  const { user, isLoaded } = useUser();
  const router = useRouter();
  const supabase = useSupabaseClient();

  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard-home');
  const [selectedDogId, setSelectedDogId] = useState<string | null>(null);
  const { role, status, loading } = useUserProfile();

  const userId = user?.id ?? '';
  const profileImage = user?.imageUrl ?? '';

  // Redirect unauthenticated or admin users
  useEffect(() => {
    if (!user) {
      router.push('/sign-in');
    } else if (!loading && role === 'admin') {
      router.push('/dashboard/admin');
    }
  }, [user, role, loading, router]);

  // Redirect to /complete-profile if profile is incomplete
  useEffect(() => {
    const checkProfileComplete = async () => {
      if (!isLoaded || !user) return;

      const { data, error } = await supabase
        .from('users')
        .select('profile_complete')
        .eq('id', user.id)
        .single();

      if (error) {
        console.error('[Dashboard] Supabase error:', error.message);
        return;
      }

      if (!data?.profile_complete) {
        router.replace('/complete-profile');
      }
    };

    checkProfileComplete();
  }, [isLoaded, user, supabase, router]);

  const handleSelectDog = useCallback<React.Dispatch<React.SetStateAction<string | null>>>(
    (idOrSetter) => setSelectedDogId(idOrSetter),
    []
  );

  // Show nothing while loading
  if (!user || loading) return null;

  // Block access if user is pending or denied
  if (status !== 'approved' || role === null) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white p-6 rounded-lg shadow text-center">
          <h2 className="text-xl font-semibold mb-2">Your profile is under review</h2>
          <p className="text-gray-700">
            Thanks for registering! Our team is reviewing your information and will notify you once approved.
          </p>
        </div>
      </div>
    );
  }

  const renderActiveTabContent = () => {
    switch (activeTab) {
      case 'dashboard-home':
        return (
          <DashboardHome
            userId={userId}
            role={role as 'volunteer' | 'individual'}
            setActiveTab={setActiveTab}
          />
        );
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
