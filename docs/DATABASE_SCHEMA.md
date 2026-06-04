# Database Schema

> **Last verified:** May 2026 against dev DB dump
> **Previous doc was severely out of date** — entire tables (visits, pd_regions, chat_requests, etc.) were missing.
> Columns marked ⚠️ are suspected unused or need investigation.

---

## Tables Overview

| Table | Purpose |
|-------|---------|
| `users` | All user profiles (individuals, volunteers, orgs, PDs, admins) |
| `dogs` | Dog profiles linked to volunteers |
| `appointments` | Individual therapy dog visit appointments (old scheduling system) |
| `appointment_chats` | Stream Chat channels for individual appointments |
| `chat_requests` | Newer chat-based scheduling system (replaces appointments flow) |
| `chat_logs` | Audit log of messages from appointment chats |
| `message_read_status` | Per-user read tracking for appointment chats |
| `pending_email_notifications` | Scheduled delayed email notifications |
| `visits` | Org visit events (group visit system) |
| `visit_registrations` | Volunteer signups/waitlist for org visits |
| `visit_notes` | Admin/PD notes on org visits |
| `pd_regions` | Program Director regions |
| `pd_region_places` | Geographic places (with OSM boundary polygons) within regions |
| `audience_categories` | Matching categories (Young Kids, Teens, Adults, Seniors) |
| `individual_audience_tags` | Category assignments for individuals (admin-assigned) |
| `volunteer_audience_preferences` | Category preferences for volunteers (self-selected) |
| `device_tokens` | Push notification tokens for native app (Capacitor) |
| `role_change_audit` | Audit log of user role changes |
| `welcome_messages` | Admin-managed announcement banners shown on dashboards |
| `spatial_ref_sys` | PostGIS system table — not our data, ignore |

> **Note:** `appointment_availability` (weekly recurring availability slots) is referenced in code and TypeScript types but was **absent from the dev DB dump**. It likely still exists in prod. Needs verification — may be in the process of being deprecated as part of the chat-based scheduling redesign.

---

## Table Details

### `users`

All user types share this table. Many columns are role-specific and null for other roles.

**Core fields (all roles)**

| Column | Type | Notes |
|--------|------|-------|
| `id` | text, PK | Clerk user ID |
| `first_name` | text | |
| `last_name` | text | |
| `email` | text, unique | |
| `role` | text | `individual` \| `volunteer` \| `admin` \| `pd` \| `organization` |
| `status` | text | `pending` \| `approved` \| `denied` \| `archived` |
| `bio` | text | |
| `profile_image` | text | URL |
| `phone_number` | text | |
| `postal_code` | text | |
| `location_lat` | float8 | Geocoded from postal_code |
| `location_lng` | float8 | Geocoded from postal_code |
| `city` | text | |
| `profile_complete` | boolean | Set true when signup flow finished |
| `assigned_region_id` | int | FK → pd_regions.id |
| `region_assignment_method` | text | `boundary_auto` \| `distance_auto` \| `fsa_auto` \| `manual` |
| `is_browsable` | boolean | Admin toggle for volunteer visibility in search |
| `archived_at` | timestamptz | Non-null = archived |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

**Volunteer-only fields**

| Column | Type | Notes |
|--------|------|-------|
| `travel_distance_km` | int | Max travel radius |
| `pronouns` | varchar(50) | |
| `general_availability` | text | Free-text hint shown on profile, e.g. "Weekends and evenings" |
| `open_to_individual_visits` | boolean | Whether volunteer accepts individual (non-org) visits |
| `vsc_document_url` | text | Supabase Storage URL |
| `vsc_date_issued` | date | |
| `vsc_renewal_due` | date | Auto-calculated: issued + 3 years |

**Individual-only fields**

| Column | Type | Notes |
|--------|------|-------|
| `birthday` | int | Birth year only |
| `physical_address` | text | Visit location description |
| `other_pets_on_site` | boolean | |
| `other_pets_description` | text | |
| `third_party_available` | text | Third-party contact info |
| `additional_information` | text | |
| `liability_waiver_accepted` | boolean | |
| `liability_waiver_accepted_at` | timestamptz | |
| `visit_recipient_type` | text | `self` \| `other` |
| `relationship_to_recipient` | text | When visit_recipient_type = 'other' |
| `dependant_name` | text | Name of person receiving visits |

**Organization-only fields**

| Column | Type | Notes |
|--------|------|-------|
| `org_name` | text | |
| `org_type` | text | School, Hospital, Long-term Care, etc. |
| `org_address` | text | |
| `org_place_id` | text | Google Places ID for org address |
| `org_contact_name` | text | |
| `org_contact_phone` | text | |
| `fee_tier` | text | `tier_500` \| `tier_200` \| `tier_0` \| `custom` |

**PD (Program Director)-only fields**

| Column | Type | Notes |
|--------|------|-------|
| `pd_postal_code` | text | PD's location (separate from home postal_code) |
| `pd_lat` | float8 | Geocoded from pd_postal_code |
| `pd_lng` | float8 | Geocoded from pd_postal_code |

---

### `dogs`

One dog per volunteer (unique constraint on `volunteer_id`).

| Column | Type | Notes |
|--------|------|-------|
| `id` | int, PK | Auto-increment |
| `volunteer_id` | text | FK → users.id |
| `status` | text | `pending` \| `approved` \| `archived` |
| `dog_name` | text | |
| `dog_breed` | text | |
| `dog_age` | int | |
| `dog_bio` | text | |
| `dog_picture_url` | text | |
| `vaccine_record_url` | text | Supabase Storage URL |
| `vaccine_date_issued` | date | |
| `vaccine_expiry_date` | date | |
| `vaccine_cycle_years` | int | 1 or 3, selected by volunteer |
| `created_at` | timestamp | |
| `updated_at` | timestamp | |

---

### `appointments`

The original individual visit scheduling system. A volunteer and individual agree on a time.

| Column | Type | Notes |
|--------|------|-------|
| `id` | int, PK | |
| `individual_id` | text | FK → users.id |
| `volunteer_id` | text | FK → users.id |
| `status` | text | `pending` \| `confirmed` \| `canceled` |
| `start_time` | timestamptz | |
| `end_time` | timestamptz | |
| `availability_id` | int | FK → appointment_availability.id (nullable — set to NULL when slot deleted) |
| `cancellation_reason` | text | |
| `location_type` | text | |
| `location_details` | text | |
| `duration_minutes` | int | Default 60 |
| `notes` | text | |
| `proposed_by` | text | User ID of who proposed the time |
| `proposed_at` | timestamptz | |
| `confirmed_at` | timestamptz | |
| `chat_request_id` | uuid | ⚠️ FK → chat_requests.id — links old and new systems; unclear if actively used |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

---

### `appointment_chats`

Stream Chat channel tracking for individual appointment conversations.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid, PK | |
| `appointment_id` | int | FK → appointments.id |
| `stream_channel_id` | text | Stream Chat channel ID |
| `status` | text | `active` \| `closed` |
| `created_by` | text | `system` or user ID |
| `unread_count` | int | ⚠️ May overlap with message_read_status — verify which is authoritative |
| `last_read_at` | timestamptz | ⚠️ Same concern |
| `closed_at` | timestamptz | |
| `created_at` | timestamptz | |

---

### `chat_requests`

**Newer system** — chat-based bidirectional matching. An individual initiates a chat with a volunteer; if accepted, an appointment can be created. Partial replacement for the old appointments flow.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid, PK | |
| `requester_id` | text | FK → users.id |
| `recipient_id` | text | FK → users.id |
| `dog_id` | int | FK → dogs.id |
| `status` | text | `pending` \| (others TBD) |
| `channel_id` | text | Stream Chat channel ID |
| `channel_created_at` | timestamptz | |
| `channel_closed_at` | timestamptz | |
| `last_message_at` | timestamptz | |
| `message_count` | int | |
| `unread_count_admin` | int | For admin monitoring |
| `snoozed_by` | text | Admin who snoozed this chat |
| `snoozed_until` | timestamptz | |
| `responded_at` | timestamptz | |
| `created_at` | timestamptz | |

---

### `chat_logs`

Audit log of messages sent through appointment chats (not chat_requests).

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid, PK | |
| `appointment_id` | int | FK → appointments.id |
| `stream_message_id` | text | |
| `sender_id` | text | FK → users.id |
| `content` | text | |
| `message_type` | text | Default `text` |
| `is_system_message` | boolean | |
| `created_at` | timestamptz | |

---

### `message_read_status`

Per-user read tracking for appointment chats. Source of truth for unread badge counts.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid, PK | |
| `user_id` | text | FK → users.id |
| `appointment_id` | int | FK → appointments.id |
| `last_read_message_id` | text | Stream message ID |
| `last_read_at` | timestamptz | |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

---

### `pending_email_notifications`

Delayed email notifications (default 1-hour delay). Canceled if user reads the message before delivery.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid, PK | |
| `user_id` | text | Recipient |
| `appointment_id` | int | Context (nullable) |
| `chat_request_id` | uuid | FK → chat_requests.id (nullable) |
| `stream_message_id` | text | |
| `channel_id` | text | |
| `scheduled_for` | timestamptz | When to send |
| `status` | text | `pending` \| `sent` \| `canceled` |
| `sent_at` | timestamptz | |
| `created_at` | timestamptz | |

---

### `visits`

Org visit events. Created by orgs via request form or by admin/PD manually.

| Column | Type | Notes |
|--------|------|-------|
| `id` | int, PK | |
| `status` | text | `pending_review` \| `approved` \| `declined` \| `canceled` \| `completed` |
| `organization_id` | text | FK → users.id (null for guest submissions) |
| `guest_org_name` | text | For non-registered org submissions |
| `guest_contact_name` | text | |
| `guest_contact_email` | text | |
| `guest_contact_phone` | text | |
| `title` | text | Visit title/name |
| `visit_date` | date | |
| `start_time` | timestamptz | |
| `end_time` | timestamptz | |
| `address` | text | |
| `location_lat` | float8 | |
| `location_lng` | float8 | |
| `location_place_id` | text | Google Places ID |
| `postal_code` | varchar(10) | |
| `audience_age_ranges` | text[] | Array of age range strings |
| `visitor_count_expected` | int | |
| `volunteer_slots` | int | Number of volunteer spots, default 1 |
| `special_needs_notes` | text | |
| `approx_space_sqft` | int | |
| `requires_vsc` | boolean | Whether volunteers must have VSC on file |
| `requires_vaccine_record` | boolean | Default true |
| `parking_coverage` | text | |
| `parking_instructions` | text | |
| `arrival_instructions` | text | |
| `accessibility_notes` | text | |
| `fee_tier` | text | |
| `fee_amount` | numeric | |
| `admin_note` | text | Internal note by admin/PD |
| `assigned_pd_id` | text | FK → users.id (PD responsible for this visit) |
| `google_calendar_event_id` | text | Auto-created on approval |
| `created_by` | text | User ID or `guest` |
| `recurrence_rule` | text | ⚠️ In DB but no code references found — planned feature, not implemented |
| `parent_visit_id` | int | ⚠️ Same — recurring visit parent link, not implemented |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

---

### `visit_registrations`

Volunteer signup records for org visits. Handles both confirmed slots and waitlist.

| Column | Type | Notes |
|--------|------|-------|
| `id` | int, PK | |
| `visit_id` | int | FK → visits.id |
| `volunteer_id` | text | FK → users.id |
| `status` | text | `confirmed` \| `waitlisted` \| `cancelled` |
| `waitlist_position` | int | Null if confirmed |
| `contact_shared` | boolean | Admin toggle to share volunteer contact with org |
| `admin_note` | text | |
| `cancellation_reason` | text | |
| `cancelled_at` | timestamptz | |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

---

### `visit_notes`

Admin/PD notes attached to org visits.

| Column | Type | Notes |
|--------|------|-------|
| `id` | int, PK | |
| `visit_id` | int | FK → visits.id |
| `author_id` | text | FK → users.id |
| `note_text` | text | |
| `created_at` | timestamptz | |

---

### `pd_regions`

Named geographic regions, each optionally owned by a PD.

| Column | Type | Notes |
|--------|------|-------|
| `id` | int, PK | |
| `name` | text | e.g. "Durham", "Toronto" |
| `owner_pd_id` | text | FK → users.id (role=pd), nullable |
| `is_active` | boolean | Deactivating unassigns all members |
| `created_at` | timestamptz | |

---

### `pd_region_places`

Geographic sub-units within a region. Boundaries fetched from Nominatim (OpenStreetMap).

| Column | Type | Notes |
|--------|------|-------|
| `id` | int, PK | |
| `region_id` | int | FK → pd_regions.id |
| `place_id` | text | Google Places ID |
| `place_name` | text | |
| `place_type` | text | |
| `match_value` | text | Used for FSA/boundary matching |
| `lat` | float8 | |
| `lng` | float8 | |
| `viewport_south/west/north/east` | float8 | Bounding box |
| `boundary_json` | jsonb | GeoJSON polygon from Nominatim |
| `boundary_status` | text | `pending` \| `found` \| `not_found` |
| `boundary_osm_id` | text | OSM relation ID |
| `boundary_osm_type` | text | |
| `created_at` | timestamptz | |

---

### `audience_categories`

Reference table for volunteer/individual matching categories.

| Column | Type | Notes |
|--------|------|-------|
| `id` | int, PK | |
| `name` | text | e.g. "Young Kids", "Seniors" |
| `slug` | text, unique | |
| `sort_order` | int | |

---

### `individual_audience_tags`

Which categories apply to an individual. **Admin-assigned only** — individuals cannot see or set these.

| Column | Type | Notes |
|--------|------|-------|
| `individual_id` | text | FK → users.id, PK |
| `category_id` | int | FK → audience_categories.id, PK |

---

### `volunteer_audience_preferences`

Which audience types a volunteer is comfortable with. **Self-selected** during profile completion.

| Column | Type | Notes |
|--------|------|-------|
| `volunteer_id` | text | FK → users.id, PK |
| `category_id` | int | FK → audience_categories.id, PK |

---

### `device_tokens`

Push notification tokens registered by native app (Capacitor/iOS/Android).

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid, PK | |
| `user_id` | text | FK → users.id |
| `device_id` | text | |
| `push_token` | text | |
| `platform` | text | `ios` \| `android` |
| `environment` | text | `production` \| `development` |
| `notifications_enabled` | boolean | |
| `created_at` | timestamptz | |
| `last_seen_at` | timestamptz | |

---

### `role_change_audit`

Audit trail for user role changes.

| Column | Type | Notes |
|--------|------|-------|
| `id` | int, PK | |
| `user_id` | text | FK → users.id |
| `old_role` | text | |
| `new_role` | text | |
| `source` | text | What triggered the change |
| `metadata` | jsonb | Additional context |
| `changed_at` | timestamptz | |

---

### `welcome_messages`

Admin-managed announcements shown as banners on user dashboards (`AnnouncementBanner` component).

| Column | Type | Notes |
|--------|------|-------|
| `id` | int, PK | |
| `user_type` | text | Which role sees this message |
| `message` | text | |
| `is_active` | boolean | |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

---

## Known Issues / Technical Debt

### ⚠️ Possibly Unused Columns
- `visits.recurrence_rule` — in DB, zero code references found. Placeholder for recurring visit feature not yet built.
- `visits.parent_visit_id` — same.
- `appointments.chat_request_id` — links old and new chat systems; unclear if actively populated.

### ⚠️ Overlapping Systems
**Two chat systems exist simultaneously:**
- `appointment_chats` + `chat_logs` + `message_read_status` = Stream Chat for **individual appointments** (old system)
- `chat_requests` = Chat-based scheduling redesign (newer system, active development)

These serve different purposes but have some architectural overlap. The long-term relationship between them needs documenting once the chat-based redesign is complete.

**Two unread tracking approaches on appointment_chats:**
- `appointment_chats.unread_count` / `last_read_at`
- `message_read_status` table (per-user, per-appointment)

Which is authoritative should be clarified and one may be removable.

### ⚠️ `appointment_availability` — Dev/Prod Discrepancy
This table (weekly recurring availability slots, used by the old scheduling system) is referenced in:
- `src/app/api/request/route.ts`
- `src/app/api/appointment/cancel/route.ts`
- `src/types/supabase.ts`

But it was **absent from the dev DB dump**. It likely still exists in prod. Verify whether it has been intentionally dropped in dev as part of the chat-based scheduling redesign, or whether it needs to be recreated in dev.

### ⚠️ `users` Table Breadth
The `users` table stores all roles (individual, volunteer, org, PD, admin) in a single table. This means many columns are role-specific and null for all other roles. This is common for early-stage apps and works fine, but any new developer needs to understand which columns apply to which roles (see the groupings above).

---

## User Roles

| Role | Description |
|------|-------------|
| `individual` | People seeking therapy dog visits |
| `volunteer` | Therapy dog handlers offering visits |
| `organization` | Organizations requesting group visits |
| `pd` | Program Director — manages a region and its volunteers |
| `admin` | Full platform access |

## Status Values

| Table | Column | Values |
|-------|--------|--------|
| `users` | `status` | `pending`, `approved`, `denied`, `archived` |
| `dogs` | `status` | `pending`, `approved`, `archived` |
| `appointments` | `status` | `pending`, `confirmed`, `canceled` |
| `visits` | `status` | `pending_review`, `approved`, `declined`, `canceled`, `completed` |
| `visit_registrations` | `status` | `confirmed`, `waitlisted`, `cancelled` |
| `pending_email_notifications` | `status` | `pending`, `sent`, `canceled` |
| `appointment_chats` | `status` | `active`, `closed` |
| `chat_requests` | `status` | `pending`, (others TBD) |
| `pd_region_places` | `boundary_status` | `pending`, `found`, `not_found` |

## Region Assignment Methods

`users.region_assignment_method` values:
- `boundary_auto` — user's lat/lng falls inside a region's OSM boundary polygon
- `distance_auto` — assigned to nearest region by distance (fallback)
- `fsa_auto` — matched by postal code FSA prefix (partially implemented)
- `manual` — admin manually assigned

---

*Last updated: May 2026. Verified against dev DB column dump.*
*To re-verify: run the information_schema query in Supabase SQL Editor and compare.*
