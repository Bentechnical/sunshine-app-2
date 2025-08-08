// src/components/layout/DesktopNavAdmin.tsx
import { Dispatch, SetStateAction } from 'react';
import { ActiveTab } from '@/types/navigation';
import { useAdminUnreadCount } from '@/hooks/useAdminUnreadCount';

interface Props {
  activeTab: ActiveTab;
  setActiveTab: Dispatch<SetStateAction<ActiveTab>>;
  refreshTrigger?: number;
}

export default function DesktopNavAdmin({ activeTab, setActiveTab, refreshTrigger }: Props) {
  const { unreadCount } = useAdminUnreadCount(activeTab, refreshTrigger);
  
  const tabs: { key: ActiveTab; label: string; showAlert?: boolean }[] = [
    { key: 'dashboard-home', label: 'Overview' },
    { key: 'user-requests', label: 'New User Requests' },
    { key: 'manage-users', label: 'Manage Users' },
    { key: 'appointments', label: 'Appointments' },
    { key: 'chats', label: 'Chat Management', showAlert: unreadCount > 0 },
    { key: 'welcome-messages', label: 'Welcome Messages' },
    { key: 'email-testing', label: 'Email Testing' },
  ];


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
