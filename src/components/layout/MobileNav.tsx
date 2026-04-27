// src/components/layout/MobileNav.tsx
'use client';

import { useRouter, usePathname } from 'next/navigation';
import { Home, PawPrint, MessageCircle, CalendarCheck } from 'lucide-react';
import { useNavNotifications } from '@/hooks/useNavNotifications';

interface MobileNavProps {
  role: 'individual' | 'volunteer';
  profileImage: string;
}

export default function MobileNav({ role }: MobileNavProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { hasUnreadMessages } = useNavNotifications();

  const tabs: { path: string; label: string; icon: React.ReactNode; showAlert?: boolean }[] =
    role === 'individual'
      ? [
          { path: '/dashboard', label: 'Home', icon: <Home size={20} /> },
          { path: '/dashboard/meet', label: 'Meet a Dog', icon: <PawPrint size={20} /> },
          { path: '/dashboard/visits', label: 'Visits', icon: <CalendarCheck size={20} /> },
          { path: '/dashboard/messages', label: 'Messages', icon: <MessageCircle size={20} />, showAlert: hasUnreadMessages },
        ]
      : [
          { path: '/dashboard', label: 'Home', icon: <Home size={20} /> },
          { path: '/dashboard/connect', label: 'Connect', icon: <PawPrint size={20} /> },
          { path: '/dashboard/visits', label: 'Visits', icon: <CalendarCheck size={20} /> },
          { path: '/dashboard/messages', label: 'Messages', icon: <MessageCircle size={20} />, showAlert: hasUnreadMessages },
        ];

  const isActive = (path: string) =>
    path === '/dashboard' ? pathname === '/dashboard' : pathname.startsWith(path);

  const isNative = typeof window !== 'undefined' && !!(window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.();

  return (
    <nav
      className="bg-white border-t border-gray-200 px-4 pt-2"
      style={isNative ? { paddingBottom: 'calc(env(safe-area-inset-bottom) + 8px)' } : { paddingBottom: '8px' }}
    >
      <div className="flex justify-around items-center">
        {tabs.map(({ path, label, icon, showAlert }) => (
          <button
            key={path}
            onClick={() => router.push(path)}
            className={`flex flex-col items-center gap-1 py-2 px-3 rounded-lg transition-colors relative ${
              isActive(path)
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
