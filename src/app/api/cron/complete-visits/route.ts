// GET /api/cron/complete-visits
// Nightly cleanup: marks approved visits whose end_time has passed as 'completed'.
// The UI does NOT depend on this for accuracy — it uses end_time comparisons directly.
// This job keeps the DB tidy so status reflects reality over time.

import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/utils/supabase/admin';

export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const supabase = createSupabaseAdminClient();
    const now = new Date().toISOString();

    const { data, error } = await supabase
      .from('visits')
      .update({ status: 'completed' })
      .eq('status', 'approved')
      .lte('end_time', now)
      .select('id');

    if (error) {
      console.error('[cron/complete-visits] Supabase error:', error);
      return NextResponse.json({ error: 'Failed to update visits' }, { status: 500 });
    }

    const count = data?.length ?? 0;
    console.log(`[cron/complete-visits] Marked ${count} visit(s) as completed.`);
    return NextResponse.json({ success: true, completed: count });
  } catch (err: any) {
    console.error('[cron/complete-visits] Unexpected error:', err.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
