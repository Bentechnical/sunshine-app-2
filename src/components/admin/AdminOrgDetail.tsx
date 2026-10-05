// src/components/admin/AdminOrgDetail.tsx
// Dedicated org detail view: profile card + visit history list.
// Rendered when an org is selected from the Manage Organizations table.

'use client';

import { useEffect, useState } from 'react';
import {
  ArrowLeft, Building2, Calendar, Clock, ChevronRight,
  Pencil, Link2, Unlink,
} from 'lucide-react';
import { formatCardTime } from '@/utils/timeZone';
import { VolunteerSlotBar } from '@/components/visits/VolunteerSlotBar';
import { formatPhoneDisplay } from '@/utils/formatPhone';

// ─── Types ────────────────────────────────────────────────────────────────────

type VisitStatus = 'pending_review' | 'approved' | 'declined' | 'cancelled' | 'completed';

interface OrgData {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  org_name: string;
  org_type: string;
  org_logo: string | null;
  org_address: string;
  org_contact_name: string;
  org_contact_phone: string;
  assigned_region_id: number | null;
  fee_tier: string | null;
  is_admin_managed: boolean;
}

interface Region {
  id: number;
  name: string;
}

interface VisitSummary {
  id: number;
  title: string | null;
  guest_org_name: string | null;
  visit_date: string;
  start_time: string;
  end_time: string;
  address: string;
  volunteer_slots: number;
  min_volunteers: number;
  confirmed_count: number;
  slots_remaining: number;
  status: VisitStatus;
}

interface Props {
  org: OrgData;
  regions: Region[];
  onBack: () => void;
  onSelectVisit: (visitId: number) => void;
  onEditOrg: () => void;
  onArchiveOrg: () => void;
  onDeleteOrg: () => void;
  onLinkOrg: () => void;
  onUnlinkOrg: () => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const FEE_TIER_LABELS: Record<string, { short: string; full: string }> = {
  tier_500: { short: '$500', full: '$500 — Corporate / for-profit / conferences / large events' },
  tier_200: { short: '$200', full: '$200 — Post-secondary / private schools / private care / wellness' },
  tier_0:   { short: '$0',   full: '$0 — Public schools / non-profits / first responders / inpatients' },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDateShort(dateStr: string) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-CA', {
    weekday: 'short', month: 'short', day: 'numeric',
  });
}

function StatusBadge({ status }: { status: VisitStatus }) {
  const config: Record<VisitStatus, { label: string; classes: string }> = {
    pending_review: { label: 'Pending Review', classes: 'bg-amber-100 text-amber-800' },
    approved:       { label: 'Approved',        classes: 'bg-green-100 text-green-800' },
    declined:       { label: 'Declined',         classes: 'bg-red-100 text-red-800' },
    cancelled:      { label: 'Cancelled',        classes: 'bg-gray-100 text-gray-600' },
    completed:      { label: 'Completed',        classes: 'bg-blue-100 text-blue-800' },
  };
  const { label, classes } = config[status] ?? config.pending_review;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${classes}`}>
      {label}
    </span>
  );
}


// ─── Main Component ───────────────────────────────────────────────────────────

export default function AdminOrgDetail({
  org, regions, onBack, onSelectVisit, onEditOrg, onArchiveOrg, onDeleteOrg, onLinkOrg, onUnlinkOrg,
}: Props) {
  const [visits, setVisits] = useState<VisitSummary[]>([]);
  const [visitsLoading, setVisitsLoading] = useState(true);
  const [visitFilter, setVisitFilter] = useState<'all' | 'upcoming' | 'pending' | 'past'>('all');

  const assignedRegion = regions.find(r => r.id === org.assigned_region_id);
  const feeTier = org.fee_tier ? FEE_TIER_LABELS[org.fee_tier] : null;

  // Fetch visits for this org
  useEffect(() => {
    const fetchVisits = async () => {
      setVisitsLoading(true);
      try {
        const res = await fetch(`/api/admin/visits?org=${org.id}`);
        const json = await res.json();
        if (res.ok) {
          setVisits(json.visits ?? []);
        }
      } catch (err) {
        console.error('[AdminOrgDetail] Failed to fetch visits:', err);
      } finally {
        setVisitsLoading(false);
      }
    };
    fetchVisits();
  }, [org.id]);

  // Filter visits
  const now = new Date().toISOString();
  const filteredVisits = visits.filter(v => {
    if (visitFilter === 'upcoming') return v.end_time > now && v.status === 'approved';
    if (visitFilter === 'pending') return v.status === 'pending_review';
    if (visitFilter === 'past') return v.end_time <= now || ['cancelled', 'declined', 'completed'].includes(v.status);
    return true;
  });

  // Sort: upcoming = soonest first, others = most recent first
  const sortedVisits = [...filteredVisits].sort((a, b) => {
    if (visitFilter === 'upcoming') return new Date(a.visit_date).getTime() - new Date(b.visit_date).getTime();
    return new Date(b.visit_date).getTime() - new Date(a.visit_date).getTime();
  });

  return (
    <div className="px-4 py-4 max-w-3xl mx-auto">
      {/* Back bar */}
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 font-medium transition mb-5"
      >
        <ArrowLeft size={16} /> Back
      </button>

      {/* ── Org Profile Card ── */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm mb-6">
        {/* Header: logo + name + type */}
        <div className="flex gap-4 items-start mb-5">
          {org.org_logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={org.org_logo} alt={org.org_name} className="w-16 h-16 rounded-xl object-cover shrink-0" />
          ) : (
            <div className="w-16 h-16 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0">
              <Building2 size={28} className="text-blue-300" />
            </div>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold text-gray-900">{org.org_name || '—'}</h1>
              {org.is_admin_managed && (
                <span className="text-[10px] font-semibold bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full">
                  Admin-managed
                </span>
              )}
            </div>
            {org.org_type && (
              <p className="text-sm text-gray-500 mt-0.5">{org.org_type}</p>
            )}
            {org.org_address && (
              <p className="text-sm text-gray-500 mt-0.5">{org.org_address}</p>
            )}
          </div>
        </div>

        {/* Contact + meta grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-sm mb-5">
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Contact Name</p>
            <p className="text-gray-900">{org.org_contact_name || `${org.first_name} ${org.last_name}`}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Contact Phone</p>
            <p className="text-gray-900">{formatPhoneDisplay(org.org_contact_phone) || '—'}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Account Email</p>
            <p className="text-gray-900">{org.email || '—'}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Fee Tier</p>
            {feeTier ? (
              <span className="text-xs font-semibold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">{feeTier.full}</span>
            ) : (
              <span className="text-xs font-semibold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">Not set</span>
            )}
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Region</p>
            {assignedRegion ? (
              <span className="text-xs font-semibold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">{assignedRegion.name}</span>
            ) : (
              <span className="text-xs font-semibold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">Unassigned</span>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div className="pt-4 border-t border-gray-200 flex flex-wrap gap-2">
          <button
            onClick={onEditOrg}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded transition"
          >
            <Pencil size={14} /> Edit
          </button>
          {org.is_admin_managed ? (
            <>
              <button
                onClick={onLinkOrg}
                className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded transition"
              >
                <Link2 size={14} /> Link to Account
              </button>
              <button
                onClick={onDeleteOrg}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded transition"
              >
                Delete
              </button>
            </>
          ) : (
            <>
              <button
                onClick={onUnlinkOrg}
                className="flex items-center gap-1.5 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium rounded transition"
              >
                <Unlink size={14} /> Detach to Managed
              </button>
              <button
                onClick={onArchiveOrg}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded transition"
              >
                Archive
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── Visit History ── */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-gray-900">Visit History</h2>
          <div className="inline-flex border border-gray-200 rounded-lg overflow-hidden">
            {(['all', 'upcoming', 'pending', 'past'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setVisitFilter(tab)}
                className={`px-3 py-1.5 text-xs font-semibold transition-all border-r border-gray-200 last:border-r-0 ${
                  visitFilter === tab
                    ? 'bg-[#0e62ae] text-white'
                    : 'bg-white text-gray-400 hover:bg-gray-50 hover:text-gray-600'
                }`}
              >
                {tab === 'pending' ? 'Pending' : tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {visitsLoading && (
          <div className="flex items-center justify-center py-12 gap-2">
            <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm text-gray-600">Loading visits…</span>
          </div>
        )}

        {!visitsLoading && sortedVisits.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            <Calendar className="mx-auto mb-3 text-gray-300" size={40} />
            <p className="font-medium">
              {visitFilter === 'upcoming' ? 'No upcoming visits' :
               visitFilter === 'pending' ? 'No pending visits' :
               visitFilter === 'past' ? 'No past visits' :
               'No visits found'}
            </p>
            <p className="text-sm mt-1">
              {visitFilter === 'upcoming'
                ? 'This organization has no active or scheduled visits.'
                : visitFilter === 'pending'
                  ? 'No visits are awaiting review.'
                  : 'Visits will appear here once created.'}
            </p>
          </div>
        )}

        {!visitsLoading && sortedVisits.length > 0 && (
          <div className="space-y-3">
            {sortedVisits.map(visit => {
              const isPast = visit.end_time <= now || ['cancelled', 'declined', 'completed'].includes(visit.status);
              return (
                <div
                  key={visit.id}
                  onClick={() => onSelectVisit(visit.id)}
                  className={`border rounded-xl p-4 cursor-pointer transition-all group ${
                    isPast
                      ? 'border-gray-200 hover:border-gray-300 hover:shadow-sm opacity-80'
                      : 'border-gray-100 hover:border-blue-200 hover:shadow-sm'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <StatusBadge status={visit.status} />
                    </div>
                    <ChevronRight size={16} className="text-gray-300 group-hover:text-blue-400 shrink-0 transition-colors" />
                  </div>

                  {visit.title && (
                    <p className="text-sm font-semibold text-gray-900 mb-0.5">{visit.title}</p>
                  )}

                  <div className="flex items-center gap-4 text-sm text-gray-600 mb-2">
                    <span className="flex items-center gap-1.5">
                      <Calendar size={13} className="text-gray-400" />
                      {formatDateShort(visit.visit_date)}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Clock size={13} className="text-gray-400" />
                      {formatCardTime(visit.start_time)} – {formatCardTime(visit.end_time)}
                    </span>
                  </div>

                  <p className="text-xs text-gray-500 truncate mb-2">{visit.address}</p>

                  <VolunteerSlotBar confirmed={visit.confirmed_count} min={visit.min_volunteers ?? visit.volunteer_slots} max={visit.volunteer_slots} showMinimum />
                </div>
              );
            })}
          </div>
        )}

        {/* Summary stats */}
        {!visitsLoading && visits.length > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-100 flex items-center gap-6 text-xs text-gray-500">
            <span>{visits.filter(v => v.status === 'completed').length} completed</span>
            <span>{visits.filter(v => v.status === 'approved' && v.end_time > now).length} upcoming</span>
            <span>{visits.length} total</span>
          </div>
        )}
      </div>
    </div>
  );
}
