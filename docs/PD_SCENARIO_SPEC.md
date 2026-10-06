# PD Testing — Scenario Spec

**Status:** Draft for review
**Sessions:** week of Mon 5 Oct 2026 (sessions Tue 6th – Fri 9th)
**Account:** all sessions use `toronto.pd@sunshinedogs.app` (TorontoPD Tester)
**Environment:** beta/preview URL → dev Supabase (`gwuqfhp…`) + dev Clerk
**Supersedes:** the rough draft in `PD_TESTING_PLAN.md` (session structure there still applies)

This document is the source of truth for the scenario. `scenario:build` is written *from* it —
if a prompt changes here, the seed state changes with it.

---

## 1. How a session runs

| Phase | Time | What |
|---|---|---|
| Open | ~10 min | Hand over a logged-in PD dashboard. One line of framing, then observe in silence. |
| Prompts | ~30 min | Work down the priority list. Expect to get through 6-7, not all 10. |
| Debrief | ~15 min | App questions, then real-workflow questions. |

**Framing line (paraphrase, don't read):** *you're starting your day with about fifteen minutes
before your first call — what are you dealing with first?*

Each prompt is phrased as **something that happened in the world**, never as an app operation. Do
not name screens, features, or buttons. If they ask where something is, deflect once ("where would
you expect it to be?") before helping.

---

## 2. The prompts

**Numbered in the order they should be introduced.** Priority: **A** = run always · **B** = if going
well · **C** = reserve. Expect 6-8 to land, so the first seven are arranged to cover the widest
ground — request approval, compliance, editing, staffing, creation, document review, cancellation.

One ordering rule matters and is already baked in: **P2 runs before P6 and P10**, because P2 is a
search task and the other two reveal where documents live; and later prompts are the
reserve — the list is designed for its tail to be cut.

Each prompt is phrased as **something that happened in the world**, never as an app operation. Don't
name screens, features or buttons. If they ask where something is, deflect once — "where would you
expect it to be?" — before helping.

---

### P1 · Approve a waiting visit request — priority A
> "The Village of Humber Heights put in a request over the weekend — they'd like a visit on
> **Thursday 22 October**, late morning. Have a look and let them know."

- **Anchor:** Humber Heights, **Thu 22 Oct** 10:30–11:30, `pending_review`, no registrations
  (volunteers can't see a visit until it's approved).
- **Done when:** approved. Whether they add a note to the org is the interesting part.
- **Watch:** about as core as PD functions get. Is the queue of waiting requests obvious from the
  dashboard, or did they go looking? Do they check anything before approving — date, fee tier,
  whether volunteers are likely to be free — or just accept it?

### P2 · Compliance sweep — priority A · **runs before P6 and P10**
> "Before month end you need to know everyone going out has valid paperwork. Anyone got a problem?"

- **Anchor:** five volunteers in distinct bad states (§4.4).
- **Done when:** they can say who has a problem. Fixing isn't required.
- **Watch:** is there one surface that answers this, or do they go volunteer by volunteer? Do they
  find all five, or only the ones the app badges? **Does anyone notice that the volunteer with the
  lapsed vaccine is already confirmed on an upcoming visit?** (plant B, §3)

### P3 · Edit a visit's details — priority A
> "Jeff at Sunnyview emailed. The main car park is closed for resurfacing from next week, so anyone
> coming needs to use the side entrance off Pinewood Avenue and park on the street. Can you get that
> updated so the people coming know?"

- **Anchor:** Sunnyview Elementary, **Tue 13 Oct** 10:00–11:00, approved, fully staffed.
  `org_contact_name = 'Jeff Mbeki'`, so the name corroborates on screen.
- **Done when:** the visit's parking instructions are updated.
- **Watch:** do they find the edit path at all? And having changed something the attending
  volunteers need to know, **do they expect those volunteers to be told** — do they go looking for a
  way to notify them?

> **This used to be a reschedule, and shouldn't be.** Moving a visit that already has volunteers
> signed up needs them notified and arguably re-confirmed, and the app has no flow for that. Asking a
> PD to do it would have been teaching a habit the product can't yet support safely, and the
> interesting finding would have been buried in an operation they shouldn't be performing. The
> underlying gap is worth raising **in the debrief instead** (see §5), not by having someone do it.

### P4 · Dropout, then choose a replacement — priority A (chained)
> "Sarah Chen emailed — she has to drop out of the Toronto Hydro visit on **Thursday 15 October**.
> There are four people waiting for a spot. Sort it out, and pick whoever you think fits best."

- **Anchor:** Toronto Hydro – Milner Site, **Thu 15 Oct**. `volunteer_slots = 3`,
  `min_volunteers = 2`, 3 confirmed (including Sarah Chen / volunteer.1), **4 waitlisted**.
- **Done when:** Sarah's registration is cancelled **and** one named waitlister is promoted.
- **Watch:** two operations from one request — do they do both, or stop after removing Sarah? The
  visit is deliberately **full** to begin with, so the open spot only exists once they act. If they
  try to promote first they'll hit *"This visit is full. Remove a volunteer or raise the maximum."*
  — does that tell them what to do? And on what basis do they choose between four people: is the
  information they'd want even on screen?

### P5 · Create a visit — priority A
> "Patricia at Nisbet Lodge called. She'd like a visit on **Wednesday 14 October** at 2pm, about 25
> residents in their main lounge. Two dogs ideally."

- **Anchor:** Nisbet Lodge exists (PD-managed) with history, but has **no** visit on 14 Oct.
- **Done when:** approved visit, Wed 14 Oct 14:00, ~25 expected, 2 dogs.
- **Watch:** min versus max dogs — "two ideally" is ambiguous and that ambiguity is the point. Do
  they set a range or a fixed number? Do they notice the org's saved defaults prefilling?

### P6 · Review a submitted document — priority A
> "One of your volunteers uploaded a new police check over the weekend. Deal with it."

- **Anchor:** one volunteer with `vsc_verification_status = 'pending_review'` and an upload comment.
- **Done when:** approved, or rejected with a reason.
- **Skip if P2 already led them here.**
- **Watch:** can they open and read the document? Do they feel able to judge it? If they reject,
  the reason they write is now shown back to any admin or PD who opens that document later.

### P7 · Cancel a visit, then see what the org received — priority A
> "The contact at Markham Stouffville has just been told their unit is closed to visitors for a
> month. Their visit on **Friday 16 October** isn't happening."

- **Anchor:** Markham Stouffville Hospital, **Fri 16 Oct**, approved, 2 confirmed volunteers.
- **Done when:** cancelled, **with a reason recorded** — it goes to `visits.admin_note`, the same
  field P15 later asks someone to go and find.
- **Then show them the email the org received.** Ask: *is that what you'd want to have gone out?*
- **Watch:** do they expect the volunteers to be told too? Do they look for somewhere to say why?

### P8 · Create an org that will never self-register — priority A
> "Lakeshore Lodge, a retirement home in Etobicoke. You've already spoken to their activities
> coordinator, Dana Whitfield, and you're happy to go ahead — but she's never going to fill anything
> in online. Get them into the system so you can start booking visits for them."

- **Anchor:** none — Lakeshore Lodge must **not** exist in the seed.
- **Done when:** a PD-managed org exists for Lakeshore Lodge.
- **Watch:** do they reach for the PD-managed org path, or hunt for an invite flow? Address entry
  goes through Google Places — does that help or get in the way?

### P9 · Approve a new org, and notice it isn't theirs — priority A
> "A new organisation registered online overnight. Take a look, decide whether to let them in — and
> whether they're actually yours."

- **Anchor:** ErinoakKids Centre, `pending`, sitting in **Toronto's** queue but with a
  **Mississauga** address, marked `region_assignment_method = 'manual'` — boundary auto-assignment
  could never produce that pairing, so the honest story is that a human filed it there by hand.
- **Done when:** approved, and ideally reassigned to the Mississauga region.
- **Watch:** do they spot the geography at all? The closing clause is the only nudge — if they
  approve it into their own region without noticing, that's the finding.

### P10 · Retrieve a document — priority B
> "Jeff at Sunnyview has asked for a copy of James Okafor's police check for their records before
> the visit next week. Can you send it over?"

- **Anchor:** James Okafor (volunteer.4), VSC approved, confirmed on the Sunnyview visit.
- **Done when:** they locate the document and open or download it.
- **Read-only, so it safely shares P3's org** — it changes nothing, unlike every other prompt.
- **Watch:** this is *retrieval*, not review. P6 reaches a document through the review queue; here
  nothing is pending, so they have to find a volunteer's file cold. Can they? Does the signed URL
  actually open — it expires after an hour, so a stale tab fails silently.

### P11 · Close off last week — priority B
> "Last week's visits — anything you need to close off?"

- **Anchor:** Humber Heights, **Mon 28 Sep**, approved with its end time already past.
- Visits earlier in the session week will also have passed by a Thursday or Friday session, so this
  queue holds 1–3 depending on the day.
- **Done when:** at least one marked complete.
- **Watch:** do they find the awaiting-completion view, or scroll the main list? Does "complete"
  mean anything to them, or feel like busywork?

### P12 · Approve a new volunteer — priority B
> "Someone signed up as a volunteer a couple of days ago. Have a look and decide."

- **Anchor:** Leah Brandt, `pending`, dog registered, documents uploaded but unverified, Toronto
  postcode, correctly auto-assigned to Toronto. Nothing is wrong with her — this is the clean case.
- **Done when:** approved or denied.
- **Watch:** do they review the documents as part of approving, or treat the two as separate jobs?
  Do they check anything else before approving — location, dog, travel distance?

### P13 · Update an org's contact — priority B
> "Nisbet Lodge have had a staff change — Patricia has left and their new activities coordinator is
> Dermot Hanley, dermot.hanley@sunshinedogs.app. Update their details."

- **Anchor:** Nisbet Lodge (PD-managed, so editable), `org_contact_name = 'Patricia Oyelaran'`.
- **Done when:** contact name and email updated.
- **Watch:** extremely common in reality and nothing else covers it. Do they find org editing at
  all? Does changing the contact affect anything already booked — and do they expect it to?

### P14 · Decline a request — priority B
> "North York Central Library have asked for a session on **Monday 12 October**. Have a look and let
> them know."

- **Anchor:** North York Central Library, **Mon 12 Oct** 15:30–16:30, `pending_review`.
- **Three to six days' notice** depending on the session day — tight enough that declining is
  defensible, loose enough to be a judgement call. The ambiguity is deliberate.
- **Done when:** declined with a reason, or approved with an explanation of how they'd staff it.
- **Watch:** do they find the decline path, and does anything prompt them for a reason?

### P15 · Find out what happened — priority C
> "Someone from Toronto Metro rang asking why their September session was called off. Can you find
> out what happened?"

- **Anchor:** Toronto Metro University, **Tue 22 Sep**, `cancelled`, reason in `admin_note` (room
  reallocated to an exam sitting at short notice; they want to rebook in November).
- **Done when:** they can say why it was cancelled.
- **Watch:** cancelled visits aren't on the default view — do they know where history lives? Is the
  reason legible once they get there, or buried?

### P16 · Why can't she sign up? — priority C (diagnostic)
> "Amanda rang — she wants in on the LiveNation visit on **Tuesday 20 October**, but the sign-up
> won't let her. Can you sort it?"

- **Anchor:** LiveNation – RBC Amphitheatre, **Tue 20 Oct**. `volunteer_slots = 3`,
  `min_volunteers = 2`, 2 confirmed, **1 waitlisted** (Nicole Ferrante). Amanda Reyes is compliant
  and not registered.
- **Why she's blocked:** `isWaitlistOnly()` — while anyone is waitlisted, open spots are held for
  the PD, so new sign-ups queue instead of taking them.
- **Done when:** Amanda is confirmed (PDs *can* add volunteers directly), or they promote Nicole
  and can explain the hold.
- **Watch:** can they work out *why* she was blocked? Nothing on screen states the rule.

---

## 3. Planted but never prompted

Deliberately unmentioned. If every problem comes with a prompt, you only learn whether people can
follow instructions. Raise these **in the debrief**, not during the session.

**A · Understaffed visit outside the alert window.** Scarborough Community Hospice, **Mon 26 Oct**,
`min_volunteers = 4`, **0 confirmed**. The red-flag rule (`belowMinSoon`) only fires inside 14 days,
so this gets **no alert at all** despite being the most at-risk visit on the board.
→ Debrief: *"did you notice anything about the Scarborough visit on the 26th?"*

**B · Lapsed vaccine on a confirmed volunteer.** A volunteer whose dog's vaccine expired ~3 weeks
ago, already `confirmed` on the **Mon 19 Oct** TDSB visit. Registration checks only run at sign-up
time, so an existing registration persists silently after the document lapses.
→ Debrief: *"if someone's paperwork expires after they've signed up, what happens?"*

**C · Flagged understaffed visit, for contrast with A.** TDSB Dr. Rita Cox, **Mon 19 Oct**,
`min_volunteers = 3`, 1 confirmed → inside the window, so it **does** carry a red flag. Whether they
find A as readily as C tells you how much work the badge is doing.

> Date note: 19 Oct is inside 14 days and 26 Oct outside it for every session day Tue 6th – Fri 9th,
> so A stays silent and C stays flagged regardless of which day a session runs.

---

## 4. Seed specification

### 4.1 Keep from the current DB
- `pd_regions` + `pd_region_places` — all 5 regions with fetched boundaries (expensive to rebuild)
- `admin.test@`, `toronto.pd@`, `mississauga.pd@`, `oakville.pd@`
- `organization.1-10@` (account-holding) — unarchive 8, leave 2 archived for the archived view
- `volunteer.1-5@` as-is (Clerk-backed)
- The 5 existing PD-managed orgs, **with external emails scrubbed to `@sunshinedogs.app`**:
  Toronto Hydro (`alannabee32@gmail.com`) and Nisbet Lodge (`test@test.com`)

### 4.2 Remove
- All `visits`, `visit_registrations`, `visit_notes`
- The 7 non-numbered volunteers and 2 archived volunteers (incl. all remaining external emails)
- The `individual` account
- Deprecated-feature tables: `appointments`, `appointment_chats`, `chat_logs`, `chat_requests`,
  `message_read_status`, `pending_email_notifications`, `individual_audience_tags`, `device_tokens`

### 4.3 Create
- `volunteer.6-10@` in Clerk + Supabase, completing the numbered set
- ~10 further volunteers as **DB-only rows** (no Clerk) — nobody logs in as them
- ~3 further PD-managed orgs, plus the P5 pending org (Mississauga) — Lakeshore Lodge deliberately absent
- 1 pending volunteer for P10

> **Pending users must carry a region.** `/api/admin/pending-users` filters PDs with
> `.in('assigned_region_id', regionIds)`, and SQL `IN` never matches `NULL` — an unassigned pending
> user is invisible to every PD, and only an admin ever sees them. P5's org and P10's volunteer are
> therefore assigned to **Toronto** while their addresses sit in Mississauga and Oakville, so both
> prompts still turn on whether the PD notices the geography. (This is also a real production gap:
> if boundary auto-assignment fails, that signup silently reaches no PD.)

### 4.4 Volunteers — ~20 total
| State | Count | Notes |
|---|---|---|
| Clean, approved, compliant | 14 | background |
| VSC `pending_review` | 1 | P7 target |
| Vaccine `pending_review` | 1 | surfaces in P6 |
| Vaccine `rejected`, awaiting re-upload | 1 | has a rejection reason |
| VSC expiring in 11 days | 1 | needs chasing; may not be badged |
| Vaccine expired ~3 weeks ago **+ confirmed on 19 Oct** | 1 | silent plant B |
| Pending new signup | 1 | P10 target |

All compliance documents point at shared fixtures under
`compliance-documents/scenario-fixtures/`. Verification state lives in the database, not the file,
so one plausible certificate serves every volunteer.

### 4.5 Visits — 45 total
| Band | Count | Status |
|---|---|---|
| Jun – Sep | 14 | `completed` — gives org pages history |
| 18 – 22 Sep | 2 | `cancelled`, each with a reason in `admin_note` (P16) |
| 28 Sep – 1 Oct | 3 | one `approved` with end time past (P11), two `completed` |
| **8 – 10 Oct** | **5** | **this week — two on Thu 8th (one full with a waitlist), two Fri, one Sat** |
| 12 – 16 Oct | 8 | incl. P1, P4, P8, P14 anchors |
| 19 – 29 Oct | 7 | incl. P1, P16, plants A and C |
| Nov | 4 | healthy, approved |
| scattered | 1 | one `declined` |

The 7–10 Oct group exists so "Coming up this week" isn't empty — it was, and it looked wrong. These
are explicit rather than generated, because the weighted org pool spreads across all regions and
too few landed in Toronto. Visits earlier in the week will have passed by a later session and move
to awaiting completion; that drift is realistic.

Two sit in `pending_review` — P1's request to approve and P14's to decline. There is deliberately
no third: unanchored pending requests were just noise in the queue.

Across **10-12 repeating orgs**, not 36 distinct ones — real orgs book repeatedly, and 36 different
names reads as fake immediately.

Regional split: Toronto carries the scenario; Mississauga and Oakville get genuine background volume
attributed to their own PDs; Waterloo and Kingston stay sparse (no owner PD, so visits there land
with none).

### 4.6 Hard constraints on the generated data
1. **Anchor uniqueness.** Each anchor must be unambiguous on the identifiers its prompt uses. No
   other visit for the same org within ±3 days of an anchor, or "their visit next Tuesday" stops
   resolving. An anchor can widen that window with `blackoutDaysAfter` when its prompt's premise
   demands it — P7 says Markham Stouffville is closed to visitors for a month, so it claims 31 days
   and the generator gives that org nothing else in the window. Without it the board contradicted
   the prompt.
2. **No overlapping registrations** for the same volunteer. The app has no double-booking detection
   and that's parked — background noise must not accidentally raise it.
3. **Suppress both crons.** Set `staffed_notified_at` on every seeded visit and `reminder_sent_at`
   on every seeded confirmed registration. Otherwise the hourly and 6-hourly crons dump mail into
   the PD's forwarded inbox and bury the emails their own actions caused. Suppression also stops the
   staffed cron nulling `min_reached_at` and drifting the seed between sessions.
4. **Every email ends `@sunshinedogs.app`.** Asserted, not assumed — one stray external address
   means real mail to a real person, repeatedly, every cron cycle.
5. **Let sequences assign ids.** Don't insert with explicit ids, or the first visit a PD creates in
   the UI fails on a primary-key collision.
6. **Dates relative to a fixed reference (Mon 5 Oct).** Frozen by the snapshot, so all action
   anchors sit ≥3 days out even for a Friday session.

---

## 5. Running the sessions

**Warm the database up ~5 minutes before each session.** DevDB is on Supabase's free tier, which
is shared compute — the first queries after an idle spell are slow, and a sluggish first paint will
colour everything a PD says about the app afterwards. Just load the dashboard yourself beforehand.
Free projects also pause after 7 days idle and need a manual restore, so if there's a gap between
prep and the sessions, check it's awake on the morning.

**Reset between sessions:** restore the snapshot (~20s), then run the verification pass. Also sign
the shared PD account out of Clerk, since all sessions use the same credential.

**Email forwarding:** add the PD to the `@sunshinedogs.app` catch-all forward **for the duration of
their session only**, so they see what their orgs and volunteers receive. Remove it afterwards.
Don't make inbox-watching part of the task flow — use it at P8, and again in the debrief.

### Do NOT correct these — they are findings, not mistakes
- **PDs cannot create a volunteer profile**, though they can create an org. If someone tries, let
  them. The asymmetry is worth knowing about.
- **Badge counts vs list filter.** Counts are scoped to the PD (`assigned_pd_id = me`); the list
  follows the region filter and can be set to "all". A PD on "all" sees ~36 visits while their
  badge says ~13.
- **No reporting.** If they ask for quarterly numbers, there's nowhere to get them.
- **No double-booking detection.** Volunteers manage their own calendars.
- **Removing a volunteer is silent and unrecorded.** The DELETE endpoint accepts `admin_note` and
  the column exists, but the UI never asks for one and nothing ever displays it. More importantly
  there is **no email to the volunteer** — the route carries a `// TODO`. A removed volunteer is
  told nothing and would turn up. (A dedicated prompt for this was dropped: the plumbing is a stub,
  so the task would have measured the stub. Ask about it in the debrief instead.)
- **Rescheduling doesn't notify anyone.** Changing a visit's date or time leaves signed-up
  volunteers uninformed, which is why P3 asks for a parking change instead.

### Facilitator checklist (private — tick, don't prompt)
```
Opener     noticed red-flagged visit (TDSB 19 Oct)        ☐
           noticed pending requests / new registrations   ☐
           first click: ______________________________

P1  ☐ done ☐ partial ☐ stuck     P10 ☐ found doc ☐ opened it
P2  ☐ found __ of 5 problems     P11 ☐ done ☐ partial ☐ stuck
P3  ☐ done ☐ partial ☐ stuck     P12 ☐ approved ☐ noticed region
P4  ☐ removed Sarah ☐ promoted   P13 ☐ done ☐ partial ☐ stuck
P5  ☐ done ☐ partial ☐ stuck     P14 ☐ declined ☐ gave reason
P6  ☐ done ☐ partial ☐ stuck     P15 ☐ done ☐ partial ☐ stuck
P7  ☐ cancelled ☐ gave reason    P16 ☐ done ☐ partial ☐ stuck
P8  ☐ done ☐ partial ☐ stuck
P9  ☐ approved ☐ noticed region
```

### Debrief
**About the app**
- What was confusing or hard to find?
- Anything you expected to see that wasn't there?
- If you were training a new PD on this, what would need explaining that shouldn't?
- *Did you notice anything about the Scarborough visit on the 26th?* (plant A)
- *If someone's paperwork expires after they've already signed up, what happens?* (plant B)
- Here's everything the system sent on your behalf in the last hour — anything surprise you?
- **If an org needed to move a visit that already had volunteers signed up, what would you expect to
  happen?** (The app has no notify-or-re-confirm flow for this. Asking is safer than having them do
  it — see P3.)
- **How often do you actually have to take a volunteer off a visit** — a site asking for a
  particular pairing not to return, say? What would you want to happen: does the volunteer get told,
  by whom, and is there anywhere you'd want to record why so the next PD doesn't rebook them? (The
  app currently does none of this; a prompt for it was dropped as out of scope.)

**About their actual work**
- Walk me through what happens today when an org wants to book a visit.
- What's the most annoying part of your current process?
- What do you find yourself looking up most often?
- Anything you do regularly that we didn't touch today?
- **What do you actually call these — visits, sessions, events, bookings?** (staff differ; three PDs
  in a row is the cheapest way to settle it)
