// src/components/layout/DesktopNavAdmin.tsx
import { Dispatch, SetStateAction } from 'react';
import { ActiveTab } from '@/types/navigation';

interface Props {
  activeTab: ActiveTab;
  setActiveTab: Dispatch<SetStateAction<ActiveTab>>;
  unreadCount: number;
  alertCounts?: Record<string, number>;
  role?: 'admin' | 'pd';
}

type TabDef = { key: ActiveTab; label: string; showAlert?: boolean };
type Group = { label: string | null; muted?: boolean; items: TabDef[] };

export default function DesktopNavAdmin({ activeTab, setActiveTab, unreadCount, alertCounts = {}, role = 'admin' }: Props) {

  // PD sees a flat list of non-admin-only tabs
  const pdTabs: TabDef[] = [
    { key: 'dashboard-home', label: 'Overview' },
    { key: 'group-visits', label: 'Group Visits' },
    { key: 'user-requests', label: 'New User Requests' },
    { key: 'manage-volunteers', label: 'Manage Volunteers' },
    { key: 'manage-orgs', label: 'Manage Organizations' },
  ];

  // Admin sees grouped nav
  const adminGroups: Group[] = [
    {
      label: null,
      items: [{ key: 'dashboard-home', label: 'Overview' }],
    },
    {
      label: 'Onboarding',
      items: [
        { key: 'user-requests', label: 'New User Requests' },
        { key: 'manage-volunteers', label: 'Manage Volunteers' },
      ],
    },
    {
      label: 'Org Visits',
      items: [
        { key: 'group-visits', label: 'Group Visits' },
        { key: 'manage-regions', label: 'Regions' },
        { key: 'manage-orgs', label: 'Manage Organizations' },
      ],
    },
    {
      label: 'Individual Program',
      items: [
        { key: 'manage-individuals', label: 'Manage Individuals' },
        { key: 'appointments', label: 'Individual Appointments' },
        { key: 'chats', label: 'Chat Management', showAlert: unreadCount > 0 },
      ],
    },
    {
      label: 'Settings',
      muted: true,
      items: [
        { key: 'welcome-messages', label: 'Welcome Messages' },
        { key: 'email-testing', label: 'Email & Admin Settings' },
      ],
    },
  ];

  const renderButton = (tab: TabDef, muted?: boolean) => (
    <button
      key={tab.key}
      onClick={() => setActiveTab(tab.key)}
      className={`inline-flex items-center gap-2 whitespace-nowrap text-sm h-9 w-full justify-start rounded-lg px-4 py-2 text-left font-medium transition-colors relative
        ${
          activeTab === tab.key
            ? 'bg-card text-primary'
            : `hover:bg-sidebar-accent hover:text-sidebar-accent-foreground ${muted ? 'text-sidebar-foreground opacity-50' : 'text-sidebar-foreground'}`
        }`}
    >
      {tab.label}
      {alertCounts[tab.key] > 0 && (
        <span className="ml-auto bg-red-500 text-white text-xs font-bold rounded-full px-1.5 py-0.5 min-w-5 text-center leading-none">
          {alertCounts[tab.key]}
        </span>
      )}
      {tab.showAlert && (
        <span className="absolute top-1/2 -translate-y-1/2 right-2 bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
          !
        </span>
      )}
    </button>
  );

  if (role === 'pd') {
    return (
      <nav className="flex flex-col gap-2 text-base">
        {pdTabs.map(tab => renderButton(tab))}
      </nav>
    );
  }

  return (
    <nav className="flex flex-col text-base">
      {adminGroups.map((group, i) => (
        <div key={i}>
          {group.label && (
            <div className={`px-4 pt-4 pb-1 text-[10px] font-semibold uppercase tracking-widest select-none text-sidebar-foreground ${group.muted ? 'opacity-30' : 'opacity-40'}`}>
              {group.label}
            </div>
          )}
          <div className="flex flex-col gap-1">
            {group.items.map(tab => renderButton(tab, group.muted))}
          </div>
        </div>
      ))}
    </nav>
  );
}
