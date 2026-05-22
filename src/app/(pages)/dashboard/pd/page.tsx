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
import AdminUserRequests from '@/components/admin/AdminUserRequests';

// ── Tab ↔ URL param mapping ──────────────────────────────────────────────────

const PARAM_TO_TAB: Record<string, ActiveTab> = {
  home:                'dashboard-home',
  'group-visits':      'group-visits',
  'user-requests':     'user-requests',
  'manage-volunteers': 'manage-volunteers',
};

const TAB_TO_PARAM: Partial<Record<ActiveTab, string>> = {
  'dashboard-home':    'home',
  'group-visits':      'group-visits',
  'user-requests':     'user-requests',
  'manage-volunteers': 'manage-volunteers',
};

function PDDashboardInner() {
  const { user } = useUser();
  const { role, status, loading } = useUserProfile();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [alertCountsRefreshTrigger, setAlertCountsRefreshTrigger] = useState(0);

  const tabParam = searchParams.get('tab') ?? 'home';
  const activeTab: ActiveTab = PARAM_TO_TAB[tabParam] ?? 'dashboard-home';
  const visitParam = searchParams.get('visit');
  const selectedVisitId = visitParam ? parseInt(visitParam, 10) : null;

  const profileImage = user?.imageUrl ?? '';

  const setActiveTab = (tabOrUpdater: ActiveTab | ((prev: ActiveTab) => ActiveTab)) => {
    const tab = typeof tabOrUpdater === 'function' ? tabOrUpdater(activeTab) : tabOrUpdater;
    const param = TAB_TO_PARAM[tab] ?? 'home';
    router.push(`/dashboard/pd?tab=${param}`);
  };

  const handleAlertCountsChange = () => {
    setAlertCountsRefreshTrigger(prev => prev + 1);
  };

  useEffect(() => {
    if (!user) {
      router.push('/sign-in');
    } else if (!loading && (role !== 'pd' || status !== 'approved')) {
      router.push('/dashboard');
    }
  }, [user, router, role, status, loading]);

  if (!user || loading || role !== 'pd' || status !== 'approved') return null;

  const renderActiveTab = () => {
    switch (activeTab) {
      case 'dashboard-home':
        return <AdminDashboardHome pdMode />;
      case 'group-visits':
        return (
          <AdminGroupVisits
            selectedVisitId={selectedVisitId}
            onSelectVisit={(id: number) => router.push(`/dashboard/pd?tab=group-visits&visit=${id}`)}
            onBackFromVisit={() => router.back()}
            onCountChange={handleAlertCountsChange}
            role="pd"
          />
        );
      case 'manage-volunteers':
        return <AdminManageVolunteers role="pd" />;
      case 'user-requests':
        return <AdminUserRequests hideIndividuals onCountChange={handleAlertCountsChange} />;
      default:
        return null;
    }
  };

  return (
    <DashboardLayout
      profileImage={profileImage}
      role="pd"
      activeTab={activeTab}
      setActiveTab={setActiveTab}
      alertCountsRefreshTrigger={alertCountsRefreshTrigger}
    >
      {renderActiveTab()}
    </DashboardLayout>
  );
}

export default function PDDashboardPage() {
  return (
    <Suspense fallback={null}>
      <PDDashboardInner />
    </Suspense>
  );
}
