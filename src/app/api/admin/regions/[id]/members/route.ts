// src/app/api/admin/regions/[id]/members/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/utils/supabase/admin';
import { requireAdminOrPd } from '@/utils/requireAdminOrPd';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const check = await requireAdminOrPd();
  if ('error' in check) return check.error;

  const { id } = await params;
  const regionId = parseInt(id, 10);
  if (isNaN(regionId)) return NextResponse.json({ error: 'Invalid region id' }, { status: 400 });

  const supabase = createSupabaseAdminClient();

  try {
    const { data, error } = await supabase
      .from('users')
      .select('id, first_name, last_name, email, city, postal_code, role, region_assignment_method, status')
      .eq('assigned_region_id', regionId)
      .in('role', ['volunteer', 'organization'])
      .order('last_name');

    if (error) {
      console.error('[regions/members GET] Error:', error.message);
      return NextResponse.json({ error: 'Failed to fetch members' }, { status: 500 });
    }

    const volunteers = (data ?? []).filter(u => u.role === 'volunteer');
    const organizations = (data ?? []).filter(u => u.role === 'organization');

    return NextResponse.json({ volunteers, organizations });
  } catch (err: any) {
    console.error('[regions/members GET] Unexpected error:', err.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
