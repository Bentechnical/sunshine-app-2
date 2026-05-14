// POST /api/admin/visits/[id]/complete
// Marks an approved visit as completed.

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

    const supabase = createSupabaseAdminClient();

    const { data: visit, error: fetchError } = await supabase
      .from('visits')
      .select('id, status')
      .eq('id', visitId)
      .single();

    if (fetchError || !visit) {
      return NextResponse.json({ error: 'Visit not found' }, { status: 404 });
    }
    if (visit.status !== 'approved') {
      return NextResponse.json({ error: 'Only approved visits can be marked complete' }, { status: 400 });
    }

    const { error } = await supabase
      .from('visits')
      .update({ status: 'completed' })
      .eq('id', visitId);

    if (error) {
      console.error('[complete visit] Supabase error:', error);
      return NextResponse.json({ error: 'Failed to mark visit as completed' }, { status: 500 });
    }

    // TODO: Auto-create invoice record (Phase 1.5)

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[complete visit] Unexpected error:', err.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
