// src/app/api/admin/incomplete-signups/route.ts
import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/utils/supabase/admin';
import { requireAdminOrPd } from '@/utils/requireAdminOrPd';

export async function GET() {
  const check = await requireAdminOrPd();
  if ('error' in check) return check.error;

  const supabase = createSupabaseAdminClient();

  const { data, error } = await supabase
    .from('users')
    .select('id, first_name, last_name, email, role, created_at')
    .eq('profile_complete', false)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ users: data });
}
