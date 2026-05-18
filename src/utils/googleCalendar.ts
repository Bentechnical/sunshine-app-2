// src/utils/googleCalendar.ts
// Google Calendar integration via service account.
// All functions are fire-and-forget safe — calendar failures are logged but
// never throw, so they never block the main API operation.

import { google } from 'googleapis';

// ─── Color mapping ────────────────────────────────────────────────────────────
// GCal color IDs: 1=Lavender, 2=Sage, 3=Grape, 4=Flamingo, 5=Banana,
// 6=Tangerine, 7=Peacock, 8=Graphite, 9=Blueberry, 10=Basil, 11=Tomato
//
// TODO: Update these mappings once production calendar color conventions are confirmed.

const FEE_TIER_COLOR: Record<string, string> = {
  free:     '2',  // Sage
  standard: '7',  // Peacock
  reduced:  '5',  // Banana
  custom:   '6',  // Tangerine
};
const DEFAULT_COLOR = '7'; // Peacock

function getColorId(feeTier: string | null | undefined): string {
  return feeTier ? (FEE_TIER_COLOR[feeTier] ?? DEFAULT_COLOR) : DEFAULT_COLOR;
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

function getCalendarClient() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;

  if (!email || !rawKey) {
    throw new Error('Google Calendar env vars not configured');
  }

  // .env.local stores \n as literal two-char sequence; convert to real newlines
  const privateKey = rawKey.replace(/\\n/g, '\n');

  const auth = new google.auth.GoogleAuth({
    credentials: { client_email: email, private_key: privateKey },
    scopes: ['https://www.googleapis.com/auth/calendar'],
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
  special_needs_notes: string | null;
  fee_tier: string | null;
  fee_amount: number | null;
  requires_vsc: boolean;
  requires_vaccine_record: boolean;
  admin_note: string | null;
}

function buildDescription(visit: VisitForCalendar, confirmedVolunteers: string[] = []): string {
  const lines: string[] = [];

  lines.push(`Organization: ${visit.guest_org_name ?? '—'}`);
  if (visit.guest_contact_name) lines.push(`Contact: ${visit.guest_contact_name}`);
  if (visit.guest_contact_phone) lines.push(`Phone: ${visit.guest_contact_phone}`);
  if (visit.guest_contact_email) lines.push(`Email: ${visit.guest_contact_email}`);

  lines.push('');
  lines.push(`Location: ${visit.address}`);

  if (visit.audience_age_ranges?.length) {
    lines.push(`Audience: ${visit.audience_age_ranges.join(', ')}`);
  }
  if (visit.visitor_count_expected) {
    lines.push(`Expected visitors: ${visit.visitor_count_expected}`);
  }
  lines.push(`Volunteer slots: ${visit.volunteer_slots}`);

  if (visit.arrival_instructions) {
    lines.push('');
    lines.push(`Arrival: ${visit.arrival_instructions}`);
  }
  if (visit.parking_instructions) {
    lines.push(`Parking: ${visit.parking_instructions}`);
  } else if (visit.parking_coverage) {
    lines.push(`Parking: ${visit.parking_coverage.replace(/_/g, ' ')}`);
  }
  if (visit.special_needs_notes) {
    lines.push(`Special needs: ${visit.special_needs_notes}`);
  }

  if (visit.fee_tier) {
    const feeStr = visit.fee_tier === 'custom' && visit.fee_amount
      ? `Custom ($${visit.fee_amount})`
      : visit.fee_tier.charAt(0).toUpperCase() + visit.fee_tier.slice(1);
    lines.push('');
    lines.push(`Fee: ${feeStr}`);
  }

  const reqs: string[] = [];
  if (visit.requires_vsc) reqs.push('VSC');
  if (visit.requires_vaccine_record) reqs.push('Vaccine record');
  if (reqs.length) lines.push(`Requirements: ${reqs.join(', ')}`);

  if (confirmedVolunteers.length) {
    lines.push('');
    lines.push(`Confirmed volunteers: ${confirmedVolunteers.join(', ')}`);
  }

  if (visit.admin_note) {
    lines.push('');
    lines.push(`Note: ${visit.admin_note}`);
  }

  lines.push('');
  lines.push(`Sunshine App visit ID: ${visit.id}`);

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
  visit: VisitForCalendar & { start_time: string; end_time: string; fee_tier: string | null },
  orgContactEmail: string | null,
): Promise<string | null> {
  try {
    const calendar = getCalendarClient();

    const attendees: { email: string }[] = [];
    if (orgContactEmail) attendees.push({ email: orgContactEmail });

    const event = await calendar.events.insert({
      calendarId: CALENDAR_ID,
      requestBody: {
        summary: buildSummary(visit),
        description: buildDescription(visit),
        location: visit.address,
        start: { dateTime: visit.start_time },
        end: { dateTime: visit.end_time },
        colorId: getColorId(visit.fee_tier),
        attendees,
      },
    });

    const eventId = event.data.id ?? null;
    console.log(`[GCal] Created event ${eventId} for visit ${visit.id}`);
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
  confirmedVolunteers?: string[],
): Promise<void> {
  try {
    const calendar = getCalendarClient();
    await calendar.events.patch({
      calendarId: CALENDAR_ID,
      eventId: googleCalendarEventId,
      requestBody: {
        summary: buildSummary(visit),
        description: buildDescription(visit, confirmedVolunteers ?? []),
        location: visit.address,
        start: { dateTime: visit.start_time },
        end: { dateTime: visit.end_time },
        colorId: getColorId(visit.fee_tier),
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
      requestBody: { attendees: filtered },
    });
    console.log(`[GCal] Removed attendee ${email} from event ${googleCalendarEventId}`);
  } catch (err: any) {
    console.error(`[GCal] Failed to remove attendee ${email} from event ${googleCalendarEventId}:`, err.message);
  }
}
