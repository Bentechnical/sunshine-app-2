// src/utils/pushNotifications.ts
// Server-side FCM push notification sender using firebase-admin

import * as admin from 'firebase-admin';
import { createSupabaseAdminClient } from '@/utils/supabase/admin';

// Initialise Firebase Admin once (singleton pattern for Next.js)
function getFirebaseApp(): admin.app.App {
  if (admin.apps.length > 0) return admin.apps[0]!;

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error('Missing Firebase Admin env vars (FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY)');
  }

  return admin.initializeApp({
    credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
  });
}

interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
}

/**
 * Send a push notification to all active devices for a given user.
 * Silently removes stale/invalid tokens from the database.
 */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
  const supabase = createSupabaseAdminClient();

  const { data: tokens, error } = await supabase
    .from('device_tokens')
    .select('id, push_token, platform')
    .eq('user_id', userId)
    .eq('notifications_enabled', true);

  if (error || !tokens || tokens.length === 0) {
    console.log(`[Push] No tokens found for user ${userId}`, { error: error?.message });
    return;
  }
  console.log(`[Push] Sending to ${tokens.length} device(s) for user ${userId}`);

  let app: admin.app.App;
  try {
    app = getFirebaseApp();
  } catch (err) {
    console.error('[Push] Firebase init error:', err);
    return;
  }

  const messaging = app.messaging();
  const staleTokenIds: string[] = [];

  await Promise.all(
    tokens.map(async ({ id, push_token }) => {
      try {
        await messaging.send({
          token: push_token,
          notification: {
            title: payload.title,
            body: payload.body,
          },
          data: payload.data,
          apns: {
            payload: {
              aps: {
                sound: 'default',
                badge: 1,
              },
            },
          },
          android: {
            priority: 'high',
            notification: {
              sound: 'default',
            },
          },
        });
      } catch (err: any) {
        // FCM error codes that mean the token is no longer valid
        const staleErrors = [
          'messaging/invalid-registration-token',
          'messaging/registration-token-not-registered',
          'messaging/invalid-argument',
        ];
        if (staleErrors.some(code => err?.errorInfo?.code === code)) {
          staleTokenIds.push(id);
        } else {
          console.error('[Push] FCM send error:', err?.errorInfo?.code, err?.message);
        }
      }
    })
  );

  // Clean up stale tokens
  if (staleTokenIds.length > 0) {
    await supabase.from('device_tokens').delete().in('id', staleTokenIds);
    console.log(`[Push] Removed ${staleTokenIds.length} stale token(s) for user ${userId}`);
  }
}
