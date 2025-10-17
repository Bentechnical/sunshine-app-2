// src/app/api/appointment/cancel/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/utils/supabase/admin';
import { sendTransactionalEmail } from '../../../utils/mailer';
import { closeAppointmentChat } from '@/utils/stream-chat';
import { formatAppointmentTime } from '@/utils/dateFormat';

export async function POST(req: NextRequest) {
  try {
    const supabase = createSupabaseAdminClient();
    const { appointmentId, cancellationReason } = await req.json();

    if (!appointmentId || cancellationReason === undefined) {
      return NextResponse.json(
        { success: false, error: 'Missing appointmentId or cancellationReason.' },
        { status: 400 }
      );
    }

    const { data: appointment, error: apptError } = await supabase
      .from('appointments')
      .select('start_time, individual_id, volunteer_id, availability_id')
      .eq('id', appointmentId)
      .maybeSingle();

    if (apptError) {
      console.error('Error fetching appointment:', apptError);
      throw new Error('Could not fetch appointment details.');
    }
    if (!appointment) {
      return NextResponse.json(
        { success: false, error: 'Appointment not found.' },
        { status: 404 }
      );
    }

    // ✅ Unhide availability slot
    if (!appointment.availability_id) {
      console.warn('No availability_id on appointment; skipping unhide.');
    } else {
      const { error: unhideError } = await supabase
        .from('appointment_availability')
        .update({ is_hidden: false })
        .eq('id', appointment.availability_id);

      if (unhideError) {
        console.error('Error unhiding availability slot:', unhideError);
      }
    }

    const { data: individual, error: individualError } = await supabase
      .from('users')
      .select('first_name, email')
      .eq('id', appointment.individual_id)
      .maybeSingle();

    if (individualError) {
      console.error('Error fetching individual:', individualError);
      throw new Error('Could not fetch individual details.');
    }
    if (!individual) {
      return NextResponse.json(
        { success: false, error: 'Individual user not found.' },
        { status: 404 }
      );
    }

    const { data: volunteer, error: volunteerError } = await supabase
      .from('users')
      .select('first_name, email')
      .eq('id', appointment.volunteer_id)
      .maybeSingle();

    if (volunteerError) {
      console.error('Error fetching volunteer:', volunteerError);
      throw new Error('Could not fetch volunteer details.');
    }
    if (!volunteer) {
      return NextResponse.json(
        { success: false, error: 'Volunteer user not found.' },
        { status: 404 }
      );
    }

    const { data: dogs, error: dogsError } = await supabase
      .from('dogs')
      .select('id, dog_name, dog_breed, dog_age')
      .eq('volunteer_id', appointment.volunteer_id);

    if (dogsError) {
      console.error('Error fetching dogs:', dogsError);
    }

    const dogData = dogs?.[0] ?? null;
    const appointmentTime = formatAppointmentTime(new Date(appointment.start_time));

    const individualEmailData = {
      appointmentTime,
      dogName: dogData?.dog_name || 'N/A',
      cancellationReason,
      firstName: individual.first_name,
      year: new Date().getFullYear(),
    };

    const volunteerEmailData = {
      appointmentTime,
      dogName: dogData?.dog_name || 'N/A',
      cancellationReason,
      firstName: volunteer.first_name,
      year: new Date().getFullYear(),
    };

    const emailResponseIndividual = await sendTransactionalEmail({
      to: individual.email,
      subject: 'Your Appointment has been Canceled',
      templateName: 'appointmentCanceledIndividual',
      data: individualEmailData,
    });

    const emailResponseVolunteer = await sendTransactionalEmail({
      to: volunteer.email,
      subject: 'Appointment Canceled',
      templateName: 'appointmentCanceledVolunteer',
      data: volunteerEmailData,
    });

    // Close the chat channel if it exists
    try {
      console.log('[Appointment Cancel] Closing chat for appointment:', appointmentId);
      
      // Close the Stream Chat channel
      await closeAppointmentChat(appointmentId);
      
      // Update the database record
      const { error: updateError } = await supabase
        .from('appointment_chats')
        .update({ 
          status: 'closed',
          closed_at: new Date().toISOString()
        })
        .eq('appointment_id', appointmentId);
      
      if (updateError) {
        console.error('[Appointment Cancel] Error updating chat status:', updateError);
      } else {
        console.log('[Appointment Cancel] Chat closed successfully');
      }
    } catch (chatError) {
      console.error('[Appointment Cancel] Error closing chat:', chatError);
      // Don't fail the entire request if chat closing fails
    }

    // Update appointment status to canceled
    const { error: statusError } = await supabase
      .from('appointments')
      .update({ 
        status: 'canceled',
        cancellation_reason: cancellationReason,
        updated_at: new Date().toISOString()
      })
      .eq('id', appointmentId);

    if (statusError) {
      console.error('[Appointment Cancel] Error updating appointment status:', statusError);
      throw new Error('Could not update appointment status.');
    }

    return NextResponse.json({
      success: true,
      individualResponse: emailResponseIndividual,
      volunteerResponse: emailResponseVolunteer,
    });
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : 'An unknown error occurred';
    console.error('Error in /api/appointment/cancel:', errorMessage);
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}
