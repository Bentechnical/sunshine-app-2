// src/components/layout/DesktopNavAdmin.tsx
import { Dispatch, SetStateAction } from 'react';
import { ActiveTab } from '@/types/navigation';

interface Props {
  activeTab: ActiveTab;
  setActiveTab: Dispatch<SetStateAction<ActiveTab>>;
  unreadCount: number;
  role?: 'admin' | 'pd';
}

export default function DesktopNavAdmin({ activeTab, setActiveTab, unreadCount, role = 'admin' }: Props) {

  const allTabs: { key: ActiveTab; label: string; showAlert?: boolean; adminOnly?: boolean }[] = [
    { key: 'dashboard-home', label: 'Overview' },
    { key: 'admin-visits', label: 'Organization Visits' },
    { key: 'admin-compliance', label: 'Compliance' },
    { key: 'user-requests', label: 'New User Requests' },
    { key: 'manage-users', label: 'Manage Users' },
    { key: 'appointments', label: 'Appointments', adminOnly: true },
    { key: 'chats', label: 'Chat Management', showAlert: unreadCount > 0, adminOnly: true },
    { key: 'welcome-messages', label: 'Welcome Messages', adminOnly: true },
    { key: 'email-testing', label: 'Email & Admin Settings', adminOnly: true },
  ];

  const tabs = role === 'pd' ? allTabs.filter(t => !t.adminOnly) : allTabs;


  return (
    <nav className="flex flex-col gap-2 text-base">
      {tabs.map(({ key, label, showAlert }) => (
        <button
          key={key}
          onClick={() => setActiveTab(key)}
          className={`inline-flex items-center gap-2 whitespace-nowrap text-sm h-9 w-full justify-start rounded-lg px-4 py-2 text-left font-medium transition-colors relative
            ${
              activeTab === key
                ? 'bg-[var(--card)] text-[var(--primary)]'
                : 'text-[var(--sidebar-foreground)] hover:bg-[var(--sidebar-accent)] hover:text-[var(--sidebar-accent-foreground)]'
            }`}
        >
          {label}
          {showAlert && (
            <span className="absolute top-1/2 -translate-y-1/2 right-2 bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
              !
            </span>
          )}
        </button>
      ))}
    </nav>
  );
}
