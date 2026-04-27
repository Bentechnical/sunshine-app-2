// src/contexts/DashboardUIContext.tsx
// Provides UI state that needs to cross the layout/page boundary in the dashboard.
// Example: MessagingTab (in a sub-page) needs to signal to the layout to hide the mobile nav.
'use client';

import { createContext, useContext, useState, ReactNode } from 'react';

interface DashboardUIContextValue {
  hideMobileNav: boolean;
  setHideMobileNav: (hide: boolean) => void;
  noMobileTopPadding: boolean;
  setNoMobileTopPadding: (hide: boolean) => void;
}

const DashboardUIContext = createContext<DashboardUIContextValue | null>(null);

export function DashboardUIProvider({ children }: { children: ReactNode }) {
  const [hideMobileNav, setHideMobileNav] = useState(false);
  const [noMobileTopPadding, setNoMobileTopPadding] = useState(false);

  return (
    <DashboardUIContext.Provider value={{ hideMobileNav, setHideMobileNav, noMobileTopPadding, setNoMobileTopPadding }}>
      {children}
    </DashboardUIContext.Provider>
  );
}

export function useDashboardUI() {
  const ctx = useContext(DashboardUIContext);
  if (!ctx) throw new Error('useDashboardUI must be used within DashboardUIProvider');
  return ctx;
}
