  // src/components/layout/DesktopNav.tsx
  import { Dispatch, SetStateAction } from 'react';
  import { ActiveTab } from '@/types/navigation';

  export interface DesktopNavProps {
    role: 'individual' | 'volunteer' | 'admin';
    activeTab: ActiveTab;
    setActiveTab: Dispatch<SetStateAction<ActiveTab>>;
  }

  export function DesktopNav({ role, activeTab, setActiveTab }: DesktopNavProps) {
    const tabs: { label: string; key: ActiveTab }[] =
      role === 'individual'
        ? [
            { key: 'profile', label: 'My Profile' },
            { key: 'meet-with-dog', label: 'Meet With Dog' },
            { key: 'my-visits', label: 'My Visits' },
            { key: 'messaging', label: 'Messages' },
          ]
        : role === 'volunteer'
        ? [
            { key: 'profile', label: 'My Profile' },
            { key: 'my-therapy-dog', label: 'My Therapy Dog' },
            { key: 'my-visits', label: 'My Visits' },
            { key: 'messaging', label: 'Messages' },
          ]
        : [];

    return (
      <nav className="flex flex-col gap-2 text-base">
        {tabs.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`inline-flex items-center gap-2 whitespace-nowrap text-sm h-9 w-full justify-start rounded-lg px-4 py-2 text-left font-medium transition-colors
              ${
                activeTab === key
                  ? 'bg-[var(--background)] text-[var(--primary)]'
                  : 'text-[var(--sidebar-foreground)] hover:bg-[var(--sidebar-accent)] hover:text-[var(--sidebar-accent-foreground)]'
              }`}
          >
            {label}
          </button>
        ))}
      </nav>
    );
  }
