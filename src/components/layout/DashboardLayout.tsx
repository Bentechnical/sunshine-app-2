// src/components/layout/DashboardLayout.tsx
'use client';

import { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { ActiveTab } from '@/types/navigation';
import { DesktopNav } from './DesktopNav';
import DesktopNavAdmin from './DesktopNavAdmin';
import MobileNav from './MobileNav';
import MobileNavAdmin from './MobileNavAdmin';
import { SignOutButton } from '@clerk/clerk-react';
import { UnreadCountProvider } from '@/contexts/UnreadCountContext';

// Maps URL pathnames to ActiveTab keys (used by admin nav and layout styling)
export function pathnameToActiveTab(pathname: string): ActiveTab {
  if (pathname.startsWith('/dashboard/messages')) return 'messaging';
  if (pathname.startsWith('/dashboard/visits')) return 'my-visits';
  if (pathname.startsWith('/dashboard/meet')) return 'meet-with-dog';
  if (pathname.startsWith('/dashboard/connect')) return 'connect-with-people';
  return 'dashboard-home';
}

interface DashboardLayoutProps {
  profileImage: string;
  role: 'individual' | 'volunteer' | 'admin' | 'pd' | 'organization';
  children: ReactNode;
  hideMobileNav?: boolean;
  noMobileTopPadding?: boolean;
  // Admin page passes these directly since it manages its own tab state
  activeTab?: ActiveTab;
  setActiveTab?: React.Dispatch<React.SetStateAction<ActiveTab>>;
  refreshTrigger?: number;
}

function getMainContentClasses(activeTab: ActiveTab, noMobileTopPadding: boolean): string {
  const baseClasses = 'relative flex-1';
  const overflowClasses = activeTab === 'messaging' ? 'overflow-hidden' : 'overflow-y-auto';
  const paddingTopClasses = noMobileTopPadding ? 'pt-0 md:pt-0' : 'pt-12 md:pt-0';
  const spacingClasses = activeTab === 'messaging'
    ? 'px-0 md:px-8 bg-white md:bg-transparent'
    : 'pb-4 px-2 md:px-8';

  return `${baseClasses} ${overflowClasses} ${paddingTopClasses} ${spacingClasses}`;
}

export default function DashboardLayout({
  profileImage,
  role,
  children,
  hideMobileNav = false,
  noMobileTopPadding = false,
  activeTab: adminActiveTab,
  setActiveTab: adminSetActiveTab,
  refreshTrigger,
}: DashboardLayoutProps) {
  const pathname = usePathname();
  const activeTab = adminActiveTab ?? pathnameToActiveTab(pathname);

  const isNative = typeof window !== 'undefined' && !!(window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.();

  return (
    <UnreadCountProvider>
      <div className="flex h-screen relative" data-active-tab={activeTab}>
        {/* Desktop sidebar */}
        <aside className="hidden md:flex flex-col h-screen w-64 bg-[var(--sidebar)] text-[var(--sidebar-foreground)] p-6 shadow-lg font-sans z-20">
          <div className="mb-8 flex justify-center relative w-full h-16">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              alt="Sunshine Therapy Dogs Logo"
              src="/images/sunshine-logo-white.png"
              className="absolute inset-0 w-full h-full object-contain"
            />
          </div>

          {(role === 'admin' || role === 'pd') ? (
            <>
              <div className="mb-6 py-2 bg-red-600 text-white text-center rounded-lg -mx-6">
                <span className="text-sm font-medium">{role === 'pd' ? 'Program Director' : 'Admin Mode'}</span>
              </div>
              <DesktopNavAdmin activeTab={activeTab} setActiveTab={adminSetActiveTab!} refreshTrigger={refreshTrigger} />
            </>
          ) : (
            <DesktopNav role={role as 'individual' | 'volunteer'} />
          )}

          <div className="mt-auto pt-6 flex flex-col gap-2">
            {role !== 'admin' && (
              <a
                href={
                  role === 'volunteer'
                    ? '/guides/volunteer-guide.pdf'
                    : '/guides/user-guide.pdf'
                }
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center w-full rounded-md text-sm font-medium bg-white text-gray-800 hover:bg-gray-100 transition-colors px-4 py-2"
              >
                User Guide
              </a>
            )}
            <SignOutButton>
              <button
                data-slot="button"
                className="inline-flex items-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] bg-red-600 hover:bg-red-700 text-white w-full px-4 py-2"
              >
                Log Out
              </button>
            </SignOutButton>
          </div>
        </aside>

        {/* Main / Mobile */}
        <main className="relative z-10 flex-1 flex flex-col h-full overflow-y-auto">
          {/* Mobile top bar */}
          <div
            className="md:hidden fixed top-0 inset-x-0 z-50 shadow-sm"
            style={{ backgroundColor: '#0e62ae', ...(isNative ? { paddingTop: 'env(safe-area-inset-top)' } : {}) }}
          >
            <div className="flex items-center justify-between px-4 py-2">
              <div className="relative h-8 w-24">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  alt="Sunshine logo"
                  src="/images/sunshine-logo-small.png"
                  className="absolute inset-0 w-full h-full object-contain"
                />
              </div>
            </div>
          </div>

          <div
            className={getMainContentClasses(activeTab, noMobileTopPadding)}
            style={isNative && !noMobileTopPadding ? { paddingTop: 'calc(env(safe-area-inset-top) + 3rem)' } : undefined}
          >
            {children}
          </div>
        </main>

        {/* Mobile bottom nav */}
        {!hideMobileNav && (
          <div className="md:hidden fixed inset-x-0 bottom-0 z-50">
            {(role === 'admin' || role === 'pd') ? (
              <MobileNavAdmin
                activeTab={activeTab}
                setActiveTab={adminSetActiveTab!}
                profileImage={profileImage}
                refreshTrigger={refreshTrigger}
              />
            ) : (
              <MobileNav role={role as 'individual' | 'volunteer'} profileImage={profileImage} />
            )}
          </div>
        )}
      </div>
    </UnreadCountProvider>
  );
}
