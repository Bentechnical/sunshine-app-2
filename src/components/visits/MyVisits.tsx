// /src/app/components/MyVisits.tsx
'use client';

import React, { useEffect, useState } from 'react';
import { useSupabaseClient } from '@/utils/supabase/client';
import AppointmentGroup from '../appointments/AppointmentGroup';
import CancellationModal from '../appointments/CancellationModal';
import { Appointment } from '../appointments/AppointmentCard';

interface MyVisitsProps {
  userId: string;
  role: string; // 'volunteer', 'individual', or 'admin'
}

const MyVisits: React.FC<MyVisitsProps> = ({ userId, role }) => {
  const supabase = useSupabaseClient();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);

  // Cancellation modal state
  const [cancelingAppointment, setCancelingAppointment] = useState<Appointment | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [showCancelModal, setShowCancelModal] = useState(false);

  // Accordion state
  const [pastOpen, setPastOpen] = useState(false);
  const [canceledOpen, setCanceledOpen] = useState(false);

  useEffect(() => {
    const fetchAppointments = async () => {
      setLoading(true);

      let query = supabase
        .from('appointments')
        .select(`
          id, 
          individual_id, 
          volunteer_id, 
          start_time, 
          end_time, 
          status, 
          cancellation_reason,
          availability_id,
          individual:individual_id (
            id, first_name, last_name, email
          ),
          volunteer:volunteer_id (
            id, first_name, last_name, email,
            dogs (
              id, dog_name, dog_picture_url
            )
          )
        `);

      if (role !== 'admin') {
        if (role === 'individual') {
          query = query.eq('individual_id', userId);
        } else if (role === 'volunteer') {
          query = query.eq('volunteer_id', userId);
        }
      }

      const { data, error } = await query;
      if (error) {
        console.error('Error fetching appointments:', error);
      } else if (data) {
        const processed = data.map((apt: any) => ({
          ...apt,
          individual: apt.individual ? apt.individual[0] : null,
          volunteer: apt.volunteer ? apt.volunteer[0] : null,
        }));
        setAppointments(processed as Appointment[]);
      }
      setLoading(false);
    };

    fetchAppointments();
  }, [userId, role]);

  // Handlers
  async function handleApprove(appointmentId: number) {
    const { error } = await supabase
      .from('appointments')
      .update({ status: 'confirmed' })
      .eq('id', appointmentId);
    if (error) return console.error('Error approving appointment:', error);

    setAppointments((prev) =>
      prev.map((apt) => apt.id === appointmentId ? { ...apt, status: 'confirmed' } : apt)
    );

    try {
      await fetch('/api/appointment/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appointmentId }),
      });
    } catch (e) {
      console.error('Error sending confirm email:', e);
    }
  }

  async function handleDecline(appointmentId: number) {
    const reason = 'Declined by volunteer';
    const { error } = await supabase
      .from('appointments')
      .update({ status: 'canceled', cancellation_reason: reason })
      .eq('id', appointmentId);
    if (error) return console.error('Error declining appointment:', error);

    setAppointments((prev) =>
      prev.map((apt) =>
        apt.id === appointmentId ? { ...apt, status: 'canceled', cancellation_reason: reason } : apt
      )
    );

    try {
      await fetch('/api/appointment/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appointmentId, cancellationReason: reason }),
      });
    } catch (err) {
      console.error('Error sending decline cancellation email:', err);
    }
  }

  async function cancelAppointment(appointmentId: number, reason: string) {
    const { error } = await supabase
      .from('appointments')
      .update({ status: 'canceled', cancellation_reason: reason })
      .eq('id', appointmentId);
    if (error) return console.error('Error canceling appointment:', error);

    setAppointments((prev) =>
      prev.map((apt) =>
        apt.id === appointmentId ? { ...apt, status: 'canceled', cancellation_reason: reason } : apt
      )
    );

    setShowCancelModal(false);
    setCancelingAppointment(null);

    try {
      await fetch('/api/appointment/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appointmentId, cancellationReason: reason }),
      });
    } catch (err) {
      console.error('Error sending cancellation email:', err);
    }
  }

  const wrappedApprove = (id: number) => handleApprove(id);
  const wrappedDecline = (id: number) => handleDecline(id);
  const handleCancelClick = (apt: Appointment) => {
    if (apt.status === 'confirmed') {
      setCancelingAppointment(apt);
      setCancelReason('');
      setShowCancelModal(true);
    } else {
      cancelAppointment(apt.id, '');
    }
  };
  const onModalCancelSubmit = () => {
    if (cancelingAppointment) cancelAppointment(cancelingAppointment.id, cancelReason);
  };

  // Group logic
  const now = new Date();
  const upcomingConfirmed = appointments.filter(
    (apt) => apt.status === 'confirmed' && new Date(apt.end_time) > now
  );
  const pendingAppointments = appointments.filter((apt) => apt.status === 'pending');
  const canceledAppointments = appointments.filter((apt) => apt.status === 'canceled');
  const pastAppointments = appointments.filter((apt) => new Date(apt.end_time) <= now);

  if (loading) return <p>Loading visits...</p>;
  if (appointments.length === 0) return <p>No visits or requests found.</p>;

  return (
    <div>
      <h2 className="text-2xl font-bold mb-4">My Visits</h2>

      {upcomingConfirmed.length > 0 && (
        <AppointmentGroup
          heading="Confirmed Visits"
          appointments={upcomingConfirmed}
          role={role}
          onApprove={wrappedApprove}
          onDecline={wrappedDecline}
          onCancelClick={handleCancelClick}
          cancelButtonDisabled={() => false}
        />
      )}

      {pendingAppointments.length > 0 && (
        <AppointmentGroup
          heading="Pending Visits"
          appointments={pendingAppointments}
          role={role}
          onApprove={wrappedApprove}
          onDecline={wrappedDecline}
          onCancelClick={handleCancelClick}
          cancelButtonDisabled={() => false}
        />
      )}

      {canceledAppointments.length > 0 && (
        <div className="mb-6">
          <button
            onClick={() => setCanceledOpen(!canceledOpen)}
            className="w-full text-left bg-gray-200 px-4 py-2 rounded mb-2"
          >
            <span className="text-xl font-semibold">Canceled Visits</span>
            <span className="float-right">{canceledOpen ? '-' : '+'}</span>
          </button>
          {canceledOpen && (
            <AppointmentGroup
              heading=""
              appointments={canceledAppointments}
              role={role}
              onApprove={wrappedApprove}
              onDecline={wrappedDecline}
              onCancelClick={handleCancelClick}
              cancelButtonDisabled={() => false}
            />
          )}
        </div>
      )}

      {pastAppointments.length > 0 && (
        <div className="mb-6">
          <button
            onClick={() => setPastOpen(!pastOpen)}
            className="w-full text-left bg-gray-200 px-4 py-2 rounded mb-2"
          >
            <span className="text-xl font-semibold">Past Appointments</span>
            <span className="float-right">{pastOpen ? '-' : '+'}</span>
          </button>
          {pastOpen && (
            <AppointmentGroup
              heading=""
              appointments={pastAppointments}
              role={role}
              onApprove={wrappedApprove}
              onDecline={wrappedDecline}
              onCancelClick={handleCancelClick}
              cancelButtonDisabled={() => false}
            />
          )}
        </div>
      )}

      {showCancelModal && cancelingAppointment && (
        <CancellationModal
          appointment={cancelingAppointment}
          cancelReason={cancelReason}
          onCancelReasonChange={setCancelReason}
          onClose={() => setShowCancelModal(false)}
          onSubmit={onModalCancelSubmit}
        />
      )}
    </div>
  );
};

export default MyVisits;
