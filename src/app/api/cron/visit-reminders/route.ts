// GET /api/cron/visit-reminders
// Sends reminder emails to volunteers ~48 hours before their visit start_time.
// Runs every 6 hours via Vercel Cron. Uses a `reminder_sent_at` column on
// visit_registrations to avoid duplicate sends.

import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/utils/supabase/admin';
import { sendTransactionalEmail } from '@/app/utils/mailer';
import { getAppUrl } from '@/app/utils/getAppUrl';

const PARKING_COVERAGE_LABELS: Record<string, string> = {
  free_on_site: 'Free parking on-site',
  reimbursed_on_site: 'Volunteers pay — reimbursed on-site',
  invoice: 'Volunteers pay — added to invoice',
};

export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const supabase = createSupabaseAdminClient();

    const now = new Date();
    // Window: visits starting between now and 54 hours from now.
    // With a 6-hour cron interval this ensures we catch visits in the ~48h window
    // even if timing drifts slightly.
    const windowEnd = new Date(now.getTime() + 54 * 60 * 60 * 1000);

    // Find approved visits within the reminder window
    const { data: visits, error: visitError } = await supabase
      .from('visits')
      .select(`
        id, title, guest_org_name, visit_date, start_time, end_time, address,
        parking_coverage, parking_instructions, arrival_instructions,
        accessibility_notes, event_description,
        guest_contact_name, guest_contact_email, guest_contact_phone
      `)
      .eq('status', 'approved')
      .gt('start_time', now.toISOString())
      .lte('start_time', windowEnd.toISOString());

    if (visitError) {
      console.error('[cron/visit-reminders] Failed to fetch visits:', visitError);
      return NextResponse.json({ error: 'Failed to fetch visits' }, { status: 500 });
    }

    if (!visits || visits.length === 0) {
      console.log('[cron/visit-reminders] No visits in reminder window.');
      return NextResponse.json({ success: true, reminders_sent: 0 });
    }

    let totalSent = 0;

    for (const visit of visits) {
      // Get confirmed registrations that haven't been reminded yet
      const { data: registrations, error: regError } = await supabase
        .from('visit_registrations')
        .select('id, volunteer_id, users:volunteer_id(email, first_name)')
        .eq('visit_id', visit.id)
        .eq('status', 'confirmed')
        .is('reminder_sent_at', null);

      if (regError) {
        console.error(`[cron/visit-reminders] Failed to fetch registrations for visit ${visit.id}:`, regError);
        continue;
      }

      if (!registrations || registrations.length === 0) continue;

      const visitTitle = visit.title || visit.guest_org_name || 'Therapy Dog Visit';
      const formattedDate = new Date(visit.visit_date).toLocaleDateString('en-CA', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      });
      const formattedTime = [
        new Date(visit.start_time).toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit', hour12: true }),
        new Date(visit.end_time).toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit', hour12: true }),
      ].join(' – ');

      const rawCoverage = visit.parking_coverage as string | null;
      const visitAddressMapLink = visit.address
        ? `https://maps.google.com/?q=${encodeURIComponent(visit.address)}`
        : null;

      for (const reg of registrations) {
        const user = reg.users as any;
        if (!user?.email) continue;

        try {
          await sendTransactionalEmail({
            to: user.email,
            subject: `Reminder: ${visitTitle} is coming up — Sunshine Therapy Dogs`,
            templateName: 'visitReminder',
            data: {
              firstName: user.first_name || 'there',
              visitTitle,
              visitDate: formattedDate,
              visitTime: formattedTime,
              visitAddress: visit.address,
              visitAddressMapLink,
              parkingCoverage: rawCoverage ? (PARKING_COVERAGE_LABELS[rawCoverage] ?? rawCoverage) : null,
              parkingInstructions: visit.parking_instructions || null,
              arrivalInstructions: visit.arrival_instructions || null,
              accessibilityNotes: visit.accessibility_notes || null,
              eventDescription: visit.event_description || null,
              contactName: visit.guest_contact_name || null,
              contactEmail: visit.guest_contact_email || null,
              contactPhone: visit.guest_contact_phone || null,
              dashboardLink: `${getAppUrl()}/dashboard/visits`,
              year: new Date().getFullYear(),
            },
          });

          // Mark reminder as sent
          await supabase
            .from('visit_registrations')
            .update({ reminder_sent_at: new Date().toISOString() })
            .eq('id', reg.id);

          totalSent++;
        } catch (err) {
          console.error(`[cron/visit-reminders] Failed to send reminder for reg ${reg.id}:`, err);
        }
      }
    }

    console.log(`[cron/visit-reminders] Sent ${totalSent} reminder(s).`);
    return NextResponse.json({ success: true, reminders_sent: totalSent });
  } catch (err: any) {
    console.error('[cron/visit-reminders] Unexpected error:', err.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
