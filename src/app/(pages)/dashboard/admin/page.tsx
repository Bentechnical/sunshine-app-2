// src/app/(pages)/dashboard/admin/page.tsx

'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useUser } from '@clerk/clerk-react';

import { useUserProfile } from '@/hooks/useUserProfile';
import DashboardLayout from '@/components/layout/DashboardLayout';
import type { ActiveTab } from '@/types/navigation';

import AdminDashboardHome from '@/components/admin/AdminDashboardHome';
import AdminGroupVisits from '@/components/admin/AdminGroupVisits';
import AdminManageVolunteers from '@/components/admin/AdminManageVolunteers';
import AdminManageRegions from '@/components/admin/AdminManageRegions';
import AdminManageIndividuals from '@/components/admin/AdminManageIndividuals';
import AdminAppointments from '@/components/admin/AdminAppointments';
import AdminUserRequests from '@/components/admin/AdminUserRequests';
import AdminChats from '@/components/admin/AdminChats';
import AdminWelcomeMessages from '@/components/admin/AdminWelcomeMessages';
import AdminEmailTesting from '@/components/admin/AdminEmailTesting';

// ── Tab ↔ URL param mapping ──────────────────────────────────────────────────

const PARAM_TO_TAB: Record<string, ActiveTab> = {
  home:                'dashboard-home',
  'group-visits':      'group-visits',
  'user-requests':     'user-requests',
  'manage-volunteers': 'manage-volunteers',
  'manage-regions':    'manage-regions',
  'manage-orgs':       'manage-orgs',
  'manage-individuals':'manage-individuals',
  appointments:        'appointments',
  chats:               'chats',
  'welcome-messages':  'welcome-messages',
  settings:            'email-testing',
};

const TAB_TO_PARAM: Partial<Record<ActiveTab, string>> = {
  'dashboard-home':    'home',
  'group-visits':      'group-visits',
  'user-requests':     'user-requests',
  'manage-volunteers': 'manage-volunteers',
  'manage-regions':    'manage-regions',
  'manage-orgs':       'manage-orgs',
  'manage-individuals':'manage-individuals',
  'appointments':      'appointments',
  'chats':             'chats',
  'welcome-messages':  'welcome-messages',
  'email-testing':     'settings',
};

// ── Inner component (needs Suspense for useSearchParams in Next.js 15) ───────

function AdminDashboardInner() {
  const { user } = useUser();
  const { role, status, loading } = useUserProfile();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [unreadCountRefreshTrigger, setUnreadCountRefreshTrigger] = useState(0);
  const [alertCountsRefreshTrigger, setAlertCountsRefreshTrigger] = useState(0);

  const tabParam = searchParams.get('tab') ?? 'home';
  const activeTab: ActiveTab = PARAM_TO_TAB[tabParam] ?? 'dashboard-home';
  const visitParam = searchParams.get('visit');
  const selectedVisitId = visitParam ? parseInt(visitParam, 10) : null;
  const profileImage = user?.imageUrl ?? '';

  const setActiveTab = (tabOrUpdater: ActiveTab | ((prev: ActiveTab) => ActiveTab)) => {
    const tab = typeof tabOrUpdater === 'function' ? tabOrUpdater(activeTab) : tabOrUpdater;
    const param = TAB_TO_PARAM[tab] ?? 'home';
    router.push(`/dashboard/admin?tab=${param}`);
  };

  const handleUnreadCountChange = () => {
    setUnreadCountRefreshTrigger(prev => prev + 1);
  };

  const handleAlertCountsChange = () => {
    setAlertCountsRefreshTrigger(prev => prev + 1);
  };

  useEffect(() => {
    if (!user) {
      router.push('/sign-in');
    } else if (!loading && (role !== 'admin' || status !== 'approved')) {
      router.push('/dashboard');
    }
  }, [user, router, role, status, loading]);

  if (!user || loading || role !== 'admin' || status !== 'approved') return null;

  const renderActiveTab = () => {
    switch (activeTab) {
      case 'dashboard-home':
        return <AdminDashboardHome />;
      case 'group-visits':
        return (
          <AdminGroupVisits
            selectedVisitId={selectedVisitId}
            onSelectVisit={(id) => router.push(`/dashboard/admin?tab=group-visits&visit=${id}`)}
            onBackFromVisit={() => router.back()}
            onCountChange={handleAlertCountsChange}
            role="admin"
          />
        );
      case 'manage-orgs':
        return (
          <AdminGroupVisits
            selectedVisitId={null}
            onSelectVisit={() => {}}
            onBackFromVisit={() => {}}
            role="admin"
            view="orgs"
          />
        );
      case 'manage-volunteers':
        return <AdminManageVolunteers />;
      case 'manage-regions':
        return <AdminManageRegions />;
      case 'manage-individuals':
        return <AdminManageIndividuals />;
      case 'user-requests':
        return <AdminUserRequests onCountChange={handleAlertCountsChange} />;
      case 'appointments':
        return <AdminAppointments />;
      case 'chats':
        return <AdminChats onUnreadCountChange={handleUnreadCountChange} />;
      case 'welcome-messages':
        return <AdminWelcomeMessages />;
      case 'email-testing':
        return <AdminEmailTesting />;
      default:
        return (
          <div className="p-4 text-red-600">
            Unknown tab: &ldquo;{activeTab}&rdquo;. Please report this issue.
          </div>
        );
    }
  };

  return (
    <DashboardLayout
      profileImage={profileImage}
      role="admin"
      activeTab={activeTab}
      setActiveTab={setActiveTab}
      refreshTrigger={unreadCountRefreshTrigger}
      alertCountsRefreshTrigger={alertCountsRefreshTrigger}
    >
      {renderActiveTab()}
    </DashboardLayout>
  );
}

export default function AdminDashboardPage() {
  return (
    <Suspense fallback={null}>
      <AdminDashboardInner />
    </Suspense>
  );
}
