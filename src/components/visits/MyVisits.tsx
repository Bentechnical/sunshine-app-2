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

  // Accordion state for Past and Canceled Visits
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

      if (role === 'individual') {
        query = query.eq('individual_id', userId);
      } else if (role === 'volunteer') {
        query = query.eq('volunteer_id', userId);
      }

      const { data, error } = await query;
      if (error) {
        console.error('Error fetching appointments:', error);
      } else if (data) {
        // Convert relational arrays to objects
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

  function formatDate(timeStr: string): string {
    return new Date(timeStr).toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });
  }

  function formatTime(timeStr: string): string {
    return new Date(timeStr).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: 'numeric',
      hour12: true,
    });
  }

  // Approve appointment (volunteer action)
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
      prev.map((apt) => (apt.id === appointmentId ? { ...apt, status: 'confirmed' } : apt))
    );
    try {
      const res = await fetch('/api/appointment/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appointmentId }),
      });
      const result = await res.json();
      console.log('Confirm email result:', result);
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
    if (error) {
      console.error('Error declining appointment:', error);
      return;
    }
    setAppointments((prev) =>
      prev.map((apt) =>
        apt.id === appointmentId ? { ...apt, status: 'canceled', cancellation_reason: reason } : apt
      )
    );
    try {
      const res = await fetch('/api/appointment/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appointmentId, cancellationReason: reason }),
      });
      const result = await res.json();
      console.log('Decline (cancel) email result:', result);
    } catch (err) {
      console.error('Error sending decline cancellation email:', err);
    }
  }

  // Cancel appointment (for pending or confirmed with modal)
  async function cancelAppointment(appointmentId: number, reason: string) {
    const { error } = await supabase
      .from('appointments')
      .update({ status: 'canceled', cancellation_reason: reason })
      .eq('id', appointmentId);
    if (error) {
      console.error('Error canceling appointment:', error);
      return;
    }
    setAppointments((prev) =>
      prev.map((apt) =>
        apt.id === appointmentId ? { ...apt, status: 'canceled', cancellation_reason: reason } : apt
      )
    );
    setShowCancelModal(false);
    setCancelingAppointment(null);
    try {
      const res = await fetch('/api/appointment/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appointmentId, cancellationReason: reason }),
      });
      const result = await res.json();
      console.log('Cancellation email result:', result);
    } catch (err) {
      console.error('Error sending cancellation email:', err);
    }
  }

  // Wrap handlers so AppointmentGroup only gets appointmentId
  const wrappedApprove = (appointmentId: number) => {
    handleApprove(appointmentId);
  };

  const wrappedDecline = (appointmentId: number) => {
    handleDecline(appointmentId);
  };

  function handleCancelClick(apt: Appointment) {
    if (apt.status === 'confirmed') {
      setCancelingAppointment(apt);
      setCancelReason('');
      setShowCancelModal(true);
    } else {
      cancelAppointment(apt.id, '');
    }
  }

  function onModalCancelSubmit() {
    if (!cancelingAppointment) return;
    cancelAppointment(cancelingAppointment.id, cancelReason);
  }

  // Group appointments
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

      {/* Confirmed Visits Group */}
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

      {/* Pending Visits Group */}
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

      {/* Canceled Visits Group (Accordion) */}
      {canceledAppointments.length > 0 && (
        <div className="mb-6">
          <button
            onClick={() => setCanceledOpen(!canceledOpen)}
            className="w-full text-left bg-gray-200 px-4 py-2 rounded mb-2 focus:outline-none"
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

      {/* Past Appointments Group (Accordion) */}
      {pastAppointments.length > 0 && (
        <div className="mb-6">
          <button
            onClick={() => setPastOpen(!pastOpen)}
            className="w-full text-left bg-gray-200 px-4 py-2 rounded mb-2 focus:outline-none"
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

      {/* Cancellation Modal */}
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
