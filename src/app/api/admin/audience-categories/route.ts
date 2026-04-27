// src/app/api/admin/audience-categories/route.ts
import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/utils/supabase/admin';
import { requireAdmin } from '@/utils/requireAdmin';

export async function GET() {
  const check = await requireAdmin();
  if ('error' in check) return check.error;

  const supabase = createSupabaseAdminClient();

  const { data, error } = await supabase
    .from('audience_categories')
    .select('*')
    .order('sort_order');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ categories: data });
}
