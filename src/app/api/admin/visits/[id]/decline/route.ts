// POST /api/admin/visits/[id]/decline
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
      .select('id, status')
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

    // TODO: Send decline email to org contact with admin_note as reason

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[decline] Unexpected error:', err.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
