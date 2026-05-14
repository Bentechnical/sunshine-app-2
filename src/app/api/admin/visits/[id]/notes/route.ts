// POST /api/admin/visits/[id]/notes
// Add an internal note to a visit (admin/PD only).
// Body: { note_text: string }

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

    const body = await req.json();
    const { note_text } = body;

    if (!note_text || typeof note_text !== 'string' || !note_text.trim()) {
      return NextResponse.json({ error: 'note_text is required' }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();

    // Verify visit exists
    const { data: visit } = await supabase
      .from('visits')
      .select('id')
      .eq('id', visitId)
      .single();

    if (!visit) {
      return NextResponse.json({ error: 'Visit not found' }, { status: 404 });
    }

    const { data: note, error } = await supabase
      .from('visit_notes')
      .insert({
        visit_id: visitId,
        author_id: userId,
        note_text: note_text.trim(),
      })
      .select('id, note_text, created_at')
      .single();

    if (error) {
      console.error('[POST notes] Supabase error:', error);
      return NextResponse.json({ error: 'Failed to add note' }, { status: 500 });
    }

    return NextResponse.json({ success: true, note }, { status: 201 });
  } catch (err: any) {
    console.error('[POST notes] Unexpected error:', err.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
