// src/app/api/admin/archive-user/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/utils/supabase/admin';
import { sendTransactionalEmail } from '@/app/utils/mailer';
import { formatAppointmentTime } from '@/utils/dateFormat';
import { closeAppointmentChat } from '@/utils/stream-chat';

interface ActiveAppointment {
  id: number;
  start_time: string;
  end_time: string;
  status: 'pending' | 'confirmed';
  other_user_id: string;
  other_user_name: string;
  other_user_email: string;
  dog_name?: string;
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createSupabaseAdminClient();
    const body = await req.json();

    console.log('[archive-user] Incoming body:', body);

    const { user_id, confirmed } = body;

    if (!user_id) {
      console.error('[archive-user] Missing user_id');
      return NextResponse.json({ error: 'Missing user_id' }, { status: 400 });
    }

    // Fetch user details
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, first_name, last_name, email, role, status')
      .eq('id', user_id)
      .single();

    if (userError || !user) {
      console.error('[archive-user] Failed to fetch user:', userError?.message);
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Check if user is already archived
    if (user.status === 'archived') {
      return NextResponse.json({ error: 'User is already archived' }, { status: 400 });
    }

    // Check for active appointments (pending or confirmed)
    const { data: appointments, error: appointmentsError } = await supabase
      .from('appointments')
      .select(`
        id,
        start_time,
        end_time,
        status,
        individual_id,
        volunteer_id
      `)
      .or(`individual_id.eq.${user_id},volunteer_id.eq.${user_id}`)
      .in('status', ['pending', 'confirmed']);

    if (appointmentsError) {
      console.error('[archive-user] Failed to fetch appointments:', appointmentsError.message);
      return NextResponse.json({ error: 'Failed to check appointments' }, { status: 500 });
    }

    // If there are active appointments and not confirmed yet, return them
    if (appointments && appointments.length > 0 && !confirmed) {
      console.log(`[archive-user] Found ${appointments.length} active appointments`);

      // Fetch other user details for each appointment
      const activeAppointments: ActiveAppointment[] = await Promise.all(
        appointments.map(async (appt) => {
          const otherUserId = appt.individual_id === user_id ? appt.volunteer_id : appt.individual_id;

          const { data: otherUser } = await supabase
            .from('users')
            .select('first_name, last_name, email')
            .eq('id', otherUserId)
            .single();

          // If user is volunteer, get dog name
          let dogName: string | undefined;
          if (user.role === 'volunteer') {
            const { data: dog } = await supabase
              .from('dogs')
              .select('dog_name')
              .eq('volunteer_id', user_id)
              .single();
            dogName = dog?.dog_name;
          } else {
            // If user is individual, get volunteer's dog name
            const { data: dog } = await supabase
              .from('dogs')
              .select('dog_name')
              .eq('volunteer_id', appt.volunteer_id)
              .single();
            dogName = dog?.dog_name;
          }

          return {
            id: appt.id,
            start_time: appt.start_time,
            end_time: appt.end_time,
            status: appt.status as 'pending' | 'confirmed',
            other_user_id: otherUserId,
            other_user_name: otherUser ? `${otherUser.first_name} ${otherUser.last_name}` : 'Unknown User',
            other_user_email: otherUser?.email || '',
            dog_name: dogName,
          };
        })
      );

      return NextResponse.json({
        success: false,
        requires_confirmation: true,
        active_appointments: activeAppointments,
      });
    }

    // If confirmed or no active appointments, proceed with archiving
    console.log('[archive-user] Proceeding with archive');

    // Step 1: Cancel all active appointments
    if (appointments && appointments.length > 0) {
      console.log(`[archive-user] Canceling ${appointments.length} appointments`);

      for (const appt of appointments) {
        // Update appointment status
        const { error: cancelError } = await supabase
          .from('appointments')
          .update({
            status: 'canceled',
            cancellation_reason: 'Canceled by Sunshine Administrator',
          })
          .eq('id', appt.id);

        if (cancelError) {
          console.error(`[archive-user] Failed to cancel appointment ${appt.id}:`, cancelError.message);
          continue;
        }

        // Close associated chat
        try {
          await closeAppointmentChat(appt.id);
          console.log(`[archive-user] Closed chat for appointment ${appt.id}`);
        } catch (chatError) {
          console.error(`[archive-user] Failed to close chat for appointment ${appt.id}:`, chatError);
        }

        // Send cancellation email to the other party
        const otherUserId = appt.individual_id === user_id ? appt.volunteer_id : appt.individual_id;

        const { data: otherUser } = await supabase
          .from('users')
          .select('first_name, last_name, email')
          .eq('id', otherUserId)
          .single();

        if (otherUser) {
          const appointmentTime = formatAppointmentTime(new Date(appt.start_time));

          // Determine if other user is individual or volunteer
          const isOtherUserIndividual = otherUserId === appt.individual_id;
          const templateName = isOtherUserIndividual ? 'appointmentCanceledIndividual' : 'appointmentCanceledVolunteer';

          // Get dog name for individual cancellation email
          let dogName = 'N/A';
          if (isOtherUserIndividual && user.role === 'volunteer') {
            const { data: dog } = await supabase
              .from('dogs')
              .select('dog_name')
              .eq('volunteer_id', user.id)
              .single();
            dogName = dog?.dog_name || 'N/A';
          }

          try {
            await sendTransactionalEmail({
              to: otherUser.email,
              subject: 'Appointment Canceled',
              templateName,
              data: {
                firstName: otherUser.first_name,
                appointmentTime,
                dogName,
                cancellationReason: 'Canceled by Sunshine Administrator',
                year: new Date().getFullYear(),
              },
            });
            console.log(`[archive-user] Sent cancellation email to ${otherUser.email}`);
          } catch (emailError) {
            console.error(`[archive-user] Failed to send cancellation email:`, emailError);
          }
        }
      }
    }

    // Step 2: Cancel all pending email notifications
    const { error: notificationsError } = await supabase
      .from('pending_email_notifications')
      .update({ status: 'canceled' })
      .eq('user_id', user_id)
      .eq('status', 'pending');

    if (notificationsError) {
      console.error('[archive-user] Failed to cancel notifications:', notificationsError.message);
      // Continue anyway, this is not critical
    }

    // Step 3: Archive the user
    const { error: archiveError } = await supabase
      .from('users')
      .update({
        status: 'archived',
        archived_at: new Date().toISOString(),
      })
      .eq('id', user_id);

    if (archiveError) {
      console.error('[archive-user] Failed to archive user:', archiveError.message);
      return NextResponse.json({ error: archiveError.message }, { status: 500 });
    }

    // Step 4: If volunteer, archive their dog too
    if (user.role === 'volunteer') {
      const { error: dogError } = await supabase
        .from('dogs')
        .update({ status: 'archived' })
        .eq('volunteer_id', user_id);

      if (dogError) {
        console.error('[archive-user] Failed to archive dog:', dogError.message);
        // Continue anyway, user is archived
      }
    }

    console.log(`[archive-user] Successfully archived user ${user_id}`);

    return NextResponse.json({
      success: true,
      canceled_appointments_count: appointments?.length || 0,
    });
  } catch (err: any) {
    console.error('[archive-user] Unexpected error:', err.message);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
