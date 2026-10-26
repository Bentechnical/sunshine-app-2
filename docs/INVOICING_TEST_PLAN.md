# Invoicing & Post-Visit Test Plan

**Status:** Ready to execute
**Scope:** Everything triggered by "Mark visit complete" — invoice generation, the org and volunteer
emails, the Drive and Sheets mirrors, and the data left behind.
**Environment:** Dev DB + the **TEST** Drive folder and sheet. Nothing here should touch the live
invoice folder, the live tracker, or a real organization's inbox.

> **Before you start:** confirm `.env.local` points at the test destinations —
> folder `14-zgAx4...`, sheet `1TWUbsLe...`. If you have pulled production env vars down for any
> reason, these tests will write real-looking invoices into the live tracker. The credentials are
> shared between environments; only the destination IDs differ.

---

## 0. Pre-flight

Set these up once. Several tests need a specific kind of visit, and creating them as you go is
slower than batching it.

| # | What to create | Why |
|---|---|---|
| P1 | An org with `fee_tier = tier_200` and **invoice** parking | The fullest billing path |
| P2 | An org with `fee_tier = tier_0` | Free-visit path |
| P3 | An org with **no** fee tier set | Blocker path |
| P4 | An org with 2 additional emails | cc resolution |
| P5 | An **admin-managed** org with no real email | No-recipient path |
| P6 | A guest visit (no org account) with a contact email | No org row at all |

Each needs an approved visit **whose `end_time` is in the past** — the complete button doesn't
appear otherwise. Put at least two confirmed volunteers on P1's visit, and withdraw a third, so the
volunteer-email filter gets exercised.

Note the current invoice number before you begin, so you can tell which rows are yours:

```sql
SELECT last_value FROM invoice_number_seq;
```

---

## 1. Core paths

### T1 — Standard fee visit with parking *(P1)*

The single most important test; most of the system runs in it.

1. Open the visit → **Mark as Complete**
2. Confirm the modal shows two lines ($200 + $25), total **$225**, and the correct recipient
3. Add an internal note, leave "send thank-you emails" ticked
4. Send

**Expect:** modal closes, visit shows Completed.

Then verify all six of these, because each is a different system and any one can fail silently:

- [ ] Org received the email, PDF attached, amount correct on the PDF
- [ ] Each confirmed volunteer received a thank-you; **the withdrawn one did not**
- [ ] PDF appears in the **test** Drive folder, filename `INV-#### — <Org> — <date>.pdf`
- [ ] Row appended to the **test** sheet, values under the right headers
- [ ] File exists in Supabase Storage (`invoices` bucket) — see §4
- [ ] Internal note saved on the visit

> **Regression check (bug found 26 Oct):** the storage upload failed with `Invalid key` because the
> display filename contains an em dash, which Supabase Storage rejects. The failure is non-fatal by
> design, so the email and Drive copy succeeded and nothing looked wrong. Storage now uses a
> separate ASCII-only key. **Always verify `pdf_path` and the bucket, not just the email.**

### T2 — Free visit *(P2)*

**Expect:** modal says *"Free visit — no invoice will be raised"*, with no editable line items.

- [ ] Org receives the **donation** email, **no attachment**
- [ ] **No** invoice row created, **no** Drive file, **no** sheet row
- [ ] Volunteers still receive thank-yous

> This is the one case where "nothing happened" is correct. Verify the absence, don't assume it.

> **Regression check (bug found 26 Oct):** the org received nothing. The donation email was being
> sent from inside `issueInvoice`, which free visits never call — so the one path that could send
> it was the one path free visits didn't take. The org follow-up is now decided in the completion
> route, independently of whether an invoice exists.

### T3 — Guest visit *(P6)*

**Expect:** bills to the guest org name, invoice goes to `guest_contact_email`, and the PDF has
**no address block** (correct — your sample #540 has none either).

### T4 — Additional emails *(P4)*

**Expect:** modal shows `to` plus `· cc …`. Check the received email's headers actually carry the
cc, not just that the modal claimed it would.

---

## 2. Edge cases

### T5 — No fee tier *(P3)* — **DB-only, not reachable through the UI**

Corrected after testing on 26 Oct: fee tier is enforced at both entry points — the admin visit
form marks it required, and org self-signup validates it
(`ProfileCompleteForm.tsx:310`). So a null `fee_tier` can no longer be produced by clicking.

The column still permits null and legacy rows may carry it, so the guard is worth proving once:

```sql
UPDATE visits SET fee_tier = NULL WHERE id = <a test visit id>;
```

**Expect:** amber warning, amount blank, submit button reads *"Enter an amount for every line"*
and is **disabled**.

- [ ] Type an amount → button enables → invoice sends for that amount
- [ ] `amount_overridden` is `true` (§4)

### T6 — Custom amount

Testing on 26 Oct found `custom` was missing from the visit *create* form while present in the
**edit** form — an oversight, now fixed. Both forms offer **Custom amount** with a fee-amount input
that appears when selected. Test both paths:

**T6a — created as custom, amount set.** Create a visit with Custom amount = $350.
**Expect:** modal pre-fills $350, no warning, sends normally.

**T6b — created as custom, amount left blank.** The field says *"Leave blank to set at completion"*.
**Expect:** the *custom-amount* warning in the modal, submit disabled until an amount is typed,
and `amount_overridden = true` once it is.

**T6c — switched to custom on an existing visit** via the edit form.
**Expect:** same as above.

> Leaving the amount blank at creation is a legitimate workflow, not an error state: the price may
> genuinely not be agreed when the visit is booked. The modal is where it gets decided, and it
> cannot be skipped — that is why this is safe to expose at creation.

### T7 — Don't invoice

Tick **Don't invoice this visit** on a billable visit.

**Expect:** visit completes, volunteers emailed, **no invoice row at all**.

> ⚠️ There is currently **no way to invoice this visit afterwards** — see §5. Only use this on a
> visit you're happy to leave uninvoiced, and note its id.

### T8 — Edited amount

Change $200 → $250 and send.

- [ ] PDF, email, sheet row and DB total all say **$250** (not one of them saying $200)
- [ ] `amount_overridden = true`

### T9 — Added line

On the **free** visit (P2) or a normal one, use **Add line** to add a parking charge.

**Expect:** it appears on the PDF and in the sheet's Parking column — the sheet splits parking out
by matching the description, so confirm a hand-added line lands in the right column.

### T10 — No recipient *(P5)*

**Expect:** modal says no email on file; invoice is **created but not sent**.

- [ ] Row exists with `status = 'draft'` and `sent_to_email` null
- [ ] PDF still generated, stored, and mirrored to Drive
- [ ] A warning is shown on the visit page after the modal closes

---

## 3. Protection against the expensive mistakes

These are the ones that cost money or credibility if they're wrong. Test them deliberately.

### T11 — Double invoicing

1. Complete a visit normally
2. Set its status back to `approved` **directly in the DB**, leaving the invoice in place
3. Complete it again

**Expect:** modal warns it was already invoiced *before* you press anything; completing again sends
**no second invoice**. Verify only one live invoice row exists for that visit.

### T12 — Double-click

On a fresh billable visit, click the send button twice rapidly.

**Expect:** one invoice. The button disables on submit, and the unique index is the backstop —
but this is worth confirming rather than trusting.

### T13 — Deleting an invoiced visit

Try to delete a visit that has a live invoice.

**Expect:** refused with *"This visit has been invoiced (#NNNN) and cannot be deleted"* — a readable
message, not a database error.

### T14 — Completing too early

Try to complete a visit whose `end_time` is in the future.

**Expect:** the button doesn't appear. If you force the API call, it's refused.

### T15 — Invoice numbers

After all the above:

```sql
SELECT invoice_number, COUNT(*) FROM invoices GROUP BY invoice_number HAVING COUNT(*) > 1;
```

**Expect: zero rows.** Gaps in the sequence are fine and expected; duplicates are never acceptable.

---

## 4. Data verification

Run after the functional tests. Read-only.

```sql
-- Everything issued, newest first
SELECT invoice_number, visit_id, bill_to_name, total, status,
       amount_overridden, sent_to_email, sent_cc_emails,
       pdf_path IS NOT NULL   AS has_pdf,
       drive_file_id IS NOT NULL AS in_drive,
       sheet_synced_at IS NOT NULL AS in_sheet,
       issued_at, sent_at
FROM invoices
ORDER BY invoice_number DESC;
```

Check specifically:

- **`has_pdf` is true on every row.** Storage upload failure is logged but deliberately
  non-fatal — the email still goes out — so this is the easiest thing in the system to miss.
- **`status = 'sent'`** wherever an email was expected, with a non-null `sent_at`.
- **`in_drive` / `in_sheet`** true except where you deliberately broke them (T16).
- **`total`** matches the PDF for every row, especially the edited ones.

```sql
-- Storage objects actually present, cross-checked against the table
SELECT i.invoice_number, i.pdf_path, o.name IS NOT NULL AS object_exists
FROM invoices i
LEFT JOIN storage.objects o
  ON o.bucket_id = 'invoices' AND o.name = i.pdf_path
ORDER BY i.invoice_number;
```

```sql
-- Volunteer emails should have gone to confirmed registrations only
SELECT status, COUNT(*) FROM visit_registrations
WHERE visit_id = <P1 visit id> GROUP BY status;
```

---

## 5. Known gaps — read before deciding on beta

These are **not** test failures. They're things that don't exist yet, listed so the decision is
made knowingly.

**No admin invoice list.** This is the one I'd treat as a genuine beta blocker. There is currently
no UI to:

- retry an invoice whose email failed (`status = 'send_failed'`)
- void an invoice issued in error
- issue an invoice for a visit completed with "don't invoice"
- see what has been invoiced without opening the database

The data and the endpoints support all three actions — `issueInvoice` is reusable as-is — but until
that screen exists, every one of those situations needs manual DB work. In a beta with real
organizations, a failed send with no retry button means someone doesn't get billed and nobody finds
out.

**T16 — deliberately break a mirror** *(optional, worth doing once)*
Temporarily set `GOOGLE_DRIVE_INVOICE_FOLDER_ID` to a nonsense value and issue an invoice.
**Expect:** the invoice still generates, stores and **sends**; only `drive_file_id` is null and an
error is logged. This proves the "best-effort mirror" promise. Restore the variable afterwards.

---

## 6. Pre-beta checklist (config and decisions, not tests)

- [ ] **Invoice number start.** Sequence begins at 1000. Confirm with stakeholders that the legacy
      sequence is still below it. Resetting is trivial *before* go-live and messy after.
- [ ] **Apps Script cutover.** The legacy colour-based invoicing must be switched off for any
      region using the app, or organizations get billed twice. Ben is handling this per-region.
- [ ] **Production env vars on Vercel** — all four, with the **live** folder and sheet IDs on
      Production only and the test ones on Preview/Development.
- [ ] **Email deliverability.** Invoices are financial mail sent from `no-reply@sunshinedogs.app`.
      Confirm SPF/DKIM are correct for that domain and send one real test to an external mailbox
      (Gmail/Outlook) to check it doesn't land in spam. An invoice in a junk folder is
      indistinguishable from an invoice never sent.
- [ ] **Stakeholder answers** still outstanding: is parking always $25; can a $0 visit carry a
      parking charge; final sign-off on the email copy. All three are defaults or text — none block
      testing, and each is a one-line change.
- [ ] **Who may complete a visit.** Currently any admin **or PD**. Confirm that's intended now that
      the action issues invoices.

---

## 7. Suggested order

Half a day, roughly:

1. §0 pre-flight data — 45 min
2. T1 end to end, verifying all six outputs — 45 min
3. T2–T4 remaining happy paths — 30 min
4. T5–T10 edge cases — 1 hr
5. T11–T15 the expensive-mistake tests — 45 min
6. §4 data verification in one pass — 20 min
7. T16 and the §6 checklist — 30 min

Do §3 even if you're short on time. The happy paths are the ones you'll notice breaking; the
double-invoice and deletion guards are the ones you won't.
