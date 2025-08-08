// src/components/layout/DashboardLayout.tsx
'use client';

import { ReactNode } from 'react';
import { ActiveTab } from '@/types/navigation';
import { DesktopNav } from './DesktopNav';
import DesktopNavAdmin from './DesktopNavAdmin'; // ✅ New
import MobileNav from './MobileNav';
import MobileNavAdmin from './MobileNavAdmin'; // ✅ New
import { SignOutButton } from '@clerk/clerk-react';

interface DashboardLayoutProps {
  profileImage: string;
  role: 'individual' | 'volunteer' | 'admin';
  activeTab: ActiveTab;
  setActiveTab: React.Dispatch<React.SetStateAction<ActiveTab>>;
  children: ReactNode;
  refreshTrigger?: number;
}

export default function DashboardLayout({
  profileImage,
  role,
  activeTab,
  setActiveTab,
  children,
  refreshTrigger,
}: DashboardLayoutProps) {
  return (
    <div className="flex h-screen relative">
      {/* ------------ Desktop sidebar ------------ */}
      <aside className="hidden md:flex flex-col h-screen w-64 bg-[var(--sidebar)] text-[var(--sidebar-foreground)] p-6 shadow-lg font-sans z-20">
        <div className="mb-8 flex justify-center relative w-full h-16">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            alt="Sunshine Therapy Dogs Logo"
            src="/images/sunshine-logo-white.png"
            className="absolute inset-0 w-full h-full object-contain"
          />
        </div>

        {/* ✅ Role-based nav */}
        {role === 'admin' ? (
          <>
            {/* Admin Mode Banner */}
            <div className="mb-6 py-2 bg-red-600 text-white text-center rounded-lg -mx-6">
              <span className="text-sm font-medium">Admin Mode</span>
            </div>
            <DesktopNavAdmin activeTab={activeTab} setActiveTab={setActiveTab} refreshTrigger={refreshTrigger} />
          </>
        ) : (
          <DesktopNav role={role} activeTab={activeTab} setActiveTab={setActiveTab} />
        )}

        <div className="mt-auto pt-6">
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

      {/* ------------ Main / Mobile ------------ */}
      <main className="relative z-10 flex-1 flex flex-col overflow-y-auto">
        {/* Mobile top bar */}
        <div
          className="md:hidden fixed top-0 inset-x-0 z-50 flex items-center justify-between px-4 py-2 shadow-sm"
          style={{ backgroundColor: '#0e62ae' }}
        >
          <div className="relative h-8 w-24">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              alt="Sunshine logo"
              src="/images/sunshine-logo-small.png"
              className="absolute inset-0 w-full h-full object-contain"
            />
          </div>
        </div>

        {/* Page content (offset for top + bottom bars on mobile) */}
        <div className="relative flex-1 overflow-y-auto pt-16 md:pt-0 pb-4 px-2 md:px-8">
          {children}
        </div>
      </main>

      {/* Mobile bottom nav wrapper (optional: restrict this to non-admins) */}
      <div className="md:hidden fixed inset-x-0 bottom-0 z-50">
        {role === 'admin' ? (
          <MobileNavAdmin
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            profileImage={profileImage}
            refreshTrigger={refreshTrigger}
          />
        ) : (
          <MobileNav
            role={role}
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            profileImage={profileImage}
          />
        )}
      </div>
    </div>
  );
}
