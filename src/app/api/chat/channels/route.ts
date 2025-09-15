import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getUserChats } from '@/utils/stream-chat';
import { createSupabaseServerClient } from '@/utils/supabase/server';
import { createSupabaseAdminClient } from '@/utils/supabase/admin';

export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await createSupabaseServerClient();
    const supabaseAdmin = createSupabaseAdminClient();
    const isDev = process.env.NODE_ENV !== 'production';
    if (isDev) console.log('[Chat Channels API] Fetching appointments for user:', userId);
    
    // Get user's active appointments with chat information (using admin client to bypass RLS)
    // Note: We still filter by user ID in the query for security
    const { data: appointments, error: appointmentsError } = await supabaseAdmin
      .from('appointments')
      .select(`
        id,
        status,
        start_time,
        end_time,
        volunteer_id,
        individual:users!appointments_individual_id_fkey (
          id,
          first_name,
          last_name,
          profile_image
        ),
        volunteer:users!appointments_volunteer_id_fkey (
          id,
          first_name,
          last_name,
          profile_image
        ),
        chat:appointment_chats (
          id,
          stream_channel_id,
          status
        )
      `)
      .or(`individual_id.eq.${userId},volunteer_id.eq.${userId}`)
      .eq('status', 'confirmed')
      .gte('start_time', new Date().toISOString()) // Restored date filter
      .order('start_time', { ascending: true });

    if (isDev) {
      console.log('[Chat Channels API] Raw appointments:', appointments);
      console.log('[Chat Channels API] Appointments error:', appointmentsError);
    }

    if (appointmentsError) {
      console.error('[Chat Channels API] Error fetching appointments:', appointmentsError);
      return NextResponse.json({ error: 'Failed to fetch appointments' }, { status: 500 });
    }

    // Filter appointments that have active chats
    if (isDev) {
      console.log('[Chat Channels API] Filtering appointments...');
      appointments?.forEach(appointment => {
        console.log(`[Chat Channels API] Appointment ${appointment.id}:`, {
          hasChat: !!appointment.chat,
          chatLength: appointment.chat?.length || 0,
          chatStatus: appointment.chat?.[0]?.status,
          startTime: appointment.start_time,
          status: appointment.status
        });
      });
    }
    
    const appointmentsWithChats = appointments?.filter(appointment => 
      appointment.chat && appointment.chat.length > 0 && appointment.chat[0].status === 'active'
    ) || [];

    if (isDev) console.log('[Chat Channels API] Appointments with chats:', appointmentsWithChats);

    // Get Stream Chat channels for these appointments
    const channels = await getUserChats(userId);
    if (isDev) console.log('[Chat Channels API] Stream Chat channels:', channels);
    
    // Combine appointment data with Stream Chat data
    const chatData = await Promise.all(appointmentsWithChats.map(async (appointment) => {
      const channel = channels.find(ch => 
        (ch.data as any)?.appointment_id === appointment.id
      );
      
      // Handle the case where joined data might be arrays
      const individual = Array.isArray(appointment.individual) ? appointment.individual[0] : appointment.individual;
      const volunteer = Array.isArray(appointment.volunteer) ? appointment.volunteer[0] : appointment.volunteer;
      
      // Fetch dog information separately
      let dogName = 'Unknown Dog';
      let dogImage = null;
      if (appointment.volunteer_id) {
        const { data: dogs } = await supabaseAdmin
          .from('dogs')
          .select('dog_name, dog_picture_url')
          .eq('volunteer_id', appointment.volunteer_id)
          .limit(1);
        
        if (dogs && dogs.length > 0) {
          dogName = dogs[0].dog_name;
          dogImage = dogs[0].dog_picture_url;
        }
      }
      
      const otherUser = individual?.id === userId 
        ? volunteer 
        : individual;

      return {
        appointmentId: appointment.id,
        channelId: appointment.chat?.[0]?.stream_channel_id,
        appointmentTime: appointment.start_time,
        dogName: dogName,
        dogImage: dogImage,
        otherUserName: otherUser?.first_name || 'User',
        otherUserImage: otherUser?.profile_image,
        unreadCount: 0, // Always return 0 for non-admin users
        isActive: appointment.chat?.[0]?.status === 'active'
      };
    }));

    return NextResponse.json({ 
      chats: chatData,
      total: chatData.length
    });

  } catch (error) {
    console.error('[Chat Channels API] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch chat channels' },
      { status: 500 }
    );
  }
} 