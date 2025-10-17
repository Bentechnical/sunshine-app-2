//src/app/api/appointment/confirm/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/utils/supabase/admin';
import { sendTransactionalEmail } from '../../../utils/mailer';
import { getAppUrl } from '@/app/utils/getAppUrl';
import { createAppointmentChat } from '@/utils/stream-chat';
import { formatAppointmentTime } from '@/utils/dateFormat';

export async function POST(req: NextRequest) {
  try {
    const supabase = createSupabaseAdminClient();

    const { appointmentId } = await req.json();

    if (!appointmentId) {
      return NextResponse.json(
        { success: false, error: 'Missing appointmentId.' },
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

    const { data: individual, error: individualError } = await supabase
      .from('users')
      .select('first_name, last_name, email')
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
      .select('first_name, last_name, email')
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
      dogBreed: dogData?.dog_breed || 'N/A',
      dogAge: dogData?.dog_age || 'N/A',
      firstName: individual.first_name,
      volunteerName: volunteer.first_name,
      year: new Date().getFullYear(),
    };

    const volunteerEmailData = {
      appointmentTime,
      dogName: dogData?.dog_name || 'N/A',
      firstName: volunteer.first_name,
      individualName: individual.first_name,
      dashboardLink: `${getAppUrl()}/dashboard`,
      year: new Date().getFullYear(),
    };

    const emailResponseIndividual = await sendTransactionalEmail({
      to: individual.email,
      subject: 'Your Appointment is Confirmed',
      templateName: 'appointmentConfirmedIndividual',
      data: individualEmailData,
    });

    const emailResponseVolunteer = await sendTransactionalEmail({
      to: volunteer.email,
      subject: 'Appointment Confirmed',
      templateName: 'appointmentConfirmedVolunteer',
      data: volunteerEmailData,
    });

    // Create chat channel for the appointment
    try {
      const isDev = process.env.NODE_ENV !== 'production';
      if (isDev) console.log('[Chat Creation] Starting chat creation for appointment:', appointmentId);
      
      // First, check if chat already exists
      const { data: existingChat } = await supabase
        .from('appointment_chats')
        .select('id')
        .eq('appointment_id', appointmentId)
        .single();

      if (existingChat) {
        if (isDev) console.log('[Chat Creation] Chat already exists for appointment:', appointmentId);
        return NextResponse.json({
          success: true,
          individualResponse: emailResponseIndividual,
          volunteerResponse: emailResponseVolunteer,
        });
      }

      // Get appointment details for chat creation
      // Handle both text and integer availability_id for backward compatibility
      const availabilityId = parseInt(appointment.availability_id as string);
      const { data: availability } = await supabase
        .from('appointment_availability')
        .select('start_time, end_time')
        .eq('id', availabilityId)
        .single();

      const { data: dog } = await supabase
        .from('dogs')
        .select('dog_name')
        .eq('volunteer_id', appointment.volunteer_id)
        .single();

      if (isDev) {
        console.log('[Chat Creation] Availability:', availability);
        console.log('[Chat Creation] Dog:', dog);
      }

      if (!availability || !dog) {
        console.error('[Chat Creation] Missing required data for chat creation');
        throw new Error('Missing availability or dog data for chat creation');
      }

      if (isDev) console.log('[Chat Creation] Creating Stream Chat channel...');
      
      // Create the Stream Chat channel
      const channel = await createAppointmentChat(
        appointmentId,
        appointment.individual_id,
        appointment.volunteer_id,
        {
          startTime: availability.start_time,
          endTime: availability.end_time,
          dogName: dog.dog_name,
          individualName: `${individual.first_name} ${individual.last_name}`,
          volunteerName: `${volunteer.first_name} ${volunteer.last_name}`,
          location: 'Location to be discussed' // This could be enhanced later
        }
      );

      if (isDev) console.log('[Chat Creation] Stream Chat channel created, storing in database...');

      // Store chat record in database
      const { error: insertError } = await supabase
        .from('appointment_chats')
        .insert({
          appointment_id: appointmentId,
          stream_channel_id: channel.cid,
          created_by: 'system'
        });

      if (insertError) {
        console.error('[Chat Creation] Database insert error:', insertError);
        throw new Error(`Failed to save chat record: ${insertError.message}`);
      } else {
        if (isDev) console.log('[Chat Creation] Chat record stored successfully');
      }
    } catch (chatError) {
      console.error('Error creating chat channel:', chatError);
      // Don't fail the entire request if chat creation fails, but log the error
    }

    return NextResponse.json({
      success: true,
      individualResponse: emailResponseIndividual,
      volunteerResponse: emailResponseVolunteer,
    });
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : 'An unknown error occurred';

    console.error('Error in /api/appointment/confirm:', errorMessage);
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}
