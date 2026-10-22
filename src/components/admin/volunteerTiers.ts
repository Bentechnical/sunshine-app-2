// src/components/admin/volunteerTiers.ts
// Volunteer tier vocabulary, shared by the volunteer list and the detail view.
//
// Its own module rather than an export from either component — the compliance extraction in
// Phase 0 was needed precisely because shared pieces had been left inside a 1,200-line component.
//
// Naming is provisional: "mentor" replaced "veteran" on 9 Oct 2026 and hasn't been settled.
// Changing a label here changes it everywhere; changing a *value* needs a migration, since the
// CHECK constraint on users.volunteer_tier pins the three strings.

export type VolunteerTier = 'candidate' | 'regular' | 'mentor';

export const VOLUNTEER_TIERS: VolunteerTier[] = ['candidate', 'regular', 'mentor'];

/**
 * Badge styling per tier. `regular` is deliberately null — it's the default state, and a pill on
 * every ordinary volunteer is noise. Callers should render a dash or nothing for it.
 */
export const TIER_BADGE: Record<VolunteerTier, { label: string; classes: string } | null> = {
  candidate: { label: 'Candidate', classes: 'bg-amber-100 text-amber-800' },
  regular: null,
  mentor: { label: 'Mentor', classes: 'bg-blue-100 text-blue-700' },
};

export const TIER_OPTIONS: { value: VolunteerTier; label: string; hint: string }[] = [
  {
    // "Will be" is load-bearing until gating ships: nothing enforces this yet, and a PD who reads
    // it as already active could let a candidate onto an unsupported visit believing the system
    // would have stopped them. Drop the "Will be" when the gate goes in.
    value: 'candidate',
    label: 'Candidate',
    hint: 'Will be limited to supported visits',
  },
  {
    value: 'regular',
    label: 'Regular',
    hint: 'Fully onboarded; no restrictions',
  },
  {
    value: 'mentor',
    label: 'Mentor',
    hint: 'This volunteer can supervise supported visits',
  },
];
