// src/app/api/audience-categories/route.ts
import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/utils/supabase/server';

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();

    const { data, error } = await supabase
      .from('audience_categories')
      .select('*')
      .order('sort_order');

    if (error) {
      console.error('[Audience Categories API] Error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ categories: data });
  } catch (err) {
    console.error('[Audience Categories API] Server error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
} 