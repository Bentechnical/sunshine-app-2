// src/components/appointments/AppointmentCard.tsx
'use client';

import React from 'react';

export interface Appointment {
  id: number;
  individual_id: string;
  volunteer_id: string;
  start_time: string;
  end_time: string;
  status: string;
  cancellation_reason?: string;
  availability_id?: number;
  volunteer?: {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
    dogs?: {
      id: number;
      dog_name: string;
      dog_picture_url: string;
    }[];
  };
  individual?: {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
  };
}

interface AppointmentCardProps {
  appointment: Appointment;
  role: string;
  onApprove: (appointmentId: number) => void;
  onDecline: (appointmentId: number) => void;
  onCancelClick: (appointment: Appointment) => void;
  cancelButtonDisabled: (appointment: Appointment) => boolean;
}

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

const AppointmentCard: React.FC<AppointmentCardProps> = ({
  appointment,
  role,
  onApprove,
  onDecline,
  onCancelClick,
  cancelButtonDisabled,
}) => {
  let displayName = '';
  let displayEmail: string | undefined = undefined;
  let dogName: string | undefined = undefined;
  let dogPictureUrl: string | undefined = undefined;

  const isPast = new Date(appointment.end_time) <= new Date();

  if (role === 'individual') {
    const volunteer = appointment.volunteer;
    if (volunteer) {
      displayName = volunteer.first_name;
      displayEmail = volunteer.email;
      if (volunteer.dogs && volunteer.dogs.length > 0) {
        dogName = volunteer.dogs[0].dog_name;
        dogPictureUrl = volunteer.dogs[0].dog_picture_url;
      }
    }
  } else if (role === 'volunteer' || role === 'admin') {
    const requester = appointment.individual;
    if (requester) {
      displayName = `${requester.first_name} ${requester.last_name}`;
      displayEmail = requester.email;
    }
    if (appointment.volunteer?.dogs?.length) {
      dogName = appointment.volunteer.dogs[0].dog_name;
      dogPictureUrl = appointment.volunteer.dogs[0].dog_picture_url;
    }
  }

  return (
    <li className="p-4 border rounded-lg bg-gray-50">
      <p><strong>Date:</strong> {formatDate(appointment.start_time)}</p>
      <p><strong>When:</strong> {formatTime(appointment.start_time)} - {formatTime(appointment.end_time)}</p>
      <p><strong>Status:</strong> {appointment.status}</p>

      <div className="relative w-32 h-32 mt-2">
        <img
          src={dogPictureUrl || '/images/default_dog.png'}
          alt="Dog Picture"
          className="absolute inset-0 w-full h-full rounded object-cover"
        />
      </div>


      {role !== 'admin' && displayName && !isPast && (
        <div className="mt-2">
          <p><strong>{role === 'individual' ? 'Volunteer' : 'Requester'}:</strong> {displayName}</p>
          {displayEmail && (
            <p><strong>Email:</strong> {displayEmail}</p>
          )}
        </div>
      )}

      {role === 'admin' && displayName && !isPast && (
        <div className="mt-2">
          <p><strong>User:</strong> {displayName}</p>
          <p><strong>Email:</strong> {displayEmail}</p>
        </div>
      )}

      <div className="mt-3">
        {role === 'individual' && !isPast && (
          <button
            onClick={() => onCancelClick(appointment)}
            className="px-4 py-2 rounded bg-red-600 text-white"
          >
            {appointment.status === 'pending' ? 'Cancel Request' : 'Cancel Appointment'}
          </button>
        )}
        {role === 'volunteer' && appointment.status === 'pending' && !isPast && (
          <div className="space-x-2">
            <button
              onClick={() => onApprove(appointment.id)}
              className="bg-green-600 text-white px-4 py-2 rounded"
            >
              Confirm Visit
            </button>
            <button
              onClick={() => onDecline(appointment.id)}
              className="bg-red-600 text-white px-4 py-2 rounded"
            >
              Deny Request
            </button>
          </div>
        )}
        {role === 'volunteer' && appointment.status === 'confirmed' && !isPast && (
          <button
            onClick={() => onCancelClick(appointment)}
            className={`px-4 py-2 rounded ${cancelButtonDisabled(appointment)
              ? 'bg-gray-400 text-white cursor-not-allowed'
              : 'bg-red-600 text-white'
              }`}
            disabled={cancelButtonDisabled(appointment)}
          >
            Cancel Appointment
          </button>
        )}
      </div>

      {appointment.status === 'canceled' && appointment.cancellation_reason && (
        <p className="text-gray-600 mt-2">
          <strong>Cancellation Reason:</strong> {appointment.cancellation_reason}
        </p>
      )}
    </li>
  );
};

export default AppointmentCard;
