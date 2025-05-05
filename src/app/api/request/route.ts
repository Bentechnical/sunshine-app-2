// src/app/api/request/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/utils/supabase/server';
import { sendTransactionalEmail } from '../../utils/mailer';

export async function POST(req: NextRequest) {
  try {
    // 1) Create your server-side Supabase client (attaching Clerk token for RLS)
    const supabase = await createSupabaseServerClient();

    // 2) Parse request data
    const payload = await req.json();
    console.log('Payload received in /api/request:', payload);

    const { type, requestId, dogId } = payload;
    if (!type || !requestId || !dogId) {
      return NextResponse.json(
        { success: false, error: 'Missing type, requestId, or dogId.' },
        { status: 400 }
      );
    }

    // 3) Fetch appointment details
    const { data: appointment, error: apptError } = await supabase
      .from('appointments')
      .select('start_time, individual_id, volunteer_id')
      .eq('id', requestId)
      .single();

    if (apptError || !appointment) {
      console.error('Error fetching appointment data:', apptError);
      throw new Error('Could not fetch appointment details.');
    }

    // 4) Fetch dog details
    const { data: dogData, error: dogError } = await supabase
      .from('dogs')
      .select('dog_name, dog_breed, dog_age')
      .eq('id', dogId)
      .single();

    if (dogError || !dogData) {
      console.error('Error fetching dog data:', dogError);
      throw new Error('Could not fetch dog details.');
    }

    // 5) Fetch individual (requester) details
    const { data: individual, error: individualError } = await supabase
      .from('users')
      .select('first_name, email')
      .eq('id', appointment.individual_id)
      .single();

    if (individualError || !individual) {
      console.error('Error fetching individual data:', individualError);
      throw new Error('Could not fetch individual details.');
    }

    // 6) Fetch volunteer details
    const { data: volunteer, error: volunteerError } = await supabase
      .from('users')
      .select('first_name, email')
      .eq('id', appointment.volunteer_id)
      .single();

    if (volunteerError || !volunteer) {
      console.error('Error fetching volunteer data:', volunteerError);
      throw new Error('Could not fetch volunteer details.');
    }

    // 7) Derive appointment time
    const appointmentTime = new Date(appointment.start_time).toLocaleString();

    // 8) Prepare email details
    let emailRecipient = '';
    let subject = '';
    let emailData: Record<string, any> = {};

    if (type === 'individual') {
      // Email to the individual (requester)
      emailRecipient = individual.email;
      subject = 'Your Appointment Request Submitted';
      emailData = {
        appointmentTime,
        dogName: dogData.dog_name,
        dogBreed: dogData.dog_breed,
        dogAge: dogData.dog_age,
        volunteerName: volunteer.first_name,
        year: new Date().getFullYear(),
      };
    } else if (type === 'volunteer') {
      // Email to the volunteer
      emailRecipient = volunteer.email;
      subject = 'New Appointment Request';

      // Use a dashboard URL from environment or a default
      const dashboardLink = process.env.DASHBOARD_URL || 'https://example.com/dashboard';

      emailData = {
        appointmentTime,
        dogName: dogData.dog_name,
        individualName: individual.first_name,
        dashboardLink,
        year: new Date().getFullYear(),
      };
    } else {
      return NextResponse.json(
        { success: false, error: 'Invalid request type.' },
        { status: 400 }
      );
    }

    // 9) Send email using the appropriate template
    const emailResponse = await sendTransactionalEmail({
      to: emailRecipient,
      subject,
      templateName: type === 'individual' ? 'individualRequest' : 'volunteerRequest',
      data: emailData,
    });

    // 10) Return success response
    return NextResponse.json({ success: true, response: emailResponse });
  } catch (error: unknown) {
    let errorMessage = 'An unknown error occurred';
    if (error instanceof Error) {
      errorMessage = error.message;
    }
    console.error('Error in /api/request:', errorMessage);
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}
