// src/app/(pages)/dashboard/messages/page.tsx
'use client';

import MessagingTab from '@/components/messaging/MessagingTab';
import { useDashboardUI } from '@/contexts/DashboardUIContext';

export default function MessagesPage() {
  const { setHideMobileNav, setNoMobileTopPadding } = useDashboardUI();

  return (
    <MessagingTab
      onActiveChatChange={(isActive) => {
        setHideMobileNav(isActive);
        setNoMobileTopPadding(isActive);
      }}
    />
  );
}
