// src/components/layout/DesktopNav.tsx
'use client';

import { useRouter, usePathname } from 'next/navigation';
import { useNavNotifications } from '@/hooks/useNavNotifications';

export interface DesktopNavProps {
  role: 'individual' | 'volunteer' | 'admin';
}

export function DesktopNav({ role }: DesktopNavProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { hasUnreadMessages } = useNavNotifications();

  const tabs: { label: string; path: string; showAlert?: boolean }[] =
    role === 'individual'
      ? [
          { path: '/dashboard', label: 'Home' },
          { path: '/dashboard/meet', label: 'Meet a Dog' },
          { path: '/dashboard/visits', label: 'My Visits' },
          { path: '/dashboard/messages', label: 'Messages', showAlert: hasUnreadMessages },
        ]
      : role === 'volunteer'
      ? [
          { path: '/dashboard', label: 'Home' },
          { path: '/dashboard/connect', label: 'Connect with People' },
          { path: '/dashboard/visits', label: 'My Visits' },
          { path: '/dashboard/messages', label: 'Messages', showAlert: hasUnreadMessages },
        ]
      : [];

  const isActive = (path: string) =>
    path === '/dashboard' ? pathname === '/dashboard' : pathname.startsWith(path);

  return (
    <nav className="flex flex-col gap-2 text-base">
      {tabs.map(({ path, label, showAlert }) => (
        <button
          key={path}
          onClick={() => router.push(path)}
          className={`inline-flex items-center gap-2 whitespace-nowrap text-sm h-9 w-full justify-start rounded-lg px-4 py-2 text-left font-medium transition-colors relative
            ${
              isActive(path)
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
