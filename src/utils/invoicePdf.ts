// src/utils/invoicePdf.ts
// Renders an invoice PDF matching the layout Sunshine already sends.
//
// Uses pdf-lib rather than pdfkit. pdfkit has the nicer API — real text wrapping, flow layout —
// but it resolves its built-in fonts by reading `.afm` files from its own package at runtime,
// which is a well-known failure on serverless bundlers: the metrics files aren't traced into the
// deployment and generation dies with ENOENT on a font nobody mentioned. pdf-lib carries its
// standard font metrics inside the library and touches no filesystem, so it either works
// everywhere or nowhere. For a fixed, simple layout that trade is worth making; the cost is that
// text wrapping and column alignment are done by hand below.

import {
  PDFDocument, PDFName, PDFString, StandardFonts, rgb,
  type PDFFont, type PDFPage,
} from 'pdf-lib';
import { INVOICE_LOGO_PNG_BASE64 } from '@/utils/invoiceLogo';
import { formatMoney, type InvoiceLineItem } from '@/utils/invoice';

// ─── Organization constants ───────────────────────────────────────────────────
// Everything that would change if Sunshine moved office or changed payment providers lives here,
// so a copy change never means hunting through drawing code.

const ORG = {
  // The legacy invoices disagreed with themselves here — "Kingswood Road" in the footer,
  // "Kingswood Drive" in the payment block. Confirmed with Ben (26 Oct 2026): Road is correct,
  // and every invoice issued before then carried a wrong mailing address in the cheque line.
  addressLine: '19 Kingswood Road, Toronto Ontario, M4E 3N4',
  phone: '416-315-2673',
  email: 'info@sunshinetherapydogs.ca',
  charityNumber: '79008 8868 RR0001',
  chequeAddress: '19 Kingswood Road, Toronto, Ontario, M4E 3N4',
  paypalUrl: 'https://www.paypal.com/ncp/payment/NT7H2RGBLQ3P4',
  canadaHelpsUrl: 'https://www.canadahelps.org/en/charities/sunshine-therapy-dogs/',
  canadaHelpsLabel: 'canadahelps.org/en/charities/sunshine-therapy-dogs',
};

// ─── Layout constants ─────────────────────────────────────────────────────────
// US Letter. Canadian business standard, and what the existing invoices use.

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 54;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

const INK = rgb(0.1, 0.1, 0.1);
const MUTED = rgb(0.45, 0.45, 0.45);
const RULE = rgb(0.78, 0.78, 0.78);
const LINK = rgb(0.05, 0.38, 0.68);

// Column x-positions for the line-item table, measured from the left margin.
const COL_DESCRIPTION = MARGIN;
const COL_RATE_RIGHT = MARGIN + 350;
const COL_QTY_RIGHT = MARGIN + 420;
const COL_TOTAL_RIGHT = MARGIN + CONTENT_WIDTH;

export interface InvoicePdfInput {
  invoiceNumber: number;
  issuedAt: Date;
  billToName: string;
  billToAddress?: string | null;
  lineItems: InvoiceLineItem[];
  total: number;
}

/** Right-align text at `x` by measuring it first — pdf-lib only draws from a left origin. */
function drawRight(
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  font: PDFFont,
  size: number,
  color = INK,
) {
  const width = font.widthOfTextAtSize(text, size);
  page.drawText(text, { x: x - width, y, size, font, color });
}

/**
 * Greedy word wrap to a pixel width. pdf-lib has no layout engine, so this is the whole of it.
 * Long single words (a pasted URL, a hyphenless org name) are allowed to overflow rather than
 * being broken mid-word — an overflowing line looks wrong and gets fixed; a silently chopped
 * organization name looks deliberate and doesn't.
 */
function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [''];

  const lines: string[] = [];
  let line = words[0];

  for (const word of words.slice(1)) {
    const candidate = `${line} ${word}`;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      line = candidate;
    } else {
      lines.push(line);
      line = word;
    }
  }
  lines.push(line);
  return lines;
}

/**
 * Draw text as a real clickable link.
 *
 * pdf-lib has no link API, so this registers a /Link annotation by hand and returns it for the
 * caller to collect — every annotation for a page has to be set in one go at the end, because
 * assigning `Annots` replaces whatever was there rather than appending.
 *
 * Worth the extra machinery: these invoices arrive as email attachments and are read on screen far
 * more often than they're printed. A URL you have to retype is a payment that doesn't happen. The
 * visible text stays human-readable so a printed copy still works.
 */
function drawLink(
  doc: PDFDocument,
  page: PDFPage,
  text: string,
  url: string,
  x: number,
  y: number,
  font: PDFFont,
  size: number,
) {
  page.drawText(text, { x, y, size, font, color: LINK });
  const width = font.widthOfTextAtSize(text, size);
  return doc.context.register(
    doc.context.obj({
      Type: 'Annot',
      Subtype: 'Link',
      // Padded slightly so the clickable area covers descenders and isn't fiddly to hit.
      Rect: [x, y - 2, x + width, y + size],
      Border: [0, 0, 0],
      A: { Type: 'Action', S: 'URI', URI: PDFString.of(url) },
    }),
  );
}

function formatIssueDate(date: Date): string {
  // MM/DD/YYYY, matching the existing invoices rather than the app's usual long-form dates.
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${mm}/${dd}/${date.getFullYear()}`;
}

export async function renderInvoicePdf(input: InvoicePdfInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Invoice ${input.invoiceNumber} — Sunshine Therapy Dogs`);
  doc.setProducer('Sunshine App');
  doc.setCreationDate(input.issuedAt);

  const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  let y = PAGE_HEIGHT - MARGIN;

  // ── Header: logo left, "INVOICE" right ──
  const logo = await doc.embedPng(Buffer.from(INVOICE_LOGO_PNG_BASE64, 'base64'));
  const logoWidth = 190;
  const logoHeight = (logo.height / logo.width) * logoWidth;
  page.drawImage(logo, { x: MARGIN, y: y - logoHeight, width: logoWidth, height: logoHeight });
  drawRight(page, 'INVOICE', MARGIN + CONTENT_WIDTH, y - 34, regular, 30);

  y -= Math.max(logoHeight, 42) + 34;

  // ── Date / number block, right-aligned ──
  drawRight(page, `Date: `, MARGIN + CONTENT_WIDTH - bold.widthOfTextAtSize(formatIssueDate(input.issuedAt), 11), y, regular, 11);
  drawRight(page, formatIssueDate(input.issuedAt), MARGIN + CONTENT_WIDTH, y, bold, 11);
  y -= 16;
  const numberText = `#${input.invoiceNumber}`;
  drawRight(page, 'INVOICE ', MARGIN + CONTENT_WIDTH - bold.widthOfTextAtSize(numberText, 11), y, regular, 11);
  drawRight(page, numberText, MARGIN + CONTENT_WIDTH, y, bold, 11);

  y -= 34;

  // ── Bill-to block ──
  page.drawText('To:', { x: MARGIN, y, size: 10, font: regular, color: MUTED });
  let billY = y;
  const billX = MARGIN + 28;
  const billWidth = CONTENT_WIDTH - 28;

  for (const line of wrapText(input.billToName, bold, 11, billWidth)) {
    page.drawText(line, { x: billX, y: billY, size: 11, font: bold, color: INK });
    billY -= 14;
  }
  // Address is optional — guest visits have none, and sample #540 shows the block is fine without.
  if (input.billToAddress) {
    for (const line of wrapText(input.billToAddress, regular, 10, billWidth)) {
      page.drawText(line, { x: billX, y: billY, size: 10, font: regular, color: INK });
      billY -= 13;
    }
  }

  y = billY - 28;

  // ── Line item table ──
  page.drawText('Description', { x: COL_DESCRIPTION, y, size: 9, font: regular, color: MUTED });
  drawRight(page, 'Rate ($)', COL_RATE_RIGHT, y, regular, 9, MUTED);
  drawRight(page, 'Quantity', COL_QTY_RIGHT, y, regular, 9, MUTED);
  drawRight(page, 'Line Total ($)', COL_TOTAL_RIGHT, y, regular, 9, MUTED);

  y -= 8;
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: MARGIN + CONTENT_WIDTH, y },
    thickness: 0.75,
    color: RULE,
  });

  for (const item of input.lineItems) {
    y -= 20;
    const descLines = wrapText(item.description, regular, 10, 330);
    page.drawText(descLines[0], { x: COL_DESCRIPTION, y, size: 10, font: regular, color: INK });

    // Figures sit on the first line of a wrapped description, not floating beside its middle.
    drawRight(page, formatMoney(item.rate), COL_RATE_RIGHT, y, regular, 10);
    drawRight(page, String(item.quantity), COL_QTY_RIGHT, y, regular, 10);
    drawRight(page, formatMoney(item.amount), COL_TOTAL_RIGHT, y, regular, 10);

    for (const line of descLines.slice(1)) {
      y -= 12;
      page.drawText(line, { x: COL_DESCRIPTION, y, size: 10, font: regular, color: INK });
    }

    // The date line, smaller and grey beneath the description — keeps a single row readable
    // instead of one very long description cell.
    if (item.detail) {
      y -= 12;
      page.drawText(item.detail, { x: COL_DESCRIPTION, y, size: 9, font: regular, color: MUTED });
    }

    y -= 10;
    page.drawLine({
      start: { x: MARGIN, y },
      end: { x: MARGIN + CONTENT_WIDTH, y },
      thickness: 0.5,
      color: RULE,
    });
  }

  // ── Total ──
  y -= 22;
  drawRight(page, 'Total', COL_QTY_RIGHT, y, bold, 11);
  drawRight(page, `$${formatMoney(input.total)}`, COL_TOTAL_RIGHT, y, bold, 11);

  // ── Payment instructions ──
  y -= 46;
  const heading = 'Payment can be made by one of the following methods:';
  drawRight(page, heading, MARGIN + (CONTENT_WIDTH + bold.widthOfTextAtSize(heading, 10)) / 2, y, bold, 10);

  // Rewritten from the original wording, which said "Mailed cheque — made out to Sunshine Therapy
  // Dogs and sent to: Sunshine Therapy Dogs, 19 Kingswood Road…" — naming the charity twice in
  // consecutive lines. Same information, read once.
  const annots: ReturnType<typeof drawLink>[] = [];
  const payX = MARGIN + 30;
  const size = 9.5;

  y -= 15;
  page.drawText('1.  Cheque — payable to Sunshine Therapy Dogs', { x: payX, y, size, font: regular, color: INK });
  y -= 13;
  page.drawText(`      ${ORG.chequeAddress}`, { x: payX, y, size, font: regular, color: MUTED });

  y -= 15;
  const etransferPrefix = '2.  E-transfer — ';
  page.drawText(etransferPrefix, { x: payX, y, size, font: regular, color: INK });
  annots.push(drawLink(doc, page, ORG.email, `mailto:${ORG.email}`,
    payX + regular.widthOfTextAtSize(etransferPrefix, size), y, regular, size));

  y -= 15;
  const paypalPrefix = '3.  PayPal — ';
  page.drawText(paypalPrefix, { x: payX, y, size, font: regular, color: INK });
  annots.push(drawLink(doc, page, ORG.paypalUrl, ORG.paypalUrl,
    payX + regular.widthOfTextAtSize(paypalPrefix, size), y, regular, size));

  // The original read "We also accept donations (separate from fee-for-service) at CanadaHelps.
  // (tax receipt provided)" — two parentheticals in one sentence, the second stranded after a full
  // stop. Same meaning, said once, with the charity's own CanadaHelps page linked directly rather
  // than sending people to a site-wide search.
  y -= 26;
  const donationPrefix = 'Donations are welcome too, separate from any fee for service — ';
  page.drawText(donationPrefix, { x: MARGIN, y, size, font: regular, color: INK });
  annots.push(drawLink(doc, page, ORG.canadaHelpsLabel, ORG.canadaHelpsUrl,
    MARGIN + regular.widthOfTextAtSize(donationPrefix, size), y, regular, size));
  y -= 13;
  page.drawText('A tax receipt is provided.', { x: MARGIN, y, size, font: regular, color: INK });
  y -= 13;

  y -= 10;
  const thanks = 'Thank you for contributing to more sunshine!';
  drawRight(page, thanks, MARGIN + (CONTENT_WIDTH + bold.widthOfTextAtSize(thanks, 10)) / 2, y, bold, 10);

  // ── Footer, pinned to the bottom rather than flowing, so a two-line org name can't push it
  //    off the page or leave it floating mid-sheet. ──
  const footerLines = [
    ORG.addressLine,
    `${ORG.phone}, ${ORG.email}`,
    `Charity registration number: ${ORG.charityNumber}`,
  ];
  let footerY = MARGIN + 28;
  for (const line of footerLines) {
    drawRight(page, line, MARGIN + (CONTENT_WIDTH + regular.widthOfTextAtSize(line, 8.5)) / 2, footerY, regular, 8.5, MUTED);
    footerY -= 11;
  }

  // Set once, at the end: assigning `Annots` replaces the array rather than appending to it, so
  // doing this per-link would leave only the last one clickable.
  if (annots.length) page.node.set(PDFName.of('Annots'), doc.context.obj(annots));

  return doc.save();
}

/**
 * Filename used in Drive, in Supabase Storage and as the email attachment. Punctuation that
 * behaves badly in a filesystem or a URL is stripped; the invoice number leads so a folder sorts
 * chronologically by default.
 */
export function invoicePdfFilename(invoiceNumber: number, billToName: string, issuedAt: Date): string {
  return buildInvoiceName(invoiceNumber, billToName, issuedAt, false);
}

/**
 * Object key for Supabase Storage. **Not** the same string as the display filename.
 *
 * Storage rejects keys containing characters outside a conservative set — the em dash and the
 * ampersand in `INV-1001 — Pratt & Whitney — 2026-10-26.pdf` both fail with a bare
 * "Invalid key", which is logged but deliberately non-fatal, so the invoice sends and the stored
 * copy silently never appears. That is the worst kind of bug this system can have, so the key is
 * reduced to `[A-Za-z0-9._-]` and the pretty name is kept only for the email attachment and the
 * Drive copy, where it is what a human actually reads.
 */
export function invoiceStorageKey(invoiceNumber: number, billToName: string, issuedAt: Date): string {
  return `${invoiceNumber}/${buildInvoiceName(invoiceNumber, billToName, issuedAt, true)}`;
}

function buildInvoiceName(
  invoiceNumber: number,
  billToName: string,
  issuedAt: Date,
  asciiOnly: boolean,
): string {
  const date = issuedAt.toISOString().slice(0, 10);

  if (asciiOnly) {
    const slug = billToName
      .normalize('NFKD')                 // é -> e + combining accent
      .replace(/[̀-ͯ]/g, '')   // drop the accents
      .replace(/[^A-Za-z0-9]+/g, '-')    // everything else becomes a separator
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'organization';   // a name of only punctuation would otherwise empty out
    return `INV-${invoiceNumber}-${slug}-${date}.pdf`;
  }

  return legacyDisplayName(invoiceNumber, billToName, date);
}

function legacyDisplayName(invoiceNumber: number, billToName: string, date: string): string {
  // Strips only characters that are actually illegal in a filename. An earlier allowlist of
  // `[\w\s&-]` turned "Café Noël" into "Caf Nol" and "Pratt & Whitney" into "Pratt Whitney" —
  // both read as a different organization, which on a financial document is worse than an
  // awkward filename. Drive, email clients and every modern filesystem handle accents fine.
  const safeName = billToName
    .replace(/[/\\:*?"<>|\u0000-\u001f]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 60);
  return `INV-${invoiceNumber} — ${safeName} — ${date}.pdf`;
}
