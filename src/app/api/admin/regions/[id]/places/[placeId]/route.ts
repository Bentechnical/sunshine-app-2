// src/app/api/admin/regions/[id]/places/[placeId]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/utils/supabase/admin';
import { requireAdminOrPd } from '@/utils/requireAdminOrPd';

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; placeId: string }> }
) {
  const check = await requireAdminOrPd();
  if ('error' in check) return check.error;

  const { id, placeId } = await params;
  const regionId = parseInt(id, 10);
  const placeRowId = parseInt(placeId, 10);

  if (isNaN(regionId) || isNaN(placeRowId)) {
    return NextResponse.json({ error: 'Invalid region or place id' }, { status: 400 });
  }

  try {
    const supabase = createSupabaseAdminClient();

    const { error } = await supabase
      .from('pd_region_places')
      .delete()
      .eq('id', placeRowId)
      .eq('region_id', regionId);

    if (error) {
      console.error('[regions/places DELETE] Error:', error.message);
      return NextResponse.json({ error: 'Failed to remove place' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[regions/places DELETE] Unexpected error:', err.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
