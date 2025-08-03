// /src/app/components/CancellationModal.tsx
'use client';

import React from 'react';
import { Appointment } from './AppointmentCard';
import { X, AlertTriangle, Calendar, Clock } from 'lucide-react';

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

  const formatDate = (timeStr: string): string => {
    return new Date(timeStr).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatTime = (timeStr: string): string => {
    return new Date(timeStr).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <div className="p-2 bg-red-100 rounded-lg mr-3">
                <AlertTriangle className="w-5 h-5 text-red-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900">Cancel Appointment</h3>
            </div>
            <button
              onClick={onClose}
              className="p-1 hover:bg-gray-100 rounded-lg transition-colors duration-200"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-4">
          {/* Appointment details */}
          <div className="mb-6 p-4 bg-gray-50 rounded-lg">
            <p className="text-sm text-gray-600 mb-3">
              You're about to cancel your appointment with <strong className="text-gray-900">{targetName}</strong>.
            </p>
            <div className="space-y-2">
              <div className="flex items-center text-sm text-gray-700">
                <Calendar className="w-4 h-4 mr-2 text-gray-500" />
                <span>{formatDate(appointment.start_time)}</span>
              </div>
              <div className="flex items-center text-sm text-gray-700">
                <Clock className="w-4 h-4 mr-2 text-gray-500" />
                <span>{formatTime(appointment.start_time)} - {formatTime(appointment.end_time)}</span>
              </div>
            </div>
          </div>

          {/* Cancellation reason */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Cancellation Reason <span className="text-red-500">*</span>
            </label>
            <textarea
              value={cancelReason}
              onChange={(e) => onCancelReasonChange(e.target.value)}
              className={`w-full border rounded-lg p-3 focus:ring-2 focus:ring-red-500 focus:border-red-500 transition-colors duration-200 resize-none ${
                cancelReason.trim() === '' ? 'border-red-300 bg-red-50' : 'border-gray-300'
              }`}
              rows={3}
              placeholder="Please provide a reason for canceling this appointment..."
              required
            />
            {cancelReason.trim() === '' && (
              <p className="text-xs text-red-500 mt-1">
                Cancellation reason is required.
              </p>
            )}
            <p className="text-xs text-gray-500 mt-1">
              This helps us improve our service and notify the other party appropriately.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors duration-200"
            >
              Keep Appointment
            </button>
            <button
              onClick={onSubmit}
              disabled={cancelReason.trim() === ''}
              className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors duration-200 ${
                cancelReason.trim() === ''
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-red-600 hover:bg-red-700 text-white'
              }`}
            >
              Confirm Cancellation
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CancellationModal;
