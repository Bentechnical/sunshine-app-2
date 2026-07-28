# Future Features

Post-pilot feature work, roughly in priority order. Each item is self-contained and doesn't block the others unless noted.

---

## Invoicing

Auto-create an invoice record when a visit is marked complete. Admin reconciles payment manually in the app (cash, cheque, e-transfer). Invoice email sent to org billing contact with amount and payment instructions.

The visits table already has fee tier and fee amount fields. This is primarily a new `invoices` table, an admin invoice dashboard, and a few email templates.

Stripe / online payment is a later addition once the manual flow is stable.

See [ORGANIZATION_VISITS_PLAN.md](../ORGANIZATION_VISITS_PLAN.md) for full schema spec.

---

## Automated Communications

Triggered notifications that currently require manual admin action or don't exist yet:

- **48h reminder** to confirmed volunteers before a visit (with arrival details and co-volunteer names)
- **Waitlist promotion** — when a slot opens, email the next waitlisted volunteer with a 24h window to confirm; if no response, invite the next in queue
- **Cancellation urgency alert** — if a volunteer cancels within 72h of the visit, flag the admin/PD notification as urgent
- **Slot filled confirmation** — notify org contact when all volunteer slots are filled
- **VSC / vaccine expiry reminders** — 60, 30, and 7 days before a volunteer's documents expire

---

## Volunteer Onboarding Pipeline

Allows PDs to manage the full candidate-to-active-volunteer pipeline from the app, replacing the Candidates spreadsheet. Relevant once the pilot is complete and Sunshine is ready to onboard new volunteers through the app.

Key stages: application received → interview → assessment session → probation visits → active.

See [VOLUNTEER_ONBOARDING.md](VOLUNTEER_ONBOARDING.md) for full detail.

---

## Google Sheets Mirror

A cron-synced read-only Google Sheet that gives the ED and PDs an always-current backup of app data without requiring app access. Resilience against app downtime; also useful for external stakeholders.

See [GOOGLE_SHEETS_MIRROR.md](GOOGLE_SHEETS_MIRROR.md) for full detail.

---

## Statistics & Reporting

- Volunteer visit counts by period and region
- Organization visit history
- Regional activity breakdowns
- Admin calendar density view (which dates are heavily or lightly booked)

---

## Recurring Visits

Weekly or monthly visits with the same organization. The schema already has `recurrence_rule` and `parent_visit_id` columns reserved. UI and scheduling logic not yet built.

---

## Native Mobile App (Capacitor)

iOS and Android wrappers around the web app using Capacitor. Scaffolding exists. Paused pending pilot completion and a clearer picture of whether volunteers prefer native app vs. PWA.

See [NATIVE_APP_DEPLOYMENT.md](NATIVE_APP_DEPLOYMENT.md) for full detail.

---

## Use Case 1 Revival — Individual Visits

The original 1:1 visit flow between volunteers and individual members. Reached a working state and was piloted with a small beta group. Code is preserved. Intended for revival once the org visits system is stable and adopted.

---

## Stabilization

- Remove dead code: old `appointment_availability` system, unused columns
- Resolve the two overlapping scheduling systems (`appointments` + `chat_requests`) — decide which wins for UC1 revival
- Consider onboarding a second developer or documenting for a contractor
- Stripe / Wave payment integration (once manual invoicing is running)
