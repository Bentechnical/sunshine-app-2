'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { CalendarPlus, CheckCircle, Clock, MapPin, ChevronDown, ChevronUp, Pencil, AlertTriangle, X } from 'lucide-react';
import { formatAppointmentDate, formatAppointmentTime } from '@/utils/timeZone';
import ScheduleAppointmentModal from './ScheduleAppointmentModal';

interface Appointment {
  id: number;
  status: 'pending' | 'confirmed';
  start_time: string;
  duration_minutes: number;
  location_type: string;
  location_details: string | null;
  notes: string | null;
  proposed_by: string;
  confirmed_at: string | null;
}

function formatDateFull(iso: string) {
  return formatAppointmentDate(iso);
}

interface AppointmentCancelModalProps {
  startTime: string;
  cancelReason: string;
  onCancelReasonChange: (v: string) => void;
  onClose: () => void;
  onSubmit: () => void;
  submitting: boolean;
}

function AppointmentCancelModal({ startTime, cancelReason, onCancelReasonChange, onClose, onSubmit, submitting }: AppointmentCancelModalProps) {
  const [touched, setTouched] = useState(false);
  const isEmpty = !cancelReason.trim();

  const handleSubmit = () => {
    setTouched(true);
    if (isEmpty) return;
    onSubmit();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-4">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center shrink-0">
              <AlertTriangle size={16} className="text-red-600" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-900">Cancel Appointment</h2>
              <p className="text-xs text-gray-500 mt-0.5">This action cannot be undone</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Appointment details */}
          <div className="bg-gray-50 rounded-xl px-4 py-3">
            <p className="text-xs font-medium text-gray-500 mb-1">Scheduled visit</p>
            <p className="text-sm font-medium text-gray-900">{formatDateFull(startTime)}</p>
            <p className="text-sm text-gray-600">{formatTime(startTime)}</p>
          </div>

          {/* Reason */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">
              Reason for cancellation <span className="text-red-500">*</span>
            </label>
            <textarea
              value={cancelReason}
              onChange={e => onCancelReasonChange(e.target.value)}
              placeholder="Please provide a reason..."
              rows={3}
              className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent resize-none transition-colors ${touched && isEmpty ? 'border-red-400 bg-red-50' : 'border-gray-200'}`}
            />
            {touched && isEmpty && (
              <p className="text-xs text-red-600 mt-1">Please provide a reason for cancellation.</p>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-2 pb-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Keep Appointment
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-xl text-sm font-medium hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {submitting ? 'Canceling…' : 'Confirm Cancellation'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface AppointmentPanelProps {
  chatRequestId: string;
  currentUserId: string;
  onCloseChat?: () => void;
  closingChat?: boolean;
}

function formatDate(iso: string) {
  return formatAppointmentDate(iso);
}

function formatTime(iso: string) {
  return formatAppointmentTime(iso);
}

function locationLabel(type: string, details: string | null) {
  const base =
    type === 'individual_address' ? "Individual's home" :
    type === 'public' ? 'Public place' : 'Other';
  return details ? `${base} — ${details}` : base;
}

function CloseChatButton({ onClick, disabled }: { onClick?: () => void; disabled?: boolean }) {
  if (!onClick) return null;
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="text-xs font-medium text-gray-500 border border-gray-200 rounded-full px-2.5 py-1 hover:border-red-300 hover:text-red-600 disabled:opacity-40 transition-colors shrink-0"
    >
      {disabled ? 'Closing…' : 'Close Chat'}
    </button>
  );
}

export default function AppointmentPanel({ chatRequestId, currentUserId, onCloseChat, closingChat }: AppointmentPanelProps) {
  const [appointment, setAppointment] = useState<Appointment | null | undefined>(undefined);
  const [expanded, setExpanded] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [modifyingId, setModifyingId] = useState<number | undefined>(undefined);
  const [acting, setActing] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  const fetchAppointment = useCallback(async () => {
    try {
      const res = await fetch(`/api/chat-request/${chatRequestId}/appointment`);
      if (res.ok) {
        const data = await res.json();
        setAppointment(data.appointment ?? null);
      }
    } catch {
      // Non-fatal
    }
  }, [chatRequestId]);

  useEffect(() => {
    fetchAppointment();
  }, [fetchAppointment]);

  const handleConfirm = async () => {
    if (!appointment) return;
    setActing(true);
    try {
      const res = await fetch('/api/appointment/confirm-proposal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appointment_id: appointment.id }),
      });
      if (res.ok) fetchAppointment();
    } finally {
      setActing(false);
    }
  };

  const handleDeclineOrWithdraw = async () => {
    if (!appointment) return;
    setActing(true);
    try {
      const res = await fetch('/api/appointment/decline-proposal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appointment_id: appointment.id }),
      });
      if (res.ok) fetchAppointment();
    } finally {
      setActing(false);
    }
  };

  const handleCancelConfirmed = async () => {
    if (!appointment) return;
    setActing(true);
    try {
      const res = await fetch('/api/appointment/decline-proposal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appointment_id: appointment.id, cancellation_reason: cancelReason || null }),
      });
      if (res.ok) {
        setShowCancelModal(false);
        setCancelReason('');
        fetchAppointment();
      }
    } finally {
      setActing(false);
    }
  };

  const openModify = () => {
    if (!appointment) return;
    setModifyingId(appointment.id);
    setShowModal(true);
  };

  // Still loading
  if (appointment === undefined) return null;

  // ── No active appointment ──────────────────────────────────────
  if (appointment === null) {
    return (
      <div className="flex items-center justify-end px-3 py-1.5 border-b border-gray-100 bg-white gap-2">
        <button
          onClick={() => { setModifyingId(undefined); setShowModal(true); }}
          className="inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-full px-3.5 py-1.5 text-xs font-semibold shadow-sm transition-colors"
        >
          <CalendarPlus size={12} />
          Schedule a Visit
        </button>
        <CloseChatButton onClick={onCloseChat} disabled={closingChat} />

        {showModal && (
          <ScheduleAppointmentModal
            chatRequestId={chatRequestId}
            onClose={() => setShowModal(false)}
            onProposed={() => { setShowModal(false); fetchAppointment(); }}
          />
        )}
      </div>
    );
  }

  // ── Active appointment ─────────────────────────────────────────
  const iAmProposer = appointment.proposed_by === currentUserId;
  const isConfirmed = appointment.status === 'confirmed';
  const isPending = appointment.status === 'pending';

  const panelBg = isConfirmed ? 'bg-green-50 border-green-100' : 'bg-amber-50 border-amber-100';
  const pillColor = isConfirmed ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800';
  const dotColor = isConfirmed ? 'bg-green-500' : 'bg-amber-500';

  return (
    <div className={`border-b ${panelBg}`}>
      {/* Summary row */}
      <div className="flex items-center px-3 py-1.5 gap-2">
        <button
          onClick={() => setExpanded(v => !v)}
          className="flex items-center gap-1.5 min-w-0 flex-1 text-left"
        >
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium shrink-0 ${pillColor}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
            {isConfirmed ? 'Confirmed' : 'Proposed'}
          </span>
          <span className="text-xs text-gray-600 truncate">
            {formatDate(appointment.start_time)} · {formatTime(appointment.start_time)}
          </span>
          {expanded
            ? <ChevronUp size={12} className="text-gray-400 shrink-0" />
            : <ChevronDown size={12} className="text-gray-400 shrink-0" />
          }
        </button>
        <CloseChatButton onClick={onCloseChat} disabled={closingChat} />
      </div>

      {expanded && (
        <div className="px-3 pb-2 space-y-1.5">
          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            <MapPin size={11} className="text-gray-400 shrink-0" />
            <span>{locationLabel(appointment.location_type, appointment.location_details)}</span>
          </div>

          {appointment.notes && (
            <p className="text-xs text-gray-500 italic pl-4">"{appointment.notes}"</p>
          )}

          {/* Actions */}
          {isPending && !iAmProposer && (
            <div className="flex items-center gap-2 pt-0.5">
              <button
                onClick={handleConfirm}
                disabled={acting}
                className="inline-flex items-center gap-1 bg-green-600 hover:bg-green-700 text-white rounded-full px-3 py-1 text-xs font-semibold disabled:opacity-50 transition-colors"
              >
                <CheckCircle size={11} />
                {acting ? '…' : 'Confirm Visit'}
              </button>
              <button
                onClick={handleDeclineOrWithdraw}
                disabled={acting}
                className="text-xs text-gray-500 hover:text-red-600 disabled:opacity-50 transition-colors"
              >
                Decline
              </button>
            </div>
          )}

          {isPending && iAmProposer && (
            <div className="flex items-center gap-3 pt-0.5">
              <span className="inline-flex items-center gap-1 text-xs text-amber-700">
                <Clock size={11} />
                Waiting for confirmation…
              </span>
              <button
                onClick={handleDeclineOrWithdraw}
                disabled={acting}
                className="text-xs text-gray-400 hover:text-red-600 disabled:opacity-50 transition-colors"
              >
                Withdraw
              </button>
            </div>
          )}

          {isConfirmed && (
            <div className="flex items-center gap-3 pt-0.5">
              <span className="inline-flex items-center gap-1 text-xs text-green-700 font-medium">
                <CheckCircle size={11} />
                Confirmed
              </span>
              <button
                onClick={openModify}
                disabled={acting}
                className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-blue-600 disabled:opacity-50 transition-colors"
              >
                <Pencil size={10} />
                Propose changes
              </button>
              <button
                onClick={() => { setCancelReason(''); setShowCancelModal(true); }}
                disabled={acting}
                className="text-xs text-gray-400 hover:text-red-600 disabled:opacity-50 transition-colors"
              >
                Cancel Appointment
              </button>
            </div>
          )}
        </div>
      )}

      {showModal && (
        <ScheduleAppointmentModal
          chatRequestId={chatRequestId}
          replacingAppointmentId={modifyingId}
          onClose={() => { setShowModal(false); setModifyingId(undefined); }}
          onProposed={() => { setShowModal(false); setModifyingId(undefined); fetchAppointment(); }}
        />
      )}

      {showCancelModal && appointment && (
        <AppointmentCancelModal
          startTime={appointment.start_time}
          cancelReason={cancelReason}
          onCancelReasonChange={setCancelReason}
          onClose={() => setShowCancelModal(false)}
          onSubmit={handleCancelConfirmed}
          submitting={acting}
        />
      )}
    </div>
  );
}
