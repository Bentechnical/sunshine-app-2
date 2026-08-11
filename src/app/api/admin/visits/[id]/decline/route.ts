// POST /api/admin/visits/[id]/decline
// Body: { admin_note?: string }

import { NextRequest, NextResponse } from 'next/server';
import { requireAdminOrPd } from '@/utils/requireAdminOrPd';
import { createSupabaseAdminClient } from '@/utils/supabase/admin';
import { sendTransactionalEmail } from '@/app/utils/mailer';

export async function POST(
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

    const body = await req.json().catch(() => ({}));
    const adminNote = body.admin_note ?? null;

    const supabase = createSupabaseAdminClient();

    const { data: visit, error: fetchError } = await supabase
      .from('visits')
      .select('id, status, visit_date, organization_id, guest_org_name, guest_contact_name, guest_contact_email')
      .eq('id', visitId)
      .single();

    if (fetchError || !visit) {
      return NextResponse.json({ error: 'Visit not found' }, { status: 404 });
    }
    if (!['pending_review', 'approved'].includes(visit.status as string)) {
      return NextResponse.json({ error: 'This visit cannot be declined in its current state' }, { status: 400 });
    }

    const { error } = await supabase
      .from('visits')
      .update({ status: 'declined', admin_note: adminNote })
      .eq('id', visitId);

    if (error) {
      console.error('[decline] Supabase error:', error);
      return NextResponse.json({ error: 'Failed to decline visit' }, { status: 500 });
    }

    // Send decline email to org contact
    let orgContactEmail: string | null = visit.guest_contact_email ?? null;
    let orgName: string = visit.guest_org_name ?? '';
    let contactName: string = visit.guest_contact_name ?? '';

    if (visit.organization_id) {
      const { data: orgUser } = await supabase
        .from('users')
        .select('email, org_name, org_contact_name')
        .eq('id', visit.organization_id)
        .single();
      if (orgUser) {
        if (orgUser.email) orgContactEmail = orgUser.email;
        if (orgUser.org_name) orgName = orgUser.org_name;
        if (orgUser.org_contact_name) contactName = orgUser.org_contact_name;
      }
    }
    if (visit.guest_contact_name) contactName = visit.guest_contact_name;

    if (orgContactEmail) {
      const ccEmail = visit.guest_contact_email && visit.guest_contact_email !== orgContactEmail
        ? visit.guest_contact_email
        : undefined;

      const formattedDate = new Date(visit.visit_date).toLocaleDateString('en-CA', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      });

      sendTransactionalEmail({
        to: orgContactEmail,
        ...(ccEmail ? { cc: ccEmail } : {}),
        subject: 'Update on your visit request — Sunshine Therapy Dogs',
        templateName: 'visitDeclined',
        data: {
          contactName: contactName || 'there',
          orgName: orgName || 'your organization',
          visitDate: formattedDate,
          adminNote: adminNote || null,
          year: new Date().getFullYear(),
        },
      }).catch(err => console.error('[decline] Failed to send decline email:', err));
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[decline] Unexpected error:', err.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
