// POST /api/admin/visits/[id]/complete
// Marks an approved visit as completed.
// Body: { internal_note?: string } — an optional visit_notes entry captured at completion.
// The note is internal (admin/PD only) and is never shared with the organization; the
// org-facing note is visits.admin_note, set by the approve/decline/cancel routes.

import { NextRequest, NextResponse } from 'next/server';
import { requireAdminOrPd } from '@/utils/requireAdminOrPd';
import { createSupabaseAdminClient } from '@/utils/supabase/admin';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const check = await requireAdminOrPd();
  if ('error' in check) return check.error;
  const { userId } = check;

  try {
    const { id } = await params;
    const visitId = parseInt(id, 10);
    if (isNaN(visitId)) {
      return NextResponse.json({ error: 'Invalid visit ID' }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const internalNote = typeof body?.internal_note === 'string' ? body.internal_note.trim() : '';

    const supabase = createSupabaseAdminClient();

    const { data: visit, error: fetchError } = await supabase
      .from('visits')
      .select('id, status, end_time')
      .eq('id', visitId)
      .single();

    if (fetchError || !visit) {
      return NextResponse.json({ error: 'Visit not found' }, { status: 404 });
    }
    if (visit.status !== 'approved') {
      return NextResponse.json({ error: 'Only approved visits can be marked complete' }, { status: 400 });
    }
    if (new Date((visit as any).end_time) > new Date()) {
      return NextResponse.json({ error: 'Cannot mark a visit as complete before it has ended' }, { status: 400 });
    }

    const { error } = await supabase
      .from('visits')
      .update({ status: 'completed' })
      .eq('id', visitId);

    if (error) {
      console.error('[complete visit] Supabase error:', error);
      return NextResponse.json({ error: 'Failed to mark visit as completed' }, { status: 500 });
    }

    // The visit is already complete at this point, so a failed note must not roll that back
    // or report the action as failed. Flag it instead and let the caller say the note was lost.
    let noteSaved = true;
    if (internalNote) {
      const { error: noteError } = await supabase
        .from('visit_notes')
        .insert({ visit_id: visitId, author_id: userId, note_text: internalNote });
      if (noteError) {
        console.error('[complete visit] Failed to save completion note:', noteError);
        noteSaved = false;
      }
    }

    // TODO: Auto-create invoice record (Phase 1.5)

    return NextResponse.json({ success: true, note_saved: noteSaved });
  } catch (err: any) {
    console.error('[complete visit] Unexpected error:', err.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
