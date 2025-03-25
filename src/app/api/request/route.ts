// src/app/api/request/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/utils/supabase/client';
import { sendTransactionalEmail } from '../../utils/mailer';

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json();
    console.log('Payload received in /api/request:', payload);
    
    const { type, requestId, dogId } = payload;
    if (!type || !requestId || !dogId) {
      return NextResponse.json(
        { success: false, error: 'Missing type, requestId, or dogId.' },
        { status: 400 }
      );
    }
    
    // Fetch appointment details (using the id column from appointments)
    const { data: appointment, error: apptError } = await supabase
      .from('appointments')
      .select('start_time, individual_id, volunteer_id')
      .eq('id', requestId)
      .single();
    if (apptError || !appointment) {
      console.error('Error fetching appointment data:', apptError);
      throw new Error('Could not fetch appointment details.');
    }
    
    // Fetch dog details (we only need the dog's name for volunteer email;
    // for individual email, you might include more dog details)
    const { data: dogData, error: dogError } = await supabase
      .from('dogs')
      .select('dog_name, dog_breed, dog_age')
      .eq('id', dogId)
      .single();
    if (dogError || !dogData) {
      console.error('Error fetching dog data:', dogError);
      throw new Error('Could not fetch dog details.');
    }
    
    // Fetch individual (requester) details using appointment.individual_id
    const { data: individual, error: individualError } = await supabase
      .from('users')
      .select('first_name, email')
      .eq('id', appointment.individual_id)
      .single();
    if (individualError || !individual) {
      console.error('Error fetching individual data:', individualError);
      throw new Error('Could not fetch individual details.');
    }
    
    // Fetch volunteer details using appointment.volunteer_id
    const { data: volunteer, error: volunteerError } = await supabase
      .from('users')
      .select('first_name, email')
      .eq('id', appointment.volunteer_id)
      .single();
    if (volunteerError || !volunteer) {
      console.error('Error fetching volunteer data:', volunteerError);
      throw new Error('Could not fetch volunteer details.');
    }
    
    // Derive the appointment time as a formatted string.
    const appointmentTime = new Date(appointment.start_time).toLocaleString();
    
    let emailRecipient = '';
    let subject = '';
    let emailData: Record<string, any> = {};
    
    if (type === 'individual') {
      // Email to the individual (requester)
      emailRecipient = individual.email;
      subject = 'Your Appointment Request Submitted';
      emailData = {
        appointmentTime,                // Date & time of the appointment
        dogName: dogData.dog_name,        // Dog details
        dogBreed: dogData.dog_breed,
        dogAge: dogData.dog_age,
        volunteerName: volunteer.first_name, // Volunteer's first name
        year: new Date().getFullYear(),
      };
    } else if (type === 'volunteer') {
      // Email to the volunteer
      emailRecipient = volunteer.email;
      subject = 'New Appointment Request';
      
      // Use a dashboard URL from the environment or a default value.
      const dashboardLink = process.env.DASHBOARD_URL || 'https://example.com/dashboard';
      
      emailData = {
        appointmentTime,              // Date & time of the appointment
        dogName: dogData.dog_name,      // Dog's name
        individualName: individual.first_name, // Requester's first name
        dashboardLink,                // Link for volunteer to review the request
        year: new Date().getFullYear(),
      };
    } else {
      return NextResponse.json(
        { success: false, error: 'Invalid request type.' },
        { status: 400 }
      );
    }
    
    // Trigger the transactional email using the appropriate template.
    const emailResponse = await sendTransactionalEmail({
      to: emailRecipient,
      subject,
      templateName: type === 'individual' ? 'individualRequest' : 'volunteerRequest',
      data: emailData,
    });
    
    return NextResponse.json({ success: true, response: emailResponse });
  } catch (error: unknown) {
    let errorMessage = 'An unknown error occurred';
    if (error instanceof Error) errorMessage = error.message;
    console.error('Error in /api/request:', errorMessage);
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}
