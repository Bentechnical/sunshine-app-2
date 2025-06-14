// src/components/layout/MobileNav.tsx
import { Dispatch, SetStateAction } from 'react';
import { ActiveTab } from '@/types/navigation';

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
  const tabs: { key: ActiveTab; label: string }[] =
    role === 'individual'
      ? [
          { key: 'profile', label: 'Profile' },
          { key: 'meet-with-dog', label: 'Meet Dogs' },
          { key: 'my-visits', label: 'Visits' },
          { key: 'messaging', label: 'Messages' },
        ]
      : [
          { key: 'profile', label: 'Profile' },
          { key: 'my-therapy-dog', label: 'My Dog' },
          { key: 'my-visits', label: 'Visits' },
          { key: 'messaging', label: 'Messages' },
        ];

  return (
    <nav
      className="flex justify-around border-t text-sm"
      style={{ backgroundColor: '#0e62ae', borderColor: '#0e62ae' }}
    >
      {tabs.map(({ key, label }) => {
        const isActive = activeTab === key;
        return (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex-1 py-2 ${
              isActive
                ? 'font-semibold'
                : 'opacity-90'
            }`}
            style={{
              color: isActive ? '#f09f1a' : '#ffffff',
              borderTop: isActive ? '2px solid #f09f1a' : '2px solid transparent',
            }}
          >
            {label}
          </button>
        );
      })}
    </nav>
  );
}
