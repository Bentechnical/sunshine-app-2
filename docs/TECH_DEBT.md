# Known tech debt

A running list of things we know are wrong, inconsistent or deferred — so they don't have to be
rediscovered. Not a backlog of features; only work we've consciously chosen *not* to do yet.

**How to use it:** add an entry when you decide to leave something, with enough context that the
decision is legible later. Delete the entry when it's fixed. Nothing here is urgent by default — if
something becomes a blocker, say so in the entry.

Size is rough: **S** = under an hour, **M** = half a day, **L** = more.

---

## Database and schema

**Legacy audience tables** — `audience_categories`, `volunteer_audience_preferences`,
`individual_audience_tags`. Built for individual↔volunteer matching (deprecated). Superseded for
PD purposes by `audience_groups` / `volunteer_audience_exclusions` (Migration 40), which model
*exclusions*, not preferences. Deliberately **not** reused: the semantics are inverted, so one table
would mean opposite things to different code paths. The signup form no longer writes to them
(the preferences step was removed 22 Oct), so the existing rows are frozen rather than growing.
Drop once individual matching is formally retired. *Size: S to drop, blocked on the retirement
decision.*

**Travel distance is still collected from volunteers.** `users.travel_distance_km` exists only to
serve individual↔volunteer matching, which is frozen. It was removed from the admin volunteer
detail view on 22 Oct, but volunteers are **still asked for it** in `EditProfileForm.tsx` (state at
~line 74, submitted at ~line 147), and `ProfileCompleteForm.tsx` still writes it on submit using a
hard-coded default of 25 now that the step collecting it is gone. Hide or remove both. Worth doing
alongside any other volunteer-facing form change rather than on its own, since it means retesting
the signup and edit flows. Keep the column — dropping it is a separate decision tied to retiring
individual matching. *Size: S.*

**`GET /api/audience-categories` now has no callers.** Its only consumer was the signup step removed
on 22 Oct. The admin screens that still display audience categories read them through
`/api/admin/approved-users` instead. Left in place rather than deleted along with everything else
that day — deleting routes is easy to do and annoying to undo. *Size: S.*

**`volunteer_audience_exclusions.note` is unused.** Added in Migration 40, then the conditions UI
was simplified to plain flags, with any nuance going into a volunteer note instead. The column and
the `note` field on `PUT .../exclusions` both still work; nothing sends them. Harmless, but it will
confuse whoever reads the schema next. *Size: S.*

**`visits.audience_age_ranges`** — accepted by three API routes, written by no form, displayed where
legacy rows have values. Making audience *exclusions* enforceable requires a real per-visit audience
field, which means adding one back to the org request form (an org-facing change). Until then
exclusions are recorded and displayed but enforce nothing. *Size: M, and it's a product decision
before it's a code one.*

**`visits.requires_vaccine_record`** — retained in the DB but ignored; every write path hard-codes
`true` and the registration gate is unconditional. Already logged as Migration 29, so this is a
pointer, not a discovery. Harmless, but the column implies per-visit configurability that no longer
exists. *Size: S.*

**`appointments.availability_id`** — vestigial, no FK, table it referenced
(`appointment_availability`) no longer exists. *Size: S.*

**The schema log claims a table that does not exist.** `ORGANIZATION_VISITS_SCHEMA.md` records
Migration 31 as "Created `document_verifications` audit table — append-only log of all admin
approve/reject actions on compliance documents." That table is **not in DevDB, not in the snapshot,
and not referenced anywhere in the code** — compliance verification shipped using mutable
`*_verification_status` / `*_verified_at` / `*_verified_by` columns on `users` and `dogs` instead
(Migration 30). So either the migration was never run or it was dropped, and the log was never
corrected. The schema log has now been annotated in three places to say so, so this entry is just
the pointer. Worth noting as precedent: this is the same mutable-column shortcut that produced the
cancellation-attribution problem. Whether the audit log itself is still wanted is tracked under
"Compliance document decisions keep no history" in Data fidelity. *Size: done (doc corrected).*

**`docs/DB_SNAPSHOT_DEV.md` is stale** — predates Migration 39. Since the snapshot is meant to be
the current-state reference that wins over the migration history, a stale one is actively
misleading. Worth regenerating whenever it drifts more than a migration or two. *Size: S.*

**RLS holes on peripheral tables** — `role_change_audit`, `welcome_messages`, `chat_logs`,
`appointment_chats`, `volunteer_audience_preferences` each carry a policy *named* for a privileged
role but written `roles=public` with a `true` predicate, which ORs away the restrictive policies on
the same table. `volunteer_audience_preferences` is the worst: its DELETE policy is `USING true`, so
any authenticated user can delete anyone's rows. Also noted in CLAUDE.md. **Fix before onboarding
real users**; not a blocker for internal testing. *Size: M.*

---

## Data fidelity

**Registration history is mutable state, with no event log. → DECIDED: build
`visit_registration_events` before the first pilot region.** This is the proper fix for everything
in this section; the two entries below it are symptoms. `visit_registrations` is a single mutable
row per (visit, volunteer) whose status flips in place, so it answers "what is this person's current
relationship to this visit" and nothing about how it got there.

Agreed design (9 Oct 2026). Scope is deliberately **robust basic logging of registration and
deregistration activity** — not analytics. An append-only `visit_registration_events` table
**alongside** the mutable row: the row stays the current-state read, the log is additive history.
Deriving current state from the log is the over-engineering trap; don't.

| Column | Purpose |
|---|---|
| `visit_id`, `volunteer_id` | Denormalised, so events survive row deletion and per-volunteer queries need no join. `volunteer_id` is who the event is **about**. |
| `event_type` | `signed_up`, `waitlisted`, `promoted`, `withdrew`, `removed_by_staff`, `visit_cancelled`; later `attended` / `no_show`. |
| `actor_id` | Who **did it** — `text` → `users.id`, nullable for cron/system, `ON DELETE SET NULL` so events outlive the user. Usually equal to `volunteer_id`; differs when a PD acts on someone's behalf. |
| `actor_role` | Snapshot (`volunteer`/`pd`/`admin`/`system`), so attribution survives a later role change and needs no join to interpret. |
| `reason` | Free text, whatever the acting path collected. |
| `created_at` | When it happened. |

**`actor_id` is the point of the whole design.** Self-initiated becomes exactly
`actor_id == volunteer_id` — comparing two ids rather than inferring intent from which of two
nullable text columns happens to be populated, which is what today's code has to do. And
`visit_cancelled` being its own event type means an org pulling out is never attributable to the
volunteer.

Also fixed for free: attendance and no-shows become event types needing no further schema change
(the log *is* the attendance table), and the PD activity feed from `PD_FEEDBACK_ROADMAP.md` §2 reads
straight off this table ordered by `created_at`.

**Keep the existing `cancelled_at` / `cancellation_reason` / `admin_note` columns on
`visit_registrations`.** They're the current-state cache — "why is this registration cancelled"
should be answerable without touching the log, and dropping them would mean rewriting every read
path that renders a reason. Columns describe now; the log describes history. Write both in the same
code path so they can't diverge.

Deliberately **not** included: `hours_before_visit` (computed-at-write-time lateness). Considered
and rejected as overkill for v1 — it's derivable from `created_at` plus the visit's start time, with
the only loss being accuracy if a visit was rescheduled after the event. Revisit if late-cancellation
reporting ever becomes a real metric.

Why not sooner: it means inserting at six write paths (register, volunteer cancel, admin add, admin
remove, waitlist promote, visit-level cancel) — the most load-bearing flow in the app — so it wants
its own phase, not to be mixed into a UI feature. Why not later: event data is unrecoverable once
real volunteers are using the system. A partial backfill is possible now (`cancelled_at` + reason on
cancelled rows, `created_at` on the rest); everything before it is lost, which is acceptable at
current scale and will not be after a pilot.

*Size: M. Hard gate: before the first pilot region onboards.*

**Cancellation history is lost on re-registration** — *resolved by the event log above, with no
behaviour change needed.* Both reactivation paths (`POST /api/visits/[id]/register` and
`POST /api/admin/visits/[id]/registrations`) null `cancelled_at` when reviving a cancelled
registration, so today a volunteer who cancelled and later re-signed-up leaves no trace. Once the
log exists, nulling that column is simply *correct* — it accurately describes current state, and the
cancellation survives as an event. No `cancel_count` column, no change to the reactivation logic.
Listed separately only so the symptom isn't fixed twice. *Size: none, once the log lands.*

**Compliance document decisions keep no history — apply the same event-log approach.** Lower
priority than the registration log, but the same defect and the same fix. Approve/reject decisions
are written to mutable columns on `users` (`vsc_verification_status`, `vsc_verified_at`,
`vsc_verified_by`, `vsc_rejection_reason`) and `dogs` (the `vaccine_*` equivalents), each holding
only the **latest** decision. A document approved, then rejected, then re-approved retains no record
of that sequence — and `*_rejection_reason` is cleared on re-upload, so the reason a volunteer was
knocked back is destroyed as soon as they respond to it. If a volunteer ever disputes a decision
there is nothing to look at, and there's no way to see which PD has been rejecting what.

An append-only `document_verifications` log was specified for exactly this in Migration 31 and never
applied (see the Database section). Shape mirrors `visit_registration_events`: subject (volunteer or
dog), document type (`vsc` / `vaccine`), decision, `actor_id`, `reason`, `created_at`. Keep the
mutable columns as the current-state read, same split as above.

Do this **after** the registration log, reusing whatever pattern that establishes rather than
inventing a second one. Not gated on pilot — the risk is reputational/dispute-handling rather than
data loss that compounds, though it does accumulate quietly. *Size: M.*

**A confirmed candidate keeps their place if the last mentor cancels.** The candidate gate, like
every gate before it, is evaluated only at the moment of signup — so a candidate who joined because
a mentor was confirmed stays confirmed after that mentor withdraws, with nobody told. Decided
deliberately: nothing should happen automatically, because removing someone is worse than leaving a
visit under-supported, and only a PD can judge it.

The right home for the warning is the **admin activity feed** (`PD_FEEDBACK_ROADMAP.md` §2), which
is planned before this goes out for testing and is exactly the mechanism for surfacing state changes
the app shouldn't resolve on its own. Deliberately *not* building a one-off badge in the meantime,
since the feed would replace it. The signal to show: a visit with a confirmed candidate, not marked
`supported_visit`, and no confirmed mentor. *Size: S once the feed exists.*

**No attendance or no-show tracking.** Attendance is inferred as *confirmed registration on a visit
with status `completed`*. Someone who signed up and didn't show counts identically to someone who
attended. Accepted deliberately: no-shows get recorded in admin notes for now. The natural trigger
to build this properly is when there's per-attendance data worth storing (no-show flag, hours
served) — at which point the inferred stats should become a materialised table. *Size: M when it
comes.*

---

**Volunteer notes have no edit history and no soft delete** — *deliberate, not an oversight.* An
edit overwrites the text, a delete removes the row, and an edited note still shows its original
timestamp with no "edited" marker. A PD may only change their own notes; an admin may change
anyone's, which is enforced server-side in `PATCH`/`DELETE /api/admin/volunteers/[id]/notes/[noteId]`.
The author check exists so that "Jeff wrote this" can't sit above text someone else silently
rewrote — misattribution being the one genuinely bad outcome at this scale.

Adding an "edited" marker costs one column; full history costs a revisions table. Neither was judged
worth it while PDs are a small group of known staff, and while the places a missing trail could
actually hurt someone — compliance decisions and registration history, both above — remain unfixed.
**Revisit if PDs stop being a small trusted group.** *Size: S for an `updated_at` marker.*

## Permissions and scoping

**PD scoping is not enforced by RLS** — it's client-side filtering on `assigned_pd_id` (visits) and
`assigned_region_id` (volunteers, orgs). Noted at length in CLAUDE.md. *Size: L.*

**All PDs can edit all volunteers, orgs and visits.** Deliberate for now — full transparency between
PDs is the intended policy, and volunteers are encouraged to work across regions. A likely future
refinement is view-all / edit-own-region. Nothing to do until someone asks. *Size: M.*

---

## Front-end

**The visits list offers PDs a region filter that can't widen anything.** PD visit scoping is
client-side on `assigned_pd_id === currentUserId`, so a PD only ever sees their own visits — but
`AdminVisits` still shows a region selector including "All Regions". Choosing it changes nothing,
which reads as a bug: during testing on 26 Oct a PD went looking for a visit across "all regions"
and concluded it had vanished, when it was simply an Oakville visit belonging to the Oakville PD.

Worth understanding *why* this arises rather than just hiding the control, because the underlying
behaviour is correct and deliberate: **volunteers are not region-siloed** (encouraged to sign up
across regions) while **PDs are**. So a Toronto volunteer can hold a place on a visit her own PD
can never see. The volunteer's profile *does* show it — `GET /api/admin/volunteers/[id]` has no
region filter by design, since judging a person means seeing all their visits — so the information
isn't lost, just absent from the visits list.

Fix: hide the region selector in PD mode. A control that cannot change the result is worse than no
control. (Keeping it and relabelling it is the alternative, but "filter within your own visits"
isn't a useful axis when a PD has one region.) *Size: S.*


**`AdminVisits.tsx` fetches every visit and filters client-side.** Fine at current scale. A concern
for the largest regions (a few hundred volunteers), and exactly the class of problem a small pilot
region will hide — so don't read a small pilot as evidence this is fine.

The Manage Volunteers list had the same shape and was fixed on 22 Oct; that change is the template.
Three things did it: a purpose-built endpoint returning only the columns the table renders
(`GET /api/admin/volunteers?scope=list`) instead of reusing `approved-users`, which returns every
role with ~48 columns and three joins; **server-side** region filtering, since a client-side filter
means a PD with 30 volunteers still downloads the whole organisation; and attaching heavy
per-row detail only to the rows that can actually use it. Measured result: **1,864 → 325 bytes per
row**, and a PD's own-region load went from ~910 KB to ~9 KB at a projected 300 volunteers.

`AdminVisits` can't copy it wholesale — its filters are status-based and it has no equivalent of the
region default — but the principle holds: filter server-side, select narrowly, and don't make every
row pay for what a handful need. *Size: M.*

**Images bypass `next/image` across most of the app.** 20 files use a plain `<img>`; 11 use
`next/image`. `remotePatterns` in `next.config.ts` is already configured for both Supabase hosts, so
the plumbing exists — the components just don't use it. The cost is that a 800px avatar is
downloaded in full to render in a 64–96px box, with no WebP/AVIF conversion and no edge caching
near the viewer.

**Deliberately deferred for the beta** (24 Oct). Measured against a real trace from a high-latency
connection, a 340 kB image took 168 ms while a 2 kB API response took 1.18 s — images are not the
bottleneck, distance is. Converting would save perhaps 80–120 ms per image, against a real risk of
layout shifts: `<Image>` needs explicit dimensions or a positioned parent, and 27 of these render
`w-full h-full` inside containers whose size varies.

Where it will actually pay, and so where to start: screens that render **many** images at once —
a visit's registration list (up to six dogs) and the volunteer browse view — and **volunteers on
cellular data**, who are the ones paying for the megabytes. The admin profile screens, which show
two images, are the weakest case and should be done last. *Size: M, best done screen by screen.*

**Responsive layout at lower resolutions.** Every PD in the October testing sessions was on a
smaller display than assumed; the UI squished more than expected. *Size: M.*

**`getComplianceStatus` is reimplemented in four places.** The canonical copy now lives in
`src/utils/compliance.ts` and is used by the admin surfaces. Still duplicated in
`src/app/api/admin/compliance/route.ts` and in three volunteer-facing fragments
(`TherapyDogCard.tsx`, `ProfileCardBlock.tsx`, `ComplianceDocsModal.tsx`). All four are currently
identical, so a change to the 30-day expiry window or the status precedence has to be made in five
places to stay consistent. Left alone deliberately: rewiring the volunteer-facing fragments means
touching volunteer UI, which didn't belong in a mechanical refactor. Note the fragments each carry
their own `statusConfig` with different icons and wording — that divergence is legitimate and should
stay. *Size: S.*

---

## Scripts and tooling

**`testEmails.ts` covers only the 9 appointment-era templates** — none of the 16 visit-era ones.
*Size: M.*

**`checkDatabasePermissions.ts` probes dropped tables.** *Size: S.*

**`scripts/closeExpiredChats.ts` duplicates `src/utils/closeExpiredChats.ts`** rather than importing
it, so the two can drift. Chat is deprecated, so this only matters if the script is still wired to a
cron somewhere. *Size: S.*
