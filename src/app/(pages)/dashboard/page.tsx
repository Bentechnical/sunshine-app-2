// src/app/(pages)/dashboard/page.tsx
'use client';

import { useEffect, useState, useCallback } from 'react';
import { useUser } from '@clerk/clerk-react';
import { useRouter } from 'next/navigation';
import { SignOutButton } from '@clerk/nextjs';

import DashboardLayout from '@/components/layout/DashboardLayout';
import DashboardHome from '@/components/dashboard/DashboardHome';
import MeetWithDog from '@/components/visits/MeetWithDog';
import MyVisits from '@/components/visits/MyVisits';
import CalendlyStyleAvailability from '@/components/availability/CalendlyStyleAvailability';
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
  const [hideMobileNav, setHideMobileNav] = useState<boolean>(false);
  const [isMessagingActiveChat, setIsMessagingActiveChat] = useState<boolean>(false);

  const userId = user?.id ?? '';
  const profileImage = user?.imageUrl ?? '';

  const handleSelectDog = useCallback<React.Dispatch<React.SetStateAction<string | null>>>(
    (idOrSetter) => setSelectedDogId(idOrSetter),
    []
  );

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

  // Show nothing while loading
  if (!user || loading) return null;

  // Block access if user is pending or denied
  if (status !== 'approved' || role === null) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center p-4">
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
          <div className="h-full flex flex-col space-y-0 md:space-y-6 md:bg-transparent">
            <CalendlyStyleAvailability userId={userId} />
          </div>
        );
      case 'messaging':
        return (
          <MessagingTab
            onActiveChatChange={(isActive) => {
              setHideMobileNav(isActive);
              setIsMessagingActiveChat(isActive);
            }}
          />
        );
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
      hideMobileNav={hideMobileNav}
      noMobileTopPadding={activeTab === 'messaging' && isMessagingActiveChat}
    >
      <main className={`flex-grow ${activeTab === 'messaging' || activeTab === 'my-therapy-dog' ? 'p-0 md:p-4 h-full min-h-0' : 'p-4'}`}>
        {renderActiveTabContent()}
        
        {/* Mobile Logout Button - Only on home tab */}
        {activeTab === 'dashboard-home' && (
          <div className="md:hidden mt-8 pt-6 border-t border-gray-200 pb-8">
            <SignOutButton>
              <button
                data-slot="button"
                className="inline-flex items-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] bg-red-600 hover:bg-red-700 text-white w-full px-4 py-3"
              >
                Log Out
              </button>
            </SignOutButton>
          </div>
        )}
        
        {/* Mobile bottom spacing for all tabs except messaging (handled inside component) */}
        {activeTab !== 'messaging' && activeTab !== 'my-therapy-dog' && (
          <div className="md:hidden pb-20"></div>
        )}
      </main>
    </DashboardLayout>
  );
}
