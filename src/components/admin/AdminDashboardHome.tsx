'use client';

import { useEffect, useState } from 'react';
import { useUser } from '@clerk/nextjs';
import {
  AlertTriangle, CalendarClock, CheckCircle2, ChevronRight, ClipboardCheck,
  FileText, Inbox, MapPin, UserPlus, UserX,
} from 'lucide-react';
import { formatCardTime } from '@/utils/timeZone';
import { getVisitAlerts, daysUntilVisit } from '@/utils/visitSlots';
import { StaffingStatus } from '@/components/visits/VolunteerSlotBar';

const UPCOMING_WINDOW_DAYS = 7;
const MAX_ROWS = 8;

interface HomeVisit {
  id: number;
  title: string | null;
  guest_org_name: string | null;
  org_name: string | null;
  visit_date: string;
  start_time: string;
  end_time: string;
  status: string;
  volunteer_slots: number;
  min_volunteers: number | null;
  confirmed_count: number;
  waitlist_count: number;
  assigned_pd_id: string | null;
}

interface Region {
  id: number;
  name: string;
  owner_pd_id: string | null;
}

interface Props {
  pdMode?: boolean;
  onOpenVisit: (id: number) => void;
  // param = dashboard ?tab= value; filter = optional ?filter= for the visits list
  onOpenTab: (param: string, filter?: string) => void;
}

interface ReviewCounts {
  visitRequests: number;
  pendingCompletion: number;
  userRequests: number;
  docReviews: number;
  unassigned: number;
}

function visitLabel(v: HomeVisit) {
  return v.guest_org_name || v.org_name || v.title || 'Visit';
}

function formatDay(visitDate: string) {
  const days = daysUntilVisit(visitDate);
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  return new Date(visitDate + 'T00:00:00').toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric' });
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

export default function AdminDashboardHome({ pdMode = false, onOpenVisit, onOpenTab }: Props) {
  const { user } = useUser();
  const [activeVisits, setActiveVisits] = useState<HomeVisit[] | null>(null);
  const [counts, setCounts] = useState<ReviewCounts | null>(null);
  const [regions, setRegions] = useState<Region[]>([]);
  const [regionFilter, setRegionFilter] = useState('all');
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    const mine = <T extends { assigned_pd_id: string | null }>(list: T[]) =>
      pdMode ? list.filter(v => v.assigned_pd_id === user.id) : list;
    const json = (url: string): Promise<any> => fetch(url).then(r => (r.ok ? r.json() : {}));

    Promise.all([
      json('/api/admin/visits?scope=active'),
      json('/api/admin/visits?status=pending_review'),
      json('/api/admin/visits?scope=pending_completion'),
      json('/api/admin/pending-users'),
      json('/api/admin/pending-doc-reviews-count'),
      json('/api/admin/regions'),
    ]).then(([activeJson, reviewJson, completionJson, usersJson, docsJson, regionsJson]) => {
      const active = mine((activeJson.visits ?? []) as HomeVisit[]);
      setActiveVisits(active);

      // Same role rules as the nav badges (useAdminAlertCounts)
      const pendingUsers: { role: string }[] = usersJson.users ?? [];
      const userRoles = pdMode ? ['volunteer', 'organization'] : ['volunteer', 'individual', 'organization'];

      setCounts({
        visitRequests: mine(reviewJson.visits ?? []).length,
        pendingCompletion: mine(completionJson.visits ?? []).length,
        userRequests: pendingUsers.filter(u => userRoles.includes(u.role)).length,
        docReviews: docsJson.count ?? 0,
        unassigned: pdMode ? 0 : active.filter(v => !v.assigned_pd_id).length,
      });

      setRegions(((regionsJson.regions ?? []) as (Region & { is_active: boolean })[]).filter(r => r.is_active));
    }).catch(() => setError(true));
  }, [pdMode, user?.id]);

  const myRegion = pdMode ? regions.find(r => r.owner_pd_id === user?.id) ?? null : null;
  const selectedRegion = regions.find(r => String(r.id) === regionFilter) ?? null;
  const visits = (activeVisits ?? []).filter(v =>
    pdMode || !selectedRegion || v.assigned_pd_id === selectedRegion.owner_pd_id
  );

  const needsAttention = visits
    .map(v => ({ visit: v, alerts: getVisitAlerts(v) }))
    .filter(({ alerts }) => alerts.needsAttention);
  const comingUp = visits.filter(v => daysUntilVisit(v.visit_date) <= UPCOMING_WINDOW_DAYS);

  const reviewTiles = counts ? [
    { key: 'visit-requests', label: 'Visit requests', count: counts.visitRequests, icon: Inbox, onClick: () => onOpenTab('group-visits', 'pending_review') },
    { key: 'completion', label: 'Mark as complete', count: counts.pendingCompletion, icon: ClipboardCheck, onClick: () => onOpenTab('group-visits', 'pending_completion') },
    { key: 'users', label: 'User requests', count: counts.userRequests, icon: UserPlus, onClick: () => onOpenTab('user-requests') },
    { key: 'docs', label: 'Documents to review', count: counts.docReviews, icon: FileText, onClick: () => onOpenTab('manage-volunteers') },
    ...(!pdMode ? [{ key: 'unassigned', label: 'Visits without a PD', count: counts.unassigned, icon: UserX, onClick: () => onOpenTab('group-visits', 'unassigned') }] : []),
  ] : [];

  const loading = activeVisits === null && !error;

  return (
    <div className="p-4 space-y-5 max-w-4xl">
      {/* Header */}
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-gray-900">
            {greeting()}{user?.firstName ? `, ${user.firstName}` : ''}
          </h1>
          {pdMode && (
            <p className="text-sm text-gray-500 flex items-center gap-1 mt-0.5">
              <MapPin size={13} className="text-green-600" />
              {myRegion ? myRegion.name : <span className="italic">No region assigned</span>}
            </p>
          )}
        </div>
        {!pdMode && regions.length > 0 && (
          <select
            value={regionFilter}
            onChange={e => setRegionFilter(e.target.value)}
            className="border border-gray-300 px-3 py-1.5 rounded-md text-sm bg-white"
          >
            <option value="all">All Regions</option>
            {regions.map(r => <option key={r.id} value={String(r.id)}>{r.name}</option>)}
          </select>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
          Couldn&apos;t load your overview. Please refresh the page.
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-16 gap-2">
          <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-gray-600">Loading…</span>
        </div>
      )}

      {!loading && !error && (<>
        {/* 1. Needs attention */}
        <section className="bg-white rounded-xl border border-gray-200 shadow-sm">
          <div className="px-5 pt-4 pb-3 flex items-center gap-2">
            <AlertTriangle size={16} className={needsAttention.length > 0 ? 'text-red-500' : 'text-gray-300'} />
            <h2 className="text-sm font-semibold text-gray-800">Needs attention</h2>
            {needsAttention.length > 0 && (
              <span className="bg-red-500 text-white text-xs font-bold rounded-full px-1.5 py-0.5 leading-none">{needsAttention.length}</span>
            )}
          </div>
          {needsAttention.length === 0 ? (
            <p className="px-5 pb-4 text-sm text-gray-500 flex items-center gap-1.5">
              <CheckCircle2 size={14} className="text-green-600" />
              All upcoming visits are on track.
            </p>
          ) : (
            <ul className="border-t border-gray-100 divide-y divide-gray-100">
              {needsAttention.slice(0, MAX_ROWS).map(({ visit: v, alerts }) => {
                const min = v.min_volunteers ?? v.volunteer_slots;
                return (
                  <li key={v.id}>
                    <button onClick={() => onOpenVisit(v.id)}
                      className="w-full text-left px-5 py-3 hover:bg-gray-50 flex items-center gap-3 group">
                      <div className="w-24 shrink-0">
                        <p className="text-sm font-semibold text-gray-800">{formatDay(v.visit_date)}</p>
                        <p className="text-xs text-gray-500">{formatCardTime(v.start_time)}</p>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">{visitLabel(v)}</p>
                        <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                          {alerts.belowMinSoon && (
                            <span className="text-xs font-semibold text-orange-600">
                              Needs {min - v.confirmed_count} more to go ahead
                            </span>
                          )}
                          {alerts.waitlistReady && (
                            <span className="text-xs font-semibold text-red-600">
                              Spot open · {v.waitlist_count} on waitlist. Promote someone
                            </span>
                          )}
                        </div>
                      </div>
                      <ChevronRight size={16} className="text-gray-300 group-hover:text-blue-400 shrink-0" />
                    </button>
                  </li>
                );
              })}
              {needsAttention.length > MAX_ROWS && (
                <li>
                  <button onClick={() => onOpenTab('group-visits')}
                    className="w-full px-5 py-2.5 text-sm font-semibold text-[#0e62ae] hover:bg-gray-50 text-left">
                    View all {needsAttention.length} in Group Visits
                  </button>
                </li>
              )}
            </ul>
          )}
        </section>

        {/* 2. To review */}
        <section>
          <h2 className="text-sm font-semibold text-gray-800 mb-2">To review</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {reviewTiles.map(t => {
              const Icon = t.icon;
              const active = t.count > 0;
              return (
                <button key={t.key} onClick={t.onClick}
                  className={`text-left bg-white rounded-xl border shadow-sm p-4 transition hover:shadow-md ${
                    active ? 'border-gray-200 hover:border-blue-200' : 'border-gray-100'
                  }`}>
                  <div className="flex items-center justify-between mb-2">
                    <Icon size={18} className={active ? 'text-[#0e62ae]' : 'text-gray-300'} />
                    {active && <span className="w-2 h-2 rounded-full bg-red-500" />}
                  </div>
                  <p className={`text-2xl font-bold ${active ? 'text-gray-900' : 'text-gray-300'}`}>{t.count}</p>
                  <p className={`text-xs font-medium ${active ? 'text-gray-600' : 'text-gray-400'}`}>{t.label}</p>
                </button>
              );
            })}
          </div>
        </section>

        {/* 3. Coming up this week */}
        <section className="bg-white rounded-xl border border-gray-200 shadow-sm">
          <div className="px-5 pt-4 pb-3 flex items-center gap-2">
            <CalendarClock size={16} className="text-[#0e62ae]" />
            <h2 className="text-sm font-semibold text-gray-800">Coming up this week</h2>
            <button onClick={() => onOpenTab('group-visits')}
              className="ml-auto text-xs font-semibold text-[#0e62ae] hover:underline">
              All {visits.length} upcoming
            </button>
          </div>
          {comingUp.length === 0 ? (
            <p className="px-5 pb-4 text-sm text-gray-500">No visits in the next {UPCOMING_WINDOW_DAYS} days.</p>
          ) : (
            <ul className="border-t border-gray-100 divide-y divide-gray-100">
              {comingUp.map(v => (
                <li key={v.id}>
                  <button onClick={() => onOpenVisit(v.id)}
                    className="w-full text-left px-5 py-3 hover:bg-gray-50 flex items-center gap-3 group">
                    <div className="w-24 shrink-0">
                      <p className="text-sm font-semibold text-gray-800">{formatDay(v.visit_date)}</p>
                      <p className="text-xs text-gray-500">{formatCardTime(v.start_time)} – {formatCardTime(v.end_time)}</p>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">{visitLabel(v)}</p>
                      <StaffingStatus
                        confirmed={v.confirmed_count}
                        min={v.min_volunteers ?? v.volunteer_slots}
                        max={v.volunteer_slots}
                        audience="admin"
                      />
                    </div>
                    <span className="text-xs text-gray-500 shrink-0">{v.confirmed_count}/{v.volunteer_slots} dogs</span>
                    <ChevronRight size={16} className="text-gray-300 group-hover:text-blue-400 shrink-0" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </>)}
    </div>
  );
}
