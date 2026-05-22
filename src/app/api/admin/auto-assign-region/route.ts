// src/app/api/admin/auto-assign-region/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { requireAdminOrPd } from '@/utils/requireAdminOrPd';
import { autoAssignRegion } from '@/utils/autoAssignRegion';

export async function POST(req: NextRequest) {
  const check = await requireAdminOrPd();
  if ('error' in check) return check.error;

  try {
    const { user_id } = await req.json();
    if (!user_id) return NextResponse.json({ error: 'user_id is required' }, { status: 400 });

    const result = await autoAssignRegion(user_id);
    return NextResponse.json(result);
  } catch (err: any) {
    console.error('[auto-assign-region] Unexpected error:', err.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
