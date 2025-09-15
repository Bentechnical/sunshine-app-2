  // src/components/layout/DesktopNav.tsx
  import { Dispatch, SetStateAction } from 'react';
  import { ActiveTab } from '@/types/navigation';
  import { useUserChatNotifications } from '@/hooks/useUserChatNotifications';

  export interface DesktopNavProps {
    role: 'individual' | 'volunteer' | 'admin';
    activeTab: ActiveTab;
    setActiveTab: Dispatch<SetStateAction<ActiveTab>>;
  }

  export function DesktopNav({ role, activeTab, setActiveTab }: DesktopNavProps) {
    const { hasUnreadMessages } = useUserChatNotifications(activeTab);

    // Debug logging for navigation notifications
    console.log('[DesktopNav] Notification state:', {
      role,
      activeTab,
      hasUnreadMessages,
      timestamp: new Date().toISOString()
    });

    const tabs: { label: string; key: ActiveTab; showAlert?: boolean }[] =
    role === 'individual'
      ? [
          { key: 'dashboard-home', label: 'Home' },
          { key: 'meet-with-dog', label: 'Meet With Dog' },
          { key: 'my-visits', label: 'My Visits' },
          { key: 'messaging', label: 'Messages', showAlert: hasUnreadMessages },
        ]
      : role === 'volunteer'
      ? [
          { key: 'dashboard-home', label: 'Home' },
          { key: 'my-therapy-dog', label: 'Set Availability' },
          { key: 'my-visits', label: 'My Visits' },
          { key: 'messaging', label: 'Messages', showAlert: hasUnreadMessages },
        ]
      : [];

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
