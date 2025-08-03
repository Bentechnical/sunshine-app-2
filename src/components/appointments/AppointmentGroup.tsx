// /src/app/components/AppointmentGroup.tsx
'use client';

import React from 'react';
import AppointmentCard, { Appointment } from './AppointmentCard';

interface AppointmentGroupProps {
  heading: string;
  appointments: Appointment[];
  role: string;
  onApprove: (appointmentId: number) => void;
  onDecline: (appointmentId: number) => void;
  onCancelClick: (appointment: Appointment) => void;
  cancelButtonDisabled: (appointment: Appointment) => boolean;
  processingAppointments?: Set<number>;
}

const AppointmentGroup: React.FC<AppointmentGroupProps> = ({
  heading,
  appointments,
  role,
  onApprove,
  onDecline,
  onCancelClick,
  cancelButtonDisabled,
  processingAppointments = new Set(),
}) => {
  return (
    <div className="mb-8">
      {heading && (
        <h3 className="text-xl font-semibold text-gray-900 mb-4 flex items-center">
          {heading}
          <span className="ml-2 px-2 py-1 bg-gray-100 text-gray-600 text-sm font-medium rounded-full">
            {appointments.length}
          </span>
        </h3>
      )}
      <div className="space-y-4 transition-all duration-300 ease-in-out">
        {appointments.map((apt) => (
          <AppointmentCard
            key={apt.id}
            appointment={apt}
            role={role}
            onApprove={onApprove}
            onDecline={onDecline}
            onCancelClick={onCancelClick}
            cancelButtonDisabled={cancelButtonDisabled}
            isProcessing={processingAppointments.has(apt.id)}
          />
        ))}
      </div>
    </div>
  );
};

export default AppointmentGroup;
