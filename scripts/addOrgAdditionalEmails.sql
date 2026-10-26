-- Migration 43 — Add `additional_emails` to `users`
--
-- WHY: an organization frequently has more than one person who should receive its mail — most
-- often a billing contact distinct from the person who booked the visit. `users.email` is uniquely
-- constrained and doubles as the Clerk login identity, so it cannot hold a second address, and a
-- second *user* row is the wrong shape: these people don't log in, they just receive email.
--
-- WHY A COLUMN AND NOT A TABLE: the usual objection to a denormalized list is that you can't query
-- it, can't constrain it, and can't hang attributes off it. The first two don't apply to a real
-- `text[]` (`@>` works, GIN indexes work, CHECK constraints work), and the third is moot — these
-- rows have no attributes. Names were considered and deliberately dropped; an address is the whole
-- record. If per-address flags are ever needed ("this one gets invoices, that one gets reminders"),
-- `unnest` migrates this into a table in about ten lines.
--
-- This is NOT a comma-separated string. Postgres arrays are a first-class type; a delimited string
-- would be the actual smell, because it needs parsing and can't be constrained.
--
-- SEMANTICS: these are additional addresses for the organization, not a separate "billing" concept.
-- `users.email` stays the primary — the addressee. These are copied (cc). The one exception is an
-- admin-managed org whose primary is an undeliverable `<id>@managed.local` placeholder: there the
-- first additional address is promoted to the addressee, which makes a managed org fully
-- functional as soon as one real address is added. See `src/utils/orgEmail.ts`.
--
-- SCOPE AT TIME OF WRITING: wired into the post-visit invoice email only. Whether these addresses
-- should also receive the other org-facing transactional mail (approval, going-ahead, reminders,
-- cancellation) is an open product question. Resolution lives in one helper so widening it later is
-- a one-line change per send site rather than a schema change.
--
-- Only meaningful for `role = 'organization'`. Harmless elsewhere — an empty array on a volunteer
-- row costs nothing and is never read.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS additional_emails text[] NOT NULL DEFAULT '{}';

-- Constraints are enforced here as well as in the API, because the API is not the only way rows
-- get written (seed scripts, manual fixes, a future import tool).
--
--   * at most 5 addresses — a notification list, not a mailing list
--   * each must look like an address and contain no whitespace
--   * no `@managed.local` placeholders, which are undeliverable by construction
--
-- Deliberately NOT enforced in SQL: uniqueness within the array, and "must differ from
-- users.email". Both are normalization concerns rather than integrity ones, both are handled on
-- write, and a CHECK that rejects a duplicate would turn a harmless paste into a 500.
--
-- The obvious phrasing — `NOT EXISTS (SELECT 1 FROM unnest(...) WHERE ...)` — is rejected:
-- Postgres forbids subqueries in CHECK constraints (0A000), and `unnest` in a WHERE clause is
-- one. The alternative is an IMMUTABLE helper function, but a function in a CHECK is a known
-- foot-gun (its body is never re-validated, and pg_dump ordering can bite).
--
-- So: join the array with a space and match the whole string. This is exact rather than a hack,
-- because the address pattern itself forbids whitespace — `[^@[:space:]]` — so a space can only
-- ever be a separator we inserted, never part of an address. The regex therefore means
-- "every element is well-formed" with no ambiguity.
--
-- `array_to_string` silently skips NULL elements, which would let `ARRAY['a@b.c', NULL]` pass,
-- so NULLs are excluded separately via `array_position`.
ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_additional_emails_check;

ALTER TABLE users
  ADD CONSTRAINT users_additional_emails_check CHECK (
    cardinality(additional_emails) <= 5
    AND array_position(additional_emails, NULL) IS NULL
    AND (
      cardinality(additional_emails) = 0
      OR (
        array_to_string(additional_emails, ' ')
          ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+( [^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+)*$'
        AND lower(array_to_string(additional_emails, ' ')) NOT LIKE '%@managed.local%'
      )
    )
  );

COMMENT ON COLUMN users.additional_emails IS
  'Extra email addresses for an organization (cc''d on org mail). users.email remains the primary '
  'addressee, except for admin-managed orgs whose primary is an @managed.local placeholder, where '
  'the first entry here is promoted. Max 5. Only meaningful for role = ''organization''.';

-- Verify: the column exists, defaults empty, and no existing row was given addresses.
SELECT
  count(*)                                              AS org_rows,
  count(*) FILTER (WHERE cardinality(additional_emails) > 0) AS rows_with_extras
FROM users
WHERE role = 'organization';
