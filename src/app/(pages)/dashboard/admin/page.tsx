// src/app/(pages)/dashboard/admin/page.tsx

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@clerk/clerk-react';

import { useUserProfile } from '@/hooks/useUserProfile';
import DashboardLayout from '@/components/layout/DashboardLayout';
import type { ActiveTab } from '@/types/navigation';

import AdminDashboardHome from '@/components/admin/AdminDashboardHome';
import AdminManageUsers from '@/components/admin/AdminManageUsers';
import AdminAppointments from '@/components/admin/AdminAppointments';
import AdminUserRequests from '@/components/admin/AdminUserRequests';
import AdminChats from '@/components/admin/AdminChats';
import AdminWelcomeMessages from '@/components/admin/AdminWelcomeMessages';
import AdminEmailTesting from '@/components/admin/AdminEmailTesting';

export default function AdminDashboardPage() {
  const { user } = useUser();
  const { role, status, loading } = useUserProfile();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard-home');
  const [unreadCountRefreshTrigger, setUnreadCountRefreshTrigger] = useState(0);

  const profileImage = user?.imageUrl ?? '';
  
  const handleUnreadCountChange = () => {
    setUnreadCountRefreshTrigger(prev => prev + 1);
  };

  useEffect(() => {
    if (!user) {
      router.push('/sign-in');
    } else if (!loading && (role !== 'admin' || status !== 'approved')) {
      router.push('/dashboard');
    }
  }, [user, router, role, status, loading]);

  // Wait until everything is loaded and valid
  if (!user || loading || role !== 'admin' || status !== 'approved') return null;

  const renderActiveTab = () => {
    switch (activeTab) {
      case 'dashboard-home':
        return <AdminDashboardHome />;
      case 'manage-users':
        return <AdminManageUsers />;
      case 'user-requests':
        return <AdminUserRequests />;
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
            Unknown tab selected. Please report this issue.
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
    >
      {renderActiveTab()}
    </DashboardLayout>
  );
}
