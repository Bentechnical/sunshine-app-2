# Sunshine App — Project Status Briefing

**Last updated:** September 2026


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

The core visit lifecycle is fully implemented. Organizations (or guests without an account) submit visit requests via the app. Admin or PD reviews and approves the request, at which point it becomes visible to volunteers. Volunteers browse upcoming visits filtered by their travel radius, see slot availability, and sign up or join a waitlist. Compliance requirements (VSC/police check, vaccine records) are enforced at signup. When a confirmed volunteer cancels, the slot reopens for the next waitlisted person (manual promotion for now). Admins and PDs can manage all of this through dedicated dashboards, including removing volunteers, adding notes, sharing contact info with orgs, and marking visits complete.

**Admin-managed organizations** are complete. Admins can create "virtual" org records without a Clerk account, storing reusable details (name, address, contact, fee tier, logo, default visit settings) and grouping visits under them. These use synthetic IDs (`managed_<uuid>`) in the `users` table with `is_admin_managed = true`. Managed orgs can be linked to a real Clerk account later (transferring visit history), or a real org can be "detached" to a managed org. Org default fields (parking, arrival instructions, accessibility, space, dogs needed, VSC requirement) are included and prepopulate the visit creation form.

The **compliance document system** is functional — volunteers upload VSC and dog vaccine records, stored in private Supabase storage, accessible to admins and PDs via signed URLs. An admin compliance dashboard shows document status across all volunteers.

The **PD regions system** is complete. Admins define geographic regions using Google Places boundaries (backed by OSM polygons). Volunteers and organizations are auto-assigned to a region on approval based on FSA (postal code area) matching or geographic proximity. PDs have scoped dashboard views limited to their region with My Region / All toggles.

**Google Calendar integration** is wired up — events are created when visits are approved, attendees managed when volunteers join/cancel, and events cancelled when visits are cancelled. Uses a Google service account with a shared calendar.

**Email notifications** cover the core visit lifecycle: visit request received, approved, declined, volunteer signup confirmed, waitlisted, admin-assigned, visit cancelled, and 48h visit reminders. All use Resend with Handlebars templates.

The **organization dashboard** allows registered orgs to view their visits (upcoming, pending, past), request new visits, and edit their profile. Visit detail views show confirmed volunteers with dog information.

**Registration flows** support all five user roles (individual, volunteer, organization, PD, admin) with role-specific profile steps including compliance document uploads for volunteers.

### What's not yet done

**Invoicing** — auto-created when a visit is marked complete; admin reconciles payment manually. Not yet built. This is the next planned feature (Phase 1.5).

**Automated waitlist promotion** — when a confirmed volunteer cancels, the next waitlisted volunteer should be automatically emailed with a 24h confirmation window. Currently this is a manual admin action.

**Some email triggers** — a few notification emails are not yet implemented: volunteer removed from visit by admin, all slots filled notification to org, urgent cancellation alert (<72h).

### Deferred by design

- **Automated compliance reminders** — 48h visit reminders exist, but VSC/vaccine expiry reminders (60d/30d/7d) are Phase 2
- **Recurring visits, statistics dashboard, Stripe, volunteer onboarding pipeline** — see [future/FUTURE_FEATURES.md](future/FUTURE_FEATURES.md)

### Current status

The system is entering **beta testing** — see [BETA_TESTING_PLAN.md](BETA_TESTING_PLAN.md) for the full plan. All features on the `org-visits` branch need to be merged to main and deployed to production with database migrations before testing begins.

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

- **Visit workflow validation with Alanna** — The beta test (Phase 1) will serve as the hands-on walkthrough with Alanna to validate the full transaction flow. Key areas to get feedback on: waitlist promotion steps, volunteer-facing language, whether visit details should lock after approval, and any gaps between the app's workflow and how Sunshine actually operates today.
