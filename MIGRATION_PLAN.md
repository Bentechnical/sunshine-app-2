# Chat-Based Scheduling Migration Plan

**Version:** 1.0
**Date:** January 26, 2026
**Branch:** `feature/chat-based-scheduling`
**Estimated Sessions:** 6-8 (2-3 hours each)

---

## Executive Summary

This document outlines the complete migration from availability-based appointment scheduling to a chat-based, bidirectional matching system. The redesign removes the rigid 12-week recurring availability system in favor of flexible, conversational coordination between volunteers and individuals.

### Key Changes
- ❌ **Remove:** Entire availability management system (~2000 lines)
- ➕ **Add:** Bidirectional search (volunteers can browse individuals)
- ➕ **Add:** Two-step chat request flow with pending/accepted states
- ➕ **Add:** In-chat appointment scheduling wizard
- 🔄 **Modify:** Appointment system (remove availability_id, add location/proposal fields)
- 🔄 **Modify:** Dashboard navigation (replace "Manage Availability" with "Connect with People")

---

## Table of Contents

1. [Pre-Migration Checklist](#1-pre-migration-checklist)
2. [Database Migration](#2-database-migration)
3. [Phase-by-Phase Implementation](#3-phase-by-phase-implementation)
4. [Component Specifications](#4-component-specifications)
5. [API Endpoint Changes](#5-api-endpoint-changes)
6. [Testing Checklist](#6-testing-checklist)
7. [Deployment Strategy](#7-deployment-strategy)
8. [Rollback Procedures](#8-rollback-procedures)

---

## 1. Pre-Migration Checklist

### 1.1 Environment Setup

- [ ] Create new branch: `git checkout -b feature/chat-based-scheduling`
- [ ] Verify development environment:
  - [ ] Development Clerk instance configured
  - [ ] Development Supabase instance configured
  - [ ] Local environment variables point to dev instances
- [ ] Test database backup/restore on dev environment
- [ ] Document current production state:
  - [ ] Number of active users (individuals/volunteers)
  - [ ] Number of active appointments
  - [ ] Number of availability slots currently set

### 1.2 User Communication

**Email Template for Volunteers** (send 1 week before deployment):

```
Subject: Important Update: New Way to Connect with Individuals

Hi [Volunteer Name],

We're excited to share a major update to Sunshine App based on your feedback!

What's Changing:
• NEW: Browse and connect with individuals directly
• NEW: More flexible scheduling through chat conversations
• REMOVED: The weekly availability template system

What You Need to Do:
1. When you log in after [deployment date], you'll see a new "Connect with People" tab
2. Add a brief note to your profile about when you're typically available (optional)
3. Start browsing individuals in your area and send chat requests!

Your existing appointments will remain scheduled. Only the way you create new appointments is changing.

Questions? Reply to this email or contact [support email].

Thank you for being part of Sunshine App!
```

### 1.3 Backup Strategy

```bash
# Production database backup (run before deployment)
pg_dump $SUPABASE_DB_URL > backup_pre_migration_$(date +%Y%m%d_%H%M%S).sql

# Test restore on dev environment
psql $DEV_SUPABASE_DB_URL < backup_pre_migration_*.sql
```

---

## 2. Database Migration

### 2.1 Migration Scripts (Ordered Execution)

#### Script 1: Add New Fields to Users Table

```sql
-- File: scripts/migration_01_add_general_availability.sql

-- Add general availability text field for volunteers
ALTER TABLE users
ADD COLUMN general_availability TEXT,
ADD COLUMN is_browsable BOOLEAN DEFAULT TRUE;

-- Add comments
COMMENT ON COLUMN users.general_availability IS
  'Free-text description of typical availability (e.g., "Weekends and Thursday afternoons")';
COMMENT ON COLUMN users.is_browsable IS
  'Whether user appears in directory search (future feature, defaults to true for MVP)';
```

**Rollback:**
```sql
ALTER TABLE users
DROP COLUMN general_availability,
DROP COLUMN is_browsable;
```

---

#### Script 2: Create Chat Requests Table

```sql
-- File: scripts/migration_02_create_chat_requests.sql

CREATE TABLE chat_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  requester_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  dog_id UUID REFERENCES dogs(id) ON DELETE SET NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'accepted', 'declined')) DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  responded_at TIMESTAMPTZ,

  -- Prevent duplicate pending requests
  CONSTRAINT unique_pending_request UNIQUE (requester_id, recipient_id, status)
    WHERE status = 'pending'
);

-- Indexes for performance
CREATE INDEX idx_chat_requests_recipient ON chat_requests(recipient_id, status);
CREATE INDEX idx_chat_requests_requester ON chat_requests(requester_id, status);
CREATE INDEX idx_chat_requests_created ON chat_requests(created_at DESC);

-- Comments
COMMENT ON TABLE chat_requests IS
  'Tracks chat connection requests between users (bidirectional: individual→volunteer or volunteer→individual)';
COMMENT ON COLUMN chat_requests.requester_id IS
  'User who initiated the chat request';
COMMENT ON COLUMN chat_requests.recipient_id IS
  'User who needs to accept/decline the request';
COMMENT ON COLUMN chat_requests.dog_id IS
  'Optional: if request is about a specific dog (null if volunteer initiates)';
```

**Rollback:**
```sql
DROP TABLE chat_requests;
```

---

#### Script 3: Modify Appointments Table

```sql
-- File: scripts/migration_03_modify_appointments.sql

-- Add new fields for chat-based scheduling
ALTER TABLE appointments
ADD COLUMN location_type TEXT CHECK (location_type IN ('individual_address', 'public', 'other')),
ADD COLUMN location_details TEXT,
ADD COLUMN duration_minutes INTEGER DEFAULT 60,
ADD COLUMN notes TEXT,
ADD COLUMN proposed_by UUID REFERENCES users(id) ON DELETE SET NULL,
ADD COLUMN proposed_at TIMESTAMPTZ,
ADD COLUMN confirmed_at TIMESTAMPTZ,
ADD COLUMN chat_request_id UUID REFERENCES chat_requests(id) ON DELETE SET NULL;

-- Set availability_id to nullable (preserve existing data)
ALTER TABLE appointments
ALTER COLUMN availability_id DROP NOT NULL;

-- Add constraint: only one pending/confirmed appointment per chat at a time (MVP)
CREATE UNIQUE INDEX one_active_appointment_per_chat
ON appointments(chat_channel_id)
WHERE status IN ('pending', 'confirmed')
  AND start_time > NOW()
  AND chat_channel_id IS NOT NULL;

-- Update existing appointments to have default values
UPDATE appointments
SET
  duration_minutes = 60,
  location_type = 'individual_address'
WHERE duration_minutes IS NULL;

-- Comments
COMMENT ON COLUMN appointments.location_type IS
  'Where the appointment takes place: individual_address, public location, or other';
COMMENT ON COLUMN appointments.location_details IS
  'Address or description of meeting location';
COMMENT ON COLUMN appointments.proposed_by IS
  'User who initially proposed this appointment (individual or volunteer)';
COMMENT ON COLUMN appointments.chat_request_id IS
  'Links appointment to the original chat request (optional)';
```

**Rollback:**
```sql
DROP INDEX one_active_appointment_per_chat;

ALTER TABLE appointments
DROP COLUMN location_type,
DROP COLUMN location_details,
DROP COLUMN duration_minutes,
DROP COLUMN notes,
DROP COLUMN proposed_by,
DROP COLUMN proposed_at,
DROP COLUMN confirmed_at,
DROP COLUMN chat_request_id;

ALTER TABLE appointments
ALTER COLUMN availability_id SET NOT NULL;
```

---

#### Script 4: Update RLS Policies

```sql
-- File: scripts/migration_04_update_rls_policies.sql

-- Chat Requests: Users can see requests they sent or received
ALTER TABLE chat_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own chat requests"
ON chat_requests FOR SELECT
USING (
  auth.uid()::text IN (requester_id::text, recipient_id::text)
);

CREATE POLICY "Users can create chat requests"
ON chat_requests FOR INSERT
WITH CHECK (
  auth.uid()::text = requester_id::text
);

CREATE POLICY "Recipients can update status"
ON chat_requests FOR UPDATE
USING (
  auth.uid()::text = recipient_id::text
)
WITH CHECK (
  auth.uid()::text = recipient_id::text
);

-- Appointments: Update policies to handle new fields (no changes to access logic)
-- Existing policies remain valid

-- Users: Add policy for browsable profiles
CREATE POLICY "Approved users can view other approved browsable users"
ON users FOR SELECT
USING (
  status = 'approved'
  AND is_browsable = TRUE
  AND role IN ('individual', 'volunteer')
);
```

**Rollback:**
```sql
DROP POLICY "Users can view their own chat requests" ON chat_requests;
DROP POLICY "Users can create chat requests" ON chat_requests;
DROP POLICY "Recipients can update status" ON chat_requests;
DROP POLICY "Approved users can view other approved browsable users" ON users;
```

---

#### Script 5: Remove Availability System

```sql
-- File: scripts/migration_05_remove_availability.sql

-- IMPORTANT: This is a destructive operation.
-- Ensure backups are in place before running.

-- Drop database functions
DROP FUNCTION IF EXISTS get_nearby_dogs_with_availability(FLOAT, FLOAT);
DROP FUNCTION IF EXISTS get_dogs_with_next_availability();

-- Drop views
DROP VIEW IF EXISTS dogs_with_next_availability;

-- Archive availability data before deletion (optional, for records)
CREATE TABLE IF NOT EXISTS archived_appointment_availability AS
SELECT * FROM appointment_availability;

-- Drop the table
DROP TABLE appointment_availability;

-- Note: We keep appointments.availability_id column as nullable for historical records
-- but new appointments won't use it
```

**Rollback:**
```sql
-- Restore from backup (requires full database restore)
-- This cannot be easily rolled back, which is why backups are critical
```

---

### 2.2 Create New Database Functions

#### Function: Get Individuals for Volunteer Search

```sql
-- File: scripts/migration_06_create_search_functions.sql

CREATE OR REPLACE FUNCTION get_individuals_for_volunteer(
  volunteer_user_id UUID,
  max_distance_km FLOAT DEFAULT 50
)
RETURNS TABLE (
  id UUID,
  first_name TEXT,
  last_initial TEXT,
  city TEXT,
  pronouns TEXT,
  bio TEXT,
  profile_picture_url TEXT,
  distance_km FLOAT,
  matching_categories TEXT[]
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    u.id,
    u.first_name,
    LEFT(u.last_name, 1) as last_initial,
    u.city,
    u.pronouns,
    u.bio,
    u.profile_picture_url,
    ST_Distance(
      ST_MakePoint(u.location_lng, u.location_lat)::geography,
      ST_MakePoint(v.location_lng, v.location_lat)::geography
    ) / 1000 as distance_km,
    ARRAY_AGG(DISTINCT ac.name) as matching_categories
  FROM users u
  CROSS JOIN users v
  LEFT JOIN individual_audience_tags iat ON iat.individual_id = u.id
  LEFT JOIN volunteer_audience_preferences vap ON vap.volunteer_id = volunteer_user_id
  LEFT JOIN audience_categories ac ON ac.id = iat.category_id
  WHERE u.role = 'individual'
    AND u.status = 'approved'
    AND u.is_browsable = TRUE
    AND v.id = volunteer_user_id
    AND v.role = 'volunteer'
    AND iat.category_id = vap.category_id  -- Must have matching category
    AND ST_DWithin(
      ST_MakePoint(u.location_lng, u.location_lat)::geography,
      ST_MakePoint(v.location_lng, v.location_lat)::geography,
      max_distance_km * 1000
    )
  GROUP BY u.id, v.location_lng, v.location_lat
  ORDER BY distance_km ASC;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

COMMENT ON FUNCTION get_individuals_for_volunteer IS
  'Returns individuals matching volunteer''s audience preferences within distance';
```

#### Function: Get Dogs for Individual Search (Simplified)

```sql
-- Simplified version without availability (replaces get_nearby_dogs_with_availability)

CREATE OR REPLACE FUNCTION get_dogs_for_individual(
  individual_user_id UUID,
  max_distance_km FLOAT DEFAULT 50
)
RETURNS TABLE (
  dog_id UUID,
  dog_name TEXT,
  dog_breed TEXT,
  dog_age INTEGER,
  dog_bio TEXT,
  dog_picture_url TEXT,
  volunteer_id UUID,
  volunteer_first_name TEXT,
  volunteer_last_initial TEXT,
  volunteer_city TEXT,
  general_availability TEXT,
  distance_km FLOAT,
  matching_categories TEXT[]
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    d.id as dog_id,
    d.name as dog_name,
    d.breed as dog_breed,
    d.age as dog_age,
    d.bio as dog_bio,
    d.picture_url as dog_picture_url,
    v.id as volunteer_id,
    v.first_name as volunteer_first_name,
    LEFT(v.last_name, 1) as volunteer_last_initial,
    v.city as volunteer_city,
    v.general_availability,
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
    AND u.id = individual_user_id
    AND u.role = 'individual'
    AND vap.category_id = iat.category_id  -- Must have matching category
    AND ST_DWithin(
      ST_MakePoint(v.location_lng, v.location_lat)::geography,
      ST_MakePoint(u.location_lng, u.location_lat)::geography,
      max_distance_km * 1000
    )
  GROUP BY d.id, v.id, u.location_lng, u.location_lat
  ORDER BY distance_km ASC;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

COMMENT ON FUNCTION get_dogs_for_individual IS
  'Returns dogs matching individual''s assigned categories within distance (no availability check)';
```

---

## 3. Phase-by-Phase Implementation

### Phase 1: Database Migration & Cleanup (Session 1)

**Goal:** Execute database changes, remove availability code

**Tasks:**
1. Run migration scripts 1-6 on dev Supabase
2. Verify data integrity (check existing appointments preserved)
3. Delete availability-related components:
   - `src/components/availability/TemplateStyleAvailability.tsx`
   - `src/components/availability/CustomTimePicker.tsx`
4. Delete availability-related API routes:
   - `src/app/api/admin/availabilities/route.ts`
5. Remove availability management from volunteer dashboard:
   - Edit `src/components/dashboard/DashboardHomeVolunteer.tsx`
   - Remove "Manage Availability" tab
6. Update `src/components/dog/DogProfile.tsx`:
   - Remove booking modal logic (~150 lines)
   - Keep component shell for Phase 2

**Testing:**
- [ ] No TypeScript errors after deletions
- [ ] Existing appointments still visible in "My Visits"
- [ ] Database migration successful (all scripts run)

**Estimated Time:** 2-3 hours

---

### Phase 2: Individual Directory Component (Session 2)

**Goal:** Create volunteer's "Connect with People" page

**New Components:**

1. **`src/components/individual/IndividualDirectory.tsx`** (~400 lines)
   - Similar structure to `DogDirectory.tsx`
   - Uses `get_individuals_for_volunteer()` function
   - Grid layout with profile cards
   - Distance filter (reuse from dog directory)
   - "Request to Chat" button on each card

2. **`src/components/individual/IndividualProfileCard.tsx`** (~150 lines)
   - Card component for grid display
   - Shows: first name + initial, city, pronouns, bio, profile pic
   - Distance badge
   - "Request to Chat" button

3. **`src/components/profile/GeneralAvailabilityInput.tsx`** (~100 lines)
   - Text area for volunteer profile
   - Max 200 characters
   - Help text with examples
   - Add to volunteer profile edit form

**New API Routes:**

1. **`src/app/api/individuals/search/route.ts`** (~200 lines)
   - GET endpoint
   - Calls `get_individuals_for_volunteer()`
   - Returns public profile data only
   - Requires volunteer authentication

**Page Integration:**

- Create new tab in volunteer dashboard navigation
- Route: `/dashboard/individuals` or similar
- Add to `src/app/(pages)/dashboard/layout.tsx` (volunteer role only)

**Testing:**
- [ ] Volunteers can see individuals in their area
- [ ] Audience category filtering works
- [ ] Distance calculation correct
- [ ] Profile pictures display
- [ ] No last names visible

**Estimated Time:** 3-4 hours

---

### Phase 3: Chat Request Flow (Session 3)

**Goal:** Implement pending/accepted chat system

**Modified Components:**

1. **`src/components/dog/DogDirectory.tsx`**
   - Replace "View Availability" → "Request to Chat"
   - Remove availability-based filtering
   - Use new `get_dogs_for_individual()` function

2. **`src/components/dog/DogProfile.tsx`**
   - Replace booking button with "Request to Chat"
   - Remove availability calendar display
   - Show `general_availability` text if present

**New Components:**

1. **`src/components/chat/ChatRequestButton.tsx`** (~150 lines)
   - "Request to Chat" button with loading state
   - Handles both directions (individual→volunteer, volunteer→individual)
   - Success modal: "Request sent! You'll be notified when they accept."
   - Error handling (duplicate request, user at capacity, etc.)

2. **`src/components/chat/PendingChatRequests.tsx`** (~300 lines)
   - Shows incoming chat requests
   - Card format with requester profile summary
   - [Accept] [Decline] buttons
   - Add to volunteer/individual dashboard

**New API Routes:**

1. **`src/app/api/chat/request/route.ts`** (~250 lines)
   - POST: Create chat request
   - Validates: users are approved, no duplicate pending request
   - Creates `chat_requests` record
   - Sends email notification to recipient
   - Returns: request ID, status

2. **`src/app/api/chat/accept/route.ts`** (~200 lines)
   - POST: Accept chat request
   - Updates `chat_requests.status = 'accepted'`
   - Creates Stream Chat channel
   - Adds both users to channel
   - Sends welcome message with "Schedule Appointment" prompt
   - Sends email to requester: "Your chat request was accepted!"

3. **`src/app/api/chat/decline/route.ts`** (~100 lines)
   - POST: Decline chat request
   - Updates `chat_requests.status = 'declined'`
   - Sends email to requester: "Chat request was declined"

**Dashboard Integration:**

- Add "Pending Chat Requests" section to both dashboards
- Badge count on dashboard home
- Notification emails

**Testing:**
- [ ] Individual can send chat request to volunteer
- [ ] Volunteer can send chat request to individual
- [ ] Recipient receives email notification
- [ ] Accept creates Stream Chat channel
- [ ] Decline notifies requester
- [ ] Duplicate requests prevented

**Estimated Time:** 3-4 hours

---

### Phase 4: Schedule Appointment Wizard (Session 4-5)

**Goal:** In-chat appointment scheduling

**New Components:**

1. **`src/components/appointments/ScheduleAppointmentModal.tsx`** (~600 lines)
   - Three-step wizard:
     - Step 1: Date & Time (date picker, start time dropdown, duration dropdown)
     - Step 2: Location (type selector, address/details input)
     - Step 3: Notes (optional text area)
   - Pre-fill date/time if volunteer clicked from chat suggestion
   - Validation (future dates only, duration 30min-3hrs, etc.)
   - Submit creates appointment with `status='pending'`

2. **`src/components/appointments/AppointmentProposalCard.tsx`** (~250 lines)
   - Shows in chat when appointment proposed
   - Displays: date, time, duration, location, notes
   - Actions: [✓ Confirm] [✏ Suggest Changes] [✗ Decline]
   - Status indicator (pending/confirmed)

3. **`src/components/appointments/AppointmentConfirmedBanner.tsx`** (~150 lines)
   - Persistent banner at top of chat
   - Shows confirmed appointment details
   - Actions: [Modify Booking] [Cancel Booking]

4. **`src/components/messaging/MessagingTab.tsx`** (modify ~200 lines)
   - Add "Schedule Appointment" button (prominent, above message input)
   - Check for existing appointment (disable if one exists - MVP constraint)
   - Show appointment banner if confirmed appointment exists

**New API Routes:**

1. **`src/app/api/appointment/propose/route.ts`** (~300 lines)
   - POST: Create appointment proposal
   - Body: date, time, duration, location_type, location_details, notes
   - Creates `appointment` record with `status='pending'`
   - Validates: no time conflict (future feature: skip for MVP)
   - Validates: no other active appointment in this chat (MVP constraint)
   - Sends email to other party: "New appointment proposal"
   - Posts system message in chat with proposal details

2. **`src/app/api/appointment/confirm-proposal/route.ts`** (~200 lines)
   - POST: Confirm proposed appointment
   - Updates `status='confirmed'`, sets `confirmed_at` timestamp
   - Sends confirmation emails to both parties
   - Updates chat with confirmation message

3. **`src/app/api/appointment/decline-proposal/route.ts`** (~150 lines)
   - POST: Decline proposed appointment
   - Updates `status='canceled'`, sets `cancellation_reason`
   - Notifies proposer via email + chat message

**Modified API Routes:**

1. **`src/app/api/appointment/confirm/route.ts`** (refactor ~150 lines)
   - Remove availability-related logic
   - Update to work with new appointment schema
   - Keep chat creation logic (if not already created)

**Testing:**
- [ ] Either party can propose appointment
- [ ] Proposal appears in chat with correct details
- [ ] Confirm creates confirmed appointment
- [ ] Decline notifies proposer
- [ ] MVP constraint: Only one active appointment per chat
- [ ] Emails sent at each step

**Estimated Time:** 4-5 hours

---

### Phase 5: Modify & Cancel Flows (Session 6)

**Goal:** Allow users to change/cancel appointments

**New Components:**

1. **`src/components/appointments/ModifyAppointmentModal.tsx`** (~400 lines)
   - Reuses ScheduleAppointmentModal with pre-filled values
   - Shows diff: old details vs. new details
   - Submit sends as new proposal (other party must re-confirm)

2. **`src/components/appointments/CancelAppointmentModal.tsx`** (modify existing ~150 lines)
   - Keep existing cancel modal
   - Update to work with new appointment schema
   - Remove availability unhiding logic

**Modified Components:**

1. **`src/components/appointments/AppointmentConfirmedBanner.tsx`**
   - Wire up [Modify] and [Cancel] buttons

2. **`src/components/visits/MyVisits.tsx`**
   - Add [Modify] and [Cancel] to appointment cards
   - Works for both individuals and volunteers

**New API Routes:**

1. **`src/app/api/appointment/modify/route.ts`** (~250 lines)
   - POST: Propose modification to existing appointment
   - Body: appointment_id, new date/time/location/notes
   - Updates appointment with new values, sets `status='pending'` again
   - Sends email to other party: "Appointment change proposed"
   - Posts modification request in chat

**Modified API Routes:**

1. **`src/app/api/appointment/cancel/route.ts`** (refactor ~100 lines)
   - Remove availability unhiding
   - Keep everything else (status update, notifications, chat message)

**Testing:**
- [ ] Modify button opens wizard with current values
- [ ] Modified appointment requires re-confirmation
- [ ] Cancel updates status and notifies other party
- [ ] My Visits shows updated information
- [ ] Chat shows modification/cancellation messages

**Estimated Time:** 2-3 hours

---

### Phase 6: Dashboard & Email Updates (Session 7)

**Goal:** Update dashboards, navigation, and email templates

**Modified Components:**

1. **Dashboard Navigation**
   - Individuals: Rename "Meet with Dog" → "Connect with Dogs"
   - Volunteers: Remove "Manage Availability", add "Connect with People"

2. **`src/components/dashboard/DashboardHomeVolunteer.tsx`**
   - Remove availability management prompts
   - Update "Pending Requests" to show both chat requests and appointment proposals
   - Add prompt to complete `general_availability` if empty

3. **`src/components/dashboard/DashboardHomeIndividual.tsx`**
   - Update "Suggested Dogs" logic (no availability required)
   - Show 3 nearby dogs with matching categories

4. **`src/components/dashboard/fragments/NextAppointmentCard.tsx`**
   - Update to use new appointment schema fields
   - Show location_details instead of availability slot

**Email Templates:**

Create new Handlebars templates in `templates/emails/`:

1. **`chat-request-received.hbs`**
   - Subject: "[Name] wants to connect with you"
   - Body: Profile summary, [Accept Request] [View Profile] [Decline]

2. **`chat-request-accepted.hbs`**
   - Subject: "Your chat request was accepted!"
   - Body: "Start chatting with [Name]", [Go to Messages]

3. **`appointment-proposed.hbs`**
   - Subject: "[Name] proposed a visit"
   - Body: Date, time, location, [Confirm] [View Details] [Decline]

4. **`appointment-confirmed.hbs`**
   - Subject: "Visit confirmed with [Name]"
   - Body: Confirmed details, [Add to Calendar] [View Chat]

5. **`appointment-modified.hbs`**
   - Subject: "[Name] proposed changes to your visit"
   - Body: Old details vs. new details, [Approve Changes] [Decline]

**Update Existing Templates:**
- Modify references to "availability" in existing emails
- Update appointment confirmation to show new location fields

**Testing:**
- [ ] Dashboard navigation correct for each role
- [ ] Pending requests section shows both types
- [ ] Email templates render correctly
- [ ] Email links work (point to correct pages)

**Estimated Time:** 2-3 hours

---

### Phase 7: Testing & Polish (Session 8)

**Goal:** End-to-end testing, bug fixes, UX improvements

**Full User Flow Testing:**

1. **Individual → Volunteer Flow:**
   - [ ] Individual browses dogs
   - [ ] Individual sends chat request
   - [ ] Volunteer receives email + in-app notification
   - [ ] Volunteer accepts request
   - [ ] Chat opens with welcome message
   - [ ] Individual proposes appointment
   - [ ] Volunteer confirms
   - [ ] Both receive confirmation emails
   - [ ] Appointment appears in "My Visits"
   - [ ] Individual modifies appointment
   - [ ] Volunteer approves changes
   - [ ] Volunteer cancels appointment
   - [ ] Individual receives cancellation notification

2. **Volunteer → Individual Flow:**
   - [ ] Volunteer browses individuals
   - [ ] Volunteer sends chat request
   - [ ] Individual receives notification
   - [ ] Individual accepts
   - [ ] Volunteer proposes appointment
   - [ ] Individual confirms
   - [ ] Test modify/cancel flows

3. **Admin Oversight:**
   - [ ] Admin can see all chat requests
   - [ ] Admin can see all appointments (new schema)
   - [ ] Admin can see all chats

**Edge Cases:**
- [ ] User tries to send duplicate chat request (blocked)
- [ ] User tries to schedule second appointment in same chat (blocked by MVP constraint)
- [ ] User tries to schedule appointment in the past (validation error)
- [ ] User deletes account with pending chat requests (cascades correctly)
- [ ] Stream Chat disconnection/reconnection works

**Performance Testing:**
- [ ] Individual search loads in <2 seconds
- [ ] Dog search loads in <2 seconds
- [ ] Chat request creation is instant
- [ ] No N+1 queries

**UX Polish:**
- [ ] Loading states on all buttons
- [ ] Error messages are helpful
- [ ] Success messages provide next steps
- [ ] Mobile responsive
- [ ] Accessibility (keyboard navigation, screen readers)

**Estimated Time:** 3-4 hours

---

## 4. Component Specifications

### 4.1 IndividualDirectory Component

**File:** `src/components/individual/IndividualDirectory.tsx`

**Purpose:** Allows volunteers to browse individuals in their area

**Props:** None (uses user context)

**State:**
```typescript
interface IndividualDirectoryState {
  individuals: Individual[];
  loading: boolean;
  error: string | null;
  filters: {
    maxDistance: number; // km
  };
}

interface Individual {
  id: string;
  firstName: string;
  lastInitial: string;
  city: string;
  pronouns: string | null;
  bio: string | null;
  profilePictureUrl: string | null;
  distanceKm: number;
  matchingCategories: string[];
}
```

**API Calls:**
- `GET /api/individuals/search?maxDistance=50`

**UI Structure:**
```
┌─────────────────────────────────────────┐
│ Connect with People                     │
├─────────────────────────────────────────┤
│ [Distance Filter: 50km ▼]              │
│                                          │
│ ┌──────┐ ┌──────┐ ┌──────┐             │
│ │ John │ │ Sarah│ │ Mike │             │
│ │  M.  │ │  K.  │ │  P.  │             │
│ │ 5km  │ │ 8km  │ │ 12km │             │
│ │[Chat]│ │[Chat]│ │[Chat]│             │
│ └──────┘ └──────┘ └──────┘             │
│                                          │
│ (Grid continues...)                      │
└─────────────────────────────────────────┘
```

**Key Features:**
- Grid layout (responsive: 3 cols desktop, 2 cols tablet, 1 col mobile)
- Distance filter dropdown
- Empty state if no matches
- Loading skeleton

---

### 4.2 ScheduleAppointmentModal Component

**File:** `src/components/appointments/ScheduleAppointmentModal.tsx`

**Purpose:** Wizard for proposing appointments in chat

**Props:**
```typescript
interface ScheduleAppointmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  chatChannelId: string;
  otherUserId: string;
  otherUserName: string;
  proposingUserId: string; // current user
}
```

**State:**
```typescript
interface WizardState {
  step: 1 | 2 | 3;
  formData: {
    date: Date | null;
    startTime: string; // "3:00 PM"
    durationMinutes: number; // 60
    locationType: 'individual_address' | 'public' | 'other';
    locationDetails: string;
    notes: string;
  };
  errors: Record<string, string>;
  submitting: boolean;
}
```

**API Calls:**
- `POST /api/appointment/propose`

**Validation Rules:**
- Date must be in future
- Start time required
- Duration: 30, 60, 90, 120, 180 minutes
- Location details required if type is 'public' or 'other'
- Notes max 500 characters

**UI Flow:**
```
Step 1: Date & Time
┌────────────────────────────────┐
│ Schedule Appointment (1/3)     │
├────────────────────────────────┤
│ Date *                         │
│ [Calendar Picker]              │
│                                │
│ Start Time *                   │
│ [Dropdown: 9:00 AM - 8:00 PM]  │
│                                │
│ Duration *                     │
│ [Dropdown: 30min - 3hrs]       │
│                                │
│        [Cancel]  [Next →]      │
└────────────────────────────────┘

Step 2: Location
┌────────────────────────────────┐
│ Schedule Appointment (2/3)     │
├────────────────────────────────┤
│ Where will you meet? *         │
│ ○ Individual's address         │
│ ○ Public location              │
│ ○ Other                        │
│                                │
│ [If public/other selected:]    │
│ Location Details *             │
│ [Text input]                   │
│                                │
│      [← Back]  [Next →]        │
└────────────────────────────────┘

Step 3: Notes
┌────────────────────────────────┐
│ Schedule Appointment (3/3)     │
├────────────────────────────────┤
│ Additional Notes (Optional)    │
│ ┌────────────────────────────┐ │
│ │                            │ │
│ │ [Text area, 500 chars max] │ │
│ │                            │ │
│ └────────────────────────────┘ │
│                                │
│    [← Back]  [Send Proposal]   │
└────────────────────────────────┘
```

---

### 4.3 AppointmentConfirmedBanner Component

**File:** `src/components/appointments/AppointmentConfirmedBanner.tsx`

**Purpose:** Shows confirmed appointment at top of chat

**Props:**
```typescript
interface AppointmentConfirmedBannerProps {
  appointment: {
    id: string;
    startTime: Date;
    endTime: Date;
    locationType: string;
    locationDetails: string;
    notes: string | null;
  };
  onModify: () => void;
  onCancel: () => void;
}
```

**UI:**
```
┌─────────────────────────────────────────┐
│ ✅ Confirmed Appointment                │
│ Tuesday, February 4, 2026               │
│ 3:00 PM - 4:00 PM (1 hour)              │
│ 📍 123 Main St, Toronto, ON             │
│ [Modify Booking]  [Cancel Booking]      │
└─────────────────────────────────────────┘
```

**States:**
- Confirmed (green background)
- Pending modification (yellow background, "Changes proposed by [Name]")
- Past appointment (gray, no action buttons)

---

## 5. API Endpoint Changes

### 5.1 New Endpoints

#### POST /api/chat/request

**Purpose:** Create chat request between users

**Auth:** Required (Clerk)

**Body:**
```typescript
{
  recipientId: string;  // UUID
  dogId?: string;       // UUID, optional (if individual→volunteer)
  message?: string;     // Optional intro message
}
```

**Response:**
```typescript
{
  success: true,
  chatRequestId: string,
  status: 'pending' | 'accepted'  // 'accepted' if auto-accept enabled (future)
}
```

**Logic:**
1. Validate: requester and recipient are both approved
2. Check for existing pending request (prevent duplicates)
3. Create `chat_requests` record
4. Send email to recipient (use Resend)
5. Create in-app notification
6. Return request ID

**Error Codes:**
- 400: Missing required fields
- 403: Users not approved
- 409: Duplicate pending request
- 500: Database error

---

#### POST /api/chat/accept

**Purpose:** Accept chat request and create Stream Chat channel

**Auth:** Required (must be recipient)

**Body:**
```typescript
{
  chatRequestId: string;  // UUID
}
```

**Response:**
```typescript
{
  success: true,
  chatChannelId: string,
  channelUrl: string  // "/dashboard/messaging?channel=..."
}
```

**Logic:**
1. Validate: user is the recipient
2. Update `chat_requests.status = 'accepted'`, set `responded_at`
3. Create Stream Chat channel (or get existing if already created)
4. Add both users as members
5. Send automated welcome message with "Schedule Appointment" prompt
6. Update `appointment_chats` table
7. Send email to requester
8. Return channel ID

---

#### POST /api/appointment/propose

**Purpose:** Propose new appointment in chat

**Auth:** Required (must be chat member)

**Body:**
```typescript
{
  chatChannelId: string;
  otherUserId: string;
  date: string;          // ISO 8601
  startTime: string;     // "3:00 PM"
  durationMinutes: number;
  locationType: 'individual_address' | 'public' | 'other';
  locationDetails: string;
  notes?: string;
}
```

**Response:**
```typescript
{
  success: true,
  appointmentId: string,
  appointment: {
    id: string,
    startTime: string,  // ISO 8601
    endTime: string,
    status: 'pending',
    // ... other fields
  }
}
```

**Logic:**
1. Validate: user is member of chat
2. Parse date/time into UTC timestamps
3. Check MVP constraint: no other active appointment in this chat
4. Create `appointment` record with `status='pending'`
5. Set `proposed_by` to current user
6. Post system message in chat with proposal details
7. Send email to other user
8. Return appointment object

**Error Codes:**
- 400: Invalid date/time format
- 403: Not chat member
- 409: Active appointment already exists in this chat (MVP constraint)
- 500: Database error

---

#### GET /api/individuals/search

**Purpose:** Get individuals for volunteer to browse

**Auth:** Required (must be volunteer)

**Query Params:**
```typescript
{
  maxDistance?: number;  // Default: 50 km
}
```

**Response:**
```typescript
{
  individuals: [
    {
      id: string,
      firstName: string,
      lastInitial: string,
      city: string,
      pronouns: string | null,
      bio: string | null,
      profilePictureUrl: string | null,
      distanceKm: number,
      matchingCategories: string[]
    }
  ]
}
```

**Logic:**
1. Validate: user is volunteer
2. Call `get_individuals_for_volunteer(user.id, maxDistance)`
3. Return results (RLS ensures only approved, browsable individuals)

---

### 5.2 Modified Endpoints

#### POST /api/appointment/confirm (previously confirm appointment request)

**Changes:**
- Remove availability unhiding logic
- Remove `availability_id` references
- Update to use new appointment schema fields
- Keep chat creation logic (or skip if chat already exists)

**New Logic:**
1. Update `status = 'confirmed'`, set `confirmed_at` timestamp
2. Send confirmation emails (keep existing)
3. Create chat if not exists (keep existing)
4. Post confirmation message in chat

---

#### POST /api/appointment/cancel

**Changes:**
- Remove availability unhiding
- Keep everything else

---

#### DELETE /api/request (Deprecate/Remove)

**Status:** No longer needed (replaced by chat request flow)

**Action:** Delete this route entirely

---

## 6. Testing Checklist

### 6.1 Database Migration Testing

- [ ] All migration scripts run without errors on dev Supabase
- [ ] Existing appointments preserved with correct data
- [ ] `availability_id` set to NULL for all existing appointments
- [ ] New columns have correct default values
- [ ] RLS policies work (users can only see own data)
- [ ] Database functions return correct results
- [ ] Unique constraints prevent duplicate data

### 6.2 Chat Request Flow Testing

**Individual → Volunteer:**
- [ ] Individual can send chat request from dog profile
- [ ] Volunteer receives email notification
- [ ] Volunteer sees request in dashboard "Pending Requests"
- [ ] Volunteer can accept → chat opens
- [ ] Volunteer can decline → individual notified
- [ ] Duplicate requests prevented (error shown)

**Volunteer → Individual:**
- [ ] Volunteer can browse individuals
- [ ] Audience category matching works
- [ ] Distance filtering accurate
- [ ] Volunteer can send chat request
- [ ] Individual receives notification
- [ ] Individual can accept/decline
- [ ] Profile visibility correct (first name + initial, no last name)

### 6.3 Appointment Scheduling Testing

**Proposal:**
- [ ] "Schedule Appointment" button visible in chat
- [ ] Modal wizard works through all 3 steps
- [ ] Date picker prevents past dates
- [ ] Time dropdown shows reasonable hours
- [ ] Duration options: 30, 60, 90, 120, 180 minutes
- [ ] Location type selector works
- [ ] Validation errors shown correctly
- [ ] Submit creates pending appointment
- [ ] Other user sees proposal in chat
- [ ] Other user receives email

**Confirmation:**
- [ ] Recipient can confirm → status = 'confirmed'
- [ ] Both users receive confirmation email
- [ ] Appointment appears in "My Visits"
- [ ] Appointment banner shows in chat
- [ ] MVP constraint: Can't create second appointment (error shown)

**Modification:**
- [ ] "Modify Booking" opens wizard with current values
- [ ] Changes shown as diff (old vs new)
- [ ] Modified appointment status = 'pending' again
- [ ] Other user must re-confirm
- [ ] Email sent with change details

**Cancellation:**
- [ ] "Cancel Booking" prompts for reason
- [ ] Status updated to 'canceled'
- [ ] Other user notified via email + chat
- [ ] Appointment removed from "My Visits" upcoming section
- [ ] Appears in history with "Canceled" badge

### 6.4 Dashboard & Navigation Testing

- [ ] Individuals see "Connect with Dogs" tab
- [ ] Volunteers see "Connect with People" tab
- [ ] Volunteer dashboard no longer shows "Manage Availability"
- [ ] "Pending Requests" shows both chat requests and appointment proposals
- [ ] Badge counts accurate
- [ ] Empty states show helpful messages
- [ ] Mobile navigation works

### 6.5 Email Testing

- [ ] All new email templates render correctly
- [ ] Links in emails work (point to correct pages)
- [ ] Unsubscribe links present
- [ ] Images load
- [ ] Mobile-friendly formatting
- [ ] Resend API calls succeed
- [ ] Emails arrive within 1 minute

### 6.6 Admin Testing

- [ ] Admin can see all chat requests
- [ ] Admin can see all appointments (new schema)
- [ ] Admin can view all chats
- [ ] Admin can archive users (cascades correctly)
- [ ] Admin dashboard still functional

### 6.7 Performance Testing

- [ ] Individual search returns in <2 seconds
- [ ] Dog search returns in <2 seconds
- [ ] No N+1 queries (check logs)
- [ ] Database indexes used (check EXPLAIN ANALYZE)
- [ ] Stream Chat connection stable
- [ ] No memory leaks in long sessions

### 6.8 Edge Cases & Error Handling

- [ ] User tries to send chat request to self (blocked)
- [ ] User tries to schedule appointment with past date (validation error)
- [ ] User deletes account → pending requests deleted (cascade)
- [ ] User declines 5 chat requests in a row (no issues)
- [ ] Stream Chat disconnects during scheduling (graceful handling)
- [ ] Database timeout during search (error message shown)
- [ ] Invalid timezone handling (uses UTC, displays in local)

---

## 7. Deployment Strategy

### 7.1 Pre-Deployment (1 week before)

1. **User Communication:**
   - [ ] Send email to all volunteers explaining changes
   - [ ] Post announcement in any community channels
   - [ ] Update help documentation

2. **Final Testing:**
   - [ ] Run all tests on dev environment
   - [ ] Test with production-like data (anonymized export)
   - [ ] Performance testing with realistic data volume

3. **Backup Production:**
   - [ ] Full database backup
   - [ ] Export all user data
   - [ ] Backup environment variables
   - [ ] Document current production state

### 7.2 Deployment Day

**Recommended Time:** Low-traffic period (e.g., Sunday 2 AM)

**Steps:**

1. **Prepare Production Environment** (30 min)
   ```bash
   # Switch to main branch, pull latest
   git checkout main
   git pull origin main

   # Merge feature branch
   git merge feature/chat-based-scheduling

   # Push to GitHub
   git push origin main
   ```

2. **Run Database Migrations** (30 min)
   ```bash
   # Connect to production Supabase
   # Run scripts 1-6 in order
   psql $PROD_SUPABASE_URL < scripts/migration_01_add_general_availability.sql
   psql $PROD_SUPABASE_URL < scripts/migration_02_create_chat_requests.sql
   # ... continue through migration_06

   # Verify migrations
   psql $PROD_SUPABASE_URL -c "\d appointments"  # Check new columns
   psql $PROD_SUPABASE_URL -c "\dt"              # Check tables exist
   ```

3. **Deploy to Vercel** (15 min)
   ```bash
   # Vercel will auto-deploy from main branch
   # Or trigger manual deployment
   vercel --prod

   # Wait for build to complete
   # Monitor build logs for errors
   ```

4. **Verify Deployment** (30 min)
   - [ ] Homepage loads
   - [ ] User login works
   - [ ] Individual dashboard accessible
   - [ ] Volunteer dashboard accessible
   - [ ] Search functions work
   - [ ] Chat request can be sent
   - [ ] Email notifications sending

5. **Monitor for Issues** (2 hours)
   - [ ] Watch Vercel error logs
   - [ ] Check Supabase query performance
   - [ ] Monitor Resend email delivery
   - [ ] Check Stream Chat connections
   - [ ] Watch for user-reported issues

### 7.3 Post-Deployment

**Day 1:**
- [ ] Monitor error rates (should be <1%)
- [ ] Check email delivery (all sent successfully)
- [ ] Verify no database deadlocks
- [ ] Respond to user questions/issues

**Week 1:**
- [ ] Collect user feedback
- [ ] Track key metrics:
  - Chat requests sent/accepted
  - Appointments proposed/confirmed
  - Time from chat request to confirmed appointment
  - User engagement (return visits)
- [ ] Fix any bugs discovered
- [ ] Adjust UI based on feedback

**Week 2-4:**
- [ ] Analyze metrics vs. old system
- [ ] Plan additional features based on feedback
- [ ] Optimize performance if needed

---

## 8. Rollback Procedures

### 8.1 If Deployment Fails During Migration

**Scenario:** Database migration fails partway through

**Steps:**
1. **Don't Panic** - No users are affected yet (deployment hasn't completed)
2. Restore database from backup:
   ```bash
   psql $PROD_SUPABASE_URL < backup_pre_migration_*.sql
   ```
3. Revert Vercel deployment to previous version:
   ```bash
   vercel rollback
   ```
4. Investigate issue in dev environment
5. Fix migration script
6. Retry when ready

### 8.2 If Critical Bug Discovered Post-Deployment

**Scenario:** Users can't send chat requests (API error)

**Steps:**
1. **Assess Severity:**
   - Critical (app unusable): Immediate rollback
   - High (feature broken): Fix within 4 hours or rollback
   - Medium (UX issue): Fix within 24 hours
   - Low (minor bug): Add to backlog

2. **For Critical/High Issues:**
   ```bash
   # Revert Vercel to previous deployment
   vercel rollback

   # Restore database (if data corruption occurred)
   # Note: This loses any new data created since deployment
   psql $PROD_SUPABASE_URL < backup_pre_migration_*.sql
   ```

3. **Communicate:**
   - Post status update to users
   - Explain what happened
   - Timeline for fix

4. **Fix & Redeploy:**
   - Fix bug in feature branch
   - Test thoroughly
   - Schedule new deployment

### 8.3 Partial Rollback (Keep Some Features)

**Scenario:** Chat-based scheduling works, but individual directory has bugs

**Steps:**
1. Feature flag approach (future implementation):
   ```typescript
   // Disable individual directory temporarily
   const ENABLE_INDIVIDUAL_DIRECTORY = false;

   // In volunteer dashboard:
   {ENABLE_INDIVIDUAL_DIRECTORY && <IndividualDirectory />}
   ```

2. Deploy hotfix with feature disabled
3. Fix bug in dev
4. Re-enable feature when ready

---

## 9. Known Issues & Future Enhancements

### 9.1 Known Limitations (MVP)

**Documented for User Awareness:**

1. **One Appointment at a Time:** Users can only have one active/future appointment per chat. After completion, they can schedule the next.

2. **No Double-Booking Prevention:** Volunteers must manually avoid scheduling conflicts (check calendar before confirming).

3. **No Waitlist:** If volunteer is at capacity, individuals must try again later.

4. **Profile Visibility:** All approved users appear in search (no opt-out toggle yet).

5. **Limited Filters:** Only distance and audience categories for MVP.

### 9.2 Future Enhancements (Post-MVP)

**Priority 1 (Next Sprint):**
- [ ] Profile visibility toggle (`is_browsable` field already exists)
- [ ] Chat request limits (max 5 pending incoming)
- [ ] Advanced filters (age, visit frequency, dog breed)
- [ ] "Last active" timestamp on profiles

**Priority 2 (Within 3 Months):**
- [ ] Multiple appointments per chat (remove constraint)
- [ ] Double-booking prevention with warnings
- [ ] Calendar integration (.ics export)
- [ ] No-show tracking and ratings

**Priority 3 (Future):**
- [ ] In-app notifications (push)
- [ ] Mobile app (React Native or Capacitor native build)
- [ ] Video call integration for remote visits
- [ ] Recurring appointment templates

---

## 10. Success Metrics

### 10.1 Key Performance Indicators

**Engagement Metrics:**
- Chat request acceptance rate (target: >60%)
- Appointment confirmation rate after chat opens (target: >70%)
- Time from chat request to confirmed appointment (target: <48 hours)
- Volunteer return rate (target: >40% weekly active)

**User Satisfaction:**
- User feedback survey (target: 4+ stars)
- Support tickets related to scheduling (target: <5/week)
- User retention (target: >50% active after 30 days)

**System Health:**
- API response time (target: <500ms p95)
- Email delivery rate (target: >98%)
- Stream Chat uptime (target: >99%)
- Database query performance (target: <200ms avg)

### 10.2 Comparison to Old System

**Baseline (Current System):**
- Appointment request → confirmation time: ~24 hours
- Volunteer weekly active rate: ~25%
- Availability setup completion: ~60%

**Expected Improvements:**
- Faster appointment confirmation (real-time chat)
- Higher volunteer engagement (browsing individuals)
- Simpler onboarding (no availability setup)

**Track Weekly:**
- Total chat requests sent
- Total appointments scheduled
- Average time to first appointment (new users)

---

## Appendix A: File Change Summary

### Files to Delete (~2500 lines)
```
src/components/availability/
├─ TemplateStyleAvailability.tsx (~800 lines)
└─ CustomTimePicker.tsx (~300 lines)

src/app/api/
├─ request/route.ts (~200 lines)
└─ admin/availabilities/route.ts (~150 lines)

scripts/
├─ Various availability-related migration scripts (~1000 lines)
```

### Files to Create (~4500 lines)
```
src/components/individual/
├─ IndividualDirectory.tsx (~400 lines)
├─ IndividualProfileCard.tsx (~150 lines)

src/components/chat/
├─ ChatRequestButton.tsx (~150 lines)
└─ PendingChatRequests.tsx (~300 lines)

src/components/appointments/
├─ ScheduleAppointmentModal.tsx (~600 lines)
├─ AppointmentProposalCard.tsx (~250 lines)
├─ AppointmentConfirmedBanner.tsx (~150 lines)
└─ ModifyAppointmentModal.tsx (~400 lines)

src/components/profile/
└─ GeneralAvailabilityInput.tsx (~100 lines)

src/app/api/
├─ chat/request/route.ts (~250 lines)
├─ chat/accept/route.ts (~200 lines)
├─ chat/decline/route.ts (~100 lines)
├─ appointment/propose/route.ts (~300 lines)
├─ appointment/confirm-proposal/route.ts (~200 lines)
├─ appointment/decline-proposal/route.ts (~150 lines)
├─ appointment/modify/route.ts (~250 lines)
└─ individuals/search/route.ts (~200 lines)

scripts/
├─ migration_01_add_general_availability.sql
├─ migration_02_create_chat_requests.sql
├─ migration_03_modify_appointments.sql
├─ migration_04_update_rls_policies.sql
├─ migration_05_remove_availability.sql
└─ migration_06_create_search_functions.sql

templates/emails/
├─ chat-request-received.hbs
├─ chat-request-accepted.hbs
├─ appointment-proposed.hbs
├─ appointment-confirmed.hbs
└─ appointment-modified.hbs
```

### Files to Modify (~3000 lines changed)
```
src/components/
├─ dog/DogDirectory.tsx (~200 lines changed)
├─ dog/DogProfile.tsx (~300 lines changed)
├─ visits/MyVisits.tsx (~200 lines changed)
├─ messaging/MessagingTab.tsx (~200 lines changed)
├─ dashboard/DashboardHomeVolunteer.tsx (~300 lines changed)
├─ dashboard/DashboardHomeIndividual.tsx (~150 lines changed)
└─ appointments/CancelAppointmentModal.tsx (~100 lines changed)

src/app/api/
├─ appointment/confirm/route.ts (~150 lines changed)
└─ appointment/cancel/route.ts (~100 lines changed)
```

---

## Appendix B: Database Schema Reference

### New Tables

**chat_requests:**
```sql
id                UUID PRIMARY KEY
requester_id      UUID → users.id
recipient_id      UUID → users.id
dog_id            UUID → dogs.id (nullable)
status            TEXT (pending/accepted/declined)
created_at        TIMESTAMPTZ
responded_at      TIMESTAMPTZ (nullable)
```

### Modified Tables

**users:**
```sql
-- Existing columns remain
-- New columns:
general_availability  TEXT (nullable)
is_browsable          BOOLEAN DEFAULT TRUE
```

**appointments:**
```sql
-- Existing columns remain
-- Modified:
availability_id       TEXT (now nullable, was NOT NULL)

-- New columns:
location_type         TEXT
location_details      TEXT
duration_minutes      INTEGER DEFAULT 60
notes                 TEXT
proposed_by           UUID → users.id
proposed_at           TIMESTAMPTZ
confirmed_at          TIMESTAMPTZ
chat_request_id       UUID → chat_requests.id
```

### Deleted Tables
- `appointment_availability` (entire table removed)

---

**End of Migration Plan**

This document should be referenced throughout the implementation. Update as needed when requirements change or bugs are discovered.
