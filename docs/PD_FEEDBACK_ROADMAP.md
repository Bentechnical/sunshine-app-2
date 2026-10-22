# PD feedback → roadmap reference

**Status:** working reference, not a committed plan. Written 9 Oct 2026 after three PD testing
sessions (week of 5 Oct) and a design conversation following them.

Sources: three PD sessions, the design conversation after them, and facts verified directly against
the code (§1). Open decisions are listed in §5 — treat those as unsettled, not as recommendations.

---

## 1. Verified facts about the current system

Checked in code during the conversation. Recorded so they don't need re-deriving — several were
counter-intuitive and a couple of my initial assumptions were wrong.

**Google Calendar is load-bearing for billing.**
`getColorId(fee_tier, parking_coverage)` in `src/utils/googleCalendar.ts` encodes the billing code
into one of 11 GCal colours. A Google Apps Script reads those colours back and generates invoices.
Colour is **write-only** in the app — `getColorId` is called at two places only, both building event
bodies, and nothing ever reads a colour back.

Consequences:
- The colour map is a contract between two codebases. Changing or adding a fee tier before the
  script is retired breaks billing *silently* — a wrong invoice, no error.
- `custom` maps to Graphite and `fee_amount` can't be encoded in a colour at all.
- The fee tiers may be an artifact of the transport rather than real pricing policy. Open question
  for Alanna.

**Each region already has its own Google Calendar.** The Apps Script reads each separately. The app
currently writes every visit to one shared calendar (`GOOGLE_CALENDAR_ID`, a single env var). Making
the app region-aware is a rollout prerequisite — see §4.

**Calendar events exist only for approved/completed visits.** `/api/visits/route.ts` (org submission)
makes no calendar call at all; admin create is gated on `status === 'approved'`; approve creates,
restore recreates, cancel/delete patch to `cancelled`. So Nancy's "don't send invites until staffed"
is a small change — "staffed" is already modelled (`min_reached_at`, `staffed_notified_at`, plus an
hourly cron that fires at exactly that moment).

**Signup gates check only the volunteer's own attributes.** `/api/visits/[id]/register` checks VSC
and vaccine state against `visit.requires_vsc` / `requires_vaccine_record`, returning 403 with a
readable message. All stable facts about the person signing up.

**Gates run at signup time only.** Nothing re-checks afterwards, so an existing registration survives
its own compliance lapsing. Confirmed deliberately during PD testing (the planted lapsed-vaccine
volunteer who stayed confirmed on an upcoming visit). The waitlist promote route re-checks capacity
but not eligibility at all.

**Recurring-visit scaffolding already exists.** `visits.recurrence_rule` and `visits.parent_visit_id`
(self-referential FK) are present, reserved for "Phase 3".

**Pending users are invisible to PDs outside their own region.** `/api/admin/pending-users` filters
PDs with `.in('assigned_region_id', regionIds)`, and SQL `IN` never matches `NULL` — so a signup
whose boundary auto-assignment failed reaches no PD at all, only an admin.

**`autoAssignRegion` only ever returns `boundary_auto` or `null`.** The `fsa_auto` and `distance_auto`
values in the check constraint are vestigial. There is no distance fallback.

**The admin visit list fetches every visit and filters client-side.** Fine at 45 visits; a concern at
large-region scale. See §4 — a small-region pilot will give false confidence here.

**`users.email` is uniquely constrained**, which blocks multiple org contacts and forces the
deferred `organizations` table decision.

---

## 2. Feature candidates

Grouped by theme rather than by the order they came up. Sizes are relative, not estimates.

### Volunteer visibility and control

The dominant theme — PDs want more visibility into volunteers, surfacing from several angles.

Two distinct asks are braided together, and they're worth separating: **visibility** (who is this
person, what have they done, are they reliable) versus **control** (can I determine whether they're
allowed to do this). Hypothesis worth testing: much of the control demand exists *because* of missing
visibility. Shipping visibility first is cheap and uncontroversial, and makes the harder conversation
evidence-based.

| | Status | Size | Notes |
|---|---|---|---|
| Volunteer profile page for PDs | Wanted, uncontroversial | Moderate | `AdminOrgDetail.tsx` (365 lines) is the pattern; `visit_notes` is the complete private-notes pattern. Catch: the volunteer accordion lives inside a 1,249-line `AdminManageVolunteers.tsx`, so it's a refactor |
| Private admin notes on volunteers | Wanted | Small | Copy `visit_notes` wholesale |
| Volunteer stats (visit count, recent visits) | Wanted | Small | |
| Assessment conditions ("pass with conditions") | Likely V1 | Moderate | Keep *preferences* and *restrictions* separate — a preference is volunteer-stated, a condition is PD-imposed. One table would let volunteers edit their own restrictions |
| Per-signup PD approval | Rejected as default | — | Position: open by default, restrict by exception |

### Onboarding and supported visits — **decided for V1**

Originally hoped to bypass by onboarding only fully-approved volunteers. Rejected after the sessions:
it would force PDs to maintain a separate list of which visits candidates could join, creating work
rather than removing it.

Agreed shape:
- **Three tiers: candidate / regular / veteran.** Veterans are designated, not just "anyone onboarded"
- A candidate may sign up only where (a) the PD has marked themselves as attending, or (b) a veteran
  is already confirmed
- PD promotes candidate → regular when satisfied
- Reuses the `requires_vsc` pattern: per-visit flag plus a check in the register route

**Open: what happens when support disappears** (veteran cancels, PD un-marks). Leaning toward nothing
automatic plus a flag to the PD. Note this gate is the *first* that depends on other people's
registrations, so unlike every existing gate it can become false after it passed. Waitlist promotion
is the sharper edge — it re-checks capacity but not eligibility.

**Rollout consequence:** on day one in a new region nobody is marked veteran, so candidates can only
join PD-attended visits. Designating veterans is a region-onboarding step alongside importing the
roster.

### PD notifications and activity feed

More important than it first looked. It's the mechanism for **surfacing state changes the app
shouldn't resolve automatically** — veteran cancels out from under a candidate, volunteer drops off a
visit now below minimum, late signups. None have a right automatic answer; all are worth a glance.

Carrying that load means the feed lets you *avoid* deciding block-versus-auto-remove for a whole
category of problems.

Scope: at-a-glance view of recent signups and cancellations. Email reserved for genuinely high-
attention events only.

### Post-visit, invoicing — **candidate for V1.0, was V2.0**

Currently a Google Apps Script reading Google Calendar. Works, but creaking at scale with occasional
errors. No payment processing involved, and the invoices themselves are simple.

The strong argument isn't "the invoices are simple" — it's that **the app already computes the
billing code and currently throws it away** by squeezing it through a colour palette.

Proposed trigger: **"mark visit complete"**, which already exists as an explicit human action and is
more robust than inferring completion from a calendar.

Risks, since it touches money:
- **Double-invoicing during cutover.** Needs a hard switch-off, not a gradual migration
- **No audit trail today.** Invoices need a record of what was billed, when, to whom, at what rate
- **"Mark complete" becomes a financial action** — changes who should be able to press it, and
  whether it's reversible

Sequencing: move invoicing in-app reproducing today's behaviour *exactly*, run alongside the script
and compare outputs, **then** liberalise pricing as a separate change. Don't change the billing model
during the billing-system migration or you won't know which caused a wrong invoice.

### Recurring visits

Real and significant in some regions. Same place, roughly the same cadence (weekly, fortnightly),
usually the same volunteer but with rotations and holiday cover.

**Recommendation: ship a display flag now, defer linking.** The storage decision is half-made
(`recurrence_rule`, `parent_visit_id`), but the hard part is semantics: edit-one-versus-all,
rotations, cancelling one occurrence, quieter notifications across a series. A marker gives
volunteers context when browsing, costs almost nothing, and buys real usage data first.

### Smaller items

| | Size | Notes |
|---|---|---|
| Calendar invites only once staffed | Small | Do *not* ship standalone while the Apps Script reads the calendar — a visit that goes ahead under its minimum might never be invoiced |
| Timing constants → per-region config | Small | Currently hardcoded: `URGENT_WINDOW_DAYS = 14` (`visitSlots.ts`), `STAFFED_QUIET_HOURS = 3`, ~48h in the reminders cron. Per-region sidesteps the Nancy-versus-everyone-else argument entirely |
| Multiple org contacts (billing etc.) | Small–moderate | Blocked by the unique constraint on `users.email`; forces the deferred `organizations` table decision |
| Responsive fixes for smaller screens | Small | Every PD was on a lower-resolution display than assumed. UI squished more than expected |
| PD uploads compliance docs on behalf of volunteers | Moderate | **See §3 — far more strategically important than its size suggests** |

---

## 3. The migration tool

**PD creates a volunteer profile and emails an activation link.** Filed originally as low-priority;
it is probably the single biggest determinant of migration attrition.

Without it, every volunteer in a cutover region must find the site, register, set a password, build a
profile, locate their police check and vaccination record, and upload both. Many of Sunshine's
volunteers are retired; that funnel is the whole ballgame.

With it, the PD imports the roster they already maintain, uploads the compliance docs they already
hold, and the volunteer clicks a link and sets a password. Five steps become one. A pilot region
starts day one with its roster already populated — you're measuring *activation*, not acquisition.

**The anti-incentive concern** (if PDs do everything, volunteers never self-manage) is real but
narrower than it looks:

- Profile creation still requires the volunteer to activate — the PD can't set their password. It
  shrinks the step, it doesn't remove it. The crutch risk is in *ongoing proxy signups*, not setup
- The structural incentive already points the right way: every proxied signup is PD work, and PD
  workload is the problem the project exists to solve
- The exception is PDs who *value* the gatekeeping — the same cohort as the control theme in §2.
  Better handled in that conversation than with product friction
- Lightweight mitigation: **measure proxy rate per region** as a diagnostic. A region at 90% proxied
  six months in means either those volunteers can't use it or that PD hasn't let go. Both worth
  catching; neither visible without the number

---

## 4. Rollout

**Region by region.** Sunshine has 10–15 regions, smallest ~20–30 volunteers, largest a few hundred.
The app already scopes volunteers, orgs and visits by region, so regions are genuinely separable.

**Per-region calendar routing is the prerequisite.** Each region already has its own GCal and the
Apps Script reads each separately, so once the app writes to the right one, piloted and non-piloted
regions stay cleanly isolated and billing is unaffected. This is cheaper than moving invoicing and
unblocks everything — do it early.

Not quite trivial: `GOOGLE_CALENDAR_ID` is a single env var; the cancel, update and attendee
functions take only an `eventId` so the region has to be threaded through (~8 functions); a visit
changing region needs its event moved (`events.move`); guest visits have no region so need a fallback;
and the service account needs access granted on every regional calendar, which fails silently when
forgotten.

**Pick pilot regions on PD enthusiasm, not size.** The biggest single predictor of a pilot reading as
success. A 20-volunteer region may never generate a waitlist or a below-minimum visit, so you'd learn
only that the easy paths work — and the smallest regions often have the most idiosyncratic processes.
One small plus one medium beats the two smallest.

**Don't go pilot → org-wide in one step.** Large regions are qualitatively different, not just bigger
— and the client-side visit filtering (§1) is exactly the class of problem a small pilot hides. Want
one large region in a second wave before the rest.

**Add a shadow period, not another test round.** The pilot PD enters real upcoming visits into the app
for ~2 weeks while still operating normally. Only the PD bears the double-entry cost, it's scoped and
time-boxed, and it catches the one thing nothing else will: real visits that don't fit the data model.
Recurring visits with rotating volunteers are the obvious candidate.

**Rollback is already good:** as long as the app keeps writing to Google Calendar, the calendar stays
current and reverting means "stop opening the app." An argument for keeping the calendar integration
even after billing no longer depends on it.

**Seasonality** exists but is milder than expected — the real slowdown is the Christmas period.

### Measuring a pilot

Stated criteria: time given back to PDs, volunteer engagement and retention, no volunteer drop-off,
same for orgs. All **lagging** — they reveal themselves over months, and a pilot runs for weeks.

**Baseline before cutover — this is time-critical and cannot be reconstructed afterwards.** Have the
pilot PD log their hours for a fortnight before anything changes.

Leading indicators visible inside a pilot window:
- Proportion of visits that fill without the PD chasing anyone
- Time from visit created → fully staffed
- PD-proxied signups as a share of total (should *fall* as adoption grows)
- Activation rate in the first month — the early read on eventual attrition
- **"Stuff getting missed"** — currently the stated pain, and countable. Missed visits, late
  cancellations, volunteers who didn't know they were booked. Count it before and after

Volunteer complaints about the current spreadsheet sign-up sheets are an asset: both the pitch to
volunteers and a baseline to measure against.

---

## 5. Open decisions

1. **Trust model.** Working position: open signup by default, restrict by exception, with onboarding
   gating as a genuine exception. Needs the leadership conversation to confirm
2. **Does invoicing land in V1.0?** Largest single item if so
3. **What happens when a candidate loses their supervision?** Leaning: nothing automatic, flag to PD
4. **Who can mark a visit complete** once that action generates an invoice
5. **Do the current fee tiers reflect real pricing policy, or what fitted down the colour channel?**
   (Alanna). Determines how much invoice modelling is worth doing now

---

## 6. Session notes

The first PD session used a fully scripted scenario and felt artificial — the prompts described
someone else's situation, which meant the PD had to simulate caring about a fiction, and being handed
tasks turned it into a competency test. The valuable material came from the *conversation*, not from
watching task completion.

If more sessions run, better openings are "walk me through what you'd normally be doing right now,
and try to do it in here" or "think of the last visit you organised — set that one up here." The
situation then comes from their memory, with real details and real judgement. Keep the scripted
prompts as a coverage backstop for when someone stalls, not as the spine.

The scenario seed tooling lives in `scripts/scenario/` (`spec.ts`, `visits.ts`, `calendar.ts`,
`run.ts`, `verify.ts`) with `npm run scenario:build | reset | verify | inspect`. Full design in
`docs/PD_SCENARIO_SPEC.md`.
