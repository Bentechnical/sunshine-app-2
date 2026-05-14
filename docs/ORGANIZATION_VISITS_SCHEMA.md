# Organization Visits — Database Schema

**Status**: In Development
**Branch**: `org-visits`
**Last Updated**: May 2026
**Related**: [ORGANIZATION_VISITS_PLAN.md](ORGANIZATION_VISITS_PLAN.md)

This document covers all database changes required for the Organization Visits system. It is separate from [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md), which covers the original app schema.

---

## Table of Contents

1. [Changes to Existing Tables](#changes-to-existing-tables)
2. [New Tables](#new-tables)
3. [RLS Policies](#rls-policies)
4. [SQL Migrations](#sql-migrations)
5. [Change Log](#change-log)

---

## Changes to Existing Tables

### `users` table — new columns

#### Organization profile fields
Populated when `role = 'organization'`.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `org_name` | text | YES | Organization name |
| `org_type` | text | YES | Type — one of: School, Hospital, Long-term Care Home, Mental Health Facility, Library, Community Centre, University / College, Workplace, Other |
| `org_address` | text | YES | Organization's physical address |
| `org_contact_name` | text | YES | Primary contact person's name (column exists in DB but not currently collected by the profile form) |
| `org_contact_phone` | text | YES | Primary contact phone number |

#### Volunteer compliance fields
Populated when `role = 'volunteer'`.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `vsc_date_issued` | date | YES | Date VSC was issued |
| `vsc_renewal_due` | date | YES | Date VSC renewal is due (issued + 3 years) |
| `vsc_document_url` | text | YES | Storage path to uploaded VSC document (private bucket) |

#### New role values
The `role` column now accepts two additional values:
- `'organization'` — institution accounts requesting visits
- `'pd'` — Program Directors with scoped admin access

---

### `dogs` table — new columns

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `vaccine_record_url` | text | YES | Storage path to uploaded vaccine record (private bucket) |
| `vaccine_expiry_date` | date | YES | Date the vaccine record expires |
| `vaccine_cycle_years` | integer | YES | Renewal cycle: 1 or 3 (volunteer-reported) |

---

## New Tables

### `visits`

The core table for organization visit requests and confirmed visits. Distinct from the existing `appointments` table, which handles 1:1 individual/volunteer visits.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | serial | NO | auto | Primary key |
| `title` | text | YES | — | Optional visit title |
| `organization_id` | text | YES | — | FK → users.id (null for guest submissions) |
| `guest_org_name` | text | YES | — | Org name for guest submissions |
| `guest_contact_name` | text | YES | — | Contact name for guest submissions |
| `guest_contact_email` | text | YES | — | Contact email for guest submissions |
| `guest_contact_phone` | text | YES | — | Contact phone for guest submissions |
| `visit_date` | date | NO | — | Date of the visit |
| `start_time` | timestamptz | NO | — | Visit start datetime |
| `end_time` | timestamptz | NO | — | Visit end datetime |
| `address` | text | NO | — | Visit location address |
| `location_lat` | double precision | YES | — | Geocoded latitude |
| `location_lng` | double precision | YES | — | Geocoded longitude |
| `audience_age_ranges` | text[] | YES | — | e.g. `{children, youth, adults, seniors}` |
| `visitor_count_expected` | integer | YES | — | Expected number of visitors |
| `special_needs_notes` | text | YES | — | Mobility aides, special needs, etc. |
| `approx_space_sqft` | integer | YES | — | Approximate available space |
| `fee_tier` | text | YES | — | `free`, `standard`, `reduced`, `custom` |
| `fee_amount` | numeric | YES | — | Dollar amount (used when fee_tier = 'custom') |
| `volunteer_slots` | integer | NO | 1 | Number of volunteer/dog slots available |
| `parking_coverage` | text | YES | — | `free_on_site`, `reimbursed_on_site`, `invoice` |
| `parking_instructions` | text | YES | — | Parking location and access details |
| `arrival_instructions` | text | YES | — | Check-in location and access details |
| `accessibility_notes` | text | YES | — | Accessibility information |
| `requires_vsc` | boolean | YES | false | Whether VSC document is required to sign up |
| `requires_vaccine_record` | boolean | YES | true | Whether vaccine record is required to sign up |
| `status` | text | YES | 'pending_review' | `pending_review`, `approved`, `declined`, `cancelled`, `completed` |
| `admin_note` | text | YES | — | Note from admin to org when approving/declining |
| `google_calendar_event_id` | text | YES | — | GCal event ID for sync |
| `created_by` | text | YES | — | FK → users.id (who created the record) |
| `recurrence_rule` | text | YES | — | Reserved: recurring visit support (Phase 3) |
| `parent_visit_id` | integer | YES | — | Reserved: FK → visits.id for series (Phase 3) |
| `created_at` | timestamptz | YES | now() | Record creation time |
| `updated_at` | timestamptz | YES | now() | Last update time |

**Status values:**
- `pending_review` — submitted, awaiting admin approval
- `approved` — visible to volunteers for signup
- `declined` — rejected by admin (visible to org only)
- `cancelled` — cancelled after approval
- `completed` — visit has taken place

---

### `visit_registrations`

Tracks volunteer signups for visits, including waitlist state.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | serial | NO | auto | Primary key |
| `visit_id` | integer | NO | — | FK → visits.id |
| `volunteer_id` | text | NO | — | FK → users.id |
| `status` | text | NO | 'confirmed' | `confirmed`, `waitlisted`, `cancelled` |
| `waitlist_position` | integer | YES | — | Queue position (null if not waitlisted) |
| `contact_shared` | boolean | YES | false | Admin has enabled contact info sharing with this org for this visit |
| `admin_note` | text | YES | — | Note from admin when removing a volunteer |
| `cancellation_reason` | text | YES | — | Reason provided when volunteer cancels |
| `cancelled_at` | timestamptz | YES | — | When cancellation occurred |
| `created_at` | timestamptz | YES | now() | When signup was submitted |
| `updated_at` | timestamptz | YES | now() | Last update time |

**Constraints:**
- `UNIQUE (visit_id, volunteer_id)` — one registration per volunteer per visit

**Status values:**
- `confirmed` — volunteer is signed up (auto-set on join, no admin approval required)
- `waitlisted` — slots were full; volunteer is queued
- `cancelled` — volunteer cancelled or was removed by admin

---

### `visit_notes`

Admin/PD-only internal notes about a visit, for reference and site feedback.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | serial | NO | auto | Primary key |
| `visit_id` | integer | NO | — | FK → visits.id |
| `author_id` | text | NO | — | FK → users.id (must be admin or pd) |
| `note_text` | text | NO | — | Note content |
| `created_at` | timestamptz | YES | now() | When note was written |

---

## RLS Policies

### `visits` table

| Policy | Operation | Who | Condition |
|--------|-----------|-----|-----------|
| Approved visits are browsable | SELECT | All authenticated users | `status = 'approved'` |
| Orgs can view their own visits | SELECT | Organization users | `organization_id = auth.uid()` |
| Admins/PDs can view all visits | SELECT | admin, pd | Always |
| Orgs can submit visit requests | INSERT | Organization users | `organization_id = auth.uid()`, `status = 'pending_review'` |
| Admins/PDs can create visits | INSERT | admin, pd | Always |
| Admins/PDs can update visits | UPDATE | admin, pd | Always |
| Service role full access | ALL | Service role | Always |

### `visit_registrations` table

| Policy | Operation | Who | Condition |
|--------|-----------|-----|-----------|
| Volunteers can view own registrations | SELECT | Volunteers | `volunteer_id = auth.uid()` |
| Volunteers can create registrations | INSERT | Volunteers | `volunteer_id = auth.uid()` |
| Volunteers can cancel own registration | UPDATE | Volunteers | `volunteer_id = auth.uid()` (status → cancelled only) |
| Admins/PDs can view all registrations | SELECT | admin, pd | Always |
| Admins/PDs can update registrations | UPDATE | admin, pd | Always |
| Admins/PDs can delete registrations | DELETE | admin, pd | Always |
| Orgs can view registrations for their visits | SELECT | Organization users | Join to visits where `organization_id = auth.uid()` |
| Service role full access | ALL | Service role | Always |

### `visit_notes` table

| Policy | Operation | Who | Condition |
|--------|-----------|-----|-----------|
| Admins/PDs can view notes | SELECT | admin, pd | Always |
| Admins/PDs can create notes | INSERT | admin, pd | Always |
| Service role full access | ALL | Service role | Always |

---

## Storage

### `compliance-documents` bucket

A **private** Supabase Storage bucket for volunteer compliance documents.

| Property | Value |
|----------|-------|
| Bucket name | `compliance-documents` |
| Visibility | Private |
| Max file size | 10 MB |
| Allowed types | PDF, JPEG, PNG, WebP |

**Path structure:** `{clerk_user_id}/{document_type}/document.{ext}`
- Example VSC path: `user_3Dg.../vsc/document.pdf`
- Example vaccine path: `user_3Dg.../vaccine/document.jpg`

**Upload method:** All uploads are handled server-side via `POST /api/compliance/upload` using the Supabase admin client (service role). Direct client-side uploads are not used because Supabase Storage's `owner_id` column expects a UUID, which is incompatible with Clerk user ID strings.

**Admin access:** Admins retrieve files using `supabaseAdmin.storage.from('compliance-documents').createSignedUrl(path, expiry)` to generate short-lived signed URLs. Paths are stored in the DB, not public URLs.

**RLS on storage.objects:** Not required — the upload API uses the service role which bypasses RLS. No storage RLS policies are needed for this bucket.

---

## SQL Migrations

Run these in order in the Supabase SQL editor. Each section is idempotent where possible.

---

### Migration 1 — Add columns to `users`

```sql
-- Organization profile fields
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS org_name text,
  ADD COLUMN IF NOT EXISTS org_type text,
  ADD COLUMN IF NOT EXISTS org_address text,
  ADD COLUMN IF NOT EXISTS org_contact_name text,
  ADD COLUMN IF NOT EXISTS org_contact_phone text;

-- Volunteer compliance fields
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS vsc_date_issued date,
  ADD COLUMN IF NOT EXISTS vsc_renewal_due date,
  ADD COLUMN IF NOT EXISTS vsc_document_url text;
```

---

### Migration 2 — Add columns to `dogs`

```sql
ALTER TABLE dogs
  ADD COLUMN IF NOT EXISTS vaccine_record_url text,
  ADD COLUMN IF NOT EXISTS vaccine_expiry_date date,
  ADD COLUMN IF NOT EXISTS vaccine_cycle_years integer;
```

---

### Migration 3 — Create `visits` table

```sql
CREATE TABLE IF NOT EXISTS visits (
  id                      serial PRIMARY KEY,
  title                   text,
  organization_id         text REFERENCES users(id) ON DELETE SET NULL,
  guest_org_name          text,
  guest_contact_name      text,
  guest_contact_email     text,
  guest_contact_phone     text,
  visit_date              date NOT NULL,
  start_time              timestamptz NOT NULL,
  end_time                timestamptz NOT NULL,
  address                 text NOT NULL,
  location_lat            double precision,
  location_lng            double precision,
  audience_age_ranges     text[],
  visitor_count_expected  integer,
  special_needs_notes     text,
  approx_space_sqft       integer,
  fee_tier                text CHECK (fee_tier IN ('free', 'standard', 'reduced', 'custom')),
  fee_amount              numeric,
  volunteer_slots         integer NOT NULL DEFAULT 1,
  parking_coverage        text CHECK (parking_coverage IN ('free_on_site', 'reimbursed_on_site', 'invoice')),
  parking_instructions    text,
  arrival_instructions    text,
  accessibility_notes     text,
  requires_vsc            boolean DEFAULT false,
  requires_vaccine_record boolean DEFAULT true,
  status                  text DEFAULT 'pending_review' CHECK (status IN ('pending_review', 'approved', 'declined', 'cancelled', 'completed')),
  admin_note              text,
  google_calendar_event_id text,
  created_by              text REFERENCES users(id) ON DELETE SET NULL,
  recurrence_rule         text,
  parent_visit_id         integer REFERENCES visits(id) ON DELETE SET NULL,
  created_at              timestamptz DEFAULT now(),
  updated_at              timestamptz DEFAULT now()
);

-- Index for geo queries
CREATE INDEX IF NOT EXISTS visits_location_idx ON visits (location_lat, location_lng);

-- Index for status filtering
CREATE INDEX IF NOT EXISTS visits_status_idx ON visits (status);

-- Index for org lookups
CREATE INDEX IF NOT EXISTS visits_organization_id_idx ON visits (organization_id);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_visits_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER visits_updated_at
  BEFORE UPDATE ON visits
  FOR EACH ROW EXECUTE FUNCTION update_visits_updated_at();
```

---

### Migration 4 — Create `visit_registrations` table

```sql
CREATE TABLE IF NOT EXISTS visit_registrations (
  id                  serial PRIMARY KEY,
  visit_id            integer NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
  volunteer_id        text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status              text NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'waitlisted', 'cancelled')),
  waitlist_position   integer,
  contact_shared      boolean DEFAULT false,
  admin_note          text,
  cancellation_reason text,
  cancelled_at        timestamptz,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now(),
  UNIQUE (visit_id, volunteer_id)
);

CREATE INDEX IF NOT EXISTS visit_registrations_visit_id_idx ON visit_registrations (visit_id);
CREATE INDEX IF NOT EXISTS visit_registrations_volunteer_id_idx ON visit_registrations (volunteer_id);
CREATE INDEX IF NOT EXISTS visit_registrations_status_idx ON visit_registrations (status);

CREATE OR REPLACE FUNCTION update_visit_registrations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER visit_registrations_updated_at
  BEFORE UPDATE ON visit_registrations
  FOR EACH ROW EXECUTE FUNCTION update_visit_registrations_updated_at();
```

---

### Migration 5 — Create `visit_notes` table

```sql
CREATE TABLE IF NOT EXISTS visit_notes (
  id         serial PRIMARY KEY,
  visit_id   integer NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
  author_id  text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  note_text  text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS visit_notes_visit_id_idx ON visit_notes (visit_id);
```

---

### Migration 6 — Enable RLS and add policies

```sql
-- Enable RLS
ALTER TABLE visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE visit_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE visit_notes ENABLE ROW LEVEL SECURITY;

-- Note: auth.uid() returns uuid but users.id is text (Clerk IDs).
-- All comparisons use auth.uid()::text to cast explicitly.

-- =====================
-- visits policies
-- =====================

-- Approved visits are visible to all authenticated users
CREATE POLICY "Approved visits are visible to authenticated users"
  ON visits FOR SELECT
  USING (status = 'approved');

-- Organizations can view their own visits (any status)
CREATE POLICY "Organizations can view their own visits"
  ON visits FOR SELECT
  USING (organization_id = auth.uid()::text);

-- Admins and PDs can view all visits
CREATE POLICY "Admins and PDs can view all visits"
  ON visits FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()::text AND role IN ('admin', 'pd')
    )
  );

-- Organizations can submit visit requests
CREATE POLICY "Organizations can submit visit requests"
  ON visits FOR INSERT
  WITH CHECK (
    organization_id = auth.uid()::text
    AND status = 'pending_review'
    AND EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()::text AND role = 'organization' AND status = 'approved'
    )
  );

-- Admins and PDs can create visits
CREATE POLICY "Admins and PDs can create visits"
  ON visits FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()::text AND role IN ('admin', 'pd')
    )
  );

-- Admins and PDs can update any visit
CREATE POLICY "Admins and PDs can update visits"
  ON visits FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()::text AND role IN ('admin', 'pd')
    )
  );

-- Service role bypass
CREATE POLICY "Service role full access to visits"
  ON visits FOR ALL
  USING (auth.role() = 'service_role');

-- =====================
-- visit_registrations policies
-- =====================

-- Volunteers can view their own registrations
CREATE POLICY "Volunteers can view own registrations"
  ON visit_registrations FOR SELECT
  USING (volunteer_id = auth.uid()::text);

-- Volunteers can create registrations for themselves
CREATE POLICY "Volunteers can create registrations"
  ON visit_registrations FOR INSERT
  WITH CHECK (
    volunteer_id = auth.uid()::text
    AND EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()::text AND role = 'volunteer' AND status = 'approved'
    )
  );

-- Volunteers can update only their own registration (cancel only)
CREATE POLICY "Volunteers can cancel own registration"
  ON visit_registrations FOR UPDATE
  USING (volunteer_id = auth.uid()::text)
  WITH CHECK (status = 'cancelled');

-- Admins and PDs can view all registrations
CREATE POLICY "Admins and PDs can view all registrations"
  ON visit_registrations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()::text AND role IN ('admin', 'pd')
    )
  );

-- Admins and PDs can update any registration
CREATE POLICY "Admins and PDs can update registrations"
  ON visit_registrations FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()::text AND role IN ('admin', 'pd')
    )
  );

-- Admins and PDs can delete registrations (remove volunteer from visit)
CREATE POLICY "Admins and PDs can delete registrations"
  ON visit_registrations FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()::text AND role IN ('admin', 'pd')
    )
  );

-- Organizations can view registrations for their own visits
CREATE POLICY "Organizations can view registrations for their visits"
  ON visit_registrations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM visits
      WHERE visits.id = visit_registrations.visit_id
        AND visits.organization_id = auth.uid()::text
    )
  );

-- Service role bypass
CREATE POLICY "Service role full access to visit_registrations"
  ON visit_registrations FOR ALL
  USING (auth.role() = 'service_role');

-- =====================
-- visit_notes policies
-- =====================

-- Admins and PDs can view all notes
CREATE POLICY "Admins and PDs can view visit notes"
  ON visit_notes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()::text AND role IN ('admin', 'pd')
    )
  );

-- Admins and PDs can create notes
CREATE POLICY "Admins and PDs can create visit notes"
  ON visit_notes FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()::text AND role IN ('admin', 'pd')
    )
  );

-- Service role bypass
CREATE POLICY "Service role full access to visit_notes"
  ON visit_notes FOR ALL
  USING (auth.role() = 'service_role');
```

---

## Additional Migrations (apply after Migrations 1–6)

These were identified during development and must be run on any new environment.

---

### Migration 7 — Add INSERT policy to `users` table

New users completing their profile for the first time need to be able to insert their own row if the Clerk webhook hasn't fired yet (timing race on sign-up).

> **Note:** `auth.uid()::text` cannot be used here because Clerk user IDs are not UUIDs. Use `auth.jwt() ->> 'sub'` to get the raw Clerk ID string from the JWT.

```sql
DROP POLICY IF EXISTS "Users can insert their own row" ON users;

CREATE POLICY "Users can insert their own row"
ON users FOR INSERT
TO authenticated
WITH CHECK (id = (auth.jwt() ->> 'sub'));
```

---

### Migration 8 — Update `users_role_check` constraint

The original constraint only covered `individual`, `volunteer`, and `admin`. Updated to include `organization` and `pd`.

> **Note:** PostgreSQL `CHECK` constraints pass automatically for `NULL` values, so this also covers the case where a new user's row is inserted with `role = NULL` before they complete their profile.

```sql
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;

ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('individual', 'volunteer', 'admin', 'organization', 'pd'));
```

---

### Migration 9 — Add `postal_code` to `visits` table

Required for volunteer distance filtering. Stored separately from `address` so it can be geocoded independently.

```sql
ALTER TABLE visits ADD COLUMN IF NOT EXISTS postal_code VARCHAR(10);

CREATE INDEX IF NOT EXISTS visits_postal_code_idx ON visits (postal_code);
```

---

## Change Log

| Date | Migration | Description |
|------|-----------|-------------|
| May 2026 | 1 | Added org profile and volunteer VSC fields to `users` |
| May 2026 | 2 | Added vaccine record fields to `dogs` |
| May 2026 | 3 | Created `visits` table |
| May 2026 | 4 | Created `visit_registrations` table |
| May 2026 | 5 | Created `visit_notes` table |
| May 2026 | 6 | Enabled RLS and added all policies for new tables |
| May 2026 | 7 | Added INSERT policy to `users` for authenticated users (webhook timing race fix) |
| May 2026 | 8 | Updated `users_role_check` constraint to include `organization` and `pd` roles |
| May 2026 | Storage | Created private `compliance-documents` bucket; upload handled via `/api/compliance/upload` (admin client, no storage RLS needed) |
| May 2026 | Form | ProfileCompleteForm redesigned as multi-step wizard; org/volunteer/individual flows separated into step components under `src/components/profile/steps/` |
| May 2026 | Form | Volunteer audience preferences: submitting with none selected now silently saves all categories ("open to all") |
| May 2026 | Form | VSC date field label: "VSC Issue Date" (field: `vsc_date_issued`); vaccine date field: "Vaccine Expiry Date" (field: `vaccine_expiry_date` on `dogs` table) |
| May 2026 | Webhook | Changed default role from `'individual'` to `null` on `user.created` — role is now explicitly set only via ProfileCompleteForm |
| May 2026 | 9 | Added `postal_code` column to `visits` table for volunteer distance filtering; added index |
| May 2026 | Form | OrgDetails profile step now collects `org_contact_name` (required), `postal_code` (required), and org logo (`profile_image`) via AvatarUpload |
| May 2026 | Form | Org submit payload updated: `org_contact_name`, `profile_image`, `postal_code` now saved on submit; org postal code geocoded to lat/lng |
