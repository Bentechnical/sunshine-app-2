// PUT    /api/admin/volunteers/[id]/exclusions — add or update one audience exclusion
// DELETE /api/admin/volunteers/[id]/exclusions?group_id=N — remove one
//
// Per-exclusion rather than replace-the-whole-set, because each row carries created_by and
// created_at. A replace-all write would reset the provenance of conditions nobody touched, and
// "who imposed this and when" is the part a PD will actually want when reviewing a condition
// someone else set.

import { NextRequest, NextResponse } from 'next/server';
import { requireAdminOrPd } from '@/utils/requireAdminOrPd';
import { createSupabaseAdminClient } from '@/utils/supabase/admin';

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const check = await requireAdminOrPd();
  if ('error' in check) return check.error;
  const { userId } = check;

  try {
    const { id: volunteerId } = await params;
    const body = await req.json() as { group_id?: number; note?: string | null };
    const groupId = Number(body.group_id);

    if (!Number.isInteger(groupId)) {
      return NextResponse.json({ error: 'group_id is required' }, { status: 400 });
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

    const { data: group } = await supabase
      .from('audience_groups')
      .select('id, is_active')
      .eq('id', groupId)
      .maybeSingle();
    if (!group) {
      return NextResponse.json({ error: 'Audience group not found' }, { status: 400 });
    }
    if (!group.is_active) {
      return NextResponse.json({ error: 'That audience group is retired' }, { status: 400 });
    }

    const note = typeof body.note === 'string' && body.note.trim()
      ? body.note.trim()
      : null;

    // Existing row keeps its original created_by/created_at — editing the note shouldn't reassign
    // authorship of the condition itself.
    const { data: existing } = await supabase
      .from('volunteer_audience_exclusions')
      .select('volunteer_id')
      .eq('volunteer_id', volunteerId)
      .eq('group_id', groupId)
      .maybeSingle();

    const { error } = existing
      ? await supabase
          .from('volunteer_audience_exclusions')
          .update({ note })
          .eq('volunteer_id', volunteerId)
          .eq('group_id', groupId)
      : await supabase
          .from('volunteer_audience_exclusions')
          .insert({ volunteer_id: volunteerId, group_id: groupId, note, created_by: userId });

    if (error) {
      console.error('[PUT volunteer exclusion] Supabase error:', error.message);
      return NextResponse.json({ error: 'Failed to save condition' }, { status: 500 });
    }

    // Return the row as the client will render it, so the condition can be shown without
    // refetching the whole profile. The label and the setter's name both live elsewhere, which is
    // exactly why the client can't assemble this itself.
    const { data: row } = await supabase
      .from('volunteer_audience_exclusions')
      .select('group_id, note, created_at, created_by, audience_groups(label)')
      .eq('volunteer_id', volunteerId)
      .eq('group_id', groupId)
      .maybeSingle();

    let createdByName: string | null = null;
    if (row?.created_by) {
      const { data: author } = await supabase
        .from('users').select('first_name, last_name').eq('id', row.created_by).maybeSingle();
      createdByName = author ? `${author.first_name} ${author.last_name}` : null;
    }

    return NextResponse.json({
      success: true,
      created: !existing,
      exclusion: row ? {
        group_id: row.group_id,
        label: (row.audience_groups as any)?.label ?? null,
        note: row.note ?? null,
        created_at: row.created_at,
        created_by_name: createdByName,
      } : null,
    });
  } catch (err: any) {
    console.error('[PUT volunteer exclusion] Unexpected error:', err.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const check = await requireAdminOrPd();
  if ('error' in check) return check.error;

  try {
    const { id: volunteerId } = await params;
    const groupId = Number(req.nextUrl.searchParams.get('group_id'));

    if (!Number.isInteger(groupId)) {
      return NextResponse.json({ error: 'group_id is required' }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();

    const { error } = await supabase
      .from('volunteer_audience_exclusions')
      .delete()
      .eq('volunteer_id', volunteerId)
      .eq('group_id', groupId);

    if (error) {
      console.error('[DELETE volunteer exclusion] Supabase error:', error.message);
      return NextResponse.json({ error: 'Failed to remove condition' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[DELETE volunteer exclusion] Unexpected error:', err.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
