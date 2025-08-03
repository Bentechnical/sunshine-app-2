import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createSupabaseServerClient } from '@/utils/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { appointmentId } = await request.json();
    
    if (!appointmentId) {
      return NextResponse.json({ error: 'Appointment ID is required' }, { status: 400 });
    }

    const supabase = await createSupabaseServerClient();

    // Update or insert the user's read status for this appointment
    const { error: upsertError } = await supabase
      .from('message_read_status')
      .upsert({
        user_id: userId,
        appointment_id: appointmentId,
        last_read_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id,appointment_id'
      });

    if (upsertError) {
      console.error('[Mark Read API] Error updating read status:', upsertError);
      return NextResponse.json({ error: 'Failed to mark as read' }, { status: 500 });
    }

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('[Mark Read API] Error:', error);
    return NextResponse.json(
      { error: 'Failed to mark as read' },
      { status: 500 }
    );
  }
} 