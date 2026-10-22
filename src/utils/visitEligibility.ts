// src/utils/visitEligibility.ts
// The three gates that decide whether a volunteer may hold a confirmed or waitlisted place on a
// visit: VSC, rabies vaccine, and — for candidates — whether the visit has support available.
//
// Shared so the signup path and the waitlist-promote path can't drift. Before this existed,
// promote checked capacity and nothing else, so a volunteer whose VSC lapsed while waitlisted
// could be promoted straight onto a VSC-required visit with no warning.
//
// NOT used by POST /api/admin/visits/[id]/registrations (a PD adding someone directly). That path
// is deliberately ungated — it's the override, and it's how staff bypass any of these when they
// have a reason to.
//
// Every gate here is evaluated at the moment of the call. Nothing re-checks afterwards, so a
// registration survives its own eligibility lapsing. That's long-standing behaviour for VSC and
// vaccine; the candidate gate inherits it, which means a confirmed candidate keeps their place if
// the last mentor later cancels. See docs/TECH_DEBT.md.

import type { SupabaseClient } from '@supabase/supabase-js';

export type EligibilityFailure = {
  ok: false;
  code:
    | 'vsc_missing' | 'vsc_rejected' | 'vsc_unverified'
    | 'vaccine_missing' | 'vaccine_rejected' | 'vaccine_unverified' | 'vaccine_expired'
    | 'needs_supported_visit';
  /** Shown to the volunteer. Second person, explains what to do next. */
  volunteerMessage: string;
  /** Shown to an admin or PD acting on someone else's behalf. Third person. */
  staffMessage: string;
};

export type EligibilityResult = { ok: true } | EligibilityFailure;

/** The copy a candidate sees when a visit has no support available. */
export const SUPPORTED_VISIT_MESSAGE =
  "This visit isn't open to you yet. New volunteers can join supported visits, which are " +
  'attended by your program director or another experienced volunteer.';

/**
 * Check whether `volunteerId` may take a place on `visitId`.
 *
 * Applies equally to confirmed places and waitlist places: joining a queue for something you're
 * not eligible to attend would be misleading, so the caller shouldn't branch on which it is.
 */
export async function checkVisitEligibility(
  supabase: SupabaseClient,
  visitId: number,
  volunteerId: string,
): Promise<EligibilityResult> {
  const [{ data: visit }, { data: volunteer }, { data: dog }] = await Promise.all([
    supabase
      .from('visits')
      .select('id, requires_vsc, supported_visit')
      .eq('id', visitId)
      .single(),
    supabase
      .from('users')
      .select('id, first_name, vsc_document_url, vsc_verification_status, volunteer_tier')
      .eq('id', volunteerId)
      .single(),
    supabase
      .from('dogs')
      .select('vaccine_record_url, vaccine_expiry_date, vaccine_verification_status')
      .eq('volunteer_id', volunteerId)
      .neq('status', 'archived')
      .maybeSingle(),
  ]);

  if (!visit || !volunteer) {
    return {
      ok: false,
      code: 'vsc_missing',
      volunteerMessage: 'We could not load this visit. Please try again.',
      staffMessage: 'Visit or volunteer not found.',
    };
  }

  const who = volunteer.first_name || 'This volunteer';

  // ── VSC, only when the visit asks for one ──────────────────────────────────────────────────
  if (visit.requires_vsc) {
    if (!volunteer.vsc_document_url) {
      return {
        ok: false,
        code: 'vsc_missing',
        volunteerMessage: 'This visit requires a VSC document. Please upload your VSC before signing up.',
        staffMessage: `${who} has not uploaded a VSC, which this visit requires.`,
      };
    }
    if (volunteer.vsc_verification_status === 'rejected') {
      return {
        ok: false,
        code: 'vsc_rejected',
        volunteerMessage: 'Your VSC document was not approved. Please upload a new copy from your dashboard and allow time for review.',
        staffMessage: `${who}'s VSC was rejected and has not been replaced.`,
      };
    }
    if (volunteer.vsc_verification_status !== 'approved') {
      return {
        ok: false,
        code: 'vsc_unverified',
        volunteerMessage: 'This visit requires a verified VSC document. Your VSC is awaiting review by Sunshine staff — please allow up to 48 hours for approval.',
        staffMessage: `${who}'s VSC is still awaiting review.`,
      };
    }
  }

  // ── Rabies vaccine, always required (see Migration 29) ──────────────────────────────────────
  if (!dog?.vaccine_record_url) {
    return {
      ok: false,
      code: 'vaccine_missing',
      volunteerMessage: "A current rabies vaccine record is required to sign up for visits. Please upload your dog's vaccine record before signing up.",
      staffMessage: `${who} has no rabies vaccine record on file.`,
    };
  }
  if (dog.vaccine_verification_status === 'rejected') {
    return {
      ok: false,
      code: 'vaccine_rejected',
      volunteerMessage: "Your dog's vaccine record was not approved. Please upload a new copy from your dashboard and allow time for review.",
      staffMessage: `${who}'s vaccine record was rejected and has not been replaced.`,
    };
  }
  if (dog.vaccine_verification_status !== 'approved') {
    return {
      ok: false,
      code: 'vaccine_unverified',
      volunteerMessage: "Your dog's vaccine record is awaiting review by Sunshine staff — please allow up to 48 hours for approval.",
      staffMessage: `${who}'s vaccine record is still awaiting review.`,
    };
  }
  if (dog.vaccine_expiry_date && new Date(dog.vaccine_expiry_date) < new Date()) {
    return {
      ok: false,
      code: 'vaccine_expired',
      volunteerMessage: "Your dog's rabies vaccine record has expired. Please upload a current vaccine record before signing up.",
      staffMessage: `${who}'s rabies vaccine expired on ${dog.vaccine_expiry_date}.`,
    };
  }

  // ── Candidates need the visit to have support available ─────────────────────────────────────
  if (volunteer.volunteer_tier === 'candidate' && !visit.supported_visit) {
    const hasMentor = await visitHasConfirmedMentor(supabase, visitId);
    if (!hasMentor) {
      return {
        ok: false,
        code: 'needs_supported_visit',
        volunteerMessage: SUPPORTED_VISIT_MESSAGE,
        staffMessage: `${who} is a candidate, and this visit is not marked as supported and has no confirmed mentor. Tick "Supported visit" on the visit, or add them directly.`,
      };
    }
  }

  return { ok: true };
}

/**
 * Is at least one *confirmed* mentor registered on this visit?
 *
 * Waitlisted mentors don't count — a place in a queue is not support on the day.
 *
 * Two queries rather than one embedded filter: `visit_registrations → users` is a plain FK, but
 * filtering on an embedded column has been unreliable here before, and a visit has at most a
 * handful of confirmed volunteers so the extra round trip is cheap.
 */
export async function visitHasConfirmedMentor(
  supabase: SupabaseClient,
  visitId: number,
): Promise<boolean> {
  const { data: confirmed } = await supabase
    .from('visit_registrations')
    .select('volunteer_id')
    .eq('visit_id', visitId)
    .eq('status', 'confirmed');

  const ids = (confirmed ?? []).map(r => r.volunteer_id).filter(Boolean) as string[];
  if (ids.length === 0) return false;

  const { count } = await supabase
    .from('users')
    .select('id', { count: 'exact', head: true })
    .in('id', ids)
    .eq('volunteer_tier', 'mentor');

  return (count ?? 0) > 0;
}
