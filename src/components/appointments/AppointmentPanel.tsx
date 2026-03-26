'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { CalendarPlus, CheckCircle, Clock, MapPin, ChevronDown, ChevronUp, Pencil } from 'lucide-react';
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

interface AppointmentPanelProps {
  chatRequestId: string;
  currentUserId: string;
  onCloseChat?: () => void;
  closingChat?: boolean;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric'
  });
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit', hour12: true
  });
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
    const label = appointment.proposed_by === currentUserId
      ? 'Withdraw your visit proposal?'
      : 'Decline this visit proposal?';
    if (!window.confirm(label)) return;
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
    if (!window.confirm('Cancel this confirmed visit?')) return;
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
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-gray-100 bg-white gap-3">
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
                onClick={handleCancelConfirmed}
                disabled={acting}
                className="text-xs text-gray-400 hover:text-red-600 disabled:opacity-50 transition-colors"
              >
                Cancel
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
    </div>
  );
}
