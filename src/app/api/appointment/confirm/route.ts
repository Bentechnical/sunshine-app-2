// app/api/appointment/confirm/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/utils/supabase/server';
import { sendTransactionalEmail } from '../../../utils/mailer';
import { getAppUrl } from '@/app/utils/getAppUrl';

export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const { appointmentId } = await req.json();

    if (!appointmentId) {
      return NextResponse.json(
        { success: false, error: 'Missing appointmentId.' },
        { status: 400 }
      );
    }

    const { data: appointment, error: apptError } = await supabase
      .from('appointments')
      .select('start_time, individual_id, volunteer_id')
      .eq('id', appointmentId)
      .single();

    if (apptError || !appointment) {
      console.error('Error fetching appointment:', apptError);
      throw new Error('Could not fetch appointment details.');
    }

    const { data: individual, error: individualError } = await supabase
      .from('users')
      .select('first_name, email')
      .eq('id', appointment.individual_id)
      .single();

    if (individualError || !individual) {
      console.error('Error fetching individual:', individualError);
      throw new Error('Could not fetch individual details.');
    }

    const { data: volunteer, error: volunteerError } = await supabase
      .from('users')
      .select('first_name, email')
      .eq('id', appointment.volunteer_id)
      .single();

    if (volunteerError || !volunteer) {
      console.error('Error fetching volunteer:', volunteerError);
      throw new Error('Could not fetch volunteer details.');
    }

    const { data: dogs, error: dogsError } = await supabase
      .from('dogs')
      .select('id, dog_name, dog_breed, dog_age')
      .eq('volunteer_id', appointment.volunteer_id);

    if (dogsError) {
      console.error('Error fetching dogs:', dogsError);
    }

    const dogData = dogs && dogs.length > 0 ? dogs[0] : null;
    if (!dogData) {
      console.warn(`No dog found for volunteer_id: ${appointment.volunteer_id}`);
    }

    const appointmentTime = new Date(appointment.start_time).toLocaleString();

    const individualEmailData = {
      appointmentTime,
      dogName: dogData?.dog_name || 'N/A',
      dogBreed: dogData?.dog_breed || 'N/A',
      dogAge: dogData?.dog_age || 'N/A',
      volunteerName: volunteer.first_name,
      year: new Date().getFullYear(),
    };

    const volunteerEmailData = {
      appointmentTime,
      dogName: dogData?.dog_name || 'N/A',
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
