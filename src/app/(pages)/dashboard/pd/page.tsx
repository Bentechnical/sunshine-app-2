'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@clerk/clerk-react';

import { useUserProfile } from '@/hooks/useUserProfile';
import DashboardLayout from '@/components/layout/DashboardLayout';
import type { ActiveTab } from '@/types/navigation';

export default function PDDashboardPage() {
  const { user } = useUser();
  const { role, status, loading } = useUserProfile();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<ActiveTab>('pd-dashboard-home');

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
      case 'pd-dashboard-home':
        return (
          <div className="p-6">
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Program Director Dashboard</h1>
            <p className="text-gray-500">Visit management tools coming soon.</p>
          </div>
        );
      case 'pd-visits':
        return (
          <div className="p-6">
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Manage Visits</h1>
            <p className="text-gray-500">Visit management coming soon.</p>
          </div>
        );
      case 'pd-volunteers':
        return (
          <div className="p-6">
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Manage Volunteers</h1>
            <p className="text-gray-500">Volunteer management coming soon.</p>
          </div>
        );
      case 'pd-organizations':
        return (
          <div className="p-6">
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Manage Organizations</h1>
            <p className="text-gray-500">Organization management coming soon.</p>
          </div>
        );
      case 'pd-compliance':
        return (
          <div className="p-6">
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Compliance</h1>
            <p className="text-gray-500">VSC and vaccine record tracking coming soon.</p>
          </div>
        );
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
