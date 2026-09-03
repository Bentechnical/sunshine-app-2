// Promotes the next waitlisted volunteer to confirmed for a visit.
// Called from both volunteer self-cancellation and admin cancellation routes.

import { SupabaseClient } from '@supabase/supabase-js';
import { addAttendeeToEvent, refreshVisitEventDescription } from '@/utils/googleCalendar';
import { sendTransactionalEmail } from '@/app/utils/mailer';
import { getAppUrl } from '@/app/utils/getAppUrl';

const parkingCoverageLabels: Record<string, string> = {
  free_on_site: 'Free parking on-site',
  reimbursed_on_site: 'Volunteers pay — reimbursed on-site',
  invoice: 'Volunteers pay — added to invoice',
};

export async function promoteNextWaitlisted(
  supabase: SupabaseClient,
  visitId: number
): Promise<{ promoted: boolean; volunteerId?: string }> {
  // Find next waitlisted volunteer
  const { data: nextWaitlisted } = await supabase
    .from('visit_registrations')
    .select('id, volunteer_id, waitlist_position')
    .eq('visit_id', visitId)
    .eq('status', 'waitlisted')
    .order('waitlist_position', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!nextWaitlisted) {
    return { promoted: false };
  }

  // Promote: update status to confirmed
  const { error: promoteError } = await supabase
    .from('visit_registrations')
    .update({ status: 'confirmed', waitlist_position: null })
    .eq('id', nextWaitlisted.id);

  if (promoteError) {
    console.error('[promoteNextWaitlisted] Failed to promote:', promoteError);
    return { promoted: false };
  }

  // Re-number remaining waitlisted volunteers
  const { data: remaining } = await supabase
    .from('visit_registrations')
    .select('id')
    .eq('visit_id', visitId)
    .eq('status', 'waitlisted')
    .order('waitlist_position', { ascending: true });

  if (remaining && remaining.length > 0) {
    for (let i = 0; i < remaining.length; i++) {
      await supabase
        .from('visit_registrations')
        .update({ waitlist_position: i + 1 })
        .eq('id', remaining[i].id);
    }
  }

  // Fetch visit details and volunteer info for email + GCal
  const { data: visit } = await supabase
    .from('visits')
    .select('id, title, guest_org_name, visit_date, start_time, end_time, address, google_calendar_event_id, parking_coverage, parking_instructions, arrival_instructions, accessibility_notes, event_description, guest_contact_name, guest_contact_email, guest_contact_phone')
    .eq('id', visitId)
    .single();

  const { data: volunteer } = await supabase
    .from('users')
    .select('email, first_name')
    .eq('id', nextWaitlisted.volunteer_id)
    .single();

  // Add to Google Calendar event
  if (visit?.google_calendar_event_id && volunteer?.email) {
    (async () => {
      await addAttendeeToEvent(visit.google_calendar_event_id, volunteer.email);
      await refreshVisitEventDescription(visitId);
    })().catch(err => console.error('[promoteNextWaitlisted] GCal update failed:', err));
  }

  // Send promotion email
  if (volunteer?.email && visit) {
    const visitTitle = visit.title || visit.guest_org_name || 'Therapy Dog Visit';
    const formattedDate = new Date(visit.visit_date).toLocaleDateString('en-CA', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });
    const formattedTime = [
      new Date(visit.start_time).toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit', hour12: true }),
      new Date(visit.end_time).toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit', hour12: true }),
    ].join(' – ');
    const visitAddressMapLink = visit.address
      ? `https://maps.google.com/?q=${encodeURIComponent(visit.address)}`
      : null;
    const rawCoverage = visit.parking_coverage as string | null;

    sendTransactionalEmail({
      to: volunteer.email,
      subject: 'A spot opened up — you\'re confirmed! — Sunshine Therapy Dogs',
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
        contactName: visit.guest_contact_name || null,
        contactEmail: visit.guest_contact_email || null,
        contactPhone: visit.guest_contact_phone || null,
        dashboardLink: `${getAppUrl()}/dashboard/visits`,
        year: new Date().getFullYear(),
      },
    }).catch(err => console.error('[promoteNextWaitlisted] Failed to send promotion email:', err));
  }

  console.log(`[promoteNextWaitlisted] Promoted volunteer ${nextWaitlisted.volunteer_id} for visit ${visitId}`);
  return { promoted: true, volunteerId: nextWaitlisted.volunteer_id };
}
