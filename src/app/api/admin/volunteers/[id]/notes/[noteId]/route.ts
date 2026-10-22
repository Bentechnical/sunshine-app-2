// PATCH  /api/admin/volunteers/[id]/notes/[noteId] — edit a note
// DELETE /api/admin/volunteers/[id]/notes/[noteId] — delete a note
//
// Permissions: a PD may only edit or delete their own notes; an admin may edit or delete any.
// The author check exists mainly so "Jeff wrote this" can't sit above text someone else silently
// rewrote — misattribution is the one genuinely bad outcome here.
//
// Deliberately no edit history and no soft delete: an edit overwrites, a delete removes the row,
// and an edited note still shows its original date. PDs are a small known group, and the places
// where a missing trail could actually hurt someone (compliance decisions, registration history)
// are tracked in docs/TECH_DEBT.md and matter more than this does. Revisit if PDs stop being a
// small trusted group.

import { NextRequest, NextResponse } from 'next/server';
import { requireAdminOrPd } from '@/utils/requireAdminOrPd';
import { createSupabaseAdminClient } from '@/utils/supabase/admin';

/** Loads the note and checks the caller may change it. */
async function loadAuthorised(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  noteId: number,
  volunteerId: string,
  userId: string,
  role: 'admin' | 'pd',
) {
  if (!Number.isInteger(noteId)) {
    return { error: NextResponse.json({ error: 'Invalid note id' }, { status: 400 }) };
  }

  const { data: note } = await supabase
    .from('volunteer_notes')
    .select('id, author_id, volunteer_id')
    .eq('id', noteId)
    .maybeSingle();

  if (!note || note.volunteer_id !== volunteerId) {
    return { error: NextResponse.json({ error: 'Note not found' }, { status: 404 }) };
  }
  if (role !== 'admin' && note.author_id !== userId) {
    return {
      error: NextResponse.json(
        { error: 'You can only change your own notes' },
        { status: 403 },
      ),
    };
  }

  return { note };
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; noteId: string }> }
) {
  const check = await requireAdminOrPd();
  if ('error' in check) return check.error;
  const { userId, role } = check;

  try {
    const { id: volunteerId, noteId } = await params;
    const { note_text } = await req.json() as { note_text?: string };

    if (!note_text || !note_text.trim()) {
      return NextResponse.json({ error: 'note_text is required' }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();
    const auth = await loadAuthorised(supabase, parseInt(noteId, 10), volunteerId, userId, role);
    if ('error' in auth) return auth.error;

    const { error } = await supabase
      .from('volunteer_notes')
      .update({ note_text: note_text.trim() })
      .eq('id', auth.note.id);

    if (error) {
      console.error('[PATCH volunteer note] Supabase error:', error.message);
      return NextResponse.json({ error: 'Failed to save note' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[PATCH volunteer note] Unexpected error:', err.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; noteId: string }> }
) {
  const check = await requireAdminOrPd();
  if ('error' in check) return check.error;
  const { userId, role } = check;

  try {
    const { id: volunteerId, noteId } = await params;

    const supabase = createSupabaseAdminClient();
    const auth = await loadAuthorised(supabase, parseInt(noteId, 10), volunteerId, userId, role);
    if ('error' in auth) return auth.error;

    const { error } = await supabase
      .from('volunteer_notes')
      .delete()
      .eq('id', auth.note.id);

    if (error) {
      console.error('[DELETE volunteer note] Supabase error:', error.message);
      return NextResponse.json({ error: 'Failed to delete note' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[DELETE volunteer note] Unexpected error:', err.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
