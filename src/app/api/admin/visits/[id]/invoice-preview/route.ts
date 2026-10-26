// GET /api/admin/visits/[id]/invoice-preview
// What the completion modal shows before anyone commits: the computed line items, the total, and
// exactly who the invoice would be emailed to.
//
// The computation lives server-side rather than in the component so there is one implementation of
// the fee rules, not two that drift. The modal renders what this returns; the issue endpoint
// recomputes the same thing and compares, which is how an edited figure gets recorded as an
// override instead of silently trusted.

import { NextRequest, NextResponse } from 'next/server';
import { requireAdminOrPd } from '@/utils/requireAdminOrPd';
import { createSupabaseAdminClient } from '@/utils/supabase/admin';
import { computeInvoiceDraft } from '@/utils/invoice';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const check = await requireAdminOrPd();
  if ('error' in check) return check.error;

  try {
    const { id } = await params;
    const visitId = parseInt(id, 10);
    if (isNaN(visitId)) {
      return NextResponse.json({ error: 'Invalid visit ID' }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();

    const { data: visit, error } = await supabase
      .from('visits')
      .select(`
        id, title, visit_date, status, organization_id,
        guest_org_name, guest_contact_name, guest_contact_email,
        fee_tier, fee_amount, parking_coverage
      `)
      .eq('id', visitId)
      .single();

    if (error || !visit) {
      return NextResponse.json({ error: 'Visit not found' }, { status: 404 });
    }

    // An existing live invoice means this visit has already been billed. Surfaced here so the
    // modal can say so up front rather than letting someone fill in a form that will be refused
    // by the unique index at the last moment.
    const { data: existing } = await supabase
      .from('invoices')
      .select('id, invoice_number, status, total, issued_at')
      .eq('visit_id', visitId)
      .neq('status', 'void')
      .maybeSingle();

    let org = null;
    let contactName = visit.guest_contact_name || 'there';

    if (visit.organization_id) {
      const { data: orgRow } = await supabase
        .from('users')
        .select('org_name, org_address, org_contact_name, email, additional_emails, first_name')
        .eq('id', visit.organization_id)
        .single();

      if (orgRow) {
        org = orgRow;
        contactName = orgRow.org_contact_name || orgRow.first_name || 'there';
      }
    }

    const draft = computeInvoiceDraft(visit as any, org);

    return NextResponse.json({
      visit: {
        id: visit.id,
        title: visit.title,
        visit_date: visit.visit_date,
        status: visit.status,
        parking_coverage: visit.parking_coverage,
      },
      contactName,
      lineItems: draft.lineItems,
      total: draft.total,
      feeTier: draft.feeTier,
      billToName: draft.billToName,
      billToAddress: draft.billToAddress,
      recipients: draft.recipients,
      blockers: draft.blockers,
      isFreeVisit: draft.isFreeVisit,
      existingInvoice: existing ?? null,
    });
  } catch (err: any) {
    console.error('[invoice-preview] Unexpected error:', err.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
