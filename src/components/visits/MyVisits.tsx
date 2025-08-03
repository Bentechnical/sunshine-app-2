// /src/app/components/MyVisits.tsx
'use client';

import React, { useEffect, useState } from 'react';
import { useSupabaseClient } from '@/utils/supabase/client';
import AppointmentGroup from '../appointments/AppointmentGroup';
import CancellationModal from '../appointments/CancellationModal';
import { Appointment } from '../appointments/AppointmentCard';
import { ChevronDown, ChevronRight, Calendar, Clock, Users } from 'lucide-react';

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

  // Loading states for action buttons
  const [processingAppointments, setProcessingAppointments] = useState<Set<number>>(new Set());

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
            id, first_name, last_name, email, physical_address, city, visit_recipient_type, dependant_name, relationship_to_recipient
          ),
          volunteer:volunteer_id (
            id, first_name, last_name, email, city,
            dogs (
              id, dog_name, dog_picture_url, dog_breed
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
          individual: apt.individual || null,
          volunteer: apt.volunteer || null,
        }));
        setAppointments(processed as Appointment[]);
      }
      setLoading(false);
    };

    fetchAppointments();
  }, [userId, role]);

  // Handlers
  async function handleApprove(appointmentId: number) {
    // Add to processing set
    setProcessingAppointments(prev => new Set(prev).add(appointmentId));
    
    try {
      const { error } = await supabase
        .from('appointments')
        .update({ status: 'confirmed' })
        .eq('id', appointmentId);
      if (error) {
        console.error('Error approving appointment:', error);
        return;
      }

      setAppointments((prev) =>
        prev.map((apt) => apt.id === appointmentId ? { ...apt, status: 'confirmed' } : apt)
      );

      // Create chat channel directly
      try {
        console.log('[MyVisits] Creating chat for appointment:', appointmentId);
        
        // Check if chat already exists
        const { data: existingChat } = await supabase
          .from('appointment_chats')
          .select('id')
        .eq('appointment_id', appointmentId)
        .single();

      if (existingChat) {
        console.log('[MyVisits] Chat already exists for appointment:', appointmentId);
        return;
      }

      // Get appointment details
      const { data: appointment } = await supabase
        .from('appointments')
        .select(`
          *,
          individual:individual_id (first_name, last_name),
          volunteer:volunteer_id (first_name, last_name),
          availability:availability_id (start_time, end_time)
        `)
        .eq('id', appointmentId)
        .single();

      // Get dog details separately since the foreign key constraint doesn't exist
      const { data: dogData } = await supabase
        .from('dogs')
        .select('dog_name')
        .eq('volunteer_id', appointment.volunteer_id)
        .single();

      if (!appointment) {
        console.error('[MyVisits] Could not fetch appointment details');
        return;
      }

      // Create Stream Chat channel
      const { createAppointmentChat } = await import('@/utils/stream-chat');
      
      const channel = await createAppointmentChat(
        appointmentId,
        appointment.individual_id,
        appointment.volunteer_id,
        {
          startTime: appointment.availability?.start_time || appointment.start_time,
          endTime: appointment.availability?.end_time || appointment.end_time,
          dogName: dogData?.dog_name || 'Unknown Dog',
          individualName: `${appointment.individual?.first_name} ${appointment.individual?.last_name}`,
          volunteerName: `${appointment.volunteer?.first_name} ${appointment.volunteer?.last_name}`,
          location: 'Location to be discussed'
        }
      );

      // Store chat record in database
      const { error: insertError } = await supabase
        .from('appointment_chats')
        .insert({
          appointment_id: appointmentId,
          stream_channel_id: channel.cid,
          created_by: 'system'
        });

      if (insertError) {
        console.error('[MyVisits] Failed to save chat record:', insertError);
      } else {
        console.log('[MyVisits] Chat created successfully for appointment:', appointmentId);
      }

    } catch (chatError) {
      console.error('[MyVisits] Error creating chat:', chatError);
    }

    // Still try to send confirmation emails via API
    try {
      await fetch('/api/appointment/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appointmentId }),
      });
    } catch (e) {
      console.error('Error sending confirm email:', e);
    }
  } finally {
    // Remove from processing set
    setProcessingAppointments(prev => {
      const newSet = new Set(prev);
      newSet.delete(appointmentId);
      return newSet;
    });
  }
}

  async function handleDecline(appointmentId: number) {
    // Add to processing set
    setProcessingAppointments(prev => new Set(prev).add(appointmentId));
    
    try {
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

      // Close the chat channel if it exists
      try {
        await fetch('/api/chat/close', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ appointmentId }),
        });
      } catch (err) {
        console.error('Error closing chat:', err);
      }

      try {
        await fetch('/api/appointment/cancel', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ appointmentId, cancellationReason: reason }),
        });
      } catch (err) {
        console.error('Error sending decline cancellation email:', err);
      }
    } finally {
      // Remove from processing set
      setProcessingAppointments(prev => {
        const newSet = new Set(prev);
        newSet.delete(appointmentId);
        return newSet;
      });
    }
  }

  async function cancelAppointment(appointmentId: number, reason: string) {
    // Add to processing set
    setProcessingAppointments(prev => new Set(prev).add(appointmentId));
    
    try {
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

      // Close the chat channel if it exists
      try {
        await fetch('/api/chat/close', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ appointmentId }),
        });
      } catch (err) {
        console.error('Error closing chat:', err);
      }

      try {
        await fetch('/api/appointment/cancel', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ appointmentId, cancellationReason: reason }),
        });
      } catch (err) {
        console.error('Error sending cancellation email:', err);
      }
    } finally {
      // Remove from processing set
      setProcessingAppointments(prev => {
        const newSet = new Set(prev);
        newSet.delete(appointmentId);
        return newSet;
      });
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

  // Group logic with sorting (soonest first)
  const now = new Date();
  const upcomingConfirmed = appointments
    .filter((apt) => apt.status === 'confirmed' && new Date(apt.end_time) > now)
    .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
  const pendingAppointments = appointments
    .filter((apt) => apt.status === 'pending' && new Date(apt.end_time) > now)
    .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
  const canceledAppointments = appointments
    .filter((apt) => apt.status === 'canceled')
    .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
  const pastAppointments = appointments
    .filter((apt) => new Date(apt.end_time) <= now)
    .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());

  // Loading state
  if (loading) {
    return (
      <div className="min-h-[400px] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading your visits...</p>
        </div>
      </div>
    );
  }

  // Empty state
  if (appointments.length === 0) {
    return (
      <div className="min-h-[400px] flex items-center justify-center">
        <div className="text-center">
          <Calendar className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No visits found</h3>
          <p className="text-gray-600">You don't have any appointments or requests yet.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h2 className="text-3xl font-bold text-gray-900 mb-2">My Visits</h2>
        <p className="text-gray-600">Manage your therapy dog appointments and requests</p>
      </div>

      {/* Stats summary - only for volunteers */}
      {role === 'volunteer' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
          <div className="bg-white p-4 rounded-lg border border-gray-200">
            <div className="flex items-center">
              <div className="p-2 bg-green-100 rounded-lg">
                <Clock className="w-5 h-5 text-green-600" />
              </div>
              <div className="ml-3">
                <p className="text-sm font-medium text-gray-600">Confirmed</p>
                <p className="text-2xl font-bold text-gray-900">{upcomingConfirmed.length}</p>
              </div>
            </div>
          </div>
          <div className="bg-white p-4 rounded-lg border border-gray-200">
            <div className="flex items-center">
              <div className="p-2 bg-yellow-100 rounded-lg">
                <Users className="w-5 h-5 text-yellow-600" />
              </div>
              <div className="ml-3">
                <p className="text-sm font-medium text-gray-600">Pending</p>
                <p className="text-2xl font-bold text-gray-900">{pendingAppointments.length}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Appointment sections */}
      <div className="space-y-8">
        {upcomingConfirmed.length > 0 && (
          <AppointmentGroup
            heading="Confirmed Visits"
            appointments={upcomingConfirmed}
            role={role}
            onApprove={wrappedApprove}
            onDecline={wrappedDecline}
            onCancelClick={handleCancelClick}
            cancelButtonDisabled={() => false}
            processingAppointments={processingAppointments}
          />
        )}

        {pendingAppointments.length > 0 && (
          <AppointmentGroup
            heading="Pending Requests"
            appointments={pendingAppointments}
            role={role}
            onApprove={wrappedApprove}
            onDecline={wrappedDecline}
            onCancelClick={handleCancelClick}
            cancelButtonDisabled={() => false}
            processingAppointments={processingAppointments}
          />
        )}

        {canceledAppointments.length > 0 && (
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <button
              onClick={() => setCanceledOpen(!canceledOpen)}
              className="w-full px-6 py-4 text-left bg-gray-50 hover:bg-gray-100 transition-colors duration-200 flex items-center justify-between"
            >
              <div className="flex items-center">
                <h3 className="text-lg font-semibold text-gray-900">Canceled Visits</h3>
                <span className="ml-2 px-2 py-1 bg-gray-200 text-gray-600 text-sm font-medium rounded-full">
                  {canceledAppointments.length}
                </span>
              </div>
              {canceledOpen ? (
                <ChevronDown className="w-5 h-5 text-gray-500" />
              ) : (
                <ChevronRight className="w-5 h-5 text-gray-500" />
              )}
            </button>
            {canceledOpen && (
              <div className="p-6 border-t border-gray-200">
                <AppointmentGroup
                  heading=""
                  appointments={canceledAppointments}
                  role={role}
                  onApprove={wrappedApprove}
                  onDecline={wrappedDecline}
                  onCancelClick={handleCancelClick}
                  cancelButtonDisabled={() => false}
                  processingAppointments={processingAppointments}
                />
              </div>
            )}
          </div>
        )}

        {pastAppointments.length > 0 && (
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <button
              onClick={() => setPastOpen(!pastOpen)}
              className="w-full px-6 py-4 text-left bg-gray-50 hover:bg-gray-100 transition-colors duration-200 flex items-center justify-between"
            >
              <div className="flex items-center">
                <h3 className="text-lg font-semibold text-gray-900">Past Appointments</h3>
                <span className="ml-2 px-2 py-1 bg-gray-200 text-gray-600 text-sm font-medium rounded-full">
                  {pastAppointments.length}
                </span>
              </div>
              {pastOpen ? (
                <ChevronDown className="w-5 h-5 text-gray-500" />
              ) : (
                <ChevronRight className="w-5 h-5 text-gray-500" />
              )}
            </button>
            {pastOpen && (
              <div className="p-6 border-t border-gray-200">
                <AppointmentGroup
                  heading=""
                  appointments={pastAppointments}
                  role={role}
                  onApprove={wrappedApprove}
                  onDecline={wrappedDecline}
                  onCancelClick={handleCancelClick}
                  cancelButtonDisabled={() => false}
                  processingAppointments={processingAppointments}
                />
              </div>
            )}
          </div>
        )}
      </div>

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
