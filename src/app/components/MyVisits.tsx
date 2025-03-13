'use client';

import React, { useEffect, useState } from 'react';
import { supabase } from '@/utils/supabase/client';

interface MyVisitsProps {
  userId: string;
  role: string; // 'volunteer', 'individual', or 'admin'
}

interface Appointment {
  id: number;
  individual_id: string;
  volunteer_id: string;
  start_time: string;
  end_time: string;
  status: string;
  // We'll store the joined user as a single object
  userEmail?: string;
}

export default function MyVisits({ userId, role }: MyVisitsProps) {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAppointments = async () => {
      setLoading(true);
      let selectStr = `
        id,
        individual_id,
        volunteer_id,
        start_time,
        end_time,
        status
      `;

      // Build the select string based on role
      if (role === 'individual') {
        // For individuals, join on volunteer_id so we can show the volunteer's email
        selectStr = `
          id,
          individual_id,
          volunteer_id,
          start_time,
          end_time,
          status,
          users!appointments_volunteer_id_fkey (email)
        `;
      } else if (role === 'volunteer') {
        // For volunteers, join on individual_id so we can show the requester’s email
        selectStr = `
          id,
          individual_id,
          volunteer_id,
          start_time,
          end_time,
          status,
          users!appointments_individual_id_fkey (email)
        `;
      } else if (role === 'admin') {
        // For admin, you might want to show both; for now, we show nothing extra.
        selectStr = `
          id,
          individual_id,
          volunteer_id,
          start_time,
          end_time,
          status
        `;
      }

      let query = supabase.from('appointments').select(selectStr);

      if (role === 'individual') {
        query = query.eq('individual_id', userId);
      } else if (role === 'volunteer') {
        query = query.eq('volunteer_id', userId);
      } // admin sees all

      const { data, error } = await query;
      if (error) {
        console.error('Error fetching appointments:', error);
      } else if (data) {
        // Process the returned data to extract the email from the joined object.
        const processedData = data.map((apt: any) => {
          let userEmail = undefined;
          if (role === 'individual' && apt.users && Array.isArray(apt.users)) {
            // For individuals, apt.users is an array from the volunteer join
            userEmail = apt.users[0]?.email;
          } else if (role === 'volunteer' && apt.users && Array.isArray(apt.users)) {
            // For volunteers, apt.users is an array from the individual join
            userEmail = apt.users[0]?.email;
          }
          return { ...apt, userEmail };
        });
        setAppointments(processedData);
      }
      setLoading(false);
    };

    fetchAppointments();
  }, [userId, role]);

  async function handleApprove(appointmentId: number) {
    const { error } = await supabase
      .from('appointments')
      .update({ status: 'confirmed' })
      .eq('id', appointmentId);

    if (error) {
      console.error('Error approving appointment:', error);
      return;
    }
    setAppointments((prev) =>
      prev.map((apt) =>
        apt.id === appointmentId ? { ...apt, status: 'confirmed' } : apt
      )
    );
  }

  async function handleDecline(appointmentId: number) {
    const { error } = await supabase
      .from('appointments')
      .update({ status: 'declined' })
      .eq('id', appointmentId);

    if (error) {
      console.error('Error declining appointment:', error);
      return;
    }
    setAppointments((prev) =>
      prev.map((apt) =>
        apt.id === appointmentId ? { ...apt, status: 'declined' } : apt
      )
    );
  }

  if (loading) return <p>Loading visits...</p>;
  if (appointments.length === 0) return <p>No visits or requests found.</p>;

  return (
    <div>
      <h2 className="text-2xl font-bold mb-4">My Visits</h2>
      <ul className="space-y-4">
        {appointments.map((apt) => (
          <li key={apt.id} className="p-4 border rounded-lg bg-gray-50">
            <p>
              <strong>When:</strong> {new Date(apt.start_time).toLocaleString()} -{' '}
              {new Date(apt.end_time).toLocaleString()}
            </p>
            <p>
              <strong>Status:</strong> {apt.status}
            </p>
            {role === 'individual' && (
              <p>
                <strong>Volunteer Email:</strong> {apt.userEmail || apt.volunteer_id}
              </p>
            )}
            {role === 'volunteer' && (
              <p>
                <strong>Requester Email:</strong> {apt.userEmail || apt.individual_id}
              </p>
            )}
            {role === 'volunteer' && apt.status === 'pending' && (
              <div className="mt-3 space-x-2">
                <button
                  onClick={() => handleApprove(apt.id)}
                  className="bg-green-600 text-white px-4 py-2 rounded"
                >
                  Approve
                </button>
                <button
                  onClick={() => handleDecline(apt.id)}
                  className="bg-red-600 text-white px-4 py-2 rounded"
                >
                  Decline
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
