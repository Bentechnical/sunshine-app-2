import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createAppointmentChat } from '@/utils/stream-chat';
import { createSupabaseAdminClient } from '@/utils/supabase/admin';

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

    // Use admin client to bypass RLS for server-side channel creation
    const supabase = createSupabaseAdminClient();

    // Get appointment details with user information
    const { data: appointment, error: appointmentError } = await supabase
      .from('appointments')
      .select(`
        *,
        individual:users!appointments_individual_id_fkey (
          id,
          first_name,
          last_name,
          bio,
          physical_address
        ),
        volunteer:users!appointments_volunteer_id_fkey (
          id,
          first_name,
          last_name
        )
      `)
      .eq('id', appointmentId)
      .single();

    if (appointmentError || !appointment) {
      console.error('[Chat Create API] Appointment not found for id', appointmentId, 'error:', appointmentError);
      return NextResponse.json({ error: 'Appointment not found' }, { status: 404 });
    }

    // Get dog details separately since the foreign key constraint doesn't exist
    const { data: dogData } = await supabase
      .from('dogs')
      .select('dog_name')
      .eq('volunteer_id', appointment.volunteer_id)
      .maybeSingle();

    // Check if appointment is confirmed
    if (appointment.status !== 'confirmed') {
      return NextResponse.json({ error: 'Appointment must be confirmed to create chat' }, { status: 400 });
    }

    // Check if chat already exists
    const { data: existingChat } = await supabase
      .from('appointment_chats')
      .select('id')
      .eq('appointment_id', appointmentId)
      .maybeSingle();

    if (existingChat) {
      return NextResponse.json({ error: 'Chat already exists for this appointment' }, { status: 409 });
    }

    // Create Stream Chat channel using the appointment's actual start/end times
    // (not the availability slot times, which may differ due to DST adjustments)
    const channel = await createAppointmentChat(
      appointmentId,
      (appointment as any).individual?.id || appointment.individual_id,
      (appointment as any).volunteer?.id || appointment.volunteer_id,
      {
        startTime: appointment.start_time,
        endTime: appointment.end_time,
        dogName: dogData?.dog_name || 'Unknown Dog',
        individualName: appointment.individual ? `${appointment.individual.first_name} ${appointment.individual.last_name}` : 'Individual',
        volunteerName: appointment.volunteer ? `${appointment.volunteer.first_name} ${appointment.volunteer.last_name}` : 'Volunteer',
        location: (appointment as any).individual?.physical_address || 'Location to be discussed',
        individualBio: (appointment as any).individual?.bio || ''
      }
    );

    // Store chat record in database
    const { error: insertError } = await supabase
      .from('appointment_chats')
      .insert({
        appointment_id: appointmentId,
        stream_channel_id: channel.cid,
        created_by: 'system'
      });

    if (insertError) {
      console.error('[Chat Create API] Database error:', insertError);
      return NextResponse.json({ error: 'Failed to save chat record' }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true, 
      channelId: channel.cid,
      message: 'Chat channel created successfully' 
    });

  } catch (error) {
    console.error('[Chat Create API] Error:', error);
    return NextResponse.json(
      { error: 'Failed to create chat channel' },
      { status: 500 }
    );
  }
} 