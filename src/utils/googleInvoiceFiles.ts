// src/utils/googleInvoiceFiles.ts
// Mirrors each issued invoice to Google Drive (the PDF) and to the tracking sheet (one row).
//
// BOTH ARE BEST-EFFORT AND NEITHER MAY EVER THROW. Supabase Storage is the system of record for
// the PDF and the `invoices` table is the record of what was billed; Drive and Sheets exist so
// humans can browse and reconcile without opening the app. A Google outage, a revoked share or a
// renamed folder must never stop an invoice being issued or emailed — it degrades the convenience
// copy, nothing more. Failures are logged loudly and recorded as a null `drive_file_id` /
// `sheet_synced_at`, so a backfill can find them later.
//
// AUTH DIFFERS FROM THE CALENDAR INTEGRATION. Calendar uses domain-wide delegation and impersonates
// a real Workspace user (`subject:`). This does not: the service account is a *member* of the
// "Invoices - Sunshine App" shared drive and acts as itself. That means no delegation entry, no
// Workspace admin involvement, and — the reason it's safe to request broad scopes — the account
// can only reach what it's been shared on, which is one shared drive containing one folder and one
// sheet. Scope grants capability; membership bounds reach.

import { google } from 'googleapis';
import { Readable } from 'stream';

const SCOPES = [
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/spreadsheets',
];

function getAuth() {
  const email = process.env.GOOGLE_INVOICE_SERVICE_ACCOUNT_EMAIL;
  const rawKey = process.env.GOOGLE_INVOICE_SERVICE_ACCOUNT_PRIVATE_KEY;

  if (!email || !rawKey) {
    throw new Error('Invoice Google credentials not configured (GOOGLE_INVOICE_SERVICE_ACCOUNT_*)');
  }

  // A key pasted into .env.local may carry either literal two-character `\n` sequences or real
  // newlines depending on how it was quoted. Normalizing both means it works either way instead
  // of failing with an opaque "error:1E08010C:DECODER routines::unsupported".
  const privateKey = rawKey.includes('\\n') ? rawKey.replace(/\\n/g, '\n') : rawKey;

  // No `subject:` — see the auth note at the top of this file.
  return new google.auth.JWT({ email, key: privateKey, scopes: SCOPES });
}

export interface DriveUploadResult {
  fileId: string;
  webViewLink: string | null;
}

/**
 * Upload an invoice PDF to the shared-drive folder.
 *
 * `supportsAllDrives` is required on every call: without it the Drive API behaves as though shared
 * drives don't exist and rejects the parent folder with a confusing 404 that reads like a
 * permissions problem.
 *
 * Returns null on any failure. The caller stores `drive_file_id` only when this succeeds.
 */
export async function uploadInvoicePdfToDrive(
  filename: string,
  pdf: Uint8Array,
): Promise<DriveUploadResult | null> {
  const folderId = process.env.GOOGLE_DRIVE_INVOICE_FOLDER_ID;
  if (!folderId) {
    console.warn('[invoiceDrive] GOOGLE_DRIVE_INVOICE_FOLDER_ID not set — skipping Drive mirror');
    return null;
  }

  try {
    const drive = google.drive({ version: 'v3', auth: getAuth() });

    const res = await drive.files.create({
      supportsAllDrives: true,
      requestBody: { name: filename, parents: [folderId], mimeType: 'application/pdf' },
      media: { mimeType: 'application/pdf', body: Readable.from(Buffer.from(pdf)) },
      fields: 'id, webViewLink',
    });

    const fileId = res.data.id;
    if (!fileId) {
      console.error('[invoiceDrive] Upload returned no file id');
      return null;
    }

    console.log(`[invoiceDrive] Uploaded ${filename} (${fileId})`);
    return { fileId, webViewLink: res.data.webViewLink ?? null };
  } catch (err: any) {
    console.error(`[invoiceDrive] Failed to upload ${filename}:`, err?.message);
    return null;
  }
}

/**
 * Columns A–K of the tracking sheet, in order. L–O (Paid, Date Paid, Payment Method, Notes) belong
 * to whoever is reconciling payments and are never written here — the app owns issuance, the sheet
 * owns reconciliation.
 *
 * Append writes by POSITION, not by header name, so the order of these fields is a contract with
 * the sheet layout. Inserting a column into A–K silently shifts every subsequent value by one.
 */
export interface InvoiceSheetRow {
  invoiceNumber: number;
  dateIssued: string;
  organization: string;
  visitDate: string;
  visitTitle: string;
  amount: number;
  parking: number;
  total: number;
  feeTier: string;
  sentTo: string;
  pdfLink: string;
}

/**
 * Append one row to the tracking sheet.
 *
 * The target tab is resolved by index rather than assuming "Sheet1", so renaming the tab doesn't
 * break the integration — a rename is exactly the kind of harmless thing someone does to a
 * spreadsheet without realising code depends on it.
 *
 * Returns false on any failure; the caller leaves `sheet_synced_at` null.
 */
export async function appendInvoiceToSheet(row: InvoiceSheetRow): Promise<boolean> {
  const spreadsheetId = process.env.GOOGLE_INVOICE_SHEET_ID;
  if (!spreadsheetId) {
    console.warn('[invoiceSheet] GOOGLE_INVOICE_SHEET_ID not set — skipping sheet mirror');
    return false;
  }

  try {
    const sheets = google.sheets({ version: 'v4', auth: getAuth() });

    const meta = await sheets.spreadsheets.get({
      spreadsheetId,
      fields: 'sheets.properties.title',
    });
    const tabTitle = meta.data.sheets?.[0]?.properties?.title;
    if (!tabTitle) {
      console.error('[invoiceSheet] Spreadsheet has no readable tabs');
      return false;
    }

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${tabTitle}!A:K`,
      // USER_ENTERED so dates and currency land as real values a human can sort and sum, rather
      // than as text that looks right and behaves wrongly.
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: {
        values: [[
          row.invoiceNumber,
          row.dateIssued,
          row.organization,
          row.visitDate,
          row.visitTitle,
          row.amount,
          row.parking,
          row.total,
          row.feeTier,
          row.sentTo,
          row.pdfLink,
        ]],
      },
    });

    console.log(`[invoiceSheet] Appended invoice #${row.invoiceNumber}`);
    return true;
  } catch (err: any) {
    console.error(`[invoiceSheet] Failed to append invoice #${row.invoiceNumber}:`, err?.message);
    return false;
  }
}
