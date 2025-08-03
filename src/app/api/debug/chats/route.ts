import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
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

    // Check appointments for this user (with RLS)
    const { data: appointments, error: appointmentsError } = await supabase
      .from('appointments')
      .select('*')
      .or(`individual_id.eq.${userId},volunteer_id.eq.${userId}`);

    // Check ALL appointments to see what exists (without RLS - admin client)
    const { data: allAppointments, error: allAppointmentsError } = await supabaseAdmin
      .from('appointments')
      .select('*')
      .limit(10);

    // Check appointments for this user (without RLS - admin client)
    const { data: adminAppointments, error: adminAppointmentsError } = await supabaseAdmin
      .from('appointments')
      .select('*')
      .or(`individual_id.eq.${userId},volunteer_id.eq.${userId}`);

    // Check appointment_chats
    const { data: appointmentChats, error: chatsError } = await supabase
      .from('appointment_chats')
      .select('*');

    // Check chat_logs
    const { data: chatLogs, error: logsError } = await supabase
      .from('chat_logs')
      .select('*');

    return NextResponse.json({
      userId,
      appointments: {
        data: appointments,
        error: appointmentsError,
        count: appointments?.length || 0
      },
      allAppointments: {
        data: allAppointments,
        error: allAppointmentsError,
        count: allAppointments?.length || 0
      },
      adminAppointments: {
        data: adminAppointments,
        error: adminAppointmentsError,
        count: adminAppointments?.length || 0
      },
      appointmentChats: {
        data: appointmentChats,
        error: chatsError,
        count: appointmentChats?.length || 0
      },
      chatLogs: {
        data: chatLogs,
        error: logsError,
        count: chatLogs?.length || 0
      }
    });

  } catch (error) {
    console.error('[Debug Chats API] Error:', error);
    return NextResponse.json(
      { error: 'Failed to debug chats' },
      { status: 500 }
    );
  }
} 