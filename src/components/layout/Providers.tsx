// src/components/layout/Providers.tsx
// Client-side providers that wrap the entire app.
// Kept separate from the root layout so layout.tsx can remain a server component.
'use client';

import { ReactNode } from 'react';
import { UserProfileProvider } from '@/contexts/UserProfileContext';
import { usePushNotifications } from '@/hooks/usePushNotifications';

function PushNotificationRegistrar() {
  usePushNotifications();
  return null;
}

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <UserProfileProvider>
      <PushNotificationRegistrar />
      {children}
    </UserProfileProvider>
  );
}
