// src/app/api/request/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/utils/supabase/server';
import { sendTransactionalEmail } from '../../utils/mailer';
import { getAppUrl } from '@/app/utils/getAppUrl';

export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const { type, requestId, dogId } = await req.json();

    if (!type || !requestId || !dogId) {
      return NextResponse.json(
        { success: false, error: 'Missing type, requestId, or dogId.' },
        { status: 400 }
      );
    }

    // --- Fetch appointment ---
    const { data: appointment, error: apptError } = await supabase
      .from('appointments')
      .select('start_time, individual_id, volunteer_id')
      .eq('id', requestId)
      .maybeSingle();

    if (apptError) {
      console.error('Error fetching appointment data:', apptError);
      throw new Error('Could not fetch appointment details.');
    }

    if (!appointment) {
      return NextResponse.json(
        { success: false, error: 'Appointment not found.' },
        { status: 404 }
      );
    }

    // --- Fetch dog ---
    const { data: dogData, error: dogError } = await supabase
      .from('dogs')
      .select('dog_name, dog_breed, dog_age')
      .eq('id', dogId)
      .maybeSingle();

    if (dogError) {
      console.error('Error fetching dog data:', dogError);
      throw new Error('Could not fetch dog details.');
    }

    if (!dogData) {
      return NextResponse.json(
        { success: false, error: 'Dog not found.' },
        { status: 404 }
      );
    }

    // --- Fetch individual user ---
    const { data: individual, error: individualError } = await supabase
      .from('users')
      .select('first_name, email')
      .eq('id', appointment.individual_id)
      .maybeSingle();

    if (individualError) {
      console.error('Error fetching individual data:', individualError);
      throw new Error('Could not fetch individual details.');
    }

    if (!individual) {
      return NextResponse.json(
        { success: false, error: 'Individual user not found.' },
        { status: 404 }
      );
    }

    // --- Fetch volunteer user ---
    const { data: volunteer, error: volunteerError } = await supabase
      .from('users')
      .select('first_name, email')
      .eq('id', appointment.volunteer_id)
      .maybeSingle();

    if (volunteerError) {
      console.error('Error fetching volunteer data:', volunteerError);
      throw new Error('Could not fetch volunteer details.');
    }

    if (!volunteer) {
      return NextResponse.json(
        { success: false, error: 'Volunteer user not found.' },
        { status: 404 }
      );
    }

    // --- Build email content ---
    const appointmentTime = new Date(appointment.start_time).toLocaleString();

    let emailRecipient = '';
    let subject = '';
    let emailData: Record<string, any> = {};

    if (type === 'individual') {
      emailRecipient = individual.email;
      subject = 'Your Appointment Request Submitted';
      emailData = {
        appointmentTime,
        dogName: dogData.dog_name || 'N/A',
        dogBreed: dogData.dog_breed || 'N/A',
        dogAge: dogData.dog_age || 'N/A',
        volunteerName: volunteer.first_name,
        year: new Date().getFullYear(),
      };
    } else if (type === 'volunteer') {
      emailRecipient = volunteer.email;
      subject = 'New Appointment Request';
      emailData = {
        appointmentTime,
        dogName: dogData.dog_name || 'N/A',
        individualName: individual.first_name,
        dashboardLink: getAppUrl() + '/dashboard',
        year: new Date().getFullYear(),
      };
    } else {
      return NextResponse.json(
        { success: false, error: 'Invalid request type.' },
        { status: 400 }
      );
    }

    const emailResponse = await sendTransactionalEmail({
      to: emailRecipient,
      subject,
      templateName: type === 'individual' ? 'individualRequest' : 'volunteerRequest',
      data: emailData,
    });

    return NextResponse.json({ success: true, response: emailResponse });
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : 'An unknown error occurred';
    console.error('Error in /api/request:', errorMessage);
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}
