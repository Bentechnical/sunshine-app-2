// src/components/visits/BrowseOrgVisits.tsx
'use client';

import { useEffect, useState } from 'react';
import { Calendar, Clock, MapPin, Users, AlertCircle, CheckCircle } from 'lucide-react';

interface OrgVisit {
  id: number;
  title: string;
  visit_date: string;
  start_time: string;
  end_time: string;
  address: string;
  max_volunteers: number;
  expected_visitors: number | null;
  requires_vsc: boolean;
  requires_vaccine: boolean;
  parking_info: string | null;
  special_instructions: string | null;
  notes_for_volunteer: string | null;
  organization_name: string | null;
  confirmed_count: number;
  waitlisted_count: number;
  my_registration_status: string | null; // 'confirmed' | 'waitlisted' | 'cancelled' | null
}

function formatDate(dateStr: string) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-CA', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
}

function formatTime(tsStr: string) {
  return new Date(tsStr).toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit' });
}

export default function BrowseOrgVisits() {
  const [visits, setVisits] = useState<OrgVisit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [actionError, setActionError] = useState<Record<number, string>>({});

  useEffect(() => {
    fetchVisits();
  }, []);

  const fetchVisits = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/visits/available');
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || 'Failed to load visits');
        return;
      }
      setVisits(json.visits || []);
    } catch {
      setError('Failed to load visits');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (visitId: number) => {
    setActionLoading(visitId);
    setActionError(prev => { const n = { ...prev }; delete n[visitId]; return n; });
    try {
      const res = await fetch(`/api/visits/${visitId}/register`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok) {
        setActionError(prev => ({ ...prev, [visitId]: json.error || 'Failed to register' }));
        return;
      }
      // Update local state
      setVisits(prev => prev.map(v => {
        if (v.id !== visitId) return v;
        const isWaitlisted = json.status === 'waitlisted';
        return {
          ...v,
          my_registration_status: json.status,
          confirmed_count: isWaitlisted ? v.confirmed_count : v.confirmed_count + 1,
          waitlisted_count: isWaitlisted ? v.waitlisted_count + 1 : v.waitlisted_count,
        };
      }));
    } catch {
      setActionError(prev => ({ ...prev, [visitId]: 'An error occurred. Please try again.' }));
    } finally {
      setActionLoading(null);
    }
  };

  const handleCancel = async (visitId: number) => {
    setActionLoading(visitId);
    setActionError(prev => { const n = { ...prev }; delete n[visitId]; return n; });
    try {
      const res = await fetch(`/api/visits/${visitId}/cancel-registration`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok) {
        setActionError(prev => ({ ...prev, [visitId]: json.error || 'Failed to cancel' }));
        return;
      }
      setVisits(prev => prev.map(v => {
        if (v.id !== visitId) return v;
        const wasConfirmed = v.my_registration_status === 'confirmed';
        return {
          ...v,
          my_registration_status: null,
          confirmed_count: wasConfirmed ? Math.max(0, v.confirmed_count - 1) : v.confirmed_count,
          waitlisted_count: !wasConfirmed ? Math.max(0, v.waitlisted_count - 1) : v.waitlisted_count,
        };
      }));
    } catch {
      setActionError(prev => ({ ...prev, [visitId]: 'An error occurred. Please try again.' }));
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-6 flex items-start gap-3">
        <AlertCircle className="text-red-500 mt-0.5 shrink-0" size={18} />
        <p className="text-red-700 text-sm">{error}</p>
      </div>
    );
  }

  if (visits.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-12 text-center shadow-sm">
        <Calendar className="mx-auto mb-4 text-gray-300" size={48} />
        <h3 className="text-lg font-semibold text-gray-700 mb-1">No upcoming visits</h3>
        <p className="text-gray-500 text-sm">Check back soon — new organization visits will appear here once approved.</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-1">Browse Organization Visits</h2>
        <p className="text-gray-500 text-sm">Sign up to bring your therapy dog to an upcoming visit.</p>
      </div>

      <div className="space-y-4">
        {visits.map(visit => {
          const openSlots = visit.max_volunteers - visit.confirmed_count;
          const isRegistered = visit.my_registration_status === 'confirmed' || visit.my_registration_status === 'waitlisted';
          const isWaitlisted = visit.my_registration_status === 'waitlisted';
          const isConfirmed = visit.my_registration_status === 'confirmed';
          const isFull = openSlots <= 0;
          const isLoading = actionLoading === visit.id;

          return (
            <div key={visit.id} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="p-5">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <h3 className="font-semibold text-gray-900 text-base leading-snug">{visit.title}</h3>
                    {visit.organization_name && (
                      <p className="text-xs text-gray-500 mt-0.5">{visit.organization_name}</p>
                    )}
                  </div>
                  <div className="shrink-0 flex flex-col items-end gap-1">
                    {isConfirmed && (
                      <span className="inline-flex items-center gap-1 text-xs font-medium bg-green-100 text-green-700 px-2.5 py-1 rounded-full">
                        <CheckCircle size={12} /> Registered
                      </span>
                    )}
                    {isWaitlisted && (
                      <span className="text-xs font-medium bg-yellow-100 text-yellow-700 px-2.5 py-1 rounded-full">
                        Waitlisted
                      </span>
                    )}
                    {!isRegistered && isFull && (
                      <span className="text-xs font-medium bg-gray-100 text-gray-500 px-2.5 py-1 rounded-full">
                        Full — Join Waitlist
                      </span>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-sm text-gray-600 mb-3">
                  <div className="flex items-center gap-2">
                    <Calendar size={14} className="text-gray-400 shrink-0" />
                    <span>{formatDate(visit.visit_date)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock size={14} className="text-gray-400 shrink-0" />
                    <span>{formatTime(visit.start_time)} – {formatTime(visit.end_time)}</span>
                  </div>
                  <div className="flex items-center gap-2 sm:col-span-2">
                    <MapPin size={14} className="text-gray-400 shrink-0" />
                    <span>{visit.address}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Users size={14} className="text-gray-400 shrink-0" />
                    <span>
                      {visit.confirmed_count} / {visit.max_volunteers} spots filled
                      {openSlots > 0 && (
                        <span className="text-blue-600 font-medium ml-1">({openSlots} open)</span>
                      )}
                      {visit.waitlisted_count > 0 && (
                        <span className="text-yellow-600 ml-1">· {visit.waitlisted_count} waitlisted</span>
                      )}
                    </span>
                  </div>
                </div>

                {/* Requirements */}
                {(visit.requires_vsc || visit.requires_vaccine) && (
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {visit.requires_vsc && (
                      <span className="bg-purple-50 text-purple-700 text-xs font-medium px-2 py-0.5 rounded-full">VSC Required</span>
                    )}
                    {visit.requires_vaccine && (
                      <span className="bg-orange-50 text-orange-700 text-xs font-medium px-2 py-0.5 rounded-full">Vaccine Records Required</span>
                    )}
                  </div>
                )}

                {/* Details */}
                {visit.parking_info && (
                  <p className="text-xs text-gray-500 mb-1"><span className="font-medium">Parking:</span> {visit.parking_info}</p>
                )}
                {visit.notes_for_volunteer && (
                  <p className="text-xs text-gray-500"><span className="font-medium">Notes:</span> {visit.notes_for_volunteer}</p>
                )}

                {actionError[visit.id] && (
                  <p className="mt-2 text-xs text-red-600">{actionError[visit.id]}</p>
                )}
              </div>

              <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex items-center gap-3">
                {!isRegistered ? (
                  <button
                    onClick={() => handleRegister(visit.id)}
                    disabled={isLoading}
                    className="px-4 py-2 bg-[#0e62ae] hover:bg-[#0a4f8f] text-white text-sm font-semibold rounded-lg transition disabled:opacity-50"
                  >
                    {isLoading ? 'Signing up…' : isFull ? 'Join Waitlist' : 'Sign Up'}
                  </button>
                ) : (
                  <button
                    onClick={() => handleCancel(visit.id)}
                    disabled={isLoading}
                    className="px-4 py-2 bg-white border border-red-300 text-red-600 hover:bg-red-50 text-sm font-semibold rounded-lg transition disabled:opacity-50"
                  >
                    {isLoading ? 'Cancelling…' : 'Cancel Registration'}
                  </button>
                )}
                {isFull && !isRegistered && (
                  <p className="text-xs text-gray-500">All spots are filled. Join the waitlist and we'll notify you if a spot opens.</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
