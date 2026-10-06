// PATCH /api/admin/compliance/[volunteerId]
// Two modes:
//   1. Verification action: { action: 'approve_vsc' | 'reject_vsc' | 'approve_vaccine' | 'reject_vaccine' }
//      Sets verification status, records who acted and when, writes to audit log.
//   2. Manual field update: { vsc_date_issued?, vsc_renewal_due?, vaccine_expiry_date?, vaccine_cycle_years? }
//      Admin corrects dates on behalf of a volunteer. Does not affect verification status.

import { NextRequest, NextResponse } from 'next/server';
import { requireAdminOrPd } from '@/utils/requireAdminOrPd';
import { createSupabaseAdminClient } from '@/utils/supabase/admin';
import { sendTransactionalEmail } from '@/app/utils/mailer';
import { getAppUrl } from '@/app/utils/getAppUrl';

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
    const { action, rejection_reason } = body as { action?: VerificationAction; rejection_reason?: string };

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
            vsc_rejection_reason: isApprove ? null : (rejection_reason || null),
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
            vaccine_rejection_reason: isApprove ? null : (rejection_reason || null),
          })
          .eq('id', dogRow.id);

        if (vaccineError) {
          console.error('[PATCH compliance] Vaccine verification error:', vaccineError);
          return NextResponse.json({ error: 'Failed to update vaccine verification' }, { status: 500 });
        }
      }

      console.log(`[PATCH compliance] ${action} performed on ${volunteerId} by ${adminId}`);

      // Send email notification if volunteer is already approved (Case 3)
      const { data: volUser } = await supabase
        .from('users')
        .select('status, email, first_name, vsc_verification_status')
        .eq('id', volunteerId)
        .single();

      if (volUser?.status === 'approved' && volUser?.email) {
        if (isApprove) {
          // Check if any docs are still pending_review — only email when all are resolved
          const currentVscStatus = isVsc ? newStatus : volUser.vsc_verification_status;
          const { data: currentDog } = await supabase
            .from('dogs')
            .select('vaccine_verification_status')
            .eq('volunteer_id', volunteerId)
            .maybeSingle();
          const currentVaccineStatus = !isVsc ? newStatus : currentDog?.vaccine_verification_status;

          const stillPending = currentVscStatus === 'pending_review' || currentVaccineStatus === 'pending_review';

          if (!stillPending) {
            await sendTransactionalEmail({
              to: volUser.email,
              subject: 'Your compliance documents have been approved',
              templateName: 'complianceDocsApproved',
              data: {
                firstName: volUser.first_name ?? 'there',
                year: new Date().getFullYear(),
                dashboardLink: `${getAppUrl()}/dashboard`,
              },
            });
            console.log(`[Resend] Compliance docs approved email sent to ${volUser.email}`);
          }
        } else {
          // Rejection — send immediately so volunteer can take action
          const documentName = isVsc ? 'Volunteer Screening Check (VSC)' : 'Vaccination Record';
          await sendTransactionalEmail({
            to: volUser.email,
            subject: `Your ${documentName} needs attention`,
            templateName: 'complianceDocRejected',
            data: {
              firstName: volUser.first_name ?? 'there',
              documentName,
              rejectionReason: rejection_reason || null,
              year: new Date().getFullYear(),
              dashboardLink: `${getAppUrl()}/dashboard`,
            },
          });
          console.log(`[Resend] Compliance doc rejected email sent to ${volUser.email}`);
        }
      }

      // Return the verification metadata so the caller can render the result immediately
      // instead of synthesising a timestamp and waiting for a refresh to learn the verifier.
      const { data: verifier } = await supabase
        .from('users')
        .select('first_name, last_name')
        .eq('id', adminId)
        .maybeSingle();
      const verifierName = verifier
        ? `${verifier.first_name ?? ''} ${verifier.last_name ?? ''}`.trim() || null
        : null;

      return NextResponse.json({
        success: true,
        action,
        new_status: newStatus,
        verification: {
          verified_at: now,
          verified_by: adminId,
          verified_by_name: verifierName,
          rejection_reason: isApprove ? null : (rejection_reason || null),
        },
      });
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
