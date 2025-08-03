import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createSupabaseAdminClient } from '@/utils/supabase/admin';
import { closeAppointmentChat } from '@/utils/stream-chat';

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { appointmentId } = await request.json();
    
    if (!appointmentId) {
      return NextResponse.json({ error: 'Missing appointmentId' }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();

    // Check if there's an active chat for this appointment
    const { data: chat, error: chatError } = await supabase
      .from('appointment_chats')
      .select('*')
      .eq('appointment_id', appointmentId)
      .eq('status', 'active')
      .single();

    if (chatError && chatError.code !== 'PGRST116') { // PGRST116 = no rows returned
      console.error('[Chat Close API] Error fetching chat:', chatError);
      return NextResponse.json({ error: 'Failed to fetch chat' }, { status: 500 });
    }

    if (!chat) {
      // No active chat found, that's okay
      return NextResponse.json({ success: true, message: 'No active chat found' });
    }

    console.log('[Chat Close API] Closing chat for appointment:', appointmentId);

    // Close the Stream Chat channel
    await closeAppointmentChat(appointmentId);

    // Update the database record
    const { error: updateError } = await supabase
      .from('appointment_chats')
      .update({ 
        status: 'closed',
        closed_at: new Date().toISOString()
      })
      .eq('id', chat.id);

    if (updateError) {
      console.error('[Chat Close API] Error updating chat status:', updateError);
      return NextResponse.json({ error: 'Failed to update chat status' }, { status: 500 });
    }

    console.log('[Chat Close API] Chat closed successfully');

    return NextResponse.json({ 
      success: true, 
      message: 'Chat closed successfully' 
    });

  } catch (error) {
    console.error('[Chat Close API] Error:', error);
    return NextResponse.json(
      { error: 'Failed to close chat' },
      { status: 500 }
    );
  }
} 