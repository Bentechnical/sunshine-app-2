# Database Migration Log
**Project:** Chat-Based Scheduling Redesign
**Branch:** `chat-based-scheduling`

This document tracks every SQL change made during the redesign.
Copy-paste each script into the Supabase SQL editor.
Check off dev and prod as each script is applied.

---

## How to Use

1. Open Supabase → SQL Editor
2. Copy the SQL block for the next pending script
3. Run it
4. Check the box below

---

## Prerequisites

### PostGIS Extension
**Status:** [ ] Dev  [ ] Prod

Scripts 06 requires PostGIS for distance calculations. Enable it before running Script 06.

```sql
CREATE EXTENSION IF NOT EXISTS postgis;
```

Or via Supabase Dashboard → Database → Extensions → search "postgis" → Enable.

---

## Scripts

### Script 01 — Add general_availability and is_browsable to users
**Status:** [x] Dev  [ ] Prod

```sql
ALTER TABLE users
ADD COLUMN general_availability TEXT,
ADD COLUMN is_browsable BOOLEAN DEFAULT TRUE;

COMMENT ON COLUMN users.general_availability IS
  'Free-text description of typical availability (e.g., "Weekends and Thursday afternoons"). Volunteers only.';
COMMENT ON COLUMN users.is_browsable IS
  'Whether user appears in directory search. Reserved for future use — defaults to true.';
```

**Rollback:**
```sql
ALTER TABLE users
DROP COLUMN general_availability,
DROP COLUMN is_browsable;
```

---

### Script 02 — Create chat_requests table
**Status:** [x] Dev  [ ] Prod

```sql
CREATE TABLE chat_requests (

  -- Identity
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Participants
  -- Note: users.id is TEXT (Clerk user IDs), dogs.id is UUID
  requester_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  dog_id INTEGER REFERENCES dogs(id) ON DELETE SET NULL,

  -- Request state
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  responded_at TIMESTAMPTZ,

  -- Stream Chat channel (populated when request is accepted)
  channel_id TEXT,
  channel_created_at TIMESTAMPTZ,
  channel_closed_at TIMESTAMPTZ,

  -- Admin monitoring (updated by Stream webhook on each message)
  last_message_at TIMESTAMPTZ,
  message_count INTEGER DEFAULT 0,
  unread_count_admin INTEGER DEFAULT 0,

  -- Prevent duplicate pending requests between same two users
  CONSTRAINT unique_pending_request UNIQUE (requester_id, recipient_id)
    DEFERRABLE INITIALLY DEFERRED
);

-- Note: The unique constraint above only covers same-direction duplicates.
-- The application layer also checks both directions before inserting.

-- Indexes
CREATE INDEX idx_chat_requests_recipient ON chat_requests(recipient_id, status);
CREATE INDEX idx_chat_requests_requester ON chat_requests(requester_id, status);
CREATE INDEX idx_chat_requests_created ON chat_requests(created_at DESC);
CREATE INDEX idx_chat_requests_channel ON chat_requests(channel_id)
  WHERE channel_id IS NOT NULL;

COMMENT ON TABLE chat_requests IS
  'Single source of truth for the full conversation lifecycle: request → accepted chat → appointment scheduling. Replaces appointment_chats for new chats.';
COMMENT ON COLUMN chat_requests.dog_id IS
  'Always populated: set to the clicked dog (individual-initiated) or the volunteer''s dog (volunteer-initiated).';
COMMENT ON COLUMN chat_requests.responded_at IS
  'When the request was accepted or declined. Used as decline timestamp for 30-day search hiding.';
COMMENT ON COLUMN chat_requests.channel_id IS
  'Stream Chat channel ID. Null until request is accepted.';
COMMENT ON COLUMN chat_requests.channel_closed_at IS
  'Set only when conversation is fully closed. Appointment cancellation does NOT close the channel.';
```

**Rollback:**
```sql
DROP TABLE chat_requests;
```

---

### Script 03 — Modify appointments table
**Status:** [x] Dev  [ ] Prod

```sql
-- Add new fields for chat-based scheduling
ALTER TABLE appointments
ADD COLUMN location_type TEXT CHECK (location_type IN ('individual_address', 'public', 'other')),
ADD COLUMN location_details TEXT,
ADD COLUMN duration_minutes INTEGER DEFAULT 60,
ADD COLUMN notes TEXT,
ADD COLUMN proposed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
ADD COLUMN proposed_at TIMESTAMPTZ,
ADD COLUMN confirmed_at TIMESTAMPTZ,
ADD COLUMN chat_request_id UUID REFERENCES chat_requests(id) ON DELETE SET NULL;

-- Make availability_id nullable (preserve existing data, new appointments won't use it)
ALTER TABLE appointments
ALTER COLUMN availability_id DROP NOT NULL;

-- One active appointment per chat at a time (MVP constraint)
CREATE UNIQUE INDEX one_active_appointment_per_chat
ON appointments(chat_request_id)
WHERE status IN ('pending', 'confirmed')
  AND chat_request_id IS NOT NULL;

-- Backfill defaults on existing rows
UPDATE appointments
SET duration_minutes = 60
WHERE duration_minutes IS NULL;

COMMENT ON COLUMN appointments.location_type IS
  'Where the appointment takes place: individual_address, public location, or other';
COMMENT ON COLUMN appointments.location_details IS
  'Address or description of meeting location';
COMMENT ON COLUMN appointments.proposed_by IS
  'User who initially proposed this appointment (individual or volunteer)';
COMMENT ON COLUMN appointments.chat_request_id IS
  'Links appointment back to the originating chat request';
```

**Rollback:**
```sql
DROP INDEX IF EXISTS one_active_appointment_per_chat; -- was on chat_request_id

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

### Script 04 — RLS policies for chat_requests
**Status:** [x] Dev  [ ] Prod

```sql
ALTER TABLE chat_requests ENABLE ROW LEVEL SECURITY;

-- Users can see requests they sent or received
CREATE POLICY "Users can view their own chat requests"
ON chat_requests FOR SELECT
USING (
  auth.uid()::text IN (requester_id::text, recipient_id::text)
);

-- Users can create requests (as the requester)
CREATE POLICY "Users can create chat requests"
ON chat_requests FOR INSERT
WITH CHECK (
  auth.uid()::text = requester_id::text
);

-- Only the recipient can update status (accept/decline)
CREATE POLICY "Recipients can update request status"
ON chat_requests FOR UPDATE
USING (
  auth.uid()::text = recipient_id::text
)
WITH CHECK (
  auth.uid()::text = recipient_id::text
);

-- Note: is_browsable is reserved for future use and defaults to TRUE for all users.
-- The existing "Only approved users are visible to public" policy already handles
-- directory visibility. No additional policy needed here — adding one would be
-- redundant since Postgres ORs multiple SELECT policies together.
```

**Rollback:**
```sql
DROP POLICY IF EXISTS "Users can view their own chat requests" ON chat_requests;
DROP POLICY IF EXISTS "Users can create chat requests" ON chat_requests;
DROP POLICY IF EXISTS "Recipients can update request status" ON chat_requests;
```

---

### Script 05 — Remove availability system (DESTRUCTIVE — run last)
**Status:** [x] Dev  [ ] Prod

> ⚠️ This is irreversible without a full database backup. Ensure Script 01–04 are working
> and a backup has been taken before running this.

```sql
-- Drop database functions
DROP FUNCTION IF EXISTS get_nearby_dogs_with_availability(FLOAT, FLOAT);
DROP FUNCTION IF EXISTS get_dogs_with_next_availability();

-- Drop views
DROP VIEW IF EXISTS dogs_with_next_availability;

-- Archive availability data before deletion (optional safety net)
CREATE TABLE IF NOT EXISTS archived_appointment_availability AS
SELECT * FROM appointment_availability;

-- Drop the table
DROP TABLE appointment_availability;
```

**Rollback:** Requires full database restore from backup. No easy rollback — take backup first.

---

### Script 06 — Add snooze columns + create new search functions
**Status:** [x] Dev  [ ] Prod

Adds the `snoozed_by` / `snoozed_until` columns for the unified snooze system, then creates both search functions with 30-day decline hiding **and** snooze filtering built in.

**Testing — inspect active snoozes:**
```sql
SELECT id, requester_id, recipient_id, snoozed_by, snoozed_until
FROM chat_requests WHERE snoozed_until > NOW();
```
**Testing — remove a snooze (by chat_request id):**
```sql
UPDATE chat_requests SET snoozed_until = NULL, snoozed_by = NULL
WHERE id = '<chat_request_id>';
```

```sql
-- Add snooze columns first (functions below reference them)
ALTER TABLE chat_requests
  ADD COLUMN IF NOT EXISTS snoozed_by TEXT,
  ADD COLUMN IF NOT EXISTS snoozed_until TIMESTAMPTZ;

COMMENT ON COLUMN chat_requests.snoozed_by IS
  'User ID of the participant who triggered the snooze.';
COMMENT ON COLUMN chat_requests.snoozed_until IS
  'Timestamp when the snooze expires. While active, the other party is hidden from search and blocked from new chat requests.';
```

```sql
-- Function: volunteers browse individuals
CREATE OR REPLACE FUNCTION get_individuals_for_volunteer(
  volunteer_user_id TEXT,
  max_distance_km FLOAT DEFAULT 50
)
RETURNS TABLE (
  id TEXT,
  first_name TEXT,
  last_initial TEXT,
  city TEXT,
  pronouns TEXT,
  bio TEXT,
  profile_picture_url TEXT,
  distance_km DOUBLE PRECISION,
  matching_categories TEXT[]
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    u.id,
    u.first_name,
    LEFT(u.last_name, 1) as last_initial,
    u.city::TEXT,
    u.pronouns::TEXT,
    u.bio::TEXT,
    u.profile_image::TEXT as profile_picture_url,
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
    AND iat.category_id = vap.category_id
    AND ST_DWithin(
      ST_MakePoint(u.location_lng, u.location_lat)::geography,
      ST_MakePoint(v.location_lng, v.location_lat)::geography,
      max_distance_km * 1000
    )
    -- Exclude users declined within 30 days
    AND u.id NOT IN (
      SELECT recipient_id FROM chat_requests
      WHERE requester_id = volunteer_user_id
        AND status = 'declined'
        AND responded_at > NOW() - INTERVAL '30 days'
      UNION
      SELECT requester_id FROM chat_requests
      WHERE recipient_id = volunteer_user_id
        AND status = 'declined'
        AND responded_at > NOW() - INTERVAL '30 days'
    )
    -- Exclude individuals with an active snooze (either direction)
    AND u.id NOT IN (
      SELECT CASE WHEN requester_id = volunteer_user_id THEN recipient_id ELSE requester_id END
      FROM chat_requests
      WHERE (requester_id = volunteer_user_id OR recipient_id = volunteer_user_id)
        AND snoozed_until > NOW()
    )
  GROUP BY u.id, v.location_lng, v.location_lat
  ORDER BY distance_km ASC;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

COMMENT ON FUNCTION get_individuals_for_volunteer IS
  'Returns individuals matching volunteer audience preferences within distance. Excludes recently declined and snoozed users.';

---

-- Function: individuals browse dogs
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
    AND u.id = individual_user_id
    AND u.role = 'individual'
    AND vap.category_id = iat.category_id
    AND ST_DWithin(
      ST_MakePoint(v.location_lng, v.location_lat)::geography,
      ST_MakePoint(u.location_lng, u.location_lat)::geography,
      max_distance_km * 1000
    )
    -- Exclude volunteers declined within 30 days
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
    -- Exclude volunteers with an active snooze (either direction)
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

COMMENT ON FUNCTION get_dogs_for_individual IS
  'Returns dogs matching individual audience categories within distance. No availability check. Excludes recently declined and snoozed volunteers.';
```

**Rollback:**
```sql
DROP FUNCTION IF EXISTS get_individuals_for_volunteer(TEXT, FLOAT);
DROP FUNCTION IF EXISTS get_dogs_for_individual(TEXT, FLOAT);
ALTER TABLE chat_requests
  DROP COLUMN IF EXISTS snoozed_by,
  DROP COLUMN IF EXISTS snoozed_until;
```

---

### Script 07 — Fix chat_requests unique constraint
**Status:** [x] Dev  [ ] Prod

The original Script 02 constraint `UNIQUE (requester_id, recipient_id)` had no partial filter, permanently blocking re-requests after any previous request. Replaced with a partial unique index.

```sql
ALTER TABLE chat_requests DROP CONSTRAINT unique_pending_request;

CREATE UNIQUE INDEX unique_pending_request
ON chat_requests(requester_id, recipient_id)
WHERE status = 'pending';
```

**Effect:** Two simultaneous pending requests in the same direction are still blocked, but users can re-request after a chat is declined or closed.

**Rollback:**
```sql
DROP INDEX IF EXISTS unique_pending_request;

ALTER TABLE chat_requests
ADD CONSTRAINT unique_pending_request UNIQUE (requester_id, recipient_id)
  DEFERRABLE INITIALLY DEFERRED;
```

---

### Script 08 — Fix chat_requests RLS policies (auth.uid() → auth.jwt())
**Status:** [x] Dev  [ ] Prod

`auth.uid()` in PostgreSQL casts the JWT `sub` claim to UUID. Clerk user IDs are not UUIDs, so this fails. Replaced with `(auth.jwt() ->> 'sub')` which returns the sub claim as text.

```sql
DROP POLICY IF EXISTS "Users can view their own chat requests" ON chat_requests;
DROP POLICY IF EXISTS "Users can create chat requests" ON chat_requests;
DROP POLICY IF EXISTS "Recipients can update request status" ON chat_requests;

CREATE POLICY "Users can view their own chat requests"
ON chat_requests FOR SELECT
USING (
  (auth.jwt() ->> 'sub') IN (requester_id, recipient_id)
);

CREATE POLICY "Users can create chat requests"
ON chat_requests FOR INSERT
WITH CHECK (
  (auth.jwt() ->> 'sub') = requester_id
);

CREATE POLICY "Recipients can update request status"
ON chat_requests FOR UPDATE
USING (
  (auth.jwt() ->> 'sub') = recipient_id
)
WITH CHECK (
  (auth.jwt() ->> 'sub') = recipient_id
);
```

---

### ~~Script 09~~ — Folded into Script 06
**Status:** [ ] Dev  [ ] Prod

Adds `snoozed_by` and `snoozed_until` columns to `chat_requests`, and updates both search functions to exclude snoozed users. This is the single snooze mechanism used by all hiding triggers (close-and-snooze, and future: decline-and-snooze).

**Semantics:** Either participant can snooze the other. While a snooze is active, the snoozed party is hidden from the snoozer's search results, and cannot send new chat requests to the snoozer.

**Testing — inspect active snoozes:**
```sql
SELECT id, requester_id, recipient_id, snoozed_by, snoozed_until
FROM chat_requests
WHERE snoozed_until > NOW();
```

**Testing — remove a snooze:**
```sql
UPDATE chat_requests
SET snoozed_until = NULL, snoozed_by = NULL
WHERE id = '<chat_request_id>';
```

```sql
-- 1. Add columns
ALTER TABLE chat_requests
  ADD COLUMN IF NOT EXISTS snoozed_by TEXT,
  ADD COLUMN IF NOT EXISTS snoozed_until TIMESTAMPTZ;

COMMENT ON COLUMN chat_requests.snoozed_by IS
  'User ID of the participant who triggered the snooze.';
COMMENT ON COLUMN chat_requests.snoozed_until IS
  'Timestamp when the snooze expires. While active, the snoozed party is hidden from search and blocked from new chat requests.';

-- 2. Update get_dogs_for_individual to also exclude snoozed volunteers
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
    AND u.id = individual_user_id
    AND u.role = 'individual'
    AND vap.category_id = iat.category_id
    AND ST_DWithin(
      ST_MakePoint(v.location_lng, v.location_lat)::geography,
      ST_MakePoint(u.location_lng, u.location_lat)::geography,
      max_distance_km * 1000
    )
    -- Exclude volunteers declined within 30 days
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
    -- Exclude volunteers with an active snooze (either direction)
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

-- 3. Update get_individuals_for_volunteer to also exclude snoozed individuals
CREATE OR REPLACE FUNCTION get_individuals_for_volunteer(
  volunteer_user_id TEXT,
  max_distance_km FLOAT DEFAULT 50
)
RETURNS TABLE (
  id TEXT,
  first_name TEXT,
  last_initial TEXT,
  city TEXT,
  pronouns TEXT,
  bio TEXT,
  profile_picture_url TEXT,
  distance_km DOUBLE PRECISION,
  matching_categories TEXT[]
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    u.id,
    u.first_name,
    LEFT(u.last_name, 1) as last_initial,
    u.city::TEXT,
    u.pronouns::TEXT,
    u.bio::TEXT,
    u.profile_image::TEXT as profile_picture_url,
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
    AND iat.category_id = vap.category_id
    AND ST_DWithin(
      ST_MakePoint(u.location_lng, u.location_lat)::geography,
      ST_MakePoint(v.location_lng, v.location_lat)::geography,
      max_distance_km * 1000
    )
    -- Exclude users declined within 30 days
    AND u.id NOT IN (
      SELECT recipient_id FROM chat_requests
      WHERE requester_id = volunteer_user_id
        AND status = 'declined'
        AND responded_at > NOW() - INTERVAL '30 days'
      UNION
      SELECT requester_id FROM chat_requests
      WHERE recipient_id = volunteer_user_id
        AND status = 'declined'
        AND responded_at > NOW() - INTERVAL '30 days'
    )
    -- Exclude individuals with an active snooze (either direction)
    AND u.id NOT IN (
      SELECT CASE WHEN requester_id = volunteer_user_id THEN recipient_id ELSE requester_id END
      FROM chat_requests
      WHERE (requester_id = volunteer_user_id OR recipient_id = volunteer_user_id)
        AND snoozed_until > NOW()
    )
  GROUP BY u.id, v.location_lng, v.location_lat
  ORDER BY distance_km ASC;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
```

**Rollback:**
```sql
ALTER TABLE chat_requests
  DROP COLUMN IF EXISTS snoozed_by,
  DROP COLUMN IF EXISTS snoozed_until;
-- Re-run Script 06 to restore the functions without snooze filtering.
```

---

## Summary Table

| Script | Description | Dev | Prod |
|--------|-------------|-----|------|
| 01 | Add general_availability + is_browsable to users | [x] | [ ] |
| 02 | Create chat_requests table | [x] | [ ] |
| 03 | Modify appointments table | [x] | [ ] |
| 04 | RLS policies for chat_requests | [x] | [ ] |
| 06 | Add snooze columns + create new search functions (with decline & snooze filters) | [x] | [ ] |
| 07 | Fix unique constraint (allow re-requesting) | [x] | [ ] |
| 08 | Fix RLS policies (auth.jwt instead of auth.uid) | [x] | [ ] |
| 05 | **DESTRUCTIVE** — Remove appointment_availability table | [x] | [ ] |

> Run Script 05 last, after verifying all other scripts work and code changes are stable.
