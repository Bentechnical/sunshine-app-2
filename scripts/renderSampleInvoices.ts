// Dev-only: renders the four sample invoices for visual comparison against the originals.
// Not wired into any npm script; run with `npx tsx scripts/renderSampleInvoices.ts <outdir>`.
import { writeFileSync } from 'fs';
import { computeInvoiceDraft } from '../src/utils/invoice';
import { renderInvoicePdf, invoicePdfFilename } from '../src/utils/invoicePdf';

const out = process.argv[2] || '.';

const cases = [
  {
    n: 540, date: new Date('2026-10-06T12:00:00'),
    visit: { id: 1, visit_date: '2026-10-06', fee_tier: 'tier_200', parking_coverage: 'invoice' },
    org: { org_name: 'UofT Engineering First Year Office', org_address: null, email: 'a@b.ca' },
  },
  {
    n: 550, date: new Date('2026-10-20T12:00:00'),
    visit: { id: 2, visit_date: '2026-10-20', fee_tier: 'tier_200', parking_coverage: 'free_on_site' },
    org: { org_name: 'UofT Lambda Chi Alpha Fraternity', org_address: '152 St. George Street, Toronto ON, M5S 3J4', email: 'a@b.ca' },
  },
  {
    n: 473, date: new Date('2026-05-13T12:00:00'),
    visit: { id: 3, visit_date: '2026-05-13', fee_tier: 'tier_500', parking_coverage: null },
    org: { org_name: 'Pratt & Whitney', org_address: '1801 Courtneypark Drive East Mississauga', email: 'a@b.ca' },
  },
  {
    n: 488, date: new Date('2026-06-06T12:00:00'),
    visit: { id: 4, visit_date: '2026-06-06', fee_tier: 'tier_500', parking_coverage: 'invoice' },
    org: { org_name: 'AccessFest', org_address: '#218 - 192 Spadina Ave. Toronto ON M5T 2C2', email: 'a@b.ca' },
  },
];

(async () => {
  for (const c of cases) {
    const draft = computeInvoiceDraft(c.visit as any, c.org as any);
    const bytes = await renderInvoicePdf({
      invoiceNumber: c.n, issuedAt: c.date,
      billToName: draft.billToName, billToAddress: draft.billToAddress,
      lineItems: draft.lineItems, total: draft.total,
    });
    const name = invoicePdfFilename(c.n, draft.billToName, c.date);
    writeFileSync(`${out}/${name}`, bytes);
    console.log(`#${c.n}  total $${draft.total}  lines=${draft.lineItems.length}  blockers=[${draft.blockers}]  -> ${name}`);
  }
})();
