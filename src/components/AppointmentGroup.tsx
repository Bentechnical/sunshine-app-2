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
}

const AppointmentGroup: React.FC<AppointmentGroupProps> = ({
  heading,
  appointments,
  role,
  onApprove,
  onDecline,
  onCancelClick,
  cancelButtonDisabled,
}) => {
  return (
    <div className="mb-6">
      <h3 className="text-xl font-semibold mb-2">{heading}</h3>
      <ul className="space-y-4">
        {appointments.map((apt) => (
          <AppointmentCard
            key={apt.id}
            appointment={apt}
            role={role}
            onApprove={onApprove}
            onDecline={onDecline}
            onCancelClick={onCancelClick}
            cancelButtonDisabled={cancelButtonDisabled}
          />
        ))}
      </ul>
    </div>
  );
};

export default AppointmentGroup;
