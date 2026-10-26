-- Migration 44 — `invoices` + invoice number sequence + private PDF storage bucket
--
-- The post-visit billing record. Created when a visit is marked complete, which is now a
-- deliberate human action (the nightly auto-complete cron was retired in the same change, because
-- an unattended job must not issue invoices).
--
-- THE CENTRAL PROPERTY IS IMMUTABILITY. An invoice is a statement of what was billed, to whom, at
-- what rate, on what date. Nothing about it may change because something else changed later. So
-- the bill-to block, the recipients, the line items, the totals and the fee tier are all
-- *snapshotted* here rather than joined from `visits` and `users` at read time. If an org is
-- renamed, moves address, changes fee tier, or has a contact removed, every invoice already
-- issued must still read exactly as it did when it was sent.
--
-- This is also why `total` is stored rather than summed from `line_items` on read: a rounding
-- rule or a display change must never retroactively alter a figure someone was billed.

-- ─── Invoice numbers ─────────────────────────────────────────────────────────
--
-- A dedicated sequence rather than reusing the PK, because the number is externally meaningful:
-- it appears on the PDF, in the organization's records, and in the tracking sheet.
--
-- STARTING AT 1000 is deliberate. Invoice numbers are currently issued by the legacy Google Apps
-- Script / manual process, which is in the 500s and climbing. Starting well above the live
-- sequence guarantees the two systems cannot collide during the region-by-region cutover, and
-- buys roughly a year of headroom at the current rate.
--
-- GAPS ARE EXPECTED AND FINE. A sequence does not roll back on a failed transaction, so an
-- abandoned draft burns a number. Duplicates would be a real problem; gaps are not, and trying to
-- avoid them (by assigning numbers late, or reusing them) is how you get duplicates.
CREATE SEQUENCE IF NOT EXISTS invoice_number_seq START WITH 1000 INCREMENT BY 1;

CREATE TABLE IF NOT EXISTS invoices (
  id              bigserial PRIMARY KEY,
  invoice_number  integer NOT NULL UNIQUE DEFAULT nextval('invoice_number_seq'),

  -- ON DELETE RESTRICT, not CASCADE or SET NULL. A financial record must not be destroyed as a
  -- side effect of tidying up a visit, and an invoice with no visit is an orphan nobody can
  -- explain. `DELETE /api/admin/visits/[id]/delete` carries a matching guard so the user sees a
  -- readable message rather than a raw FK violation; this constraint is the backstop for when
  -- someone forgets, or writes a new delete path.
  visit_id        integer NOT NULL REFERENCES visits(id) ON DELETE RESTRICT,

  -- Null for guest visits, which have no org account at all. SET NULL rather than RESTRICT here
  -- because the bill-to block below is already snapshotted — deleting the org account does not
  -- make the invoice unreadable, it just unlinks it.
  organization_id text REFERENCES users(id) ON DELETE SET NULL,

  -- ── Snapshot: who was billed ──
  bill_to_name    text NOT NULL,
  bill_to_address text,

  -- ── Snapshot: where it was sent ──
  -- Recorded even when sending fails, so "who should have received this" survives a retry.
  sent_to_email   text,
  sent_cc_emails  text[] NOT NULL DEFAULT '{}',

  -- ── Snapshot: what was billed ──
  -- jsonb array: [{ description, detail, rate, quantity, amount }]. Stored as a document rather
  -- than child rows because nothing ever queries across line items — they are read back only as a
  -- unit, to render the PDF or to show what was sent.
  line_items      jsonb   NOT NULL,
  total           numeric(10,2) NOT NULL CHECK (total >= 0),
  fee_tier        text,

  -- True when a human changed the computed figure in the completion modal. The whole point of
  -- allowing an override is that it is visible afterwards: an unexplained amount is the thing that
  -- makes a billing system untrustworthy.
  amount_overridden boolean NOT NULL DEFAULT false,

  -- draft        — created but not sent (no recipient, or deliberately held back)
  -- sent         — email accepted by Resend
  -- send_failed  — generated but the send errored; retryable from the admin invoice list
  -- void         — cancelled. Never deleted, and the PDF is retained.
  status          text NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft', 'sent', 'send_failed', 'void')),

  issued_at       timestamptz NOT NULL DEFAULT now(),
  sent_at         timestamptz,
  voided_at       timestamptz,
  void_reason     text,

  pdf_path        text,          -- Supabase Storage (system of record)
  drive_file_id   text,          -- Google Drive mirror; null if the upload failed or was skipped
  sheet_synced_at timestamptz,   -- tracking-sheet mirror; null if the append failed or was skipped

  created_by      text REFERENCES users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- One live invoice per visit. Partial, so a voided invoice doesn't block re-issuing a corrected
-- one — which is the entire reason voiding exists rather than deleting. This is the structural
-- defence against double-invoicing: completing a visit twice cannot produce two live bills, even
-- if a retry, a double-click or a race gets past the application checks.
CREATE UNIQUE INDEX IF NOT EXISTS invoices_one_live_per_visit
  ON invoices (visit_id) WHERE status <> 'void';

CREATE INDEX IF NOT EXISTS invoices_status_issued_idx ON invoices (status, issued_at DESC);
CREATE INDEX IF NOT EXISTS invoices_organization_idx  ON invoices (organization_id);

-- Mirrors the trigger pattern used elsewhere for updated_at.
CREATE OR REPLACE FUNCTION set_invoices_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS invoices_set_updated_at ON invoices;
CREATE TRIGGER invoices_set_updated_at
  BEFORE UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION set_invoices_updated_at();

-- ─── RLS ─────────────────────────────────────────────────────────────────────
--
-- Admin and PD may read. There is deliberately NO organization-facing policy: an org receives its
-- own invoice by email, and exposing the table to org accounts would be a way to read billing
-- data across organizations if any future policy is written loosely. All writes go through the
-- service role, which bypasses RLS — no INSERT/UPDATE policy is defined, so nothing else can
-- write even if the anon key leaks.
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins and PDs can view invoices" ON invoices;
CREATE POLICY "Admins and PDs can view invoices" ON invoices
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM users
    WHERE users.id = (auth.uid())::text
      AND users.role IN ('admin', 'pd')
  ));

COMMENT ON TABLE invoices IS
  'Billing record per completed visit. Bill-to details, recipients, line items and totals are '
  'snapshotted at issue time and must never be recomputed from visits/users on read.';

-- ─── Storage ─────────────────────────────────────────────────────────────────
--
-- Private bucket. No storage policies are created: the app reads and writes with the service role
-- and hands out short-lived signed URLs, so there is no path by which an unauthenticated request
-- can enumerate or fetch an invoice PDF.
INSERT INTO storage.buckets (id, name, public)
VALUES ('invoices', 'invoices', false)
ON CONFLICT (id) DO NOTHING;

-- Verify: table and index exist, sequence is positioned, bucket is private.
SELECT
  (SELECT count(*) FROM invoices)                                           AS invoice_rows,
  (SELECT last_value FROM invoice_number_seq)                               AS seq_at,
  (SELECT count(*) FROM pg_indexes
    WHERE tablename = 'invoices' AND indexname = 'invoices_one_live_per_visit') AS live_index,
  (SELECT public FROM storage.buckets WHERE id = 'invoices')                AS bucket_public,
  (SELECT relrowsecurity FROM pg_class WHERE relname = 'invoices')          AS rls_enabled;
