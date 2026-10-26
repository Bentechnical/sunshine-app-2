// src/utils/invoice.ts
// Works out what a completed visit should be billed, and whether it can be billed at all.
//
// This is the ONLY place the fee rules live. The completion modal shows what this returns, the
// issue endpoint recomputes it server-side, and the two are compared: if the figure the browser
// sent differs from the one computed here, the invoice is flagged `amount_overridden` rather than
// silently accepted. That comparison is the whole reason the logic is a pure function with no I/O
// — it has to be runnable twice over the same inputs and give the same answer.
//
// The computed figures reproduce the legacy Google Apps Script's behaviour exactly, on purpose.
// The migration rule is: move invoicing into the app reproducing today's output, verify, and only
// then change the pricing model. Anything a human wants to do differently happens as a visible
// override in the modal, not as a different default here.

import { formatVisitDate } from '@/utils/timeZone';
import { isDeliverableEmail, resolveOrgRecipients, type OrgRecipients } from '@/utils/orgEmail';

/** Fixed amounts per fee tier. `custom` has no fixed amount — it comes from `visits.fee_amount`. */
export const TIER_AMOUNTS: Record<string, number> = {
  tier_500: 500,
  tier_200: 200,
  tier_0: 0,
};

/**
 * Flat volunteer parking surcharge, applied when `parking_coverage = 'invoice'`.
 *
 * A default, not a constant truth — the completion modal lets a human change it, and doing so
 * records `amount_overridden`. All four sample invoices use $25 flat regardless of how many
 * volunteers attended.
 */
export const PARKING_SURCHARGE = 25;

export const FEE_TIER_LABELS: Record<string, string> = {
  tier_500: '$500 — Corporate / for-profit / conferences / large events',
  tier_200: '$200 — Post-secondary / private schools / private care / wellness',
  tier_0: '$0 — Public schools / non-profits / first responders / inpatients',
  custom: 'Custom amount',
};

export interface InvoiceLineItem {
  /** Primary text, e.g. "Sunshine Therapy Dog Visit for UofT Engineering". */
  description: string;
  /** Secondary line rendered beneath it in grey, e.g. the visit date. */
  detail?: string | null;
  rate: number;
  quantity: number;
  amount: number;
}

/** Why a draft can't be sent as it stands. Each maps to a specific fix in the completion modal. */
export type InvoiceBlocker =
  /** `visits.fee_tier` is null — reachable via guest visits and orgs that never picked one. */
  | 'no_fee_tier'
  /** Tier is `custom` but `fee_amount` was never set. The amount has to be typed in. */
  | 'custom_amount_missing'
  /** Nothing deliverable to send to. The invoice can still be created and held as a draft. */
  | 'no_recipient';

export interface InvoiceVisitInput {
  id: number;
  visit_date: string;
  title?: string | null;
  guest_org_name?: string | null;
  guest_contact_email?: string | null;
  fee_tier?: string | null;
  fee_amount?: number | string | null;
  parking_coverage?: string | null;
}

export interface InvoiceOrgInput {
  org_name?: string | null;
  org_address?: string | null;
  email?: string | null;
  additional_emails?: string[] | null;
}

export interface InvoiceDraft {
  lineItems: InvoiceLineItem[];
  total: number;
  feeTier: string | null;
  billToName: string;
  billToAddress: string | null;
  recipients: OrgRecipients;
  blockers: InvoiceBlocker[];
  /**
   * True for a `tier_0` visit: genuinely free, so no invoice is raised and the organization gets
   * the donation-request email instead. Distinct from a blocked draft — nothing is wrong here, and
   * the modal must say so rather than showing a blank amount that looks like missing data.
   */
  isFreeVisit: boolean;
}

/** Round to cents. Guards against float drift once a surcharge or an override is added in. */
function money(n: number): number {
  return Math.round(n * 100) / 100;
}

function toNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : parseFloat(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Compute the invoice a completed visit should produce.
 *
 * Pure: no database, no clock, no environment. Given the same visit and org it always returns the
 * same draft, which is what lets the server verify the client's figures instead of trusting them.
 *
 * `org` is null for guest visits, which bill to `guest_org_name` / `guest_contact_email` and have
 * no address block — matching sample invoice #540, which carries an org name and nothing else.
 */
export function computeInvoiceDraft(
  visit: InvoiceVisitInput,
  org: InvoiceOrgInput | null,
): InvoiceDraft {
  const blockers: InvoiceBlocker[] = [];

  const billToName =
    org?.org_name?.trim() ||
    visit.guest_org_name?.trim() ||
    visit.title?.trim() ||
    'Organization';
  const billToAddress = org?.org_address?.trim() || null;

  // Recipients: the visit's own contact first, then the organization's addresses.
  //
  // The visit contact leads because it is the person who booked *this* visit, and because it is
  // the only address an admin can correct from the visit page — which is where they are standing
  // when they discover it's wrong. A managed org with no usable account email but a hand-entered
  // contact on the visit should invoice that contact, not refuse to send.
  //
  // The org's addresses are kept as cc rather than replaced, which matters because
  // `guest_contact_email` is usually *copied* from the org at visit creation
  // (see AdminVisits' org prefill) and only sometimes edited deliberately. The column records no
  // difference between the two, so a stale snapshot could otherwise quietly outrank a corrected
  // org email. Keeping both means the worst case is a redundant cc, not a misdirected invoice.
  //
  // Deduplicated case-insensitively, so the common case — visit contact identical to the org
  // email — produces one recipient rather than cc'ing someone on their own invoice.
  const orgRecipients = org ? resolveOrgRecipients(org) : { to: null, cc: [], all: [] };
  const visitContact = isDeliverableEmail(visit.guest_contact_email)
    ? visit.guest_contact_email.trim()
    : null;

  const ordered: string[] = [];
  for (const email of [visitContact, ...orgRecipients.all]) {
    if (!email) continue;
    if (ordered.some(e => e.toLowerCase() === email.toLowerCase())) continue;
    ordered.push(email);
  }

  const recipients: OrgRecipients = {
    to: ordered[0] ?? null,
    cc: ordered.slice(1),
    all: ordered,
  };

  if (!recipients.to) blockers.push('no_recipient');

  const feeTier = visit.fee_tier ?? null;
  const isFreeVisit = feeTier === 'tier_0';

  // No tier means nobody ever decided what this visit costs. Billing $0 by default would make a
  // missing decision indistinguishable from a deliberate free visit, which is precisely the
  // silent-failure mode this system exists to remove.
  if (!feeTier) blockers.push('no_fee_tier');

  const customAmount = toNumber(visit.fee_amount);
  if (feeTier === 'custom' && customAmount === null) blockers.push('custom_amount_missing');

  const baseAmount =
    feeTier === 'custom' ? (customAmount ?? 0) : (TIER_AMOUNTS[feeTier ?? ''] ?? 0);

  const lineItems: InvoiceLineItem[] = [];

  // A free visit raises no line at all — there is nothing to bill, and an explicit $0 line on a
  // PDF reads as an error rather than as generosity.
  if (!isFreeVisit) {
    lineItems.push({
      description: `Sunshine Therapy Dog Visit for ${billToName}`,
      detail: formatVisitDate(visit.visit_date),
      rate: money(baseAmount),
      quantity: 1,
      amount: money(baseAmount),
    });
  }

  // Parking is charged only where the org agreed to cover it AND the visit is billable. A $0 visit
  // is free in full — Sunshine absorbs the parking — which is also what the legacy colour map did:
  // it defines `tier_500_parking` and `tier_200_parking` but no `tier_0_parking`, so a free visit
  // with invoice-parking has never carried the charge. Reproduced here rather than "fixed", since
  // changing it would alter billing during the billing migration. A human can still add the line
  // in the completion modal.
  if (visit.parking_coverage === 'invoice' && !isFreeVisit) {
    lineItems.push({
      description: 'Volunteer Parking Fee',
      rate: PARKING_SURCHARGE,
      quantity: 1,
      amount: PARKING_SURCHARGE,
    });
  }

  const total = money(lineItems.reduce((sum, li) => sum + li.amount, 0));

  return { lineItems, total, feeTier, billToName, billToAddress, recipients, blockers, isFreeVisit };
}

/**
 * Recompute the total from line items — used when a human has edited them, so the stored total
 * always matches the lines printed on the PDF rather than whatever arrived in the request body.
 */
export function totalFromLineItems(lineItems: InvoiceLineItem[]): number {
  return money(lineItems.reduce((sum, li) => sum + (Number(li.amount) || 0), 0));
}

export function formatMoney(amount: number): string {
  return amount.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
