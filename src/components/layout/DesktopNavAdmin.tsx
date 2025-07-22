// src/components/layout/DesktopNavAdmin.tsx
import { Dispatch, SetStateAction } from 'react';
import { ActiveTab } from '@/types/navigation';

interface Props {
  activeTab: ActiveTab;
  setActiveTab: Dispatch<SetStateAction<ActiveTab>>;
}

export default function DesktopNavAdmin({ activeTab, setActiveTab }: Props) {
  const tabs: { key: ActiveTab; label: string }[] = [
    { key: 'dashboard-home', label: 'Overview' },
    { key: 'user-requests', label: 'New User Requests' },
    { key: 'manage-users', label: 'Manage Users' },
    { key: 'appointments', label: 'Appointments' },
  ];


  return (
    <nav className="flex flex-col gap-2 text-base">
      {tabs.map(({ key, label }) => (
        <button
          key={key}
          onClick={() => setActiveTab(key)}
          className={`inline-flex items-center gap-2 whitespace-nowrap text-sm h-9 w-full justify-start rounded-lg px-4 py-2 text-left font-medium transition-colors
            ${
              activeTab === key
                ? 'bg-[var(--card)] text-[var(--primary)]'
                : 'text-[var(--sidebar-foreground)] hover:bg-[var(--sidebar-accent)] hover:text-[var(--sidebar-accent-foreground)]'
            }`}
        >
          {label}
        </button>
      ))}
    </nav>
  );
}
