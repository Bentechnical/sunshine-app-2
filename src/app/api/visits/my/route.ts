// GET /api/visits/my
// Organization users retrieve their own submitted visit requests.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createSupabaseAdminClient } from '@/utils/supabase/admin';

export async function GET(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createSupabaseAdminClient();

    // Verify caller is an organization
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('role')
      .eq('id', userId)
      .single();

    if (userError || user?.role !== 'organization') {
      return NextResponse.json({ error: 'Organization account required' }, { status: 403 });
    }

    const { data: visits, error } = await supabase
      .from('visits')
      .select(`
        id, title, visit_date, start_time, end_time, address,
        volunteer_slots, status, admin_note, created_at,
        visit_registrations(count)
      `)
      .eq('organization_id', userId)
      .order('visit_date', { ascending: true });

    if (error) {
      console.error('[GET /api/visits/my] Supabase error:', error);
      return NextResponse.json({ error: 'Failed to fetch visits' }, { status: 500 });
    }

    return NextResponse.json({ visits });
  } catch (err: any) {
    console.error('[GET /api/visits/my] Unexpected error:', err.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
