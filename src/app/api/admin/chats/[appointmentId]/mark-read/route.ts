import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createSupabaseAdminClient } from '@/utils/supabase/admin';

export async function POST(
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
      console.error('[Admin Mark Read API] User not admin:', { userId, role: user?.role, error: userError });
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    console.log('[Admin Mark Read API] Marking chat as read for appointment:', appointmentId);

    // Mark the chat as read
    const { error: updateError } = await supabase
      .from('appointment_chats')
      .update({ 
        unread_count: 0, 
        last_read_at: new Date().toISOString() 
      })
      .eq('appointment_id', appointmentId);

    if (updateError) {
      console.error('[Admin Mark Read API] Error marking chat as read:', updateError);
      return NextResponse.json({ error: 'Failed to mark chat as read' }, { status: 500 });
    }

    console.log('[Admin Mark Read API] Successfully marked chat as read');

    return NextResponse.json({ 
      success: true,
      message: 'Chat marked as read'
    });

  } catch (error) {
    console.error('[Admin Mark Read API] Error:', error);
    return NextResponse.json(
      { error: 'Failed to mark chat as read' },
      { status: 500 }
    );
  }
} 