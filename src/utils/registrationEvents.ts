// src/utils/registrationEvents.ts
// Writes to `visit_registration_events` (Migration 42) — the append-only history beside the
// mutable `visit_registrations` row.
//
// Best-effort by design. The Supabase client can't wrap the registration write and the event
// insert in one transaction, and the obvious alternative — a database trigger — cannot know who
// performed the action, which is the entire point of recording `actor_id`. So the event is written
// after the registration change succeeds, and a logging failure is reported but never allowed to
// fail a volunteer's signup or a PD's action. A crash in that gap loses one event; it cannot leave
// the registration itself wrong.
//
// Every caller must pass the real actor. `actorId` is who *did* it; `volunteerId` is who it is
// *about*. They differ exactly when staff act on someone's behalf, and that difference is what
// distinguishes a withdrawal from a removal without guessing.

import type { SupabaseClient } from '@supabase/supabase-js';

export type RegistrationEventType =
  | 'signed_up'
  | 'waitlisted'
  | 'promoted'
  | 'withdrew'
  | 'removed_by_staff'
  | 'visit_cancelled';

export type ActorRole = 'volunteer' | 'pd' | 'admin' | 'organization' | 'system';

export interface RegistrationEvent {
  visitId: number;
  volunteerId: string;
  eventType: RegistrationEventType;
  /** Null only for genuinely automated actions with no human behind them. */
  actorId?: string | null;
  actorRole: ActorRole;
  reason?: string | null;
}

/** Record one registration lifecycle event. Never throws. */
export async function logRegistrationEvent(
  supabase: SupabaseClient,
  event: RegistrationEvent,
): Promise<void> {
  await logRegistrationEvents(supabase, [event]);
}

/**
 * Record several at once — used when a visit is cancelled and every registration on it changes
 * at the same moment. One insert rather than one per volunteer, so a visit with a full roster
 * doesn't turn into a dozen sequential round trips.
 */
export async function logRegistrationEvents(
  supabase: SupabaseClient,
  events: RegistrationEvent[],
): Promise<void> {
  if (events.length === 0) return;

  try {
    const { error } = await supabase
      .from('visit_registration_events')
      .insert(events.map(e => ({
        visit_id: e.visitId,
        volunteer_id: e.volunteerId,
        event_type: e.eventType,
        actor_id: e.actorId ?? null,
        actor_role: e.actorRole,
        reason: e.reason?.trim() || null,
      })));

    if (error) {
      // Loud, because a gap in the history is invisible until someone relies on it.
      console.error(
        `[registrationEvents] Failed to log ${events.length} event(s):`,
        error.message,
        events.map(e => `${e.eventType} v${e.visitId}/${e.volunteerId}`).join(', '),
      );
    }
  } catch (err: any) {
    console.error('[registrationEvents] Unexpected error while logging:', err?.message);
  }
}

/**
 * The event for taking a place: `signed_up` when confirmed, `waitlisted` when queued.
 *
 * Kept here rather than at each call site because three separate paths create registrations and
 * all three must classify them identically — otherwise "how many sign-ups" quietly depends on
 * which route was used.
 */
export function placeEventType(status: 'confirmed' | 'waitlisted'): RegistrationEventType {
  return status === 'waitlisted' ? 'waitlisted' : 'signed_up';
}
