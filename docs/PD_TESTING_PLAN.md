# PD Testing Plan — Visits Platform

**Status:** Planning
**Target:** ~2 weeks out
**Participants:** 3-4 PDs
**Format:** 1-on-1 live sessions with screen share (~1 hour each)
**Timeline:** 1-2 days, with DB reset between sessions

---

## Goals

1. Validate that PDs can navigate the interface without guidance
2. Confirm core workflows function end-to-end
3. Surface terminology or layout mismatches with how PDs actually think about their work
4. Identify obvious gaps in PD-specific features before broader rollout

This is NOT expected to fully simulate real-world PD usage — that requires real data over real weeks post-launch. This testing catches navigation issues, workflow bugs, and first-impression friction.

## Important Context

PDs are paid staff. We can push toward a new system even if it differs from current habits, as long as the new approach is a clear improvement and doesn't remove capabilities without replacement. The goal is to validate the tool, not to preserve old processes.

---

## Session Structure

### Phase 1 — Cold Exploration (15-20 min)

Hand them a logged-in PD dashboard. One sentence of context:

> "This is the new system for managing therapy dog visits. You're logged in as a PD. Take a look around."

**Facilitator observes silently:**
- What do they click first?
- What do they look for that isn't there?
- Where do they hesitate or backtrack?
- What language do they use vs. what the app uses?

Do not help unless they are completely stuck. Moments of confusion are the most valuable data points.

### Phase 2 — Guided Simulation (20-25 min)

Present a "Monday morning" scenario — a set of situations waiting for them, framed naturally rather than as step-by-step instructions. The PD decides how to prioritize and navigate.

**Scenario covers (at minimum):**
- New visit requests waiting for review (approve one, decline one with a note)
- An org application to review
- Creating a visit manually (org called in by phone)
- Handling a volunteer cancellation / waitlist promotion
- Marking a past visit as complete
- Checking volunteer compliance (expiring documents)
- Cancelling a visit with org notification
- Restoring a cancelled visit

Facilitator tracks completion of each task on a private checklist without directing the PD.

### Phase 3 — Debrief (10-15 min)

Two types of questions:

**About the app:**
- What was confusing or hard to find?
- Anything missing that you'd expect to see?
- If you had to train a new PD on this, what would need explaining that shouldn't?

**About their real workflow (mental model discovery):**
- Walk me through what happens today when an org wants to book a visit.
- What's the most annoying part of your current process?
- What information do you find yourself looking up most often?
- Is there anything you do regularly that we didn't touch on today?

These questions surface needs the sandbox can't simulate.

---

## Sandbox Setup

### Pre-seeded test data
Each session starts from an identical state. Test data clearly labeled (e.g., org names prefixed with "TEST —").

**Seed includes:**
- 3-4 test orgs (mix of registered accounts and admin-managed)
- 5-6 visits in various states (pending review, approved with volunteers, fully staffed, past date, cancelled)
- Test volunteers with varying compliance status (valid, expiring, missing docs)
- Visit registrations including a waitlisted volunteer

### Reset process
A seed script clears and recreates all test data between sessions. Allows running 2 sessions per day (morning session, reset over lunch, afternoon session).

---

## Participant Selection

Aim for a range across the 3-4 PDs:
- At least one less tech-comfortable PD
- At least one newer PD who may not know all org relationships
- Ideally a mix of regions/experience levels

Different profiles surface different friction points.

---

## Logistics

| Day | AM | PM |
|-----|----|----|
| Day 1 | PD 1 session | PD 2 session |
| Day 2 | PD 3 session | PD 4 (or buffer) |

Sessions can be remote (video call + screen share) or in-person.

---

## Outputs

After all sessions:
- Summary of navigation/UX issues observed
- List of workflow gaps or missing features surfaced
- Terminology mismatches to address
- Prioritized fix list before next phase of rollout

---

## Pre-requisites Before Testing

- [ ] All current beta feedback fixes deployed
- [ ] Seed script built and tested
- [ ] Session scenario document finalized
- [ ] PD accounts created with appropriate permissions
- [ ] Facilitator checklist prepared (private task tracking sheet)
