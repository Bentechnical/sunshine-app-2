import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/utils/supabase/client';
import { sendTransactionalEmail } from '../../../utils/mailer';

export async function POST(req: NextRequest) {
  try {
    const { appointmentId, cancellationReason } = await req.json();
    if (!appointmentId || cancellationReason === undefined) {
      return NextResponse.json({ success: false, error: 'Missing appointmentId or cancellationReason.' }, { status: 400 });
    }
    
    // Fetch appointment details
    const { data: appointment, error: apptError } = await supabase
      .from('appointments')
      .select('start_time, individual_id, volunteer_id')
      .eq('id', appointmentId)
      .single();
    if (apptError || !appointment) {
      console.error('Error fetching appointment:', apptError);
      throw new Error('Could not fetch appointment details.');
    }
    
    // Fetch individual details
    const { data: individual, error: individualError } = await supabase
      .from('users')
      .select('first_name, email')
      .eq('id', appointment.individual_id)
      .single();
    if (individualError || !individual) {
      console.error('Error fetching individual:', individualError);
      throw new Error('Could not fetch individual details.');
    }
    
    // Fetch volunteer details
    const { data: volunteer, error: volunteerError } = await supabase
      .from('users')
      .select('first_name, email')
      .eq('id', appointment.volunteer_id)
      .single();
    if (volunteerError || !volunteer) {
      console.error('Error fetching volunteer:', volunteerError);
      throw new Error('Could not fetch volunteer details.');
    }
    
    // Fetch dog's info by using the volunteer_id
    const { data: dogs, error: dogsError } = await supabase
      .from('dogs')
      .select('id, dog_name, dog_breed, dog_age')
      .eq('volunteer_id', appointment.volunteer_id);
    if (dogsError) {
      console.error('Error fetching dogs:', dogsError);
    }
    const dogData = dogs && dogs.length > 0 ? dogs[0] : null;
    
    const appointmentTime = new Date(appointment.start_time).toLocaleString();

    // Build email data for the individual.
    const individualEmailData = {
      appointmentTime,
      dogName: dogData ? dogData.dog_name : 'N/A',
      cancellationReason,
      year: new Date().getFullYear(),
    };

    // Build email data for the volunteer.
    const volunteerEmailData = {
      appointmentTime,
      dogName: dogData ? dogData.dog_name : 'N/A',
      cancellationReason,
      year: new Date().getFullYear(),
    };

    // Send cancellation email to the individual.
    const emailResponseIndividual = await sendTransactionalEmail({
      to: individual.email,
      subject: 'Your Appointment has been Canceled',
      templateName: 'appointmentCanceledIndividual',
      data: individualEmailData,
    });

    // Send cancellation email to the volunteer.
    const emailResponseVolunteer = await sendTransactionalEmail({
      to: volunteer.email,
      subject: 'Appointment Canceled',
      templateName: 'appointmentCanceledVolunteer',
      data: volunteerEmailData,
    });

    return NextResponse.json({
      success: true,
      individualResponse: emailResponseIndividual,
      volunteerResponse: emailResponseVolunteer,
    });
  } catch (error: unknown) {
    let errorMessage = 'An unknown error occurred';
    if (error instanceof Error) errorMessage = error.message;
    console.error('Error in /api/appointment/cancel:', errorMessage);
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}
