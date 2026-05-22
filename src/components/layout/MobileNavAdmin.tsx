// src/components/layout/MobileNavAdmin.tsx
'use client';

import { Home, Users, MessageCircle, CalendarCheck, Mail, Building2, Map } from 'lucide-react';
import { ActiveTab } from '@/types/navigation';

interface MobileNavAdminProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  profileImage: string;
  unreadCount: number;
  alertCounts?: Record<string, number>;
  role?: 'admin' | 'pd';
}

export default function MobileNavAdmin({
  activeTab,
  setActiveTab,
  profileImage,
  unreadCount,
  alertCounts = {},
  role = 'admin',
}: MobileNavAdminProps) {

  const allTabs: {
    key: ActiveTab;
    label: string;
    icon: React.ReactNode;
    showAlert?: boolean;
    adminOnly?: boolean;
  }[] = [
    { key: 'dashboard-home', label: 'Overview', icon: <Home size={20} /> },
    { key: 'group-visits', label: 'Visits', icon: <Building2 size={20} /> },
    { key: 'user-requests', label: 'Requests', icon: <Users size={20} /> },
    { key: 'manage-volunteers', label: 'Volunteers', icon: <Users size={20} /> },
    { key: 'manage-regions', label: 'Regions', icon: <Map size={20} />, adminOnly: true },
    { key: 'manage-individuals', label: 'Individuals', icon: <Users size={20} />, adminOnly: true },
    { key: 'chats', label: 'Chats', icon: <MessageCircle size={20} />, showAlert: unreadCount > 0, adminOnly: true },
    { key: 'appointments', label: 'Appts', icon: <CalendarCheck size={20} />, adminOnly: true },
    { key: 'email-testing', label: 'Settings', icon: <Mail size={20} />, adminOnly: true },
  ];

  const tabs = role === 'pd' ? allTabs.filter(t => !t.adminOnly) : allTabs;

  const isNative = typeof window !== 'undefined' && !!(window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.();

  return (
    <nav
      className="bg-white border-t border-gray-200 px-4 pt-2"
      style={isNative ? { paddingBottom: 'calc(env(safe-area-inset-bottom) + 8px)' } : { paddingBottom: '8px' }}
    >
      <div className="flex justify-around items-center">
        {tabs.map(({ key, label, icon, showAlert }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex flex-col items-center gap-1 py-2 px-3 rounded-lg transition-colors relative ${
              activeTab === key
                ? 'text-blue-600 bg-blue-50'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <div className="relative">
              {icon}
              {(showAlert || alertCounts[key] > 0) && (
                <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full"></span>
              )}
            </div>
            <span className="text-xs font-medium">{label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
} 