// src/utils/googleCalendar.ts
// Google Calendar integration via service account.
// All functions are fire-and-forget safe — calendar failures are logged but
// never throw, so they never block the main API operation.

import { google } from 'googleapis';
import { createSupabaseAdminClient } from '@/utils/supabase/admin';

// ─── Color mapping ────────────────────────────────────────────────────────────
// GCal color IDs: 1=Lavender, 2=Sage, 3=Grape, 4=Flamingo, 5=Banana,
// 6=Tangerine, 7=Peacock, 8=Graphite, 9=Blueberry, 10=Basil, 11=Tomato
//
// Color is derived from fee_tier + parking_coverage combination.
// "+parking" color variants apply when parking_coverage = 'invoice' (added to invoice).
const COLOR_MAP: Record<string, string> = {
  tier_500:          '4',  // Flamingo
  tier_500_parking:  '7',  // Peacock
  tier_200:          '3',  // Grape
  tier_200_parking:  '2',  // Sage
  tier_0:            '5',  // Banana
  custom:            '8',  // Graphite
};
const DEFAULT_COLOR = '4'; // Flamingo

function getColorId(feeTier: string | null | undefined, parkingCoverage: string | null | undefined): string {
  if (!feeTier) return DEFAULT_COLOR;
  const hasParkingInvoice = parkingCoverage === 'invoice';
  const key = hasParkingInvoice && (feeTier === 'tier_500' || feeTier === 'tier_200')
    ? `${feeTier}_parking`
    : feeTier;
  return COLOR_MAP[key] ?? DEFAULT_COLOR;
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

function getCalendarClient() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
  const calId = process.env.GOOGLE_CALENDAR_ID;

  console.log('[GCal] Auth check — email:', email ? 'set' : 'MISSING',
    '| key:', rawKey ? `set (${rawKey.length} chars)` : 'MISSING',
    '| calendarId:', calId ? 'set' : 'MISSING');

  if (!email || !rawKey) {
    throw new Error('Google Calendar env vars not configured');
  }

  // .env.local stores \n as literal two-char sequence; convert to real newlines
  const privateKey = rawKey.replace(/\\n/g, '\n');

  const auth = new google.auth.JWT({
    email,
    key: privateKey,
    scopes: ['https://www.googleapis.com/auth/calendar'],
    subject: process.env.GOOGLE_CALENDAR_IMPERSONATE_EMAIL,
  });

  return google.calendar({ version: 'v3', auth });
}

const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID!;

// ─── Description builder ──────────────────────────────────────────────────────

interface VisitForCalendar {
  id: number;
  title: string | null;
  guest_org_name: string | null;
  guest_contact_name: string | null;
  guest_contact_email: string | null;
  guest_contact_phone: string | null;
  address: string;
  audience_age_ranges: string[] | null;
  visitor_count_expected: number | null;
  volunteer_slots: number;
  arrival_instructions: string | null;
  parking_instructions: string | null;
  parking_coverage: string | null;
  event_description: string | null;
  accessibility_notes: string | null;
  fee_tier: string | null;
  fee_amount: number | null;
  requires_vsc: boolean;
  requires_vaccine_record: boolean;
  admin_note: string | null;
}

// Team assigned entries: "FirstName & DogName" pairs for confirmed volunteers
function buildDescription(visit: VisitForCalendar, teamAssigned: string[] = []): string {
  const lines: string[] = [];

  // On-site contact
  if (visit.guest_contact_name) {
    let contactLine = `<b>On-site contact:</b> ${visit.guest_contact_name}`;
    if (visit.guest_contact_phone) contactLine += ` - ${visit.guest_contact_phone}`;
    lines.push(contactLine);
    if (visit.guest_contact_email) lines.push(`  ${visit.guest_contact_email}`);
  }

  // Sunshine contact (hardcoded for now)
  lines.push(`<b>Sunshine contact:</b> Alanna - 416-333-6940`);

  // Visit info (description, audience, visitor count)
  const visitInfoParts: string[] = [];
  if (visit.event_description) visitInfoParts.push(visit.event_description);
  if (visit.visitor_count_expected) visitInfoParts.push(`${visit.visitor_count_expected} expected visitors`);
  if (visit.audience_age_ranges?.length) visitInfoParts.push(visit.audience_age_ranges.join(', '));
  if (visitInfoParts.length) {
    lines.push(`<b>Visit info:</b> ${visitInfoParts.join(' - ')}`);
  }

  // Parking
  if (visit.parking_instructions) {
    lines.push(`<b>Parking:</b> ${visit.parking_instructions}`);
  }

  // Arrival/check-in instructions
  if (visit.arrival_instructions) {
    lines.push(`<b>Arrival/check-in instructions:</b> ${visit.arrival_instructions}`);
  }

  // Accessibility notes
  if (visit.accessibility_notes) {
    lines.push(`<b>Accessibility notes:</b> ${visit.accessibility_notes}`);
  }

  // Team assigned
  const teamLine = teamAssigned.length > 0 ? teamAssigned.join(', ') : 'TBD';
  lines.push(`<b>Team assigned:</b> ${teamLine}`);

  return lines.join('\n');
}

function buildSummary(visit: VisitForCalendar): string {
  const org = visit.guest_org_name ?? 'Organization';
  return visit.title ? `${org} — ${visit.title}` : `${org} — Sunshine Therapy Dog Visit`;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Create a calendar event when a visit is approved.
 * Returns the Google Calendar event ID, or null on failure.
 */
export async function createVisitEvent(
  visit: VisitForCalendar & { start_time: string; end_time: string },
  attendeeEmails: string[],
  teamAssigned?: string[],
): Promise<string | null> {
  console.log(`[GCal] createVisitEvent called for visit ${visit.id}`, {
    attendeeEmails,
    feeTier: visit.fee_tier,
    parkingCoverage: visit.parking_coverage,
    hasStartTime: !!visit.start_time,
    hasEndTime: !!visit.end_time,
    calendarId: CALENDAR_ID,
  });
  try {
    const calendar = getCalendarClient();

    // Create event without attendees first (service accounts can't invite
    // attendees directly without Domain-Wide Delegation), then add them via patch.
    const event = await calendar.events.insert({
      calendarId: CALENDAR_ID,
      sendUpdates: 'none',
      requestBody: {
        summary: buildSummary(visit),
        description: buildDescription(visit, teamAssigned ?? []),
        location: visit.address,
        start: { dateTime: visit.start_time },
        end: { dateTime: visit.end_time },
        colorId: getColorId(visit.fee_tier, visit.parking_coverage),
        guestsCanModify: false,
        guestsCanInviteOthers: false,
        guestsCanSeeOtherGuests: false,
      },
    });

    const eventId = event.data.id ?? null;
    console.log(`[GCal] Created event ${eventId} for visit ${visit.id}`);

    // Add attendees one-by-one after creation
    if (eventId && attendeeEmails.length > 0) {
      for (const email of attendeeEmails.filter(Boolean)) {
        await addAttendeeToEvent(eventId, email);
      }
    }

    return eventId;
  } catch (err: any) {
    console.error(`[GCal] Failed to create event for visit ${visit.id}:`, err.message);
    return null;
  }
}

/**
 * Cancel a calendar event when a visit is cancelled.
 */
export async function cancelVisitEvent(googleCalendarEventId: string): Promise<void> {
  try {
    const calendar = getCalendarClient();
    await calendar.events.patch({
      calendarId: CALENDAR_ID,
      eventId: googleCalendarEventId,
      sendUpdates: 'none',
      requestBody: { status: 'cancelled' },
    });
    console.log(`[GCal] Cancelled event ${googleCalendarEventId}`);
  } catch (err: any) {
    console.error(`[GCal] Failed to cancel event ${googleCalendarEventId}:`, err.message);
  }
}

/**
 * Update event summary/description/time/location when visit details change.
 */
export async function updateVisitEvent(
  googleCalendarEventId: string,
  visit: VisitForCalendar & { start_time: string; end_time: string },
  teamAssigned?: string[],
): Promise<void> {
  try {
    const calendar = getCalendarClient();
    await calendar.events.patch({
      calendarId: CALENDAR_ID,
      eventId: googleCalendarEventId,
      sendUpdates: 'none',
      requestBody: {
        summary: buildSummary(visit),
        description: buildDescription(visit, teamAssigned ?? []),
        location: visit.address,
        start: { dateTime: visit.start_time },
        end: { dateTime: visit.end_time },
        colorId: getColorId(visit.fee_tier, visit.parking_coverage),
      },
    });
    console.log(`[GCal] Updated event ${googleCalendarEventId}`);
  } catch (err: any) {
    console.error(`[GCal] Failed to update event ${googleCalendarEventId}:`, err.message);
  }
}

/**
 * Add a volunteer as an attendee on the calendar event.
 * Fetches the current attendee list first so we don't overwrite existing ones.
 */
export async function addAttendeeToEvent(
  googleCalendarEventId: string,
  email: string,
): Promise<void> {
  try {
    const calendar = getCalendarClient();

    const existing = await calendar.events.get({
      calendarId: CALENDAR_ID,
      eventId: googleCalendarEventId,
    });

    const currentAttendees = existing.data.attendees ?? [];
    const alreadyAdded = currentAttendees.some(a => a.email === email);
    if (alreadyAdded) return;

    await calendar.events.patch({
      calendarId: CALENDAR_ID,
      eventId: googleCalendarEventId,
      sendUpdates: 'none',
      requestBody: {
        attendees: [...currentAttendees, { email }],
      },
    });
    console.log(`[GCal] Added attendee ${email} to event ${googleCalendarEventId}`);
  } catch (err: any) {
    console.error(`[GCal] Failed to add attendee ${email} to event ${googleCalendarEventId}:`, err.message);
  }
}

/**
 * Remove a volunteer from the calendar event attendees.
 */
export async function removeAttendeeFromEvent(
  googleCalendarEventId: string,
  email: string,
): Promise<void> {
  try {
    const calendar = getCalendarClient();

    const existing = await calendar.events.get({
      calendarId: CALENDAR_ID,
      eventId: googleCalendarEventId,
    });

    const currentAttendees = existing.data.attendees ?? [];
    const filtered = currentAttendees.filter(a => a.email !== email);

    if (filtered.length === currentAttendees.length) return; // wasn't there

    await calendar.events.patch({
      calendarId: CALENDAR_ID,
      eventId: googleCalendarEventId,
      sendUpdates: 'none',
      requestBody: { attendees: filtered },
    });
    console.log(`[GCal] Removed attendee ${email} from event ${googleCalendarEventId}`);
  } catch (err: any) {
    console.error(`[GCal] Failed to remove attendee ${email} from event ${googleCalendarEventId}:`, err.message);
  }
}

/**
 * Fetch "FirstName & DogName" strings for all confirmed volunteers on a visit.
 * Used to build the "Team assigned" line in the GCal description.
 */
export async function getTeamAssigned(visitId: number): Promise<string[]> {
  const supabase = createSupabaseAdminClient();

  const { data: regs } = await supabase
    .from('visit_registrations')
    .select('volunteer_id')
    .eq('visit_id', visitId)
    .eq('status', 'confirmed');

  if (!regs?.length) return [];

  const volunteerIds = regs.map(r => r.volunteer_id);

  const { data: volunteers } = await supabase
    .from('users')
    .select('id, first_name')
    .in('id', volunteerIds);

  const { data: dogs } = await supabase
    .from('dogs')
    .select('volunteer_id, dog_name')
    .in('volunteer_id', volunteerIds)
    .neq('status', 'archived');

  const dogByVolunteer = new Map<string, string>();
  for (const dog of dogs ?? []) {
    dogByVolunteer.set(dog.volunteer_id, dog.dog_name);
  }

  return (volunteers ?? []).map(v => {
    const dogName = dogByVolunteer.get(v.id);
    return dogName ? `${v.first_name} & ${dogName}` : v.first_name;
  });
}

/**
 * Convenience: refresh only the description (team assigned) on a GCal event.
 * Fetches visit data and current team, then calls updateVisitEvent.
 */
export async function refreshVisitEventDescription(visitId: number): Promise<void> {
  const supabase = createSupabaseAdminClient();

  const { data: visit } = await supabase
    .from('visits')
    .select(`
      id, title, guest_org_name, guest_contact_name, guest_contact_email, guest_contact_phone,
      address, start_time, end_time, audience_age_ranges, visitor_count_expected,
      event_description, accessibility_notes, volunteer_slots, parking_coverage, parking_instructions,
      arrival_instructions, fee_tier, fee_amount, requires_vsc, requires_vaccine_record,
      admin_note, google_calendar_event_id, status
    `)
    .eq('id', visitId)
    .single();

  if (!visit?.google_calendar_event_id || visit.status !== 'approved') return;

  const teamAssigned = await getTeamAssigned(visitId);
  await updateVisitEvent(visit.google_calendar_event_id, visit as any, teamAssigned);
}
