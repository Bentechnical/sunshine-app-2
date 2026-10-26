// Dev-only connectivity check for the invoice Drive + Sheets mirrors.
//
// Exercises the real `src/utils/googleInvoiceFiles.ts` rather than a parallel implementation, so
// a pass here means the production path works — not merely that some credentials somewhere are
// valid. Run with:  npx tsx scripts/testInvoiceGoogle.ts
//
// Writes one real PDF and one real sheet row, both clearly marked as tests. Delete them by hand
// afterwards; this script does not clean up, deliberately — seeing the artifacts is the point.

import 'dotenv/config';
import { config } from 'dotenv';
config({ path: '.env.local', override: true });

async function main() {
  // Imported after dotenv so the modules see the loaded environment.
  const { renderInvoicePdf } = await import('../src/utils/invoicePdf');
  const { uploadInvoicePdfToDrive, appendInvoiceToSheet } = await import('../src/utils/googleInvoiceFiles');

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const issuedAt = new Date();

  console.log('\n1. Rendering a test PDF…');
  const pdf = await renderInvoicePdf({
    invoiceNumber: 9999,
    issuedAt,
    billToName: 'TEST — Sunshine App connectivity check',
    billToAddress: 'Safe to delete',
    lineItems: [{
      description: 'Sunshine Therapy Dog Visit for TEST',
      detail: 'This is a connectivity test, not a real invoice',
      rate: 1, quantity: 1, amount: 1,
    }],
    total: 1,
  });
  console.log(`   rendered ${pdf.length} bytes`);

  console.log('\n2. Uploading to the shared-drive folder…');
  const upload = await uploadInvoicePdfToDrive(`TEST-DELETE-ME ${stamp}.pdf`, pdf);
  if (!upload) {
    console.error('   FAILED — see the error above.');
  } else {
    console.log(`   OK  fileId=${upload.fileId}`);
    console.log(`   link: ${upload.webViewLink ?? '(none returned)'}`);
  }

  console.log('\n3. Appending a row to the tracking sheet…');
  const appended = await appendInvoiceToSheet({
    invoiceNumber: 9999,
    dateIssued: issuedAt.toISOString().slice(0, 10),
    organization: 'TEST — delete this row',
    visitDate: issuedAt.toISOString().slice(0, 10),
    visitTitle: 'Connectivity check',
    amount: 1, parking: 0, total: 1,
    feeTier: 'test',
    sentTo: 'nobody@example.com',
    pdfLink: upload?.webViewLink ?? '',
  });
  console.log(appended ? '   OK' : '   FAILED — see the error above.');

  console.log('\n─────────────────────────────────────────');
  console.log(`Drive: ${upload ? 'PASS' : 'FAIL'}    Sheet: ${appended ? 'PASS' : 'FAIL'}`);
  console.log('Delete the test file and row by hand once you have looked at them.\n');

  process.exit(upload && appended ? 0 : 1);
}

main().catch(err => {
  console.error('\nUnexpected failure:', err);
  process.exit(1);
});
