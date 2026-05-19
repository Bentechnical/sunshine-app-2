'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@clerk/clerk-react';

import { useUserProfile } from '@/hooks/useUserProfile';
import DashboardLayout from '@/components/layout/DashboardLayout';
import type { ActiveTab } from '@/types/navigation';
import AdminDashboardHome from '@/components/admin/AdminDashboardHome';
import AdminVisits from '@/components/admin/AdminVisits';
import AdminCompliance from '@/components/admin/AdminCompliance';
import AdminManageUsers from '@/components/admin/AdminManageUsers';
import AdminUserRequests from '@/components/admin/AdminUserRequests';

export default function PDDashboardPage() {
  const { user } = useUser();
  const { role, status, loading } = useUserProfile();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard-home');
  const [selectedVisitId, setSelectedVisitId] = useState<number | null>(null);

  const profileImage = user?.imageUrl ?? '';

  const handleSetActiveTab = (tab: Parameters<typeof setActiveTab>[0]) => {
    setSelectedVisitId(null);
    setActiveTab(tab);
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
      case 'admin-visits':
        return (
          <AdminVisits
            pdMode
            selectedVisitId={selectedVisitId}
            onSelectVisit={(id) => setSelectedVisitId(id)}
            onBackFromVisit={() => setSelectedVisitId(null)}
          />
        );
      case 'admin-compliance':
        return <AdminCompliance />;
      case 'manage-users':
        return <AdminManageUsers hideIndividuals />;
      case 'user-requests':
        return <AdminUserRequests hideIndividuals />;
      default:
        return null;
    }
  };

  return (
    <DashboardLayout
      profileImage={profileImage}
      role="pd"
      activeTab={activeTab}
      setActiveTab={handleSetActiveTab}
    >
      {renderActiveTab()}
    </DashboardLayout>
  );
}
