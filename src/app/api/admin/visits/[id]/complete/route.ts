// POST /api/admin/visits/[id]/complete
// Marks an approved visit as completed and runs the post-visit follow-ups.
//
// Body: {
//   internal_note?: string,        — optional visit_notes entry, admin/PD only, never shared
//   invoice?: {                    — omit to complete without invoicing
//     line_items: [...],
//     fee_tier?: string | null,
//     recipient_to?: string | null,
//     recipient_cc?: string[],
//   },
//   notify_volunteers?: boolean    — defaults true
// }
//
// COMPLETION IS NOW A FINANCIAL ACTION. Since the nightly auto-complete cron was retired, this
// route is the only way a visit becomes `completed`, and pressing it can put an invoice in an
// organization's inbox. The ordering below reflects that: the visit is marked complete first and
// everything else is a consequence that cannot undo it. A failed invoice leaves a visible record;
// a failed email leaves a retryable one; neither re-opens the visit.

import { NextRequest, NextResponse } from 'next/server';
import { requireAdminOrPd } from '@/utils/requireAdminOrPd';
import { createSupabaseAdminClient } from '@/utils/supabase/admin';
import { sendTransactionalEmail } from '@/app/utils/mailer';
import { computeInvoiceDraft, totalFromLineItems, type InvoiceLineItem } from '@/utils/invoice';
import { issueInvoice } from '@/utils/issueInvoice';
import { formatVisitDate } from '@/utils/timeZone';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const check = await requireAdminOrPd();
  if ('error' in check) return check.error;
  const { userId } = check;

  try {
    const { id } = await params;
    const visitId = parseInt(id, 10);
    if (isNaN(visitId)) {
      return NextResponse.json({ error: 'Invalid visit ID' }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const internalNote = typeof body?.internal_note === 'string' ? body.internal_note.trim() : '';
    const notifyVolunteers = body?.notify_volunteers !== false;
    const invoiceRequest = body?.invoice ?? null;

    const supabase = createSupabaseAdminClient();

    const { data: visit, error: fetchError } = await supabase
      .from('visits')
      .select(`
        id, status, end_time, title, visit_date, organization_id,
        guest_org_name, guest_contact_name, guest_contact_email,
        fee_tier, fee_amount, parking_coverage
      `)
      .eq('id', visitId)
      .single();

    if (fetchError || !visit) {
      return NextResponse.json({ error: 'Visit not found' }, { status: 404 });
    }
    if (visit.status !== 'approved') {
      return NextResponse.json({ error: 'Only approved visits can be marked complete' }, { status: 400 });
    }
    if (new Date((visit as any).end_time) > new Date()) {
      return NextResponse.json({ error: 'Cannot mark a visit as complete before it has ended' }, { status: 400 });
    }

    const { error } = await supabase
      .from('visits')
      .update({ status: 'completed' })
      .eq('id', visitId);

    if (error) {
      console.error('[complete visit] Supabase error:', error);
      return NextResponse.json({ error: 'Failed to mark visit as completed' }, { status: 500 });
    }

    // The visit is already complete at this point, so a failed note must not roll that back
    // or report the action as failed. Flag it instead and let the caller say the note was lost.
    let noteSaved = true;
    if (internalNote) {
      const { error: noteError } = await supabase
        .from('visit_notes')
        .insert({ visit_id: visitId, author_id: userId, note_text: internalNote });
      if (noteError) {
        console.error('[complete visit] Failed to save completion note:', noteError);
        noteSaved = false;
      }
    }

    // ── Organization follow-up ──
    // Resolved unconditionally, not just when an invoice was requested. A free visit raises no
    // invoice but still owes the organization a thank-you, and tying this lookup to the invoice
    // branch is exactly how that email went missing.
    let org: any = null;
    let contactName = (visit as any).guest_contact_name || 'there';

    if ((visit as any).organization_id) {
      const { data: orgRow } = await supabase
        .from('users')
        .select('org_name, org_address, org_contact_name, email, additional_emails, first_name')
        .eq('id', (visit as any).organization_id)
        .single();
      if (orgRow) {
        org = orgRow;
        contactName = orgRow.org_contact_name || orgRow.first_name || 'there';
      }
    }

    // Recomputed server-side rather than trusting the browser. The client's figures are used —
    // a human is allowed to change them, that's the point of the modal — but the difference
    // against what the system computed is what sets `amount_overridden`. Without this, an
    // edited amount and a computed one would be indistinguishable after the fact.
    //
    // Whether the visit is free is decided here too, never by the client: it follows from
    // `fee_tier` and is not something a browser should be able to assert.
    const computed = computeInvoiceDraft(visit as any, org);

    let invoiceResult: Awaited<ReturnType<typeof issueInvoice>> | null = null;

    if (computed.isFreeVisit) {
      // No invoice, but the donation-request email still goes out.
      if (computed.recipients.to) {
        sendTransactionalEmail({
          to: computed.recipients.to,
          cc: computed.recipients.cc.length ? computed.recipients.cc : undefined,
          replyTo: 'info@sunshinetherapydogs.ca',
          subject: 'Thank you from Sunshine Therapy Dogs',
          templateName: 'visitCompleteOrgFree',
          data: {
            contactName,
            orgName: computed.billToName,
            visitDate: formatVisitDate((visit as any).visit_date),
            year: new Date().getFullYear(),
          },
        }).catch(err =>
          console.error(`[complete visit] Free-visit thank-you failed for visit ${visitId}:`, err?.message)
        );
      } else {
        console.warn(`[complete visit] Visit ${visitId} is a free visit with no deliverable org email`);
      }
    } else if (invoiceRequest) {
      const lineItems: InvoiceLineItem[] = Array.isArray(invoiceRequest.line_items)
        ? invoiceRequest.line_items
        : computed.lineItems;

      if (lineItems.length === 0) {
        invoiceResult = { ok: false, error: 'An invoice needs at least one line item.' };
      } else {
        const amountOverridden =
          totalFromLineItems(lineItems) !== computed.total ||
          lineItems.length !== computed.lineItems.length;

        // A recipient override is honoured, but the resolved list is the fallback — so leaving
        // the field untouched sends where the org's own records say it should go.
        const recipientTo = invoiceRequest.recipient_to ?? computed.recipients.to;
        const recipientCc = Array.isArray(invoiceRequest.recipient_cc)
          ? invoiceRequest.recipient_cc
          : computed.recipients.cc;

        invoiceResult = await issueInvoice(supabase, {
          visit: visit as any,
          organizationId: (visit as any).organization_id ?? null,
          billToName: computed.billToName,
          billToAddress: computed.billToAddress,
          contactName,
          lineItems,
          feeTier: invoiceRequest.fee_tier ?? computed.feeTier,
          amountOverridden,
          recipientTo,
          recipientCc,
          actorId: userId,
        });
      }
    }

    // ── Volunteer follow-ups ──
    // Everyone still confirmed at completion. Withdrawn and removed volunteers are excluded by the
    // status filter; we have no attendance record, so a confirmed volunteer who didn't turn up is
    // thanked anyway. Accepted for now — an attendance step would fix this and feed volunteer
    // stats, and is noted as future work rather than guessed at here.
    let volunteersNotified = 0;
    if (notifyVolunteers) {
      const { data: registrations } = await supabase
        .from('visit_registrations')
        .select('volunteer_id')
        .eq('visit_id', visitId)
        .eq('status', 'confirmed');

      const volunteerIds = (registrations ?? []).map(r => r.volunteer_id);
      if (volunteerIds.length > 0) {
        const { data: volunteers } = await supabase
          .from('users')
          .select('id, email, first_name')
          .in('id', volunteerIds);

        const visitTitle = (visit as any).title || (visit as any).guest_org_name || 'your recent visit';
        for (const vol of volunteers ?? []) {
          if (!vol.email) continue;
          volunteersNotified++;
          // Not awaited: a slow mailbox must not hold up the response, and a single failed
          // thank-you is not worth failing the completion over.
          sendTransactionalEmail({
            to: vol.email,
            subject: 'Thank you for today\'s visit',
            templateName: 'visitCompleteVolunteer',
            data: {
              firstName: vol.first_name || 'there',
              visitTitle,
              visitDate: formatVisitDate((visit as any).visit_date),
              year: new Date().getFullYear(),
            },
          }).catch(err =>
            console.error(`[complete visit] Failed to email volunteer ${vol.id}:`, err?.message)
          );
        }
      }
    }

    return NextResponse.json({
      success: true,
      note_saved: noteSaved,
      volunteers_notified: volunteersNotified,
      invoice: invoiceResult
        ? {
            issued: invoiceResult.ok,
            invoice_number: invoiceResult.invoiceNumber ?? null,
            status: invoiceResult.status ?? null,
            warning: invoiceResult.warning ?? invoiceResult.error ?? null,
          }
        : null,
    });
  } catch (err: any) {
    console.error('[complete visit] Unexpected error:', err.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
