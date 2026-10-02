// Shared rules for a visit's volunteer range: min_volunteers (go-ahead threshold)
// to volunteer_slots (maximum; signups beyond it are waitlisted).

export const ORG_MAX_DOGS = 6;
export const ADMIN_MAX_DOGS = 99;

export type StaffingState = 'below_min' | 'going_ahead' | 'full';

export function getStaffingState(confirmed: number, min: number, max: number): StaffingState {
  if (confirmed >= max) return 'full';
  if (confirmed >= min) return 'going_ahead';
  return 'below_min';
}

// While anyone is waitlisted, open spots are held for the PD to offer to the waitlist,
// so new volunteer signups join the waitlist too.
export function isWaitlistOnly(confirmed: number, max: number, waitlisted: number): boolean {
  return confirmed >= max || waitlisted > 0;
}

type RangeResult = { min: number; max: number } | { error: string };

function toInt(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : parseInt(String(value), 10);
  return Number.isInteger(n) ? n : null;
}

// Validates a min/max pair. A missing min defaults to max (a single number seeds both).
export function resolveSlotRange(rawMin: unknown, rawMax: unknown, cap: number): RangeResult {
  const max = toInt(rawMax);
  if (max === null || max < 1) return { error: 'Number of dogs must be at least 1' };
  if (max > cap) return { error: `Number of dogs cannot exceed ${cap}` };
  const min = toInt(rawMin) ?? max;
  if (min < 1) return { error: 'Minimum dogs must be at least 1' };
  if (min > max) return { error: 'Minimum dogs cannot be more than the maximum' };
  return { min, max };
}

// Single-number entry used by org-facing forms: seeds both min and max.
export function resolveOrgDogCount(raw: unknown): RangeResult {
  return resolveSlotRange(undefined, raw, ORG_MAX_DOGS);
}

// ── PD alerts (client-side; used by the visit list cards and the red count badges) ──

export const URGENT_WINDOW_DAYS = 14;

interface AlertableVisit {
  status: string;
  visit_date: string; // YYYY-MM-DD
  volunteer_slots: number;
  min_volunteers?: number | null;
  confirmed_count: number;
  waitlist_count: number;
}

export function daysUntilVisit(visitDate: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(visitDate + 'T00:00:00');
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

// belowMinSoon: won't go ahead as things stand, and it's within the urgent window.
// waitlistReady: a spot is open and someone is waiting — the PD should promote (no auto-promotion).
export function getVisitAlerts(v: AlertableVisit) {
  if (v.status !== 'approved') return { belowMinSoon: false, waitlistReady: false, needsAttention: false };
  const min = v.min_volunteers ?? v.volunteer_slots;
  const days = daysUntilVisit(v.visit_date);
  const belowMinSoon = v.confirmed_count < min && days >= 0 && days <= URGENT_WINDOW_DAYS;
  const waitlistReady = v.waitlist_count > 0 && v.confirmed_count < v.volunteer_slots;
  return { belowMinSoon, waitlistReady, needsAttention: belowMinSoon || waitlistReady };
}
