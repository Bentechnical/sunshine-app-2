# Organization Visits System — Planning Document

**Status**: Planning / Pre-Development
**Last Updated**: May 2026
**Scope**: New feature system enabling organizations (schools, hospitals, care homes, etc.) to request therapy dog visits, volunteers to browse and sign up for those visits, and admins/PDs to manage the full lifecycle.

---

## Table of Contents

1. [Overview](#overview)
2. [User Types & Permissions](#user-types--permissions)
3. [Phase Breakdown](#phase-breakdown)
4. [Database Schema Changes](#database-schema-changes)
5. [Feature Specifications](#feature-specifications)
6. [Google Calendar Integration](#google-calendar-integration)
7. [Email Triggers](#email-triggers)
8. [API Routes](#api-routes)
9. [Open Questions & Future Phases](#open-questions--future-phases)

---

## Overview

The existing app handles 1:1 therapy dog visits between individual users and volunteers. This system adds a parallel, separate flow for **group visits** to organizations: a many-volunteer, single-organization model with a distinct approval and scheduling workflow.

These two systems (individual visits and organization visits) are separate concerns and should not be conflated architecturally. They share user accounts (volunteers appear in both), but have independent tables, flows, and UI surfaces.

### Goals

- Allow organizations to submit visit requests via the app (account-based or guest form)
- Give admins and Program Directors tools to review, approve, and manage visits
- Allow volunteers to browse available visits and sign up, with a waitlist system
- Automate communications (email + Google Calendar invites) to reduce manual admin work
- Bring invoice tracking into the app, eliminating reliance on external spreadsheets
- Track volunteer compliance (VSC, dog vaccine records) within the platform

---

## User Types & Permissions

### New User Types

**`organization`** — Institutions such as schools, hospitals, and care homes that request visits. Can submit requests, view the status of their own requests, and receive communications about confirmed visits.

**`pd`** (Program Director) — Volunteer managers with near-full admin access over the organization visits system. Cannot access individual user records, the existing chat system, or individual-visit appointment data.

### Updated Role List

| Role | Description |
|------|-------------|
| `individual` | People seeking 1:1 therapy dog visits (existing) |
| `volunteer` | People with therapy dogs (existing, expanded) |
| `organization` | Organizations requesting group visits (new) |
| `pd` | Program Directors managing the org visit system (new) |
| `admin` | Full platform access (existing) |

### Permissions Matrix

| Capability | Individual | Volunteer | Organization | PD | Admin |
|---|---|---|---|---|---|
| Submit visit request | - | - | Yes | Yes (manual) | Yes (manual) |
| View own visit requests | - | - | Yes | - | - |
| Browse available visits | - | Yes | - | Yes (read) | Yes |
| Sign up for a visit | - | Yes (auto-confirmed) | - | - | - |
| Join waitlist for a visit | - | Yes | - | - | - |
| View confirmed visit details | - | Yes (own) | Yes (own) | Yes | Yes |
| Remove volunteer from a visit | - | - | - | Yes | Yes |
| Approve/decline visit requests | - | - | - | Yes | Yes |
| Create visits manually | - | - | - | Yes | Yes |
| Manage organizations | - | - | - | Yes | Yes |
| Manage volunteers | - | - | - | Yes | Yes |
| Manage invoices | - | - | - | - | Yes (full) |
| Access individual user records | - | - | - | - | Yes |
| Access chat system | Yes | Yes | - | - | Yes |
| Access individual appointments | Yes | Yes | - | - | Yes |
| VSC / vaccine admin | - | - | - | Yes | Yes |

### Implementation Note: PD vs Admin

PD is implemented as a separate `role` value in the `users` table (consistent with how existing roles work), not as a flag on the admin role. The dashboard routing logic and middleware will redirect PD users to a PD-specific dashboard that only surfaces the organization visits system.

---

## Phase Breakdown

### Phase 1 — Core System

The minimum viable system: organizations can request visits, admins/PDs can manage them, volunteers can browse and sign up.

- Organization user type and account registration
- Guest visit request form (no account required)
- Admin/PD manual visit creation
- Visit approval workflow (admin/PD reviews, approves/declines)
- Volunteer "Browse Visits" tab with radius-based geo filtering
- Volunteer signup and waitlist system
- Admin/PD approval of volunteer signups
- PD user type with scoped dashboard
- Google Calendar integration (visit creation, attendee management, cancellations)
- Core email triggers (request received, approved/declined, signup confirmed/declined)
- VSC and vaccine record fields added to volunteer profiles (data capture, no automation yet)

### Phase 1.5 — Basic Invoice Tracking

Prioritized shortly after Phase 1. Brings invoice management into the app without requiring payment processing.

- Invoice records auto-created when visit is marked complete
- Invoice email sent automatically to org contact with amount and payment instructions
- Admin invoice dashboard: view all invoices, filter by status
- Admin can manually mark invoices as paid and record payment method (cash, cheque, etransfer)
- Basic invoice status states: Draft, Sent, Paid, Overdue, Void

### Phase 2 — Automation & Compliance

- 48-hour reminder emails to confirmed volunteers (with arrival details)
- Volunteer cancellation flows: reason collection, admin urgency alerts (within 72h), waitlist promotion
- Post-visit feedback/notes (admin-only, attached to visit record)
- Cron-based VSC renewal reminders to volunteers (60d, 30d, 7d before renewal due)
- Cron-based vaccine record expiry reminders (60d, 30d, 7d before expiry)
- Org contact confirmation email when all volunteer slots are filled

### Phase 3 — Advanced Features

- Stripe payment processing (online payment links in invoice emails)
- Recurring visit support (weekly/monthly visits with the same organization)
- Visit statistics dashboard (volunteer visit counts, org visit history, region breakdowns)
- Admin calendar availability scan view (which dates are heavily/lightly booked)

---

## Database Schema Changes

### Changes to Existing Tables

#### `users` table — new columns

**Organization profile fields** (populated when `role = 'organization'`):

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `org_name` | text | YES | Organization name |
| `org_type` | text | YES | Type of org (school, hospital, care home, etc.) |
| `org_address` | text | YES | Organization's physical address |
| `org_contact_name` | text | YES | Primary contact person's name |
| `org_contact_phone` | text | YES | Primary contact phone number |

**Volunteer compliance fields** (populated when `role = 'volunteer'`):

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `vsc_date_issued` | date | YES | Date VSC was issued |
| `vsc_renewal_due` | date | YES | Date VSC renewal is due (issued + 3 years) |
| `vsc_document_url` | text | YES | Path to uploaded VSC document in private storage |

**New role values**: `role` column now accepts `'organization'` and `'pd'` in addition to existing values.

#### `dogs` table — new columns

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `vaccine_record_url` | text | YES | URL of uploaded vaccine record document |
| `vaccine_expiry_date` | date | YES | Date vaccine record expires |
| `vaccine_cycle_years` | integer | YES | Renewal cycle: 1 or 3 years |

### New Tables

#### `visits`

The core table for organization visit requests and scheduled visits. Distinct from the existing `appointments` table.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | integer | NO | auto-increment | Primary key |
| `title` | text | YES | - | Visit title or name |
| `organization_id` | text | YES | - | FK to users.id (null for guest submissions) |
| `guest_org_name` | text | YES | - | Org name for guest submissions |
| `guest_contact_name` | text | YES | - | Contact name for guest submissions |
| `guest_contact_email` | text | YES | - | Contact email for guest submissions |
| `guest_contact_phone` | text | YES | - | Contact phone for guest submissions |
| `visit_date` | date | NO | - | Date of the visit |
| `start_time` | timestamp with time zone | NO | - | Visit start time |
| `end_time` | timestamp with time zone | NO | - | Visit end time |
| `address` | text | NO | - | Visit location address |
| `location_lat` | double precision | YES | - | Geocoded latitude |
| `location_lng` | double precision | YES | - | Geocoded longitude |
| `audience_age_ranges` | text[] | YES | - | Array: children, youth, adults, seniors |
| `visitor_count_expected` | integer | YES | - | Expected number of visitors |
| `special_needs_notes` | text | YES | - | Mobility aides, special needs, etc. |
| `approx_space_sqft` | integer | YES | - | Approximate available space |
| `fee_tier` | text | YES | - | free, standard ($200), reduced ($50), custom |
| `fee_amount` | numeric | YES | - | Dollar amount (used when fee_tier = 'custom') |
| `volunteer_slots` | integer | NO | 1 | Number of volunteer slots (= dogs requested) |
| `parking_coverage` | text | YES | - | free_on_site, reimbursed_on_site, invoice |
| `parking_instructions` | text | YES | - | Parking location and access details |
| `arrival_instructions` | text | YES | - | Check-in location and access details |
| `accessibility_notes` | text | YES | - | Accessibility information |
| `requires_vsc` | boolean | YES | false | Whether VSC is required for this visit |
| `requires_vaccine_record` | boolean | YES | true | Whether vaccine records are required |
| `status` | text | YES | 'pending_review' | pending_review, approved, declined, cancelled, completed |
| `admin_note` | text | YES | - | Note from admin to org when approving/declining |
| `google_calendar_event_id` | text | YES | - | GCal event ID for sync |
| `created_by` | text | YES | - | FK to users.id (who created this record) |
| `recurrence_rule` | text | YES | - | Reserved for Phase 3 recurring visits |
| `parent_visit_id` | integer | YES | - | Reserved for Phase 3 recurring visit series |
| `created_at` | timestamp with time zone | YES | CURRENT_TIMESTAMP | Record creation time |
| `updated_at` | timestamp with time zone | YES | CURRENT_TIMESTAMP | Record update time |

#### `visit_registrations`

Tracks volunteer signups for visits, including waitlist state.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | integer | NO | auto-increment | Primary key |
| `visit_id` | integer | NO | - | FK to visits.id |
| `volunteer_id` | text | NO | - | FK to users.id |
| `status` | text | NO | 'confirmed' | confirmed, waitlisted, cancelled |
| `waitlist_position` | integer | YES | - | Position in waitlist (null if not waitlisted) |
| `admin_note` | text | YES | - | Note from admin when approving/declining |
| `contact_shared` | boolean | YES | false | Admin has explicitly shared volunteer contact info with this org for this visit |
| `cancellation_reason` | text | YES | - | Reason provided when volunteer cancels |
| `cancelled_at` | timestamp with time zone | YES | - | When cancellation occurred |
| `created_at` | timestamp with time zone | YES | CURRENT_TIMESTAMP | When signup was submitted |
| `updated_at` | timestamp with time zone | YES | CURRENT_TIMESTAMP | Last update time |

**Unique constraint**: `(visit_id, volunteer_id)` — one registration per volunteer per visit.

#### `visit_notes`

Admin/PD-only notes about a visit site, for internal reference.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | integer | NO | auto-increment | Primary key |
| `visit_id` | integer | NO | - | FK to visits.id |
| `author_id` | text | NO | - | FK to users.id (admin or PD) |
| `note_text` | text | NO | - | Note content |
| `created_at` | timestamp with time zone | YES | CURRENT_TIMESTAMP | When note was written |

#### `invoices` (Phase 1.5)

Tracks invoices for organization visits.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | integer | NO | auto-increment | Primary key |
| `visit_id` | integer | NO | - | FK to visits.id |
| `organization_id` | text | YES | - | FK to users.id (null for guest visits) |
| `billing_contact_email` | text | NO | - | Email to send invoice to |
| `billing_contact_name` | text | YES | - | Name on the invoice |
| `amount` | numeric | NO | - | Invoice amount |
| `fee_tier` | text | YES | - | Copied from visit at time of invoice creation |
| `status` | text | YES | 'draft' | draft, sent, paid, overdue, void |
| `sent_at` | timestamp with time zone | YES | - | When invoice email was sent |
| `paid_at` | timestamp with time zone | YES | - | When payment was confirmed |
| `payment_method` | text | YES | - | stripe, cash, cheque, etransfer, other |
| `stripe_payment_intent_id` | text | YES | - | Reserved for Phase 3 Stripe integration |
| `admin_notes` | text | YES | - | Internal notes on this invoice |
| `created_at` | timestamp with time zone | YES | CURRENT_TIMESTAMP | Record creation time |
| `updated_at` | timestamp with time zone | YES | CURRENT_TIMESTAMP | Last update time |

### RLS Policy Notes

- `visits` with status `approved` are readable by all authenticated users (volunteers browse them)
- `visits` with status `pending_review` or `declined` are only readable by admin, pd, and the submitting organization
- `visit_registrations` are readable by the volunteer who created them, and by admin/pd
- `visit_notes` are readable only by admin and pd
- `invoices` are readable by admin and pd only
- Organization users can read and create their own `visits` records
- Guest-submitted visits (no `organization_id`) are managed entirely by admin/pd

---

## Feature Specifications

### Organization Registration & Profile

- Organizations register with Clerk (same auth system as other users)
- Registration link is publicly accessible
- Registration form collects: org name, org type, primary contact name, email, phone, address
- Account is created with status `pending` — admin must approve before the org can submit visit requests (same flow as existing volunteer/individual approval)
- Once approved, each visit request the org submits also requires admin approval before going live to volunteers
- Organization dashboard shows: submitted requests and their status, confirmed upcoming visits, visit history

### Guest Visit Request Form

- Public form at `/request-a-visit` — no login required
- Collects all visit details plus org name, contact name, email, phone
- On submit: creates a `visits` record with `organization_id = null` and guest contact fields populated
- Submitter receives a confirmation email with a reference number
- Admin/PD notified of new pending request
- Guest users have no login — all communication via email

### Visit Request Form (Account Holders)

- Same fields as guest form, but accessible from org dashboard
- Org contact fields pre-filled from profile
- Submitted requests visible in org dashboard with live status updates

### Admin/PD Visit Management

- Dashboard section: "Visit Requests" — list of all pending_review visits
- Admin can: approve (with optional note), decline (with note), or edit details before approving
- Admin can manually create visits (for requests received outside the app)
- "Active Visits" view: all approved upcoming visits with volunteer slot status
- Visits within 2 weeks with unfilled slots are flagged prominently
- Per-visit detail page: full visit info, registered volunteers, waitlist, notes

### Volunteer Browse Visits

- New tab in the volunteer dashboard: "Organization Visits" (or "Browse Visits")
- Shows all approved upcoming visits within the volunteer's configured travel radius
- Uses existing `location_lat`/`location_lng` and `travel_distance_km` fields on volunteer profiles — PostGIS distance query against `visits.location_lat`/`location_lng`
- Filter options: audience age range, VSC required (yes/no/either), date range
- Each visit card shows: date, time, location, audience description, slots filled/remaining, VSC/vaccine requirements
- Visits that are full show remaining slot count as 0 and offer a "Join Waitlist" option
- Volunteers can view full details of any approved visit before signing up

### Volunteer Signup & Waitlist

Once a volunteer is approved in the system, they can join and leave visits freely without per-event admin approval. Admins and PDs retain oversight and can remove a volunteer from a visit if needed.

**Signing up (slots available):**
1. Volunteer clicks "Join Visit"
2. Registration created with status `confirmed` immediately
3. Volunteer receives a confirmation email with visit details
4. Volunteer is added as an attendee on the GCal event
5. Admin/PD can see the new registration in the visit detail view and can remove the volunteer if needed

**Signing up (slots full):**
1. Volunteer clicks "Join Waitlist"
2. Registration created with status `waitlisted`, assigned next `waitlist_position`
3. Volunteer receives confirmation that they are on the waitlist

**When a confirmed volunteer cancels:**
1. Slot re-opens
2. If waitlisted volunteers exist: the first in queue receives an email — "A spot has opened for [Visit Name]. Click here to confirm your attendance."
3. Volunteer clicks confirm → registration status moves to `confirmed`, volunteer added to GCal event
4. If the volunteer does not respond within a set window (e.g. 24 hours), the next waitlisted volunteer is invited
5. If no waitlist exists: admin/PD receives notification that the visit has an open slot

**When cancellation is within 72 hours:**
- Same flow as above, but the admin/PD notification is flagged as URGENT

### Volunteer Privacy & What Organizations Can See

Volunteer contact information is not shared with organizations by default. The goal is to keep all visit-related communications routed through Sunshine, preventing organizations from contacting volunteers directly to arrange visits outside the system.

**Default — what org users see about confirmed volunteers:**
- Volunteer's first name only
- Dog's first name and breed

**Not visible to org users by default:**
- Volunteer's last name
- Email address
- Phone number

**Admin-controlled contact sharing:**
- An admin or PD can explicitly enable contact sharing for a specific volunteer on a specific visit (e.g. for large public events, corporate bookings at secure sites where a volunteer needs to be on a guest list)
- This is stored as a flag on the `visit_registrations` record: `contact_shared: boolean`
- When enabled, the org user's confirmed visit view includes the volunteer's email and/or phone for that specific registration only
- This is an intentional manual action by admin — it is never automatic

**RLS / API enforcement:**
- API responses for org-facing visit detail endpoints filter out volunteer contact fields regardless of what is stored in the database
- Contact info is only included in the response when `contact_shared = true` on that specific registration and the requesting user is the org associated with that visit

### VSC & Vaccine Records

The existing volunteer database does not have VSC or vaccine record data. The system must support a gradual onboarding of this information for both new and existing volunteers.

**Document Storage:**
- Documents (VSC, vaccine records) are uploaded to a **private Supabase Storage bucket** — not publicly accessible
- Admins and PDs can view and download documents via signed URLs generated server-side on demand
- Volunteers can upload and replace their own documents but cannot access others'

**Volunteer Profile — Compliance Section (Phase 1):**
- New "Compliance Documents" section added to volunteer profile, visible to the volunteer and to admin/PD
- **VSC fields**: date issued, renewal due date (auto-calculated: issued + 3 years), document upload
- **Vaccine record fields**: document upload, expiry date, renewal cycle (1 year or 3 years — volunteer selects)
- Uploading a document is sufficient to unlock compliance-gated visits — no explicit admin verification step required ("trust plus ability to check")
- This section is also added to the volunteer onboarding flow for new volunteers

**Existing Volunteer Profiles:**
- Existing volunteers will have no compliance data on file
- A persistent banner/nudge is shown on their dashboard: "Action Required: Please upload your VSC and dog vaccine records to continue accessing visits"
- This surfaces the incomplete profile issue without blocking dashboard access
- Admins can manually upload documents on behalf of known volunteers (e.g. where paper records are already on file)
- Admin/PD compliance view shows which volunteers have outstanding documents

**Visit Signup Enforcement:**
- Volunteers can browse and view all approved visits regardless of their compliance status
- When a volunteer attempts to join a visit that `requires_vsc = true` and they have not uploaded a VSC document: they are blocked from signing up and shown a message explaining why
- Same logic applies to `requires_vaccine_record`
- This ensures compliance is enforced at the point of signup, not at the point of browsing

**Admin/PD Compliance View:**
- A dedicated compliance tab in the admin/PD dashboard
- Lists all volunteers with: VSC status (missing / uploaded / expiring soon / expired), vaccine status (same)
- Admins can click through to view and download any volunteer's documents
- Admins can upload documents on a volunteer's behalf
- Filterable by status to quickly surface volunteers who need attention

**Reminders (Phase 2):**
- Cron job checks VSC renewal dates and vaccine expiry dates daily
- Sends reminder emails to volunteers at 60 days, 30 days, and 7 days before expiry

---

## Google Calendar Integration

### Approach

- **One master calendar** owned by the organization, managed by the app via the Google Calendar API
- App has write access via a Google service account
- Calendar events are created when visits are approved, updated as volunteers are added/removed, and cancelled when visits are cancelled
- Volunteers and org contacts receive standard Google Calendar email invites when added as attendees
- Admins get a real-time overview of all visits by viewing the shared calendar

### Implementation Details

**Environment variables required:**
```
GOOGLE_SERVICE_ACCOUNT_EMAIL=...
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY=...
GOOGLE_CALENDAR_ID=...
```

**npm package**: `googleapis`

**Color coding**: GCal supports 11 color IDs. Fee tiers and visit types are mapped to specific colors, giving admins a visual at-a-glance overview of the calendar.

**Triggers and actions:**

| App Event | Calendar Action |
|-----------|----------------|
| Visit approved | Create event, invite org contact |
| Volunteer signup confirmed | Add volunteer email as attendee |
| Volunteer cancels | Remove volunteer from attendees |
| Visit details updated | Update event title/description/time |
| Visit cancelled | Cancel the calendar event |

**Event description template:**
Includes visit address, arrival/check-in instructions, parking details, on-site contact, audience description, and names of confirmed volunteers.

**Sync direction**: App → GCal only. The app is the source of truth. Changes made directly in GCal are not reflected back.

---

## Email Triggers

All emails use the existing Resend + Handlebars infrastructure.

| # | Trigger | Recipient | Notes |
|---|---------|-----------|-------|
| 1 | Visit request submitted | Org contact / guest email | Confirmation with reference number |
| 2 | New visit request pending | Admin + PD users | Notification to review |
| 3 | Visit request approved | Org contact | Includes visit details and any admin note |
| 4 | Visit request declined | Org contact | Includes admin note/reason |
| 5 | Volunteer joins a visit | Volunteer | Auto-confirmation with visit details |
| 6 | Volunteer removed from visit by admin | Volunteer | Notice with reason if provided |
| 7 | Volunteer joins waitlist | Volunteer | Confirmation of waitlist position |
| 8 | Waitlist spot available | Next waitlisted volunteer | Invitation to confirm; expires after 24h |
| 10 | All volunteer slots filled | Org contact | Confirmation with volunteer names (Phase 2) |
| 11 | 48h visit reminder | All confirmed volunteers | Includes arrival details, co-volunteer names (Phase 2) |
| 12 | Volunteer cancelled (standard) | Admin + PD | Visit details, remaining slot count |
| 13 | Volunteer cancelled (urgent, <72h) | Admin + PD | Flagged as urgent (Phase 2) |
| 14 | Invoice issued | Org billing contact | Invoice amount, payment instructions (Phase 1.5) |
| 15 | VSC renewal reminder | Volunteer | 60d / 30d / 7d cadence (Phase 2) |
| 16 | Vaccine record expiry reminder | Volunteer | 60d / 30d / 7d cadence (Phase 2) |

---

## API Routes

### Public (no auth required)
| Method | Route | Description |
|--------|-------|-------------|
| POST | `/api/public/visit-request` | Guest org submits a visit request |

### Organization users
| Method | Route | Description |
|--------|-------|-------------|
| POST | `/api/visits` | Submit a visit request (account holder) |
| GET | `/api/visits/my` | List own submitted visits |
| GET | `/api/visits/[id]` | View own visit details |

### Volunteer users
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/visits/available` | Browse approved visits (geo-filtered) |
| GET | `/api/visits/[id]` | View visit details |
| POST | `/api/visits/[id]/register` | Sign up or join waitlist |
| POST | `/api/visits/[id]/cancel-registration` | Cancel own registration |

### Admin & PD
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/admin/visits` | List all visits with filters |
| POST | `/api/admin/visits` | Manually create a visit |
| GET | `/api/admin/visits/[id]` | View full visit details |
| PATCH | `/api/admin/visits/[id]` | Edit visit details |
| POST | `/api/admin/visits/[id]/approve` | Approve a visit request |
| POST | `/api/admin/visits/[id]/decline` | Decline a visit request |
| POST | `/api/admin/visits/[id]/cancel` | Cancel an approved visit |
| POST | `/api/admin/visits/[id]/complete` | Mark visit as completed |
| POST | `/api/admin/visits/[id]/notes` | Add internal note to visit |
| GET | `/api/admin/visits/[id]/registrations` | List all registrations for a visit |
| DELETE | `/api/admin/visits/[id]/registrations/[regId]` | Remove a volunteer from a visit |
| PATCH | `/api/admin/visits/[id]/registrations/[regId]/contact-sharing` | Toggle contact info sharing for a volunteer on a specific visit |
| GET | `/api/admin/compliance` | List all volunteers with VSC/vaccine status |
| GET | `/api/admin/compliance/[volunteerId]/documents` | Get signed download URLs for a volunteer's documents |
| PATCH | `/api/admin/compliance/[volunteerId]` | Verify VSC or vaccine record |
| GET | `/api/admin/invoices` | List all invoices (Phase 1.5, admin only) |
| PATCH | `/api/admin/invoices/[id]` | Update invoice status / mark paid (Phase 1.5, admin only) |

---

## Open Questions & Future Phases

### Resolved Decisions

- **Volunteer signup approval**: Approved volunteers self-confirm on visits with no per-event admin approval. Admin/PD can remove volunteers from a visit if needed.
- **Waitlist promotion**: 24-hour response window confirmed. Waitlisted volunteer receives an email invitation and self-confirms. If no response within 24 hours, the next volunteer in queue is invited. Revisit window duration based on real-world testing.
- **VSC enforcement**: Volunteers can browse all visits. Signup is blocked (not just warned) if they don't meet the visit's VSC or vaccine requirements. Dashboard nudge encourages compliance document upload.
- **PD invoicing access**: PDs have no access to invoicing. Invoicing is admin-only.
- **Org account approval**: Registration link is public, but org accounts require admin approval before the org can submit visit requests — same approval flow as existing user types. Each visit request also requires admin approval before going live to volunteers.
- **VSC/vaccine verification model**: "Trust plus ability to check." Uploading a document is sufficient to unlock VSC-required visits — no mandatory admin verification step. Admins can review documents at their discretion via the compliance view.
- **Compliance for existing volunteers**: No grace period. Dashboard nudge shown immediately. Admins can manually upload documents on behalf of known volunteers already in the system.

### Decisions Still Open

None currently. All major decisions resolved. Revisit if new questions arise during implementation.

### Deferred to Later Phases

- **Stripe / Wave payment processing** — Phase 3 at earliest. No accounting system is currently in use. Manual reconciliation (ScotiaBank direct deposits, e-transfers, mailed cheques) is cross-referenced against an invoice tracker. Wave has been flagged as a preferred integration candidate over QuickBooks. Invoice emails in Phase 1.5 will direct orgs to pay offline and admin reconciles manually in the app.
- **Recurring visits** — Phase 3. Schema is designed to support it (`recurrence_rule`, `parent_visit_id` columns reserved), so adding the UI later won't require a migration.
- **Visit statistics** — Phase 3. Volunteer visit counts, org visit history, regional breakdowns.
- **Advanced admin calendar view** — Phase 3. Heat-map style view of booking density by date/region.
- **Org contact confirmation email when slots filled** — Phase 2, after core flow is stable.
- **Geographic region filtering (beyond radius)** — Current plan (radius-based using PostGIS) covers the main use case. Named regions or neighborhood tags can be layered on in a future phase if needed.

---

## Migration Notes

When implementing, the following SQL migrations will be required:

1. Add new columns to `users` table (org profile fields, volunteer VSC fields, new role values)
2. Add new columns to `dogs` table (vaccine fields)
3. Create `visits` table with PostGIS-compatible lat/lng columns
4. Create `visit_registrations` table
5. Create `visit_notes` table
6. Create `invoices` table (Phase 1.5)
7. Enable PostGIS extension in Supabase (if not already enabled — check `dogs_nearby_with_availability` view, which suggests it may already be active)
8. Add RLS policies for all new tables
9. Update `DATABASE_SCHEMA.md` as each migration is applied

---

*This document will be updated as development progresses. Implementation decisions made during development should be recorded here.*
