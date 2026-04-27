// src/app/(pages)/dashboard/layout.tsx
'use client';

import { useEffect, ReactNode } from 'react';
import { useUser } from '@clerk/clerk-react';
import { useRouter } from 'next/navigation';
import { SignOutButton } from '@clerk/nextjs';

import DashboardLayout from '@/components/layout/DashboardLayout';
import { DashboardUIProvider } from '@/contexts/DashboardUIContext';
import { useUserProfile } from '@/hooks/useUserProfile';
import { useSupabaseClient } from '@/utils/supabase/client';

export default function DashboardRootLayout({ children }: { children: ReactNode }) {
  const { user, isLoaded } = useUser();
  const router = useRouter();
  const supabase = useSupabaseClient();
  const { role, status, loading } = useUserProfile();

  const profileImage = user?.imageUrl ?? '';

  // Redirect unauthenticated users
  useEffect(() => {
    if (isLoaded && !user) {
      router.push('/sign-in');
    }
  }, [isLoaded, user, router]);

  // Redirect admins to admin dashboard
  useEffect(() => {
    if (!loading && role === 'admin') {
      router.push('/dashboard/admin');
    }
  }, [role, loading, router]);

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

  if (!user || loading) return null;

  // Block access if user is archived
  if (status === 'archived') {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center p-4 bg-gray-50">
        <div className="max-w-md w-full bg-white p-8 rounded-lg shadow-lg text-center border-t-4 border-orange-500">
          <div className="mb-4">
            <svg className="mx-auto h-16 w-16 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold mb-3 text-gray-900">Account Archived</h2>
          <p className="text-gray-700 mb-6">
            Your profile is no longer active and you cannot book or receive appointment requests.
          </p>
          <p className="text-gray-600 text-sm mb-6">
            If you believe this is an error or would like to reactivate your account,
            please contact our support team at{' '}
            <a href="mailto:info@sunshinetherapydogs.ca" className="text-blue-600 hover:underline font-medium">
              info@sunshinetherapydogs.ca
            </a>
          </p>
          <SignOutButton>
            <button className="w-full bg-gray-600 hover:bg-gray-700 text-white font-medium py-3 px-4 rounded-lg transition-colors">
              Log Out
            </button>
          </SignOutButton>
        </div>
      </div>
    );
  }

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

  return (
    <DashboardUIProvider>
      <DashboardLayout profileImage={profileImage} role={role as 'individual' | 'volunteer' | 'admin'}>
        {children}
      </DashboardLayout>
    </DashboardUIProvider>
  );
}
