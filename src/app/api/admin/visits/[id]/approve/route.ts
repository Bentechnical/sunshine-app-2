// POST /api/admin/visits/[id]/approve
// Body: { admin_note?: string }

import { NextRequest, NextResponse } from 'next/server';
import { requireAdminOrPd } from '@/utils/requireAdminOrPd';
import { createSupabaseAdminClient } from '@/utils/supabase/admin';

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
      .select('id, status, guest_contact_email, guest_contact_name, organization_id, visit_date, start_time, end_time, address, title')
      .eq('id', visitId)
      .single();

    if (fetchError || !visit) {
      return NextResponse.json({ error: 'Visit not found' }, { status: 404 });
    }
    if (visit.status !== 'pending_review') {
      return NextResponse.json({ error: 'Only pending_review visits can be approved' }, { status: 400 });
    }

    const { error } = await supabase
      .from('visits')
      .update({ status: 'approved', admin_note: adminNote })
      .eq('id', visitId);

    if (error) {
      console.error('[approve] Supabase error:', error);
      return NextResponse.json({ error: 'Failed to approve visit' }, { status: 500 });
    }

    // TODO: Create Google Calendar event for the visit
    // TODO: Send approval email to org contact (guest_contact_email or org user's email)

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[approve] Unexpected error:', err.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
