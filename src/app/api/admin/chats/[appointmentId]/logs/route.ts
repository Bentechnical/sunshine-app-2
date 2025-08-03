import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createSupabaseAdminClient } from '@/utils/supabase/admin';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ appointmentId: string }> }
) {
  try {
    const { userId } = await auth();
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const resolvedParams = await params;
    const appointmentId = parseInt(resolvedParams.appointmentId);
    
    if (isNaN(appointmentId)) {
      return NextResponse.json({ error: 'Invalid appointment ID' }, { status: 400 });
    }

    // Use admin client to bypass RLS policies
    const supabase = createSupabaseAdminClient();

    // Check if user is admin
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('role')
      .eq('id', userId)
      .single();

    if (userError || user?.role !== 'admin') {
      console.error('[Admin Chat Logs API] User not admin:', { userId, role: user?.role, error: userError });
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    console.log('[Admin Chat Logs API] Fetching logs for appointment:', appointmentId);

    // Get chat logs for the appointment with user information
    const { data: logs, error: logsError } = await supabase
      .from('chat_logs')
      .select(`
        *,
        sender:users!chat_logs_sender_id_fkey (
          id,
          first_name,
          last_name,
          role
        )
      `)
      .eq('appointment_id', appointmentId)
      .order('created_at', { ascending: true });

    if (logsError) {
      console.error('[Admin Chat Logs API] Error fetching logs:', logsError);
      return NextResponse.json({ error: 'Failed to fetch chat logs' }, { status: 500 });
    }

    console.log('[Admin Chat Logs API] Found logs:', logs?.length || 0);

    return NextResponse.json({ 
      logs: logs || [],
      total: logs?.length || 0
    });

  } catch (error) {
    console.error('[Admin Chat Logs API] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch chat logs' },
      { status: 500 }
    );
  }
} 