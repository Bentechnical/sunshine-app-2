// src/app/api/push/register/route.ts
// Called on app launch to upsert the device's FCM token into device_tokens

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createSupabaseAdminClient } from '@/utils/supabase/admin';

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { push_token, device_id, platform } = body;

    if (!push_token || !device_id || !platform) {
      return NextResponse.json(
        { success: false, error: 'Missing push_token, device_id, or platform' },
        { status: 400 }
      );
    }

    if (!['ios', 'android'].includes(platform)) {
      return NextResponse.json(
        { success: false, error: 'platform must be ios or android' },
        { status: 400 }
      );
    }

    const environment = process.env.NODE_ENV === 'production' ? 'production' : 'development';

    const supabase = createSupabaseAdminClient();

    const { error } = await supabase
      .from('device_tokens')
      .upsert(
        {
          user_id: userId,
          device_id,
          push_token,
          platform,
          environment,
          notifications_enabled: true,
          last_seen_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,device_id' }
      );

    if (error) {
      console.error('[Push Register] Supabase error:', error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    console.log(`[Push Register] Token registered for user ${userId} on ${platform}`);
    return NextResponse.json({ success: true });

  } catch (err) {
    console.error('[Push Register] Unexpected error:', err);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
