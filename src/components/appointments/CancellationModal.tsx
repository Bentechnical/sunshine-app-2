// /src/app/components/CancellationModal.tsx
'use client';

import React from 'react';
import { Appointment } from './AppointmentCard';

interface CancellationModalProps {
  appointment: Appointment;
  cancelReason: string;
  onCancelReasonChange: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}

const CancellationModal: React.FC<CancellationModalProps> = ({
  appointment,
  cancelReason,
  onCancelReasonChange,
  onClose,
  onSubmit,
}) => {
  // Determine the name to show based on role in appointment:
  const targetName =
    appointment.volunteer?.first_name || appointment.individual?.first_name || '';

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-10">
      <div className="bg-white p-6 rounded-md max-w-md w-full">
        <h3 className="text-xl font-semibold mb-4">Cancel Appointment</h3>
        <p className="mb-2">
          Please provide a reason for canceling your appointment with <strong>{targetName}</strong>.
        </p>
        <textarea
          value={cancelReason}
          onChange={(e) => onCancelReasonChange(e.target.value)}
          className="w-full border p-2 mt-3"
          rows={3}
          placeholder="Enter cancellation reason..."
        />
        <div className="mt-6 flex justify-end space-x-2">
          <button onClick={onClose} className="px-4 py-2 bg-gray-400 text-white rounded">
            Back
          </button>
          <button onClick={onSubmit} className="px-4 py-2 bg-red-600 text-white rounded">
            Confirm Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export default CancellationModal;
