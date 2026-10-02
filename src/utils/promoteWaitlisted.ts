// Manual waitlist promotion: a PD/admin picks a waitlisted volunteer and moves them to confirmed.
// There is no auto-promotion — PDs usually phone the volunteer first, then promote from the visit page.

import { SupabaseClient } from '@supabase/supabase-js';
import { addAttendeeToEvent, refreshVisitEventDescription } from '@/utils/googleCalendar';
import { sendTransactionalEmail } from '@/app/utils/mailer';
import { getAppUrl } from '@/app/utils/getAppUrl';
import { formatTimeRange, formatVisitDate } from '@/utils/timeZone';

const parkingCoverageLabels: Record<string, string> = {
  free_on_site: 'Free parking on-site',
  reimbursed_on_site: 'Volunteers pay — reimbursed on-site',
  invoice: 'Volunteers pay — added to invoice',
};

// Close gaps in waitlist positions (1, 2, 3…) keeping the existing order.
export async function renumberWaitlist(supabase: SupabaseClient, visitId: number) {
  const { data: remaining } = await supabase
    .from('visit_registrations')
    .select('id, waitlist_position')
    .eq('visit_id', visitId)
    .eq('status', 'waitlisted')
    .order('waitlist_position', { ascending: true });

  for (let i = 0; i < (remaining ?? []).length; i++) {
    if (remaining![i].waitlist_position === i + 1) continue;
    await supabase
      .from('visit_registrations')
      .update({ waitlist_position: i + 1 })
      .eq('id', remaining![i].id);
  }
}

// Moves one waitlisted registration to confirmed, then handles GCal + the promotion email.
// The caller is responsible for checking there is an open spot and for recalcVisitStaffing.
export async function promoteWaitlistedRegistration(
  supabase: SupabaseClient,
  visitId: number,
  registrationId: number
): Promise<{ promoted: boolean; volunteerId?: string }> {
  // Status guard in the update itself so a double-click can't promote twice
  const { data: promotedReg, error: promoteError } = await supabase
    .from('visit_registrations')
    .update({ status: 'confirmed', waitlist_position: null })
    .eq('id', registrationId)
    .eq('visit_id', visitId)
    .eq('status', 'waitlisted')
    .select('id, volunteer_id')
    .maybeSingle();

  if (promoteError || !promotedReg) {
    if (promoteError) console.error('[promoteWaitlisted] Failed to promote:', promoteError);
    return { promoted: false };
  }

  await renumberWaitlist(supabase, visitId);

  // Fetch visit details and volunteer info for email + GCal
  const { data: visit } = await supabase
    .from('visits')
    .select('id, title, guest_org_name, visit_date, start_time, end_time, address, google_calendar_event_id, parking_coverage, parking_instructions, arrival_instructions, accessibility_notes, event_description, guest_contact_name, guest_contact_email, guest_contact_phone')
    .eq('id', visitId)
    .single();

  const { data: volunteer } = await supabase
    .from('users')
    .select('email, first_name')
    .eq('id', promotedReg.volunteer_id)
    .single();

  // Add to Google Calendar event
  if (visit?.google_calendar_event_id && volunteer?.email) {
    (async () => {
      await addAttendeeToEvent(visit.google_calendar_event_id, volunteer.email);
      await refreshVisitEventDescription(visitId);
    })().catch(err => console.error('[promoteWaitlisted] GCal update failed:', err));
  }

  // Send promotion email
  if (volunteer?.email && visit) {
    const visitTitle = visit.title || visit.guest_org_name || 'Therapy Dog Visit';
    const formattedDate = formatVisitDate(visit.visit_date);
    const formattedTime = formatTimeRange(visit.start_time, visit.end_time);
    const visitAddressMapLink = visit.address
      ? `https://maps.google.com/?q=${encodeURIComponent(visit.address)}`
      : null;
    const rawCoverage = visit.parking_coverage as string | null;

    sendTransactionalEmail({
      to: volunteer.email,
      subject: 'A spot opened up — you\'re now a confirmed attendee — Sunshine Therapy Dogs',
      templateName: 'visitWaitlistPromoted',
      data: {
        firstName: volunteer.first_name || 'there',
        visitTitle,
        visitDate: formattedDate,
        visitTime: formattedTime,
        visitAddress: visit.address,
        visitAddressMapLink,
        parkingCoverage: rawCoverage ? (parkingCoverageLabels[rawCoverage] ?? rawCoverage) : null,
        parkingInstructions: visit.parking_instructions || null,
        arrivalInstructions: visit.arrival_instructions || null,
        accessibilityNotes: visit.accessibility_notes || null,
        eventDescription: visit.event_description || null,
        hasLogistics: !!(rawCoverage || visit.parking_instructions || visit.arrival_instructions || visit.accessibility_notes),
        contactName: visit.guest_contact_name || null,
        contactEmail: visit.guest_contact_email || null,
        contactPhone: visit.guest_contact_phone || null,
        dashboardLink: `${getAppUrl()}/dashboard/visits`,
        year: new Date().getFullYear(),
      },
    }).catch(err => console.error('[promoteWaitlisted] Failed to send promotion email:', err));
  }

  console.log(`[promoteWaitlisted] Promoted volunteer ${promotedReg.volunteer_id} for visit ${visitId}`);
  return { promoted: true, volunteerId: promotedReg.volunteer_id };
}
