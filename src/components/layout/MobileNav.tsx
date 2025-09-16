// src/components/layout/MobileNav.tsx
'use client';

import { Home, PawPrint, MessageCircle, CalendarCheck } from 'lucide-react';
import { ActiveTab } from '@/types/navigation';
import { useNavNotifications } from '@/hooks/useNavNotifications';

interface MobileNavProps {
  role: 'individual' | 'volunteer';
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  profileImage: string;
}

export default function MobileNav({
  role,
  activeTab,
  setActiveTab,
  profileImage,
}: MobileNavProps) {
  const { hasUnreadMessages } = useNavNotifications(activeTab);

  const tabs: {
    key: ActiveTab;
    label: string;
    icon: React.ReactNode;
    showAlert?: boolean;
  }[] = role === 'individual'
    ? [
        { key: 'dashboard-home', label: 'Home', icon: <Home size={20} /> },
        { key: 'meet-with-dog', label: 'Meet Dogs', icon: <PawPrint size={20} /> },
        { key: 'my-visits', label: 'Visits', icon: <CalendarCheck size={20} /> },
        { key: 'messaging', label: 'Messages', icon: <MessageCircle size={20} />, showAlert: hasUnreadMessages },
      ]
    : [
        { key: 'dashboard-home', label: 'Home', icon: <Home size={20} /> },
        { key: 'my-therapy-dog', label: 'Availability', icon: <PawPrint size={20} /> },
        { key: 'my-visits', label: 'Visits', icon: <CalendarCheck size={20} /> },
        { key: 'messaging', label: 'Messages', icon: <MessageCircle size={20} />, showAlert: hasUnreadMessages },
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
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center">
                  !
                </span>
              )}
            </div>
            <span className="text-xs font-medium">{label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}
