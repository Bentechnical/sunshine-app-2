// src/components/layout/CapacitorDeepLinkHandler.tsx
// Handles incoming deep links on native (Capacitor) builds.
// When OAuth completes, Chrome redirects to clerk://com.sunshinetherapydogs.app.callback?[params].
// Android opens the Capacitor app via the intent filter, this component catches the
// URL and navigates the WebView to /sso-callback?[params] so ClerkProvider can finish auth.
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function CapacitorDeepLinkHandler() {
  const router = useRouter();

  useEffect(() => {
    const isNative =
      typeof window !== 'undefined' &&
      !!(window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.();

    if (!isNative) return;

    let removeListener: (() => void) | undefined;

    import('@capacitor/app').then(({ App }) => {
      App.addListener('appUrlOpen', (data) => {
        const url = data.url;
        if (url.startsWith('clerk://')) {
          const queryStart = url.indexOf('?');
          const queryString = queryStart !== -1 ? url.slice(queryStart) : '';
          router.push(`/sso-callback${queryString}`);
        }
      }).then((listener) => {
        removeListener = () => listener.remove();
      });
    });

    return () => {
      removeListener?.();
    };
  }, [router]);

  return null;
}
