// src/components/layout/MobileNav.tsx
'use client';

import { Dispatch, SetStateAction } from 'react';
import { ActiveTab } from '@/types/navigation';
import {
  Home,
  PawPrint,
  CalendarCheck,
  MessageCircle,
} from 'lucide-react';

export interface MobileNavProps {
  role: 'individual' | 'volunteer' | 'admin';
  activeTab: ActiveTab;
  setActiveTab: Dispatch<SetStateAction<ActiveTab>>;
  profileImage: string;
}

export default function MobileNav({
  role,
  activeTab,
  setActiveTab,
}: MobileNavProps) {
  const tabs: {
    key: ActiveTab;
    label: string;
    icon: React.ReactNode;
  }[] = role === 'individual'
    ? [
        { key: 'dashboard-home', label: 'Home', icon: <Home size={20} /> },
        { key: 'meet-with-dog', label: 'Meet Dogs', icon: <PawPrint size={20} /> },
        { key: 'my-visits', label: 'Visits', icon: <CalendarCheck size={20} /> },
        { key: 'messaging', label: 'Messages', icon: <MessageCircle size={20} /> },
      ]
    : [
        { key: 'dashboard-home', label: 'Home', icon: <Home size={20} /> },
        { key: 'my-therapy-dog', label: 'Availability', icon: <PawPrint size={20} /> },
        { key: 'my-visits', label: 'Visits', icon: <CalendarCheck size={20} /> },
        { key: 'messaging', label: 'Messages', icon: <MessageCircle size={20} /> },
      ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 flex justify-around border-t bg-[#0e62ae] text-white shadow-md">
      {tabs.map(({ key, label, icon }) => {
        const isActive = activeTab === key;
        return (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex flex-col items-center justify-center flex-1 py-2 gap-1 transition-all ${
              isActive ? 'text-[#f09f1a] font-semibold' : 'text-white opacity-90'
            }`}
            style={{
              borderTop: isActive ? '2px solid #f09f1a' : '2px solid transparent',
            }}
          >
            {icon}
            <span className="text-sm font-semibold">{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
