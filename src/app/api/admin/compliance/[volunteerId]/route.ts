// PATCH /api/admin/compliance/[volunteerId]
// Two modes:
//   1. Verification action: { action: 'approve_vsc' | 'reject_vsc' | 'approve_vaccine' | 'reject_vaccine' }
//      Sets verification status, records who acted and when, writes to audit log.
//   2. Manual field update: { vsc_date_issued?, vsc_renewal_due?, vaccine_expiry_date?, vaccine_cycle_years? }
//      Admin corrects dates on behalf of a volunteer. Does not affect verification status.

import { NextRequest, NextResponse } from 'next/server';
import { requireAdminOrPd } from '@/utils/requireAdminOrPd';
import { createSupabaseAdminClient } from '@/utils/supabase/admin';

type VerificationAction = 'approve_vsc' | 'reject_vsc' | 'approve_vaccine' | 'reject_vaccine';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ volunteerId: string }> }
) {
  const check = await requireAdminOrPd();
  if ('error' in check) return check.error;
  const { userId: adminId } = check;

  try {
    const { volunteerId } = await params;
    const body = await req.json();

    const supabase = createSupabaseAdminClient();

    // Verify this is actually a volunteer
    const { data: volunteer, error: volunteerError } = await supabase
      .from('users')
      .select('id, role')
      .eq('id', volunteerId)
      .eq('role', 'volunteer')
      .single();

    if (volunteerError || !volunteer) {
      return NextResponse.json({ error: 'Volunteer not found' }, { status: 404 });
    }

    // Fetch dog separately to avoid FK-embed ambiguity
    const { data: dogRow } = await supabase
      .from('dogs')
      .select('id')
      .eq('volunteer_id', volunteerId)
      .maybeSingle();

    // ── Mode 1: Verification action ──────────────────────────────────────────
    const { action } = body as { action?: VerificationAction };

    if (action) {
      const isVsc = action === 'approve_vsc' || action === 'reject_vsc';
      const isApprove = action === 'approve_vsc' || action === 'approve_vaccine';
      const newStatus = isApprove ? 'approved' : 'rejected';
      const now = new Date().toISOString();

      if (isVsc) {
        const { error: vscError } = await supabase
          .from('users')
          .update({
            vsc_verification_status: newStatus,
            vsc_verified_at: now,
            vsc_verified_by: adminId,
          })
          .eq('id', volunteerId);

        if (vscError) {
          console.error('[PATCH compliance] VSC verification error:', vscError);
          return NextResponse.json({ error: 'Failed to update VSC verification' }, { status: 500 });
        }
      } else {
        if (!dogRow) {
          return NextResponse.json({ error: 'No dog found for this volunteer' }, { status: 404 });
        }

        const { error: vaccineError } = await supabase
          .from('dogs')
          .update({
            vaccine_verification_status: newStatus,
            vaccine_verified_at: now,
            vaccine_verified_by: adminId,
          })
          .eq('id', dogRow.id);

        if (vaccineError) {
          console.error('[PATCH compliance] Vaccine verification error:', vaccineError);
          return NextResponse.json({ error: 'Failed to update vaccine verification' }, { status: 500 });
        }
      }

      // Write to audit log
      const { error: auditError } = await supabase
        .from('document_verifications')
        .insert({
          volunteer_id: volunteerId,
          document_type: isVsc ? 'vsc' : 'vaccine',
          action: newStatus,
          performed_by: adminId,
          performed_at: now,
        });

      if (auditError) {
        // Non-fatal — log but don't fail the request
        console.error('[PATCH compliance] Audit log insert failed:', auditError);
      }

      // TODO: If action is 'reject_vsc' or 'reject_vaccine', send notification email to volunteer.
      // Deferred pending business stakeholder decision on rejection messaging flow.

      return NextResponse.json({ success: true, action, new_status: newStatus });
    }

    // ── Mode 2: Manual field update ──────────────────────────────────────────
    const { vsc_date_issued, vsc_renewal_due, vaccine_expiry_date, vaccine_cycle_years } = body;

    // Update VSC fields on users table
    const userUpdates: Record<string, any> = {};
    if (vsc_date_issued !== undefined) userUpdates.vsc_date_issued = vsc_date_issued;
    if (vsc_renewal_due !== undefined) userUpdates.vsc_renewal_due = vsc_renewal_due;

    if (Object.keys(userUpdates).length > 0) {
      const { error: userUpdateError } = await supabase
        .from('users')
        .update(userUpdates)
        .eq('id', volunteerId);

      if (userUpdateError) {
        console.error('[PATCH compliance] User update error:', userUpdateError);
        return NextResponse.json({ error: 'Failed to update VSC fields' }, { status: 500 });
      }
    }

    // Update vaccine fields on dogs table
    const dogUpdates: Record<string, any> = {};
    if (vaccine_expiry_date !== undefined) dogUpdates.vaccine_expiry_date = vaccine_expiry_date;
    if (vaccine_cycle_years !== undefined) dogUpdates.vaccine_cycle_years = vaccine_cycle_years;

    if (Object.keys(dogUpdates).length > 0) {
      if (!dogRow) {
        return NextResponse.json({ error: 'No dog found for this volunteer' }, { status: 404 });
      }

      const { error: dogUpdateError } = await supabase
        .from('dogs')
        .update(dogUpdates)
        .eq('id', dogRow.id);

      if (dogUpdateError) {
        console.error('[PATCH compliance] Dog update error:', dogUpdateError);
        return NextResponse.json({ error: 'Failed to update vaccine fields' }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[PATCH compliance] Unexpected error:', err.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
