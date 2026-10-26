// DELETE /api/admin/visits/[id]/delete
// Hard-deletes a visit. Only allowed if the visit has no non-cancelled registrations.
// Also removes the Google Calendar event if one exists.

import { NextRequest, NextResponse } from 'next/server';
import { requireAdminOrPd } from '@/utils/requireAdminOrPd';
import { createSupabaseAdminClient } from '@/utils/supabase/admin';
import { cancelVisitEvent } from '@/utils/googleCalendar';

export async function DELETE(
  req: NextRequest,
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

    const { data: visit, error: fetchError } = await supabase
      .from('visits')
      .select('id, status, google_calendar_event_id')
      .eq('id', visitId)
      .single();

    if (fetchError || !visit) {
      return NextResponse.json({ error: 'Visit not found' }, { status: 404 });
    }

    // Check for non-cancelled registrations
    const { data: activeRegs } = await supabase
      .from('visit_registrations')
      .select('id')
      .eq('visit_id', visitId)
      .neq('status', 'cancelled')
      .limit(1);

    if (activeRegs && activeRegs.length > 0) {
      return NextResponse.json(
        { error: 'Cannot delete a visit with active registrations. Cancel the visit first to notify volunteers.' },
        { status: 400 }
      );
    }

    // An invoiced visit cannot be deleted. `invoices.visit_id` is ON DELETE RESTRICT, so the
    // database would refuse this anyway — but it would surface as an opaque FK violation. Check
    // first so the answer is readable and says what to do about it.
    //
    // A voided invoice does not block deletion: voiding is the act of saying the bill should
    // never have existed, so there is nothing left to preserve a link to.
    const { data: liveInvoices } = await supabase
      .from('invoices')
      .select('invoice_number')
      .eq('visit_id', visitId)
      .neq('status', 'void')
      .limit(1);

    if (liveInvoices && liveInvoices.length > 0) {
      return NextResponse.json(
        {
          error: `This visit has been invoiced (#${liveInvoices[0].invoice_number}) and cannot be deleted. Void the invoice first if it was issued in error.`,
        },
        { status: 409 }
      );
    }

    // Remove Google Calendar event if exists
    if ((visit as any).google_calendar_event_id) {
      await cancelVisitEvent((visit as any).google_calendar_event_id);
    }

    // Delete any cancelled registrations first (FK constraint)
    await supabase
      .from('visit_registrations')
      .delete()
      .eq('visit_id', visitId);

    // Hard delete the visit
    const { error: deleteError } = await supabase
      .from('visits')
      .delete()
      .eq('id', visitId);

    if (deleteError) {
      console.error('[delete visit] Supabase error:', deleteError);
      return NextResponse.json({ error: 'Failed to delete visit' }, { status: 500 });
    }

    console.log(`[delete visit] Visit ${visitId} permanently deleted`);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[delete visit] Unexpected error:', err.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
