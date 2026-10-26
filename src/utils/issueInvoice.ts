// src/utils/issueInvoice.ts
// Issues one invoice: reserve the record, render the PDF, store it, email it, mirror it.
//
// ORDER IS THE DESIGN. Each step depends on the one before, and each failure mode leaves the
// system in a state a human can see and act on:
//
//   1. INSERT the invoice row      — reserves the number and, via `invoices_one_live_per_visit`,
//                                    makes double-issuing structurally impossible. Fails loudly;
//                                    nothing else has happened yet.
//   2. render the PDF              — pure, no I/O. If it throws, the row stays `draft`.
//   3. upload to Supabase Storage  — the system of record for the file.
//   4. send the email              — on success `sent`, on failure `send_failed` and retryable.
//   5. mirror to Drive + Sheets    — best-effort, never affects status.
//
// The row is written BEFORE the work rather than after it, which is the opposite of the obvious
// ordering and the whole point: an invoice that was generated but whose email failed must leave a
// trace. Writing the row last would mean a crash mid-send loses all knowledge that anything
// happened, and the visit would look un-invoiced while the organization may already have the PDF.
// A stuck `draft` is visible and fixable; silence is neither.
//
// Nothing here throws. Completing a visit is the user's action; issuing the invoice is a
// consequence of it, and a consequence must not be able to fail the thing that caused it.

import type { SupabaseClient } from '@supabase/supabase-js';
import { sendTransactionalEmail } from '@/app/utils/mailer';
import { formatVisitDate } from '@/utils/timeZone';
import { appendInvoiceToSheet, uploadInvoicePdfToDrive } from '@/utils/googleInvoiceFiles';
import { invoicePdfFilename, invoiceStorageKey, renderInvoicePdf } from '@/utils/invoicePdf';
import {
  FEE_TIER_LABELS,
  formatMoney,
  totalFromLineItems,
  type InvoiceLineItem,
} from '@/utils/invoice';

const SUPPORT_EMAIL = 'info@sunshinetherapydogs.ca';
const INVOICE_BUCKET = 'invoices';

export interface IssueInvoiceInput {
  visit: {
    id: number;
    visit_date: string;
    title?: string | null;
    guest_org_name?: string | null;
  };
  organizationId: string | null;
  billToName: string;
  billToAddress: string | null;
  contactName: string;
  lineItems: InvoiceLineItem[];
  feeTier: string | null;
  /** Set when a human edited the computed figures. Recorded, never inferred. */
  amountOverridden: boolean;
  recipientTo: string | null;
  recipientCc: string[];
  actorId: string;
}

export interface IssueInvoiceResult {
  ok: boolean;
  invoiceId?: number;
  invoiceNumber?: number;
  status?: 'draft' | 'sent' | 'send_failed';
  /** Human-readable reason the invoice isn't `sent`, for the caller to surface. */
  warning?: string;
  error?: string;
}

export async function issueInvoice(
  supabase: SupabaseClient,
  input: IssueInvoiceInput,
): Promise<IssueInvoiceResult> {
  const issuedAt = new Date();
  const total = totalFromLineItems(input.lineItems);

  // ── 1. Reserve the record ──
  // `status: 'draft'` until the email actually goes out. The unique partial index rejects a
  // second live invoice for the same visit, so a double-click or a retry races into a clean
  // constraint violation rather than two bills.
  const { data: invoice, error: insertError } = await supabase
    .from('invoices')
    .insert({
      visit_id: input.visit.id,
      organization_id: input.organizationId,
      bill_to_name: input.billToName,
      bill_to_address: input.billToAddress,
      sent_to_email: input.recipientTo,
      sent_cc_emails: input.recipientCc,
      line_items: input.lineItems,
      total,
      fee_tier: input.feeTier,
      amount_overridden: input.amountOverridden,
      status: 'draft',
      issued_at: issuedAt.toISOString(),
      created_by: input.actorId,
    })
    .select('id, invoice_number')
    .single();

  if (insertError || !invoice) {
    // 23505 is unique_violation — here it can only be the one-live-invoice-per-visit index,
    // which means this visit already has a live invoice. That's a correct refusal, not a fault.
    if ((insertError as any)?.code === '23505') {
      console.warn(`[issueInvoice] Visit ${input.visit.id} already has a live invoice — refusing to duplicate`);
      return { ok: false, error: 'This visit has already been invoiced.' };
    }
    console.error('[issueInvoice] Failed to create invoice record:', insertError?.message);
    return { ok: false, error: 'Could not create the invoice record.' };
  }

  const invoiceNumber = invoice.invoice_number as number;
  const invoiceId = invoice.id as number;

  // ── 2. Render ──
  let pdf: Uint8Array;
  let filename: string;
  try {
    pdf = await renderInvoicePdf({
      invoiceNumber,
      issuedAt,
      billToName: input.billToName,
      billToAddress: input.billToAddress,
      lineItems: input.lineItems,
      total,
    });
    filename = invoicePdfFilename(invoiceNumber, input.billToName, issuedAt);
  } catch (err: any) {
    console.error(`[issueInvoice] PDF render failed for #${invoiceNumber}:`, err?.message);
    return {
      ok: false, invoiceId, invoiceNumber, status: 'draft',
      error: `Invoice #${invoiceNumber} was created but the PDF could not be generated. It is saved as a draft.`,
    };
  }

  // ── 3. Store ──
  // Path includes the invoice number so a storage listing is self-describing without the DB.
  // Deliberately NOT `filename`: Supabase Storage rejects the em dash and ampersand that make the
  // display name readable, and the rejection is non-fatal here, so reusing it meant the invoice
  // sent correctly while the stored copy silently never existed.
  const pdfPath = invoiceStorageKey(invoiceNumber, input.billToName, issuedAt);
  const { error: uploadError } = await supabase.storage
    .from(INVOICE_BUCKET)
    .upload(pdfPath, Buffer.from(pdf), { contentType: 'application/pdf', upsert: true });

  if (uploadError) {
    // Not fatal: the PDF is in memory and can still be emailed. But it must be recorded as
    // missing, because "where is the invoice we sent?" has to have an answer.
    console.error(`[issueInvoice] Storage upload failed for #${invoiceNumber}:`, uploadError.message);
  }

  // ── 4. Send ──
  let status: 'draft' | 'sent' | 'send_failed' = 'draft';
  let warning: string | undefined;

  if (!input.recipientTo) {
    warning = `Invoice #${invoiceNumber} was created but not sent — this organization has no email address on file.`;
  } else {
    try {
      // Always the invoice template. Free visits never reach this function at all — they raise no
      // invoice, so their thank-you email is sent by the completion route instead. An earlier
      // version branched on `total === 0` here, which meant the free-visit email could only be
      // sent by a code path that free visits never took, and organizations got nothing.
      await sendTransactionalEmail({
        to: input.recipientTo,
        cc: input.recipientCc.length ? input.recipientCc : undefined,
        replyTo: SUPPORT_EMAIL,
        subject: `Invoice #${invoiceNumber} — Sunshine Therapy Dogs`,
        templateName: 'visitCompleteOrgInvoice',
        data: {
          contactName: input.contactName,
          invoiceNumber,
          total: formatMoney(total),
          visitDate: formatVisitDate(input.visit.visit_date),
          orgName: input.billToName,
          year: issuedAt.getFullYear(),
        },
        attachments: [{ filename, content: pdf }],
      });
      status = 'sent';
    } catch (err: any) {
      console.error(`[issueInvoice] Email failed for #${invoiceNumber}:`, err?.message);
      status = 'send_failed';
      warning = `Invoice #${invoiceNumber} was created but the email could not be sent. You can retry it from the invoice list.`;
    }
  }

  // ── 5. Mirror (best-effort) ──
  // Deliberately after the send. These are convenience copies for humans; making the organization
  // wait on a Drive round trip to receive their invoice would be the wrong priority.
  const drive = await uploadInvoicePdfToDrive(filename, pdf);

  const parkingAmount = input.lineItems
    .filter(li => /parking/i.test(li.description))
    .reduce((sum, li) => sum + li.amount, 0);

  const sheetOk = await appendInvoiceToSheet({
    invoiceNumber,
    dateIssued: issuedAt.toISOString().slice(0, 10),
    organization: input.billToName,
    visitDate: input.visit.visit_date,
    visitTitle: input.visit.title || input.visit.guest_org_name || 'Therapy dog visit',
    amount: total - parkingAmount,
    parking: parkingAmount,
    total,
    feeTier: input.feeTier ? (FEE_TIER_LABELS[input.feeTier]?.split(' — ')[0] ?? input.feeTier) : '—',
    sentTo: [input.recipientTo, ...input.recipientCc].filter(Boolean).join(', '),
    pdfLink: drive?.webViewLink ?? '',
  });

  // ── Finalize ──
  const { error: updateError } = await supabase
    .from('invoices')
    .update({
      status,
      sent_at: status === 'sent' ? new Date().toISOString() : null,
      pdf_path: uploadError ? null : pdfPath,
      drive_file_id: drive?.fileId ?? null,
      sheet_synced_at: sheetOk ? new Date().toISOString() : null,
    })
    .eq('id', invoiceId);

  if (updateError) {
    // The invoice went out but the record says otherwise. Loud, because reconciliation will be
    // wrong until someone looks — and a `draft` row whose email already sent is the one state
    // here that could cause a duplicate send on retry.
    console.error(
      `[issueInvoice] Invoice #${invoiceNumber} finalize failed — record may understate what was sent:`,
      updateError.message,
    );
  }

  return { ok: status === 'sent', invoiceId, invoiceNumber, status, warning };
}
