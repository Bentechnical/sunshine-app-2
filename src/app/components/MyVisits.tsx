// /src/app/components/MyVisits.tsx
'use client';

import React, { useEffect, useState } from 'react';
import { supabase } from '@/utils/supabase/client';
import AppointmentGroup from './AppointmentGroup';
import CancellationModal from './CancellationModal';
import { Appointment } from './AppointmentCard';

interface MyVisitsProps {
  userId: string;
  role: string; // 'volunteer', 'individual', or 'admin'
}

const MyVisits: React.FC<MyVisitsProps> = ({ userId, role }) => {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);

  // Cancellation modal state
  const [cancelingAppointment, setCancelingAppointment] = useState<Appointment | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [showCancelModal, setShowCancelModal] = useState(false);

  // Accordion state for Past Appointments and Canceled Visits
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
              dog_name,
              dog_picture_url
            )
          )
        `);

      if (role === 'individual') {
        query = query.eq('individual_id', userId);
      } else if (role === 'volunteer') {
        query = query.eq('volunteer_id', userId);
      }

      const { data, error } = (await query) as {
        data: Appointment[] | null;
        error: any;
      };

      if (error) {
        console.error('Error fetching appointments:', error);
      } else if (data) {
        setAppointments(data);
      }
      setLoading(false);
    };

    fetchAppointments();
  }, [userId, role]);

  // Helper: Format date and time
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

  // Approve and Decline for volunteer users
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
      prev.map((apt) => (apt.id === appointmentId ? { ...apt, status: 'declined' } : apt))
    );
  }

  // Cancellation logic: For pending, cancel immediately; for confirmed, open modal.
  function canCancel(apt: Appointment): boolean {
    const now = new Date();
    const startTime = new Date(apt.start_time);
    if (apt.status === 'pending') return true;
    if (apt.status === 'confirmed' && startTime.getTime() - now.getTime() > 24 * 60 * 60 * 1000)
      return true;
    return false;
  }

  function cancelButtonDisabled(apt: Appointment): boolean {
    if (apt.status === 'confirmed') {
      const now = new Date();
      const startTime = new Date(apt.start_time);
      return startTime.getTime() - now.getTime() < 24 * 60 * 60 * 1000;
    }
    return false;
  }

  function handleCancelClick(apt: Appointment) {
    if (apt.status === 'confirmed') {
      setCancelingAppointment(apt);
      setCancelReason('');
      setShowCancelModal(true);
    } else {
      cancelAppointment(apt.id, '');
    }
  }

  async function cancelAppointment(appointmentId: number, reason: string) {
    const { error } = await supabase
      .from('appointments')
      .update({
        status: 'canceled',
        cancellation_reason: reason
      })
      .eq('id', appointmentId);
    if (error) {
      console.error('Error canceling appointment:', error, error?.message);
      return;
    }
    setAppointments((prev) =>
      prev.map((apt) =>
        apt.id === appointmentId ? { ...apt, status: 'canceled', cancellation_reason: reason } : apt
      )
    );
    setShowCancelModal(false);
    setCancelingAppointment(null);
  }

  // Group appointments into sections.
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
          onApprove={handleApprove}
          onDecline={handleDecline}
          onCancelClick={handleCancelClick}
          cancelButtonDisabled={cancelButtonDisabled}
        />
      )}

      {/* Pending Visits Group */}
      {pendingAppointments.length > 0 && (
        <AppointmentGroup
          heading="Pending Visits"
          appointments={pendingAppointments}
          role={role}
          onApprove={handleApprove}
          onDecline={handleDecline}
          onCancelClick={handleCancelClick}
          cancelButtonDisabled={cancelButtonDisabled}
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
              onApprove={handleApprove}
              onDecline={handleDecline}
              onCancelClick={handleCancelClick}
              cancelButtonDisabled={cancelButtonDisabled}
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
              onApprove={handleApprove}
              onDecline={handleDecline}
              onCancelClick={handleCancelClick}
              cancelButtonDisabled={cancelButtonDisabled}
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
          onSubmit={() => cancelAppointment(cancelingAppointment.id, cancelReason)}
        />
      )}
    </div>
  );
};

export default MyVisits;
