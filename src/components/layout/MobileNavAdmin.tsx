// src/components/layout/MobileNavAdmin.tsx
'use client';

import { Home, Users, MessageCircle, CalendarCheck, Mail, MessageSquare, Calendar } from 'lucide-react';
import { ActiveTab } from '@/types/navigation';
import { useAdminUnreadCount } from '@/hooks/useAdminUnreadCount';

interface MobileNavAdminProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  profileImage: string;
  refreshTrigger?: number;
}

export default function MobileNavAdmin({
  activeTab,
  setActiveTab,
  profileImage,
  refreshTrigger,
}: MobileNavAdminProps) {
  const { unreadCount } = useAdminUnreadCount(activeTab, refreshTrigger);

  const tabs: {
    key: ActiveTab;
    label: string;
    icon: React.ReactNode;
    showAlert?: boolean;
  }[] = [
    { key: 'dashboard-home', label: 'Overview', icon: <Home size={20} /> },
    { key: 'user-requests', label: 'Requests', icon: <Users size={20} /> },
    { key: 'chats', label: 'Chats', icon: <MessageCircle size={20} />, showAlert: unreadCount > 0 },
    { key: 'appointments', label: 'Appts', icon: <CalendarCheck size={20} /> },
    { key: 'availabilities', label: 'Avail', icon: <Calendar size={20} /> },
    { key: 'welcome-messages', label: 'Messages', icon: <MessageSquare size={20} /> },
    { key: 'email-testing', label: 'Email', icon: <Mail size={20} /> },
  ];

  return (
    <nav className="bg-white border-t border-gray-200 px-4 py-2">
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
              {showAlert && (
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