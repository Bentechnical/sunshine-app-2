// POST /api/admin/visits/[id]/cancel
// Cancels an approved visit. Notifies all confirmed/waitlisted volunteers.
// Optionally notifies the organization.
// Body: { admin_note?: string, notify_org?: boolean }

import { NextRequest, NextResponse } from 'next/server';
import { isDeliverableEmail } from '@/utils/orgEmail';
import { requireAdminOrPd } from '@/utils/requireAdminOrPd';
import { createSupabaseAdminClient } from '@/utils/supabase/admin';
import { cancelVisitEvent } from '@/utils/googleCalendar';
import { sendTransactionalEmail } from '@/app/utils/mailer';
import { getAppUrl } from '@/app/utils/getAppUrl';
import { formatTimeRange, formatVisitDate } from '@/utils/timeZone';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const check = await requireAdminOrPd();
  if ('error' in check) return check.error;

  try {
    const { id } = await params;
    const visitId = parseInt(id, 10);
    if (isNaN(visitId)) {
      return NextResponse.json({ error: 'Invalid visit ID' }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const adminNote = body.admin_note ?? null;
    const notifyOrg = body.notify_org === true;

    const supabase = createSupabaseAdminClient();

    const { data: visit, error: fetchError } = await supabase
      .from('visits')
      .select('id, status, title, guest_org_name, guest_contact_name, guest_contact_email, organization_id, visit_date, start_time, end_time, address, google_calendar_event_id')
      .eq('id', visitId)
      .single();

    if (fetchError || !visit) {
      return NextResponse.json({ error: 'Visit not found' }, { status: 404 });
    }
    if (!['pending_review', 'approved'].includes(visit.status as string)) {
      return NextResponse.json({ error: 'Only pending or approved visits can be cancelled' }, { status: 400 });
    }

    // Fetch active registrations before cancelling
    const { data: registrations } = await supabase
      .from('visit_registrations')
      .select('id, volunteer_id, status')
      .eq('visit_id', visitId)
      .in('status', ['confirmed', 'waitlisted']);

    // Cancel the visit
    const { error } = await supabase
      .from('visits')
      .update({ status: 'cancelled', admin_note: adminNote })
      .eq('id', visitId);

    if (error) {
      console.error('[cancel visit] Supabase error:', error);
      return NextResponse.json({ error: 'Failed to cancel visit' }, { status: 500 });
    }

    // Cancel Google Calendar event
    if ((visit as any).google_calendar_event_id) {
      await cancelVisitEvent((visit as any).google_calendar_event_id);
    }

    // Prepare shared email data
    const visitTitle = visit.title || visit.guest_org_name || 'Therapy Dog Visit';
    const formattedDate = formatVisitDate(visit.visit_date);
    const formattedTime = formatTimeRange(visit.start_time, visit.end_time);
    const year = new Date().getFullYear();

    // Send cancellation emails to all affected volunteers
    if (registrations && registrations.length > 0) {
      const volunteerIds = registrations.map(r => r.volunteer_id);
      const { data: volunteers } = await supabase
        .from('users')
        .select('id, email, first_name')
        .in('id', volunteerIds);

      if (volunteers) {
        for (const vol of volunteers) {
          if (!vol.email) continue;
          sendTransactionalEmail({
            to: vol.email,
            subject: `Visit cancelled — ${visitTitle}`,
            templateName: 'visitCancelledVolunteer',
            data: {
              firstName: vol.first_name || 'there',
              visitTitle,
              visitDate: formattedDate,
              visitTime: formattedTime,
              visitAddress: visit.address,
              dashboardLink: `${getAppUrl()}/dashboard/visits`,
              year,
            },
          }).catch(err => console.error(`[cancel visit] Failed to email volunteer ${vol.id}:`, err));
        }
        console.log(`[cancel visit] Sent cancellation emails to ${volunteers.length} volunteer(s)`);
      }

      // Mark registrations as cancelled
      await supabase
        .from('visit_registrations')
        .update({ status: 'cancelled', cancellation_reason: 'Visit cancelled by administrator', cancelled_at: new Date().toISOString() })
        .eq('visit_id', visitId)
        .in('status', ['confirmed', 'waitlisted']);
    }

    // Optionally notify the organization
    if (notifyOrg) {
      // Try org account email first, then guest contact email
      let orgEmail: string | null = null;
      let orgContactName: string | null = visit.guest_contact_name;

      if (visit.organization_id) {
        const { data: orgUser } = await supabase
          .from('users')
          .select('email, org_name, first_name')
          .eq('id', visit.organization_id)
          .single();
        if (orgUser && isDeliverableEmail(orgUser.email)) {
          orgEmail = orgUser.email;
          orgContactName = orgContactName || orgUser.org_name || orgUser.first_name;
        }
      }

      if (!orgEmail && isDeliverableEmail(visit.guest_contact_email)) {
        orgEmail = visit.guest_contact_email;
      }

      if (orgEmail) {
        sendTransactionalEmail({
          to: orgEmail,
          subject: `Visit cancelled — ${visitTitle}`,
          templateName: 'visitCancelledOrg',
          data: {
            contactName: orgContactName || 'there',
            visitTitle,
            visitDate: formattedDate,
            visitTime: formattedTime,
            visitAddress: visit.address,
            cancellationReason: adminNote || null,
            year,
          },
        }).catch(err => console.error('[cancel visit] Failed to email org:', err));
        console.log(`[cancel visit] Sent org cancellation email to ${orgEmail}`);
      }
    }

    return NextResponse.json({ success: true, notified_count: registrations?.length ?? 0 });
  } catch (err: any) {
    console.error('[cancel visit] Unexpected error:', err.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
