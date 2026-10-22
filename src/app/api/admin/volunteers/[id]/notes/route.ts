// POST /api/admin/volunteers/[id]/notes — add a private note about a volunteer (admin/PD only).
// Mirrors POST /api/admin/visits/[id]/notes.
//
// Append-only by design: no PATCH or DELETE. A note is a dated observation by a named person, and
// being able to quietly edit or remove one would undermine the point of having a record.

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
    const { id: volunteerId } = await params;
    const { note_text } = await req.json() as { note_text?: string };

    if (!note_text || typeof note_text !== 'string' || !note_text.trim()) {
      return NextResponse.json({ error: 'note_text is required' }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();

    const { data: target } = await supabase
      .from('users')
      .select('id, role')
      .eq('id', volunteerId)
      .maybeSingle();
    if (!target || target.role !== 'volunteer') {
      return NextResponse.json({ error: 'Volunteer not found' }, { status: 404 });
    }

    const { data: note, error } = await supabase
      .from('volunteer_notes')
      .insert({
        volunteer_id: volunteerId,
        author_id: userId,
        note_text: note_text.trim(),
      })
      .select('id, note_text, created_at, author_id')
      .single();

    if (error) {
      console.error('[POST volunteer note] Supabase error:', error.message);
      return NextResponse.json({ error: 'Failed to add note' }, { status: 500 });
    }

    // Resolve the author's name so the client can render the new note without a refetch.
    const { data: author } = await supabase
      .from('users')
      .select('first_name, last_name')
      .eq('id', userId)
      .maybeSingle();

    return NextResponse.json({
      success: true,
      note: {
        ...note,
        author_name: author ? `${author.first_name} ${author.last_name}` : null,
      },
    }, { status: 201 });
  } catch (err: any) {
    console.error('[POST volunteer note] Unexpected error:', err.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
