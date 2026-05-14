// src/components/visits/OrgMyVisits.tsx
'use client';

import { useEffect, useState } from 'react';
import { Calendar, Clock, MapPin, Users, AlertCircle } from 'lucide-react';

interface VisitRegistrationCount {
  confirmed: number;
  waitlisted: number;
}

interface OrgVisit {
  id: number;
  title: string;
  visit_date: string;
  start_time: string;
  end_time: string;
  address: string;
  status: string;
  max_volunteers: number;
  expected_visitors: number | null;
  requires_vsc: boolean;
  requires_vaccine: boolean;
  registration_counts: VisitRegistrationCount;
}

const STATUS_STYLES: Record<string, string> = {
  pending_review: 'bg-yellow-100 text-yellow-800',
  approved:       'bg-green-100 text-green-800',
  declined:       'bg-red-100 text-red-800',
  cancelled:      'bg-gray-100 text-gray-600',
  completed:      'bg-blue-100 text-blue-800',
};

const STATUS_LABELS: Record<string, string> = {
  pending_review: 'Pending Review',
  approved:       'Approved',
  declined:       'Declined',
  cancelled:      'Cancelled',
  completed:      'Completed',
};

function formatDate(dateStr: string) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-CA', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
}

function formatTime(tsStr: string) {
  return new Date(tsStr).toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit' });
}

export default function OrgMyVisits() {
  const [visits, setVisits] = useState<OrgVisit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchVisits = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/visits/my');
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
    fetchVisits();
  }, []);

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
        <h3 className="text-lg font-semibold text-gray-700 mb-1">No visits yet</h3>
        <p className="text-gray-500 text-sm">Submit a visit request and we'll review it shortly.</p>
      </div>
    );
  }

  const upcoming = visits.filter(v => v.status !== 'completed' && v.status !== 'cancelled' && v.status !== 'declined');
  const past = visits.filter(v => v.status === 'completed' || v.status === 'cancelled' || v.status === 'declined');

  const renderCard = (visit: OrgVisit) => {
    const openSlots = visit.max_volunteers - (visit.registration_counts?.confirmed ?? 0);
    return (
      <div key={visit.id} className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3 mb-3">
          <h3 className="font-semibold text-gray-900 text-base leading-snug">{visit.title}</h3>
          <span className={`shrink-0 text-xs font-medium px-2.5 py-1 rounded-full ${STATUS_STYLES[visit.status] ?? 'bg-gray-100 text-gray-600'}`}>
            {STATUS_LABELS[visit.status] ?? visit.status}
          </span>
        </div>

        <div className="space-y-1.5 text-sm text-gray-600">
          <div className="flex items-center gap-2">
            <Calendar size={14} className="text-gray-400 shrink-0" />
            <span>{formatDate(visit.visit_date)}</span>
          </div>
          <div className="flex items-center gap-2">
            <Clock size={14} className="text-gray-400 shrink-0" />
            <span>{formatTime(visit.start_time)} – {formatTime(visit.end_time)}</span>
          </div>
          <div className="flex items-center gap-2">
            <MapPin size={14} className="text-gray-400 shrink-0" />
            <span>{visit.address}</span>
          </div>
          <div className="flex items-center gap-2">
            <Users size={14} className="text-gray-400 shrink-0" />
            <span>
              {visit.registration_counts?.confirmed ?? 0} / {visit.max_volunteers} volunteers confirmed
              {visit.status === 'approved' && openSlots > 0 && (
                <span className="ml-1 text-blue-600 font-medium">({openSlots} spot{openSlots !== 1 ? 's' : ''} open)</span>
              )}
            </span>
          </div>
        </div>

        {(visit.requires_vsc || visit.requires_vaccine) && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {visit.requires_vsc && (
              <span className="bg-purple-50 text-purple-700 text-xs font-medium px-2 py-0.5 rounded-full">VSC Required</span>
            )}
            {visit.requires_vaccine && (
              <span className="bg-orange-50 text-orange-700 text-xs font-medium px-2 py-0.5 rounded-full">Vaccine Required</span>
            )}
          </div>
        )}

        {visit.status === 'pending_review' && (
          <p className="mt-3 text-xs text-gray-500 italic">Our team is reviewing your request and will be in touch soon.</p>
        )}
        {visit.status === 'declined' && (
          <p className="mt-3 text-xs text-red-600 italic">This visit request was not approved. Contact us if you have questions.</p>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-8">
      {upcoming.length > 0 && (
        <section>
          <h2 className="text-lg font-bold text-gray-900 mb-3">Upcoming &amp; Active</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {upcoming.map(renderCard)}
          </div>
        </section>
      )}
      {past.length > 0 && (
        <section>
          <h2 className="text-lg font-bold text-gray-900 mb-3">Past Visits</h2>
          <div className="grid gap-4 sm:grid-cols-2 opacity-80">
            {past.map(renderCard)}
          </div>
        </section>
      )}
    </div>
  );
}
