// GET /api/admin/volunteers?q=<search> — volunteer search for admin assignment
// Filters by first_name, last_name, or dog name. Requires 2+ char query.

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/utils/supabase/admin';
import { requireAdminOrPd } from '@/utils/requireAdminOrPd';

export async function GET(req: NextRequest) {
  const check = await requireAdminOrPd();
  if ('error' in check) return check.error;

  const q = req.nextUrl.searchParams.get('q')?.trim() ?? '';
  if (q.length < 2) {
    return NextResponse.json({ volunteers: [] });
  }

  const supabase = createSupabaseAdminClient();

  // Split query into words — each word must match first or last name (handles "Michael Torres")
  const words = q.split(/\s+/).filter(Boolean);
  let nameQuery = supabase
    .from('users')
    .select('id, first_name, last_name, email, dogs!volunteer_id(dog_name)')
    .eq('role', 'volunteer')
    .eq('status', 'approved');
  for (const word of words) {
    nameQuery = nameQuery.or(`first_name.ilike.%${word}%,last_name.ilike.%${word}%`);
  }
  const { data: byName, error: nameErr } = await nameQuery
    .order('first_name', { ascending: true })
    .limit(20);

  if (nameErr) {
    console.error('[GET /api/admin/volunteers] Supabase error:', nameErr);
    return NextResponse.json({ error: 'Failed to fetch volunteers' }, { status: 500 });
  }

  // Also search by dog name and merge (deduplicated)
  const { data: byDog } = await supabase
    .from('dogs')
    .select('volunteer_id, dog_name, users!inner(id, first_name, last_name, email, status, role)')
    .ilike('dog_name', `%${q}%`)
    .eq('users.role', 'volunteer')
    .eq('users.status', 'approved')
    .limit(20);

  // Collect volunteer IDs from dog search not already in byName
  const nameIds = new Set((byName ?? []).map(u => u.id));
  const extraIds = [...new Set(
    (byDog ?? [])
      .map((d: any) => d.volunteer_id)
      .filter((id: string) => !nameIds.has(id))
  )];

  let extra: any[] = [];
  if (extraIds.length > 0) {
    const { data } = await supabase
      .from('users')
      .select('id, first_name, last_name, email, dogs!volunteer_id(dog_name)')
      .in('id', extraIds);
    extra = data ?? [];
  }

  const combined = [...(byName ?? []), ...extra];
  const volunteers = combined.map(u => ({
    id: u.id,
    first_name: u.first_name ?? '',
    last_name: u.last_name ?? '',
    email: u.email ?? '',
    dogs: (Array.isArray(u.dogs) ? u.dogs : u.dogs ? [u.dogs] : []).map((d: any) => ({ dog_name: d.dog_name ?? '' })),
  }));

  return NextResponse.json({ volunteers });
}
