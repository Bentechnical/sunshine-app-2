// GET /api/cron/visit-staffed-notifications
// Hourly. Emails the org "Your visit is going ahead" once a visit has held at least
// min_volunteers confirmed teams for STAFFED_QUIET_HOURS. The delay absorbs volunteers
// signing up and dropping out in quick succession. Sent at most once per visit
// (visits.staffed_notified_at). See recalcVisitStaffing for how min_reached_at is kept.

import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/utils/supabase/admin';
import { sendVisitStaffedEmail, STAFFED_EMAIL_VISIT_FIELDS, type StaffedEmailVisit } from '@/utils/sendVisitStaffedEmail';

const STAFFED_QUIET_HOURS = 3;

export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const supabase = createSupabaseAdminClient();
    const now = new Date();
    const cutoff = new Date(now.getTime() - STAFFED_QUIET_HOURS * 60 * 60 * 1000);

    const { data: visits, error } = await supabase
      .from('visits')
      .select(`${STAFFED_EMAIL_VISIT_FIELDS}, min_volunteers`)
      .eq('status', 'approved')
      .is('staffed_notified_at', null)
      .not('min_reached_at', 'is', null)
      .lte('min_reached_at', cutoff.toISOString())
      .gt('start_time', now.toISOString());

    if (error) {
      console.error('[cron/visit-staffed-notifications] Failed to fetch visits:', error);
      return NextResponse.json({ error: 'Failed to fetch visits' }, { status: 500 });
    }

    let sent = 0;
    for (const visit of visits ?? []) {
      const { count } = await supabase
        .from('visit_registrations')
        .select('id', { count: 'exact', head: true })
        .eq('visit_id', visit.id)
        .eq('status', 'confirmed');
      if ((count ?? 0) < (visit.min_volunteers as number)) {
        await supabase.from('visits').update({ min_reached_at: null }).eq('id', visit.id);
        continue;
      }

      try {
        const delivered = await sendVisitStaffedEmail(supabase, visit as unknown as StaffedEmailVisit);
        // Mark as handled even with no deliverable recipient so it isn't retried hourly.
        await supabase.from('visits').update({ staffed_notified_at: now.toISOString() }).eq('id', visit.id);
        if (delivered) sent++;
        else console.log(`[cron/visit-staffed-notifications] Visit ${visit.id} has no deliverable org email; skipped.`);
      } catch (err) {
        console.error(`[cron/visit-staffed-notifications] Failed to email org for visit ${visit.id}:`, err);
      }
    }

    console.log(`[cron/visit-staffed-notifications] Checked ${visits?.length ?? 0} visits, sent ${sent} emails.`);
    return NextResponse.json({ success: true, checked: visits?.length ?? 0, sent });
  } catch (err: any) {
    console.error('[cron/visit-staffed-notifications] Unexpected error:', err.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
