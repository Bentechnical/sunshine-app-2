// src/hooks/usePushNotifications.ts
// Registers the device for FCM push notifications on native app launch.
// Only runs in Capacitor (iOS/Android) — no-ops in browser.

import { useEffect } from 'react';
import { useUser } from '@clerk/nextjs';

function getOrCreateDeviceId(): string {
  const key = 'sunshine_device_id';
  let id = localStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(key, id);
  }
  return id;
}

export function usePushNotifications() {
  const { user, isLoaded } = useUser();

  useEffect(() => {
    if (!isLoaded || !user) return;

    // Only run in Capacitor native shell
    if (typeof window === 'undefined') return;
    const isNative = !!(window as any).Capacitor?.isNativePlatform?.();
    if (!isNative) return;

    async function register() {
      try {
        const { FirebaseMessaging } = await import('@capacitor-firebase/messaging');

        // Request permission — returns 'granted', 'denied', or 'prompt'
        const { receive } = await FirebaseMessaging.requestPermissions();
        if (receive !== 'granted') {
          console.log('[Push] Permission not granted:', receive);
          return;
        }

        // Get FCM token
        const { token } = await FirebaseMessaging.getToken();
        if (!token) {
          console.log('[Push] No token returned');
          return;
        }

        const device_id = getOrCreateDeviceId();
        const platform = (window as any).Capacitor.getPlatform(); // 'ios' or 'android'

        await fetch('/api/push/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ push_token: token, device_id, platform }),
        });

        console.log('[Push] Token registered');

        // Re-register if token rotates
        FirebaseMessaging.addListener('tokenReceived', async ({ token: newToken }) => {
          await fetch('/api/push/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ push_token: newToken, device_id, platform }),
          });
          console.log('[Push] Token refreshed');
        });

      } catch (err) {
        console.error('[Push] Registration error:', err);
      }
    }

    register();
  }, [isLoaded, user?.id]);
}
