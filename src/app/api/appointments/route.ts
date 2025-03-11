import { useAuth } from '@clerk/nextjs/server';  // Protect the route using Clerk authentication
import { NextResponse } from 'next/server';
import { query } from '../../../utils/db';  // Import database query functions

// Define the handler for GET and POST requests
export const handler = async (req: Request) => {
  try {
    const user = req.auth?.user;  // Access the authenticated user from Clerk's context

    if (!user) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const userId = user.id;

    // Handle GET request - Fetch appointments for the authenticated user
    if (req.method === 'GET') {
      const appointments = await fetchAppointments(userId);
      return NextResponse.json(appointments);
    }

    // Handle POST request - Create a new appointment
    if (req.method === 'POST') {
      const { volunteerId, appointmentTime } = await req.json();
      const newAppointment = await createAppointment({ userId, volunteerId, appointmentTime });
      return NextResponse.json(newAppointment, { status: 201 });
    }

    return new NextResponse('Method Not Allowed', { status: 405 });
  } catch (error) {
    console.error('Error:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
};

// Function to fetch appointments for a specific user (individual or volunteer)
const fetchAppointments = async (userId: string) => {
  // Query the database to get appointments for the authenticated user
  const result = await query(`
    SELECT a.id, a.appointment_time, a.status, v.first_name AS volunteer_first_name, v.last_name AS volunteer_last_name
    FROM appointments a
    JOIN users v ON a.volunteer_id = v.id
    WHERE a.individual_id = $1 OR a.volunteer_id = $1
  `, [userId]);

  return result.rows;
};

// Function to create a new appointment
const createAppointment = async ({ userId, volunteerId, appointmentTime }: { userId: string, volunteerId: string, appointmentTime: string }) => {
  // Insert the new appointment into the database
  const result = await query(`
    INSERT INTO appointments (individual_id, volunteer_id, appointment_time, status)
    VALUES ($1, $2, $3, 'pending')
    RETURNING *
  `, [userId, volunteerId, appointmentTime]);

  return result.rows[0];
};

// Protect the route using Clerk's withAuth middleware
export const GET = withAuth(handler);
export const POST = withAuth(handler);
