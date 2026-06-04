# Roadmap

> High-level phased plan. Each phase is a self-contained unit of value that doesn't require the next phase to be useful.

---

## Phase 1 — Volunteer Onboarding Pipeline

**Goal:** PDs can manage the entire candidate-to-active-volunteer pipeline from the app. The Volunteer Master List spreadsheet becomes optional backup rather than the system of record.

**Deliverables:**
1. PD email notification on new application
2. Candidate pipeline view (replaces Candidates spreadsheet tab)
3. Interview tracking (date, outcome, notes)
4. Assessment sessions + time-slot registration (replaces BCC email chain)
5. Assessment outcome recording (pass / conditional / retest / fail)
6. Probation visit tracking (0 / ½ / Approved)
7. Emergency contact collection (post-assessment)

**Success criterion:** A new PD with no spreadsheet access can fully manage their region using the app alone.

See [VOLUNTEER_ONBOARDING.md](VOLUNTEER_ONBOARDING.md) for full detail.

---

## Phase 2 — Google Sheets Mirror

**Goal:** PDs and ED always have a human-readable, always-current backup of app data that doesn't require app access. Transparent to external stakeholders. Also provides resilience if the app becomes unavailable.

**Deliverables:**
1. Google service account setup + Sheet created + shared
2. `utils/googleSheets.ts` auth + write helpers
3. Cron sync job (every 4 hours): one tab per region, candidate pipeline data
4. Extend to approved volunteers tab (daily)
5. Extend to org visits tab (daily)

**Success criterion:** ED can open the Google Sheet at any time and see an accurate, region-organized view of candidate pipeline status without logging into the app.

See [GOOGLE_SHEETS_MIRROR.md](GOOGLE_SHEETS_MIRROR.md) for full detail.

---

## Phase 3 — Organization Visits (Complete + Tie Together)

**Goal:** Finish the org visits feature and connect it to the onboarding pipeline, so the full volunteer lifecycle — from candidate to probation to active org visits — flows through the app end-to-end.

**Likely deliverables** (to be scoped when Phase 1/2 are done):
- Finalize any outstanding org visit functionality
- Probation visits counted against actual visit registrations (not just manual PD update)
- Conditional pass flag visible during visit signup
- Dormant volunteer detection (hasn't signed up for visits in 60+ days) → cron alert to PD
- Sheets mirror extended to org visits tab

---

## Phase 4 — Stabilization + Documentation

**Goal:** Make the codebase legible and maintainable by someone other than the original developer. Reduce single-point-of-failure risk. Clear the tech debt backlog.

**Deliverables:**
- Complete, accurate documentation (schema, architecture, workflows)
- Remove dead code: old `appointment_availability` system, unused DB columns (`visits.recurrence_rule`, `visits.parent_visit_id`, etc.)
- Resolve dev/prod DB discrepancies
- Resolve the two overlapping scheduling systems (appointments + chat_requests) — decide which wins, remove the other
- Consider onboarding a second developer or documenting the system well enough for a contractor to pick it up
- Review single-developer dependency risk with ED/Alan

See [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md) Known Issues section for the full tech debt list.
