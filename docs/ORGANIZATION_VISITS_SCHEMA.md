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
| `org_address` | text | YES | Organization's physical address (Google-normalized formatted address string) |
| `org_place_id` | text | YES | Google Places `place_id` for the org address — populated via Places Autocomplete |
| `org_contact_name` | text | YES | Primary contact person's name (column exists in DB but not currently collected by the profile form) |
| `org_contact_phone` | text | YES | Primary contact phone number |

#### Volunteer fields
Populated when `role = 'volunteer'`.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `vsc_date_issued` | date | YES | — | Date VSC was issued |
| `vsc_renewal_due` | date | YES | — | Date VSC renewal is due (issued + 3 years) |
| `vsc_document_url` | text | YES | — | Storage path to uploaded VSC document (private bucket) |
| `open_to_individual_visits` | boolean | YES | `true` | Whether the volunteer is discoverable for individual visit requests (UC1). When `false`, the volunteer does not appear in individual member searches and is not matched against audience categories. Defaults to `true` for backward compatibility with existing volunteers. New volunteers set this explicitly during profile completion; if not opted in, travel distance and audience categories are silently defaulted (25 km and all categories) so search remains functional. |

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
| `address` | text | NO | — | Visit location address (Google-normalized formatted address string) |
| `location_place_id` | text | YES | — | Google Places `place_id` for the visit location — populated via Places Autocomplete |
| `location_lat` | double precision | YES | — | Geocoded latitude |
| `location_lng` | double precision | YES | — | Geocoded longitude |
| `audience_age_ranges` | text[] | YES | — | e.g. `{children, youth, adults, seniors}` |
| `visitor_count_expected` | integer | YES | — | Expected number of visitors |
| `special_needs_notes` | text | YES | — | Mobility aides, special needs, etc. |
| `approx_space_sqft` | integer | YES | — | Approximate available space |
| `fee_tier` | text | YES | — | `tier_500`, `tier_200`, `tier_0`, `custom` |
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

### Migration 10 — Add `org_place_id` to `users` table

Stores the Google Places `place_id` for the organization's address. Populated when an org selects their address via the Places Autocomplete input. Used to produce a verified, normalized address string and precise lat/lng (stored in existing `location_lat`/`location_lng` columns).

```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS org_place_id text;
```

---

### Migration 11 — Add `location_place_id` to `visits` table

Stores the Google Places `place_id` for an individual visit's location. Populated when an org or admin enters the visit address via Places Autocomplete.

```sql
ALTER TABLE visits ADD COLUMN IF NOT EXISTS location_place_id text;
```

---

### Migration 12 — Add `assigned_pd_id` to `visits` table

Links a visit to the Program Director responsible for managing it. Null until assigned (either automatically on approval or manually by an admin).

```sql
ALTER TABLE visits ADD COLUMN IF NOT EXISTS assigned_pd_id text REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS visits_assigned_pd_id_idx ON visits (assigned_pd_id);
```

---

### Migration 13 — Add PD location fields to `users` table

Populated when `role = 'pd'`. Used for proximity-based automatic visit assignment.

```sql
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS pd_postal_code text,
  ADD COLUMN IF NOT EXISTS pd_lat double precision,
  ADD COLUMN IF NOT EXISTS pd_lng double precision;
```

`pd_postal_code` is collected during PD profile completion. `pd_lat` and `pd_lng` are geocoded server-side from the postal code at profile submission time and stored for efficient proximity queries.

---

### Migration 14 — Add RLS policy: PDs can view their assigned visits

PDs can already view all visits via the existing "Admins and PDs can view all visits" policy. Once scoped assignment is enforced, this policy should be replaced with a narrower one. For now, document the intended future-state policy:

```sql
-- Future replacement for "Admins and PDs can view all visits" (Phase 2):
-- DROP POLICY "Admins and PDs can view all visits" ON visits;

-- CREATE POLICY "Admins can view all visits"
--   ON visits FOR SELECT
--   USING (
--     EXISTS (SELECT 1 FROM users WHERE id = auth.uid()::text AND role = 'admin')
--   );

-- CREATE POLICY "PDs can view their assigned visits"
--   ON visits FOR SELECT
--   USING (
--     assigned_pd_id = auth.uid()::text
--   );

-- Note: run this only when PD scoping is fully implemented in the API layer.
-- Until then, the combined admin/pd policy remains active.
```

---

### Migration 15 — Add `assigned_pd_id` to `users` table (org-level PD assignment)

Links an organization account to their responsible Program Director. All visits created by that org inherit this value as their default `assigned_pd_id` at creation time. Visit-level assignments can be overridden independently.

Applies only to rows where `role = 'organization'`, but the column is unscoped so admins can query freely.

`ON DELETE SET NULL` fires only on actual row deletion. Since PDs are archived rather than deleted, the archive-user API must explicitly null out this column (and active visit assignments) when a PD is archived.

```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS assigned_pd_id text REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS users_assigned_pd_id_idx ON users (assigned_pd_id);
```

---

### Migration 17 — Add `fee_tier` to `users` table

Adds a fee tier field to organization user accounts. Sunshine operates on a three-tier fee-for-service model; this column stores the tier assigned to each organization:

- `tier_500` — Corporate, private, for-profit organizations, conferences, festivals, and large-scale events
- `tier_200` — Post-secondary institutions, private and independent schools, private care facilities, private/for-profit therapy services, wellness visits to non-profit staff
- `tier_0` — Public schools, service recipients of non-profit organizations, first responders, inpatient settings

Organizations self-select their tier during profile completion. Admins can override via the Manage Users → Organizations tab. The tier is snapshotted onto each visit record at creation time (both org-submitted and admin-created visits).

```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS fee_tier text;
```

---

### Migration 19 — Update `get_dogs_for_individual` RPC to filter by `open_to_individual_visits`

The `get_dogs_for_individual` Supabase function returns volunteer/dog results to individuals searching for a therapy dog. Volunteers who have not opted into individual visits (`open_to_individual_visits = false`) must be excluded from these results. Requires Migration 18 to be applied first.

> Note: `get_individuals_for_volunteer` (the volunteer-side browse) does **not** need this filter — volunteers can still browse individuals regardless of their own opt-in status (one-way discovery).

```sql
CREATE OR REPLACE FUNCTION get_dogs_for_individual(
  individual_user_id TEXT,
  max_distance_km FLOAT DEFAULT 50
)
RETURNS TABLE (
  dog_id INTEGER,
  dog_name TEXT,
  dog_breed TEXT,
  dog_age INTEGER,
  dog_bio TEXT,
  dog_picture_url TEXT,
  volunteer_id TEXT,
  volunteer_first_name TEXT,
  volunteer_last_initial TEXT,
  volunteer_city TEXT,
  general_availability TEXT,
  distance_km DOUBLE PRECISION,
  matching_categories TEXT[]
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    d.id as dog_id,
    d.dog_name::TEXT as dog_name,
    d.dog_breed::TEXT as dog_breed,
    d.dog_age as dog_age,
    d.dog_bio::TEXT as dog_bio,
    d.dog_picture_url::TEXT as dog_picture_url,
    v.id as volunteer_id,
    v.first_name::TEXT as volunteer_first_name,
    LEFT(v.last_name, 1) as volunteer_last_initial,
    v.city::TEXT as volunteer_city,
    v.general_availability::TEXT,
    ST_Distance(
      ST_MakePoint(v.location_lng, v.location_lat)::geography,
      ST_MakePoint(u.location_lng, u.location_lat)::geography
    ) / 1000 as distance_km,
    ARRAY_AGG(DISTINCT ac.name) as matching_categories
  FROM dogs d
  JOIN users v ON v.id = d.volunteer_id
  CROSS JOIN users u
  LEFT JOIN volunteer_audience_preferences vap ON vap.volunteer_id = v.id
  LEFT JOIN individual_audience_tags iat ON iat.individual_id = individual_user_id
  LEFT JOIN audience_categories ac ON ac.id = vap.category_id
  WHERE d.status = 'approved'
    AND v.status = 'approved'
    AND v.role = 'volunteer'
    AND v.is_browsable = TRUE
    AND v.open_to_individual_visits = TRUE
    AND u.id = individual_user_id
    AND u.role = 'individual'
    AND vap.category_id = iat.category_id
    AND ST_DWithin(
      ST_MakePoint(v.location_lng, v.location_lat)::geography,
      ST_MakePoint(u.location_lng, u.location_lat)::geography,
      max_distance_km * 1000
    )
    AND v.id NOT IN (
      SELECT recipient_id FROM chat_requests
      WHERE requester_id = individual_user_id
        AND status = 'declined'
        AND responded_at > NOW() - INTERVAL '30 days'
      UNION
      SELECT requester_id FROM chat_requests
      WHERE recipient_id = individual_user_id
        AND status = 'declined'
        AND responded_at > NOW() - INTERVAL '30 days'
    )
    AND v.id NOT IN (
      SELECT CASE WHEN requester_id = individual_user_id THEN recipient_id ELSE requester_id END
      FROM chat_requests
      WHERE (requester_id = individual_user_id OR recipient_id = individual_user_id)
        AND snoozed_until > NOW()
    )
  GROUP BY d.id, v.id, u.location_lng, u.location_lat
  ORDER BY distance_km ASC;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
```

---

### Migration 18 — Add `open_to_individual_visits` to `users` table

Controls whether a volunteer is discoverable in individual member searches (UC1). When `false`, the volunteer is hidden from individual search results and excluded from audience category matching. Adding with `DEFAULT true` applies the value to all existing rows immediately, preserving backward compatibility.

```sql
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS open_to_individual_visits boolean DEFAULT true;
```

---

### Migration 16 — Add `vaccine_date_issued` to `dogs` table

Adds an issue date field for dog vaccine records. Previously only `vaccine_expiry_date` was collected; both dates are now captured explicitly. Computing expiry from issue date is not appropriate for vaccine records because validity varies by vaccine type and a single record typically covers multiple vaccines with differing expiry windows.

The expiry date remains the field used for compliance status calculations (`missing` / `uploaded` / `expiring` / `expired`). Issue date is stored for auditing and admin review.

```sql
ALTER TABLE dogs ADD COLUMN IF NOT EXISTS vaccine_date_issued date;
```

---

### Migration 20 — Create `pd_regions` table

Defines named geographic regions. Each region optionally has an owning Program Director (`owner_pd_id`). Regions can exist without an owner (e.g. while a new PD is being onboarded). Deactivating a region moves all assigned volunteers and orgs to the unassigned pool — this cascade is handled at the API layer, not via a DB trigger.

```sql
CREATE TABLE IF NOT EXISTS pd_regions (
  id           serial PRIMARY KEY,
  name         text NOT NULL,
  owner_pd_id  text REFERENCES users(id) ON DELETE SET NULL,
  is_active    boolean NOT NULL DEFAULT true,
  created_at   timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pd_regions_owner_pd_id_idx ON pd_regions (owner_pd_id);
CREATE INDEX IF NOT EXISTS pd_regions_is_active_idx ON pd_regions (is_active);
```

---

### Migration 21 — Create `pd_region_fsas` table

> **Deprecated.** This table was the original FSA-based region definition system. Superseded by `pd_region_places` (Migration 24). The table and API routes remain in place but the UI no longer uses them.

Maps Forward Sortation Areas (FSA — first 3 characters of a Canadian postal code, e.g. `N1G`) to regions. Each FSA can belong to at most one region (enforced by UNIQUE constraint).

```sql
CREATE TABLE IF NOT EXISTS pd_region_fsas (
  id          serial PRIMARY KEY,
  region_id   integer NOT NULL REFERENCES pd_regions(id) ON DELETE CASCADE,
  fsa_prefix  text NOT NULL,
  UNIQUE (fsa_prefix)
);

CREATE INDEX IF NOT EXISTS pd_region_fsas_region_id_idx ON pd_region_fsas (region_id);
```

---

### Migration 22 — Add region assignment columns to `users`; remove `assigned_pd_id`

Adds `assigned_region_id` (FK → `pd_regions`) and `region_assignment_method` to `users`, applicable to both `volunteer` and `organization` roles. Removes the old `assigned_pd_id` column, which linked org users directly to a PD — replaced by the region model.

> **Prod note:** `assigned_pd_id` on `users` was introduced in Migration 15 and has only ever existed on dev/staging environments. It has never been deployed to production. Safe to drop.

```sql
-- Add region assignment columns
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS assigned_region_id integer REFERENCES pd_regions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS region_assignment_method text
    CHECK (region_assignment_method IN ('fsa_auto', 'distance_auto', 'manual'));

CREATE INDEX IF NOT EXISTS users_assigned_region_id_idx ON users (assigned_region_id);

-- Remove old direct PD assignment column (replaced by assigned_region_id)
DROP INDEX IF EXISTS users_assigned_pd_id_idx;
ALTER TABLE users DROP COLUMN IF EXISTS assigned_pd_id;
```

---

### Migration 23 — Enable RLS and add policies for `pd_regions` and `pd_region_fsas`

Region and FSA data is non-sensitive geographic configuration. All authenticated users can read it (volunteers display their region name; orgs and PDs browse it). Only admins can write.

```sql
ALTER TABLE pd_regions ENABLE ROW LEVEL SECURITY;
ALTER TABLE pd_region_fsas ENABLE ROW LEVEL SECURITY;

-- =====================
-- pd_regions policies
-- =====================

-- All authenticated users can view regions
CREATE POLICY "Authenticated users can view regions"
  ON pd_regions FOR SELECT
  USING (auth.role() = 'authenticated');

-- Admins can create regions
CREATE POLICY "Admins can create regions"
  ON pd_regions FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid()::text AND role = 'admin')
  );

-- Admins can update regions
CREATE POLICY "Admins can update regions"
  ON pd_regions FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid()::text AND role = 'admin')
  );

-- Admins can delete regions
CREATE POLICY "Admins can delete regions"
  ON pd_regions FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid()::text AND role = 'admin')
  );

-- Service role bypass
CREATE POLICY "Service role full access to pd_regions"
  ON pd_regions FOR ALL
  USING (auth.role() = 'service_role');

-- =====================
-- pd_region_fsas policies
-- =====================

-- All authenticated users can view FSA mappings
CREATE POLICY "Authenticated users can view region FSAs"
  ON pd_region_fsas FOR SELECT
  USING (auth.role() = 'authenticated');

-- Admins can manage FSA mappings (combined policy covers all operations)
CREATE POLICY "Admins can manage region FSAs"
  ON pd_region_fsas FOR ALL
  USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid()::text AND role = 'admin')
  );

-- Service role bypass
CREATE POLICY "Service role full access to pd_region_fsas"
  ON pd_region_fsas FOR ALL
  USING (auth.role() = 'service_role');
```

---

### Migration 24 — Create `pd_region_places` table

Replaces FSA-based region definition with Google Places-based region definition. Each region has a collection of named Google Places (cities, regional municipalities, etc.) that define its geographic coverage. Admins add places via a Google Places Autocomplete input in the region management UI.

```sql
CREATE TABLE IF NOT EXISTS pd_region_places (
  id               serial PRIMARY KEY,
  region_id        integer NOT NULL REFERENCES pd_regions(id) ON DELETE CASCADE,
  place_id         text NOT NULL,      -- Google Places place_id
  place_name       text NOT NULL,      -- Short display name, e.g. "Kitchener"
  place_type       text NOT NULL,      -- Google place type, e.g. "locality", "administrative_area_level_2"
  match_value      text NOT NULL,      -- Value to match against geocoded address components
  lat              double precision,
  lng              double precision,
  viewport_south   double precision,   -- Bounding box for map display
  viewport_west    double precision,
  viewport_north   double precision,
  viewport_east    double precision,
  created_at       timestamptz DEFAULT now(),
  UNIQUE (region_id, place_id)
);

CREATE INDEX IF NOT EXISTS pd_region_places_region_id_idx ON pd_region_places (region_id);

ALTER TABLE pd_region_places ENABLE ROW LEVEL SECURITY;

-- All authenticated users can view region places
CREATE POLICY "Authenticated users can view region places"
  ON pd_region_places FOR SELECT
  USING (auth.role() = 'authenticated');

-- Admins can manage region places
CREATE POLICY "Admins can manage region places"
  ON pd_region_places FOR ALL
  USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid()::text AND role = 'admin')
  );

-- Service role bypass
CREATE POLICY "Service role full access to pd_region_places"
  ON pd_region_places FOR ALL
  USING (auth.role() = 'service_role');
```

**`place_type` values** correspond to Google Places API types: `locality` (city/town), `administrative_area_level_2` (regional municipality/county), `sublocality`, etc.

**`match_value`** is the `long_name` of the address component matching `place_type` — used by `autoAssignRegion` to compare against a user's geocoded address components.

---

### Migration 25 — Drop `pd_region_fsas` table

Removes the deprecated FSA-based region definition table. Superseded by `pd_region_places` (Migration 24). All RLS policies on this table are dropped automatically by PostgreSQL when the table is dropped.

> **Prerequisites before running:** Ensure Migration 24 has been applied and the codebase has been deployed (so no running code queries `pd_region_fsas`).

```sql
DROP TABLE IF EXISTS pd_region_fsas;
```

---

### Migration 26 — Add boundary fields to `pd_region_places`

Adds OpenStreetMap polygon boundary storage to `pd_region_places`. When an admin adds a place via Google Places Autocomplete, the server-side API fetches the boundary polygon from Nominatim (OSM) and stores it as JSONB. The map renders boundaries using Google Maps `map.data` layer with the stored GeoJSON — no Google Map ID or Data-driven styling required.

```sql
ALTER TABLE pd_region_places
  ADD COLUMN boundary_json    jsonb,
  ADD COLUMN boundary_status  text DEFAULT 'pending'
    CHECK (boundary_status IN ('pending', 'found', 'not_found')),
  ADD COLUMN boundary_osm_id   text,
  ADD COLUMN boundary_osm_type text;

-- Existing rows have no boundary data; mark as not_found.
-- Admins can remove and re-add a place to trigger the boundary fetch.
UPDATE pd_region_places SET boundary_status = 'not_found';
```

**`boundary_status` values:**
- `pending` — initial state before fetch (should not persist after first save)
- `found` — Nominatim returned a usable polygon; `boundary_json` contains GeoJSON geometry
- `not_found` — Nominatim returned no suitable polygon; map falls back to viewport zoom only

**Attribution requirement:** Any map displaying `boundary_json` polygons must show "© OpenStreetMap contributors" per OSM usage policy.

---

### Migration 27 — Add `boundary_auto` to `region_assignment_method` check constraint

Adds the `boundary_auto` value to the `users_region_assignment_method_check` constraint so that `autoAssignRegion` can write `'boundary_auto'` when a user's coordinates fall inside a region's OSM boundary polygon.

```sql
ALTER TABLE users DROP CONSTRAINT users_region_assignment_method_check;
ALTER TABLE users ADD CONSTRAINT users_region_assignment_method_check
  CHECK (region_assignment_method IN ('fsa_auto', 'distance_auto', 'boundary_auto', 'manual'));
```

---

### Migration 28 — Fix `visits_fee_tier_check` constraint

The original `visits` table (Migration 3) was created with placeholder fee tier values (`free`, `standard`, `reduced`, `custom`). The app fee model uses `tier_500`, `tier_200`, `tier_0`, and `custom`. This migration replaces the constraint to match the actual values used throughout the codebase and stored on `users.fee_tier`.

```sql
ALTER TABLE visits DROP CONSTRAINT visits_fee_tier_check;

ALTER TABLE visits ADD CONSTRAINT visits_fee_tier_check
  CHECK (fee_tier IN ('tier_500', 'tier_200', 'tier_0', 'custom'));
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
| May 2026 | 10 | Added `org_place_id text` to `users` table — Google Places place_id for org address |
| May 2026 | 11 | Added `location_place_id text` to `visits` table — Google Places place_id for visit location |
| May 2026 | Places | Replaced free-text address + postal code inputs with Google Places Autocomplete across all org/admin address forms; `org_address` and `visits.address` now store Google-normalized strings; `location_lat`/`location_lng` populated directly from Places result (no separate geocoding step for orgs/visits) |
| May 2026 | 12 | Added `assigned_pd_id text` to `visits` table — FK → users.id; links each visit to its responsible Program Director; null until assigned |
| May 2026 | 13 | Added `pd_postal_code`, `pd_lat`, `pd_lng` to `users` table — PD home location fields; postal code collected at profile completion, lat/lng geocoded server-side; used for proximity-based visit assignment |
| May 2026 | 14 | Documented future RLS policy split for PD scoping (visits); currently PDs share the combined admin/pd SELECT policy; scoped policy to be activated when API layer enforcement is complete |
| May 2026 | 15 | Added `assigned_pd_id text` to `users` table — FK → users.id ON DELETE SET NULL; links an organization account to their responsible PD; inherited by visits on creation; null = unassigned |
| May 2026 | 16 | Added `vaccine_date_issued date` to `dogs` table — issue date for dog vaccine records; expiry date continues to drive compliance status; issue date stored for auditing |
| May 2026 | 17 | Added `fee_tier text` to `users` table — three-tier fee-for-service model (`tier_500`, `tier_200`, `tier_0`); self-selected by org at signup, overridable by admin; snapshotted onto each visit at creation |
| May 2026 | 18 | Added `open_to_individual_visits boolean DEFAULT true` to `users` — controls volunteer discoverability in individual member searches (UC1); `false` hides volunteer from search and audience category matching; existing volunteers default to `true` for backward compatibility |
| May 2026 | 19 | Update `get_dogs_for_individual` RPC — add `AND v.open_to_individual_visits = TRUE` to WHERE clause; volunteers not opted in are excluded from individual search results; one-way browse (volunteers viewing individuals) is unaffected |
| May 2026 | 20 | Created `pd_regions` table — named geographic regions with optional PD owner; regions can exist unowned; deactivation cascades unassignment via API |
| May 2026 | 21 | Created `pd_region_fsas` table — FSA prefix → region mapping for auto-assignment; each FSA globally unique across all regions |
| May 2026 | 22 | Added `assigned_region_id` (FK → pd_regions) and `region_assignment_method` to `users` for volunteer and org roles; removed `assigned_pd_id` (dev/staging only, never in prod) — replaced by region model |
| May 2026 | 23 | Enabled RLS on `pd_regions` and `pd_region_fsas`; all authenticated users can read; admins only can write; service role bypass |
| May 2026 | 24 | Created `pd_region_places` table — Google Places-based region definition replacing FSA system; stores place_id, place_name, place_type, match_value, lat/lng, viewport bounds; RLS mirrors pd_region_fsas |
| May 2026 | 25 | Dropped `pd_region_fsas` table — deprecated FSA region definition system; replaced by `pd_region_places`; run after deploying code that removes all references to this table |
| May 2026 | 26 | Added `boundary_json` (jsonb), `boundary_status`, `boundary_osm_id`, `boundary_osm_type` to `pd_region_places` — OSM polygon boundary storage; fetched server-side from Nominatim on place save; rendered via `map.data` layer |
| May 2026 | 27 | Updated `users_region_assignment_method_check` constraint to include `'boundary_auto'` — required for polygon-based auto-assignment |
| May 2026 | 28 | Fixed `visits_fee_tier_check` constraint — replaced placeholder values (`free`, `standard`, `reduced`, `custom`) with actual app values (`tier_500`, `tier_200`, `tier_0`, `custom`) |
