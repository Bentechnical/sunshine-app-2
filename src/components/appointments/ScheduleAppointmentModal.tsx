'use client';

import React, { useState } from 'react';
import { X, Calendar, MapPin, FileText } from 'lucide-react';

interface ScheduleAppointmentModalProps {
  chatRequestId: string;
  onClose: () => void;
  onProposed: () => void;
  replacingAppointmentId?: number; // if set, this is a modification of an existing appointment
}

const LOCATION_TYPES = [
  { value: 'individual_address', label: "Individual's home" },
  { value: 'public', label: 'Public place' },
  { value: 'other', label: 'Other' },
];

function buildTimeOptions(): { value: string; label: string }[] {
  const options = [];
  for (let h = 7; h <= 21; h++) {
    for (const m of [0, 30]) {
      if (h === 21 && m === 30) break;
      const hour12 = h % 12 === 0 ? 12 : h % 12;
      const ampm = h < 12 ? 'AM' : 'PM';
      const label = `${hour12}:${m === 0 ? '00' : '30'} ${ampm}`;
      const value = `${String(h).padStart(2, '0')}:${m === 0 ? '00' : '30'}`;
      options.push({ value, label });
    }
  }
  return options;
}

const TIME_OPTIONS = buildTimeOptions();

function todayString() {
  return new Date().toISOString().split('T')[0];
}

export default function ScheduleAppointmentModal({
  chatRequestId,
  onClose,
  onProposed,
  replacingAppointmentId,
}: ScheduleAppointmentModalProps) {
  const isModifying = !!replacingAppointmentId;
  const [date, setDate] = useState('');
  const [time, setTime] = useState('10:00');
  const [locationType, setLocationType] = useState<string>('individual_address');
  const [locationDetails, setLocationDetails] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!date) { setError('Please select a date.'); return; }

    setSubmitting(true);
    setError(null);

    try {
      // Build ISO datetime without timezone (browser local time)
      const startTime = `${date}T${time}:00`;

      const res = await fetch('/api/appointment/propose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_request_id: chatRequestId,
          start_time: startTime,
          duration_minutes: 60,
          location_type: locationType,
          location_details: locationDetails || null,
          notes: notes || null,
          ...(replacingAppointmentId ? { replacing_appointment_id: replacingAppointmentId } : {}),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Failed to propose appointment.');
        return;
      }

      onProposed();
    } catch {
      setError('An unexpected error occurred.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-4">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-gray-100">
          <div>
            <h2 className="text-base font-semibold text-gray-900">
              {isModifying ? 'Propose Changes' : 'Propose a Visit'}
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {isModifying
                ? 'The other person will need to re-confirm the new details'
                : 'Suggest a time — they\'ll confirm or suggest changes'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-5">
          {/* Date & Time */}
          <div>
            <label className="flex items-center gap-1.5 text-xs font-medium text-gray-700 mb-2">
              <Calendar size={13} className="text-blue-500" />
              Date & Time
            </label>
            <div className="flex gap-2">
              <input
                type="date"
                value={date}
                min={todayString()}
                onChange={e => setDate(e.target.value)}
                required
                className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <select
                value={time}
                onChange={e => setTime(e.target.value)}
                className="border border-gray-200 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                {TIME_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Location */}
          <div>
            <label className="flex items-center gap-1.5 text-xs font-medium text-gray-700 mb-2">
              <MapPin size={13} className="text-blue-500" />
              Location
            </label>
            <select
              value={locationType}
              onChange={e => setLocationType(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent mb-2"
            >
              {LOCATION_TYPES.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <input
              type="text"
              placeholder={locationType === 'individual_address' ? 'Address (optional)' : 'Location details'}
              value={locationDetails}
              onChange={e => setLocationDetails(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="flex items-center gap-1.5 text-xs font-medium text-gray-700 mb-2">
              <FileText size={13} className="text-blue-500" />
              Notes <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Any notes for the other person..."
              rows={2}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
          )}

          <div className="flex gap-2 pt-1 pb-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {submitting ? 'Sending…' : isModifying ? 'Send Changes' : 'Send Proposal'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
