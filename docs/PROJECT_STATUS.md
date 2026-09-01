# Sunshine App — Project Status Briefing

**Last updated:** July 2026


---

## What This Is

A custom web app for Sunshine Therapy Dogs, a nonprofit that coordinates therapy dog visits. The app replaces a manual, spreadsheet-driven process for managing volunteers, organizations, and visit scheduling.

Built on Next.js 15 (App Router), Clerk (auth), Supabase/PostgreSQL (database), Resend (email), and Vercel (hosting).

---

## Two Use Cases — One Active

The app supports two distinct flows that share the same user accounts and infrastructure but mostly operate independently.

The original goal of this project was to address use case 1, however after reassessment of organizational needs, we have refocused the project to primarily to use case 2. The goal is to eventually reintroduce solutions for use case 1 at some point in the future. 

**Use Case 1 — Individual Visits (paused)**
One-on-one visits between volunteers and individual members. This was the original focus of the app and reached a working state including testing with a beta group. It is intentionally paused while Use Case 2 is built out. The code remains in place for revival later. This includes the Stream Chat messaging system and individual availability/scheduling system.

**Use Case 2 — Organization Visits (active)**
Group visits to institutions (schools, hospitals, care homes, etc.). This is where ~90% of Sunshine's actual business is today. All current development is here.

---

## User Roles

| Role | Description |
|------|-------------|
| `volunteer` | People with therapy dogs; browse and sign up for visits |
| `organization` | Institutions that request visits |
| `pd` | Program Directors; lower-access admin user, manage visits and volunteers within their region |
| `admin` | Full super-admin access |
| `individual` | Individuals seeking 1:1 visits (Use Case 1, paused) |

---

## Organization Visits — Current State

### What's working

The core visit lifecycle is in place. Organizations (or guests without an account) submit visit requests via the app. Admin or PD reviews and approves the request, at which point it becomes visible to volunteers. Volunteers browse upcoming visits filtered by their travel radius, see slot availability, and sign up or join a waitlist. Compliance requirements (VSC/police check, vaccine records) are enforced at signup. When a confirmed volunteer cancels, the system identifies the next person in the waitlist queue. Admins and PDs can manage all of this through dedicated dashboards, including removing volunteers, adding notes, and marking visits complete.

The compliance document system is also functional — volunteers upload VSC and dog vaccine records, stored in private storage, accessible to admins via signed URLs.

The PD regions system is complete. Admins define geographic regions using Google Places boundaries (backed by OSM polygons). Volunteers and organizations are auto-assigned to a region on approval. PDs have scoped dashboard views limited to their region.

### What's not yet done

**Admin-managed organizations** — Admins can create "virtual" org records without a Clerk account, storing reusable details (name, address, contact, fee tier, logo) and grouping visits. These use synthetic IDs (`managed_<uuid>`) in the `users` table with `is_admin_managed = true`. Managed orgs can be linked to a real Clerk account later (transferring visit history), or a real org can be "detached" to a managed org (ownership transfer). Implementation complete, pending testing. See [ORGANIZATION_VISITS_SCHEMA.md](ORGANIZATION_VISITS_SCHEMA.md) Migration 32.

**Org default fields** — Store org-level defaults (parking, arrival instructions, special needs, space) that prepopulate the visit creation form. Not yet built; will add ~5-7 columns to users table.

**Google Calendar integration** — The code is wired up to call the calendar utility at the right moments (visit approved, volunteer joins, volunteer cancels, visit cancelled), but the integration itself hasn't been built out.

**Email notifications** — Some email templates missing. Affected triggers: visit request received, approved/declined, volunteer signup confirmed/waitlisted, volunteer removed, visit cancelled.

**Minor todos** — the guest visit request form collects a subset of the available fields (audience type, space details, accessibility notes); admins can fill these in after the fact. These are polish items, not blockers.

### Deferred by design

- **Invoicing** — auto-created when a visit is marked complete; admin reconciles payment manually. Not yet built.
- **Automated reminders** — 48h visit reminders to confirmed volunteers, cancellation urgency alerts, VSC/vaccine expiry reminders, waitlist promotion with 24h response window
- **Recurring visits, statistics dashboard, Stripe, volunteer onboarding pipeline** — see [future/FUTURE_FEATURES.md](future/FUTURE_FEATURES.md)

---

## Infrastructure Notes

- **Deployment:** Vercel. Branch-based preview environments for staging. Production at sunshinedogs.app.
- **Database:** Supabase (PostgreSQL). Row Level Security enabled on all tables. Admin operations use a service role key server-side.
- **Auth:** Clerk handles sign-in/sign-up; a Svix webhook syncs new users to Supabase on creation.
- **No automated tests.** Manual test scripts exist in `/scripts/` for specific flows.
- **No error monitoring** (e.g. Sentry) currently configured.

---

## Open Questions & Pending Decisions

Things that need input, a conversation, or a decision before they can be built or finalised.

- **Visit workflow process review** — Connect with Alanna to walk through the full transaction flow from the org/volunteer side: waitlist promotion steps, what language volunteers see when confirming attendance, when (if ever) visit details become locked for editing after approval. Want to make sure the process matches how Sunshine actually operates before finalising the UX around these touchpoints.
