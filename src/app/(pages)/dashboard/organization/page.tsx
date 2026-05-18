// src/app/(pages)/dashboard/organization/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useUser } from '@clerk/clerk-react';
import { SignOutButton } from '@clerk/nextjs';
import { Settings } from 'lucide-react';
import { useUserProfile } from '@/hooks/useUserProfile';
import OrgMyVisits from '@/components/visits/OrgMyVisits';
import OrgRequestVisit from '@/components/visits/OrgRequestVisit';
import OrgEditProfileModal, { OrgProfile } from '@/components/visits/OrgEditProfileModal';

type OrgTab = 'my-visits' | 'request-visit';

export default function OrganizationDashboardPage() {
  const { user } = useUser();
  const { role, status, loading } = useUserProfile();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<OrgTab>('my-visits');
  const [orgProfile, setOrgProfile] = useState<OrgProfile | null>(null);
  const [showEditProfile, setShowEditProfile] = useState(false);

  // Parse ?visit= param for deep-linking into visit detail
  const visitParam = searchParams.get('visit');
  const selectedVisitId = visitParam ? parseInt(visitParam, 10) : null;

  useEffect(() => {
    if (!user) {
      router.push('/sign-in');
    } else if (!loading && role !== 'organization') {
      router.push('/dashboard');
    }
  }, [user, router, role, loading]);

  useEffect(() => {
    if (!user || loading || role !== 'organization') return;
    fetch('/api/org/profile')
      .then(r => r.json())
      .then(json => { if (json.profile) setOrgProfile(json.profile); })
      .catch(() => {});
  }, [user, loading, role]);

  // When a visit is selected, switch to my-visits tab so it renders
  useEffect(() => {
    if (selectedVisitId != null) setActiveTab('my-visits');
  }, [selectedVisitId]);

  if (!user || loading || role !== 'organization') return null;

  const handleSelectVisit = (id: number) => {
    router.push(`/dashboard/organization?visit=${id}`);
  };

  const handleBackFromVisit = () => {
    router.back();
  };

  const Header = () => (
    <header className="bg-[#0e62ae] text-white px-6 py-4 flex items-center justify-between shadow">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/images/sunshine-logo-white.png"
        alt="Sunshine Therapy Dogs"
        className="h-10 object-contain"
      />
      <div className="flex items-center gap-2">
        <button
          onClick={() => setShowEditProfile(true)}
          className="flex items-center gap-1.5 text-sm bg-white/10 hover:bg-white/20 text-white font-medium px-3 py-2 rounded transition-colors"
        >
          <Settings size={15} />
          Edit Profile
        </button>
        <SignOutButton>
          <button className="text-sm bg-white text-[#0e62ae] font-medium px-4 py-2 rounded hover:bg-gray-100 transition-colors">
            Log Out
          </button>
        </SignOutButton>
      </div>
    </header>
  );

  if (status === 'pending') {
    return (
      <div className="min-h-dvh flex flex-col bg-gray-50">
        <Header />
        <main className="flex-1 flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-white p-8 rounded-lg shadow text-center">
            <div className="mb-4">
              <svg className="mx-auto h-12 w-12 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Account Under Review</h2>
            <p className="text-gray-600">
              Thanks for registering your organization! Our team is reviewing your information and
              will be in touch once your account is approved.
            </p>
            <p className="text-sm text-gray-500 mt-4">
              Questions? Contact us at{' '}
              <a href="mailto:info@sunshinetherapydogs.ca" className="text-blue-600 hover:underline">
                info@sunshinetherapydogs.ca
              </a>
            </p>
          </div>
        </main>
      </div>
    );
  }

  if (status === 'archived') {
    return (
      <div className="min-h-dvh flex flex-col bg-gray-50">
        <Header />
        <main className="flex-1 flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-white p-8 rounded-lg shadow text-center border-t-4 border-orange-500">
            <h2 className="text-xl font-bold text-gray-900 mb-2">Account Archived</h2>
            <p className="text-gray-600 mb-4">
              Your organization account is no longer active. Please contact us to reactivate.
            </p>
            <a href="mailto:info@sunshinetherapydogs.ca" className="text-blue-600 hover:underline text-sm">
              info@sunshinetherapydogs.ca
            </a>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-dvh flex flex-col bg-gray-50">
      <Header />
      <main className="flex-1 max-w-5xl mx-auto w-full px-4 py-6">
        {/* Tab nav — hidden when viewing visit detail */}
        {selectedVisitId == null && (
          <div className="flex gap-3 mb-6">
            <button
              onClick={() => setActiveTab('my-visits')}
              className={`px-5 py-2 rounded-lg text-sm font-semibold transition ${
                activeTab === 'my-visits'
                  ? 'bg-[#0e62ae] text-white shadow'
                  : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
              }`}
            >
              My Visits
            </button>
            <button
              onClick={() => setActiveTab('request-visit')}
              className={`px-5 py-2 rounded-lg text-sm font-semibold transition ${
                activeTab === 'request-visit'
                  ? 'bg-[#0e62ae] text-white shadow'
                  : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
              }`}
            >
              + Request a Visit
            </button>
          </div>
        )}

        {activeTab === 'my-visits' && (
          <OrgMyVisits
            orgProfileImage={orgProfile?.profile_image ?? null}
            selectedVisitId={selectedVisitId}
            onSelectVisit={handleSelectVisit}
            onBackFromVisit={handleBackFromVisit}
          />
        )}
        {activeTab === 'request-visit' && selectedVisitId == null && (
          <OrgRequestVisit onSuccess={() => setActiveTab('my-visits')} />
        )}
      </main>

      {showEditProfile && orgProfile && (
        <OrgEditProfileModal
          profile={orgProfile}
          onClose={() => setShowEditProfile(false)}
          onSaved={updated => {
            setOrgProfile(updated);
            setShowEditProfile(false);
          }}
        />
      )}
    </div>
  );
}
