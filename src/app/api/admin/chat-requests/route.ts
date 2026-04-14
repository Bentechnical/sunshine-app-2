import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createSupabaseAdminClient } from '@/utils/supabase/admin';

export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = createSupabaseAdminClient();

    const { data: user, error: userError } = await supabase
      .from('users')
      .select('role')
      .eq('id', userId)
      .single();

    if (userError || user?.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    // Fetch all chat requests with participant and dog info
    const { data: requests, error } = await supabase
      .from('chat_requests')
      .select(`
        id,
        status,
        created_at,
        responded_at,
        channel_id,
        channel_created_at,
        channel_closed_at,
        last_message_at,
        message_count,
        unread_count_admin,
        dog_id,
        requester_id,
        recipient_id
      `)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[Admin Chat Requests API] Error fetching requests:', error);
      return NextResponse.json({ error: 'Failed to fetch chat requests' }, { status: 500 });
    }

    if (!requests || requests.length === 0) {
      return NextResponse.json({ requests: [] });
    }

    // Collect all unique user IDs and dog IDs
    const userIds = [...new Set([
      ...requests.map((r) => r.requester_id),
      ...requests.map((r) => r.recipient_id),
    ])];
    const dogIds = [...new Set(requests.map((r) => r.dog_id).filter(Boolean))];

    const [usersRes, dogsRes] = await Promise.all([
      supabase.from('users').select('id, first_name, last_name, role').in('id', userIds),
      dogIds.length > 0
        ? supabase.from('dogs').select('id, dog_name').in('id', dogIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    const usersMap = Object.fromEntries((usersRes.data ?? []).map((u) => [u.id, u]));
    const dogsMap = Object.fromEntries((dogsRes.data ?? []).map((d) => [d.id, d]));

    const enriched = requests.map((req) => ({
      ...req,
      requester: usersMap[req.requester_id] ?? { id: req.requester_id, first_name: 'Unknown', last_name: '', role: '' },
      recipient: usersMap[req.recipient_id] ?? { id: req.recipient_id, first_name: 'Unknown', last_name: '', role: '' },
      dog: req.dog_id ? dogsMap[req.dog_id] ?? { id: req.dog_id, dog_name: 'Unknown Dog' } : null,
    }));

    return NextResponse.json({ requests: enriched });
  } catch (error) {
    console.error('[Admin Chat Requests API] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
