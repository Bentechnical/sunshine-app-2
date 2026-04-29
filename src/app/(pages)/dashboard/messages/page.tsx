// src/app/(pages)/dashboard/messages/page.tsx
'use client';

import { useEffect } from 'react';
import MessagingTab from '@/components/messaging/MessagingTab';
import { useDashboardUI } from '@/contexts/DashboardUIContext';

export default function MessagesPage() {
  const { setHideMobileNav, setNoMobileTopPadding } = useDashboardUI();

  // Reset nav visibility when leaving the messages page (e.g. browser back button)
  useEffect(() => {
    return () => {
      setHideMobileNav(false);
      setNoMobileTopPadding(false);
    };
  }, [setHideMobileNav, setNoMobileTopPadding]);

  return (
    <div className="page-enter contents">
      <MessagingTab
        onActiveChatChange={(isActive) => {
          setHideMobileNav(isActive);
          setNoMobileTopPadding(isActive);
        }}
      />
    </div>
  );
}
