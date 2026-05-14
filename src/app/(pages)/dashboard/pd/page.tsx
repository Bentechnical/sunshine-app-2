'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@clerk/clerk-react';

import { useUserProfile } from '@/hooks/useUserProfile';
import DashboardLayout from '@/components/layout/DashboardLayout';
import type { ActiveTab } from '@/types/navigation';
import AdminVisits from '@/components/admin/AdminVisits';
import AdminCompliance from '@/components/admin/AdminCompliance';

export default function PDDashboardPage() {
  const { user } = useUser();
  const { role, status, loading } = useUserProfile();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<ActiveTab>('admin-visits');

  const profileImage = user?.imageUrl ?? '';

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
      case 'admin-visits':
        return <AdminVisits />;
      case 'admin-compliance':
        return <AdminCompliance />;
      default:
        return (
          <div className="p-4 text-red-600">
            Unknown tab: "{activeTab}".
          </div>
        );
    }
  };

  return (
    <DashboardLayout
      profileImage={profileImage}
      role="pd"
      activeTab={activeTab}
      setActiveTab={setActiveTab}
    >
      {renderActiveTab()}
    </DashboardLayout>
  );
}
