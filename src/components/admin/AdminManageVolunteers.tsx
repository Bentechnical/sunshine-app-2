// src/components/admin/AdminManageVolunteers.tsx
'use client';

import React, { useEffect, useState } from 'react';
import { CheckCircle, ChevronUp } from 'lucide-react';
import { useUser } from '@clerk/clerk-react';
import { ComplianceBadge } from '@/components/admin/compliance/ComplianceBadge';
import { DocumentModal } from '@/components/admin/compliance/DocumentModal';
import AdminVolunteerDetail from '@/components/admin/AdminVolunteerDetail';
import { TIER_BADGE, type VolunteerTier } from '@/components/admin/volunteerTiers';
import type {
  ComplianceRecord,
  ComplianceStatus,
  DogProfile,
  SignedDocs,
} from '@/components/admin/compliance/types';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Region {
  id: number;
  name: string;
  is_active: boolean;
  owner_pd_id: string | null;
}

/** Exactly what the table renders — see GET /api/admin/volunteers?scope=list. */
interface Volunteer {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  city: string;
  assigned_region_id: number | null;
  region_assignment_method: string | null;
  volunteer_tier: VolunteerTier | null;
  vsc_status: ComplianceStatus;
  vaccine_status: ComplianceStatus;
  vsc_verification_status: string | null;
  vaccine_verification_status: string | null;
}

interface ArchivedVolunteer {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  city: string;
  archived_at: string;
}

type SortKey = 'name' | 'email' | 'city' | 'region' | 'tier' | 'vsc' | 'vaccine';

/** Tier sorts by progression (candidate → regular → mentor), not alphabetically. */
const TIER_ORDER: Record<string, number> = { candidate: 0, regular: 1, mentor: 2 };

/** Compliance sorts worst-first, so one click surfaces whatever needs attention. */
const COMPLIANCE_ORDER: Record<string, number> = {
  missing: 0, expired: 1, rejected: 2, pending_review: 3, expiring: 4, approved: 5,
};

function SortableHeader({
  label, column, sortKey, sortAsc, onSort, className = '',
}: {
  label: string;
  column: SortKey;
  sortKey: SortKey;
  sortAsc: boolean;
  onSort: (k: SortKey) => void;
  className?: string;
}) {
  const active = sortKey === column;
  return (
    <th className={`px-4 py-2 ${className}`}>
      <button
        onClick={() => onSort(column)}
        className={`inline-flex items-center gap-1 font-semibold transition ${
          active ? 'text-gray-900' : 'text-gray-600 hover:text-gray-900'
        }`}
      >
        {label}
        <ChevronUp
          size={12}
          className={`transition-transform ${
            active ? (sortAsc ? '' : 'rotate-180') : 'opacity-0 group-hover:opacity-40'
          }`}
        />
      </button>
    </th>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface Props {
  role?: 'admin' | 'pd';
  onDocReviewChange?: () => void;
  /**
   * When set, the detail view for this volunteer replaces the list — mirroring how
   * AdminGroupVisits swaps in AdminOrgDetail. Driven by the `volunteer` URL param.
   */
  selectedVolunteerId?: string | null;
  onSelectVolunteer?: (volunteerId: string) => void;
  onBackFromVolunteer?: () => void;
  onSelectVisit?: (visitId: number) => void;
}

export default function AdminManageVolunteers({
  role = 'admin',
  onDocReviewChange,
  selectedVolunteerId = null,
  onSelectVolunteer,
  onBackFromVolunteer,
  onSelectVisit,
}: Props) {
  const { user: clerkUser } = useUser();
  const [volunteers, setVolunteers] = useState<Volunteer[]>([]);
  const [complianceMap, setComplianceMap] = useState<Map<string, ComplianceRecord>>(new Map());
  const [archivedVolunteers, setArchivedVolunteers] = useState<ArchivedVolunteer[]>([]);
  const [regions, setRegions] = useState<Region[]>([]);
  const [viewMode, setViewMode] = useState<'active' | 'archived'>('active');
  const [loading, setLoading] = useState(true);
  const [archivedLoading, setArchivedLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  // null on first load = let the server choose (a PD's own region, an admin's 'all').
  const [regionFilter, setRegionFilter] = useState<string | null>(null); // 'all' | 'unassigned' | region id
  const [complianceFilter, setComplianceFilter] = useState<'none' | 'review' | 'issues'>('none');
  // Sorting is purely client-side: the list already holds every approved volunteer and filters
  // in memory, so this is a comparator over an array that's present either way.
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortAsc, setSortAsc] = useState(true);
  const [selectedDocVolunteer, setSelectedDocVolunteer] = useState<{ id: string; name: string; record: ComplianceRecord; dog?: DogProfile | null } | null>(null);
  const [signedUrlCache, setSignedUrlCache] = useState<Map<string, SignedDocs>>(new Map());
  const [pendingDogs, setPendingDogs] = useState<Map<string, DogProfile | null>>(new Map());

  // ── Data fetching ─────────────────────────────────────────────────────────────

  /**
   * The table's rows. Region is filtered server-side, so switching region refetches rather than
   * narrowing an already-downloaded list — a PD no longer pays for every volunteer in the
   * organisation to see their own thirty.
   *
   * On the very first load `regionFilter` is null: the server picks (a PD's own region, or
   * everything for an admin) and echoes the choice back, which saves a round trip that would
   * otherwise be needed just to discover which region the caller owns.
   */
  const loadData = React.useCallback(async (opts?: { quiet?: boolean; region?: string | null }) => {
      if (!opts?.quiet) setLoading(true);
      setError(null);
      try {
        const region = opts?.region !== undefined ? opts.region : regionFilter;
        const url = region
          ? `/api/admin/volunteers?scope=list&region=${encodeURIComponent(region)}`
          : '/api/admin/volunteers?scope=list';

        const [listRes, regionsRes] = await Promise.all([
          fetch(url),
          fetch('/api/admin/regions'),
        ]);
        const [listJson, regionsJson] = await Promise.all([listRes.json(), regionsRes.json()]);

        if (!listRes.ok) {
          setError(listJson.error || 'Failed to load volunteers');
          return;
        }

        setVolunteers(listJson.volunteers ?? []);
        if (regionsRes.ok && regionsJson.regions) setRegions(regionsJson.regions);

        // Adopt whatever the server applied, so the dropdown agrees with what was fetched.
        if (listJson.applied_region) setRegionFilter(listJson.applied_region);

        // Statuses arrive on every row; the reviewable detail only for those awaiting review.
        const map = new Map<string, ComplianceRecord>();
        for (const [id, d] of Object.entries(listJson.details ?? {})) {
          map.set(id, (d as any).compliance);
        }
        setComplianceMap(map);

        const dogs = new Map<string, DogProfile | null>();
        for (const [id, d] of Object.entries(listJson.details ?? {})) {
          dogs.set(id, (d as any).dog ?? null);
        }
        setPendingDogs(dogs);
      } catch (err) {
        console.error('[AdminManageVolunteers] Error:', err);
        setError('Failed to load data');
      } finally {
        setLoading(false);
      }
  // regionFilter is read through the opts override on every call that cares, so it is
  // deliberately not a dependency — including it would refetch on every dropdown change twice.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Pre-fetch signed URLs for pending_review volunteers in the background
  useEffect(() => {
    const pending = Array.from(complianceMap.entries()).filter(([, c]) =>
      c.vsc.verification_status === 'pending_review' || c.vaccine.verification_status === 'pending_review'
    );
    if (pending.length === 0) return;
    pending.forEach(async ([id]) => {
      if (signedUrlCache.has(id)) return;
      try {
        const res = await fetch(`/api/admin/compliance/${id}/documents`);
        if (!res.ok) return;
        const json = await res.json();
        if (json.documents) {
          setSignedUrlCache(prev => new Map(prev).set(id, { ...json.documents, dog_name: json.dog_name, vaccine_supporting_signed_urls: json.vaccine_supporting_signed_urls ?? [] }));
        }
      } catch { /* non-fatal */ }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [complianceMap]);

  useEffect(() => {
    if (viewMode !== 'archived') return;
    const fetchArchived = async () => {
      setArchivedLoading(true);
      try {
        const res = await fetch('/api/admin/archived-users');
        const json = await res.json();
        if (!res.ok) { setError(json.error || 'Failed to load archived users'); return; }
        const filtered: ArchivedVolunteer[] = json.users
          .filter((u: any) => u.role === 'volunteer')
          .map((u: any) => ({
            id: u.id,
            first_name: u.first_name,
            last_name: u.last_name,
            email: u.email,
            phone: u.phone_number,
            city: u.city,
            archived_at: u.archived_at,
          }))
          .sort((a: ArchivedVolunteer, b: ArchivedVolunteer) =>
            new Date(b.archived_at).getTime() - new Date(a.archived_at).getTime()
          );
        setArchivedVolunteers(filtered);
      } catch (err) {
        console.error('[AdminManageVolunteers] Error fetching archived:', err);
      } finally {
        setArchivedLoading(false);
      }
    };
    fetchArchived();
  }, [viewMode]);

  const handleUnarchiveUser = async (userId: string, userName: string) => {
    if (!confirm(`Restore ${userName}'s account? They will be able to access the platform again.`)) return;
    try {
      const res = await fetch('/api/admin/unarchive-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId }),
      });
      const result = await res.json();
      if (result.success) {
        setArchivedVolunteers(prev => prev.filter(u => u.id !== userId));
        alert('Volunteer unarchived successfully');
      } else {
        alert(`Failed to unarchive: ${result.error}`);
      }
    } catch {
      alert('Failed to unarchive volunteer');
    }
  };

  // ── Derived state ─────────────────────────────────────────────────────────────

  const byId = (id: string) => volunteers.find(v => v.id === id);

  const hasComplianceIssue = (volunteerId: string) => {
    const v = byId(volunteerId);
    if (!v) return false;
    return ['missing', 'expiring', 'expired'].includes(v.vsc_status) ||
           ['missing', 'expiring', 'expired'].includes(v.vaccine_status);
  };

  const hasNeedsReview = (volunteerId: string) => {
    const v = byId(volunteerId);
    if (!v) return false;
    return v.vsc_status === 'pending_review' || v.vaccine_status === 'pending_review';
  };

  const issueCount = volunteers.filter(v => hasComplianceIssue(v.id)).length;
  const reviewCount = volunteers.filter(v => hasNeedsReview(v.id)).length;

  const filteredVolunteers = volunteers.filter(v => {
    const matchesSearch = `${v.first_name} ${v.last_name} ${v.email} ${v.city}`
      .toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCompliance =
      complianceFilter === 'none' ? true :
      complianceFilter === 'review' ? hasNeedsReview(v.id) :
      hasComplianceIssue(v.id);
    // No region check here — the server returned only this region's volunteers.
    return matchesSearch && matchesCompliance;
  }).sort((a, b) => {
    const regionName = (v: Volunteer) =>
      v.assigned_region_id ? (regions.find(r => r.id === v.assigned_region_id)?.name ?? '') : '';
    let cmp = 0;
    switch (sortKey) {
      case 'name':   cmp = `${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`); break;
      case 'email':  cmp = (a.email ?? '').localeCompare(b.email ?? ''); break;
      case 'city':   cmp = (a.city ?? '').localeCompare(b.city ?? ''); break;
      // Unassigned sorts last ascending — an empty region name would otherwise float to the top.
      case 'region': cmp = (regionName(a) || '\uffff').localeCompare(regionName(b) || '\uffff'); break;
      case 'tier':   cmp = (TIER_ORDER[a.volunteer_tier ?? 'regular'] ?? 1) - (TIER_ORDER[b.volunteer_tier ?? 'regular'] ?? 1); break;
      case 'vsc':
      case 'vaccine': {
        const status = (v: Volunteer) =>
          COMPLIANCE_ORDER[sortKey === 'vsc' ? v.vsc_status : v.vaccine_status] ?? 99;
        cmp = status(a) - status(b);
        break;
      }
    }
    // Stable tiebreak, so rows with equal keys keep a predictable order between clicks.
    if (cmp === 0) cmp = `${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`);
    return sortAsc ? cmp : -cmp;
  });

  /** Click a column to sort by it; click the active column again to reverse. */
  const handleSort = (key: SortKey) => {
    if (key === sortKey) { setSortAsc(a => !a); return; }
    setSortKey(key);
    // Compliance columns are most useful worst-first, which is what ascending already gives.
    setSortAsc(true);
  };

  const filteredArchived = archivedVolunteers.filter(v =>
    `${v.first_name} ${v.last_name} ${v.email} ${v.city}`
      .toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Detail view takes over the whole pane. Placed after every hook so the hook order is stable.
  // The detail component fetches its own data, so this doesn't depend on the list having loaded.
  if (selectedVolunteerId && onBackFromVolunteer) {
    return (
      <AdminVolunteerDetail
        volunteerId={selectedVolunteerId}
        onBack={onBackFromVolunteer}
        onSelectVisit={onSelectVisit ?? (() => {})}
        role={role}
        regions={regions}
        onDocReviewed={onDocReviewChange}
        onVolunteerChanged={(patch) => {
          // A patch updates the single row in place; without one (document verification, where
          // several fields move at once) fall back to refetching the list.
          if (patch) {
            setVolunteers(prev => prev.map(v =>
              v.id === selectedVolunteerId ? { ...v, ...patch } as Volunteer : v
            ));
          } else {
            loadData({ quiet: true });
          }
        }}
      />
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="px-4 py-4">
      {/* Compliance Alert Banner */}
      {!loading && viewMode === 'active' && (reviewCount > 0 || issueCount > 0) && (
        <div className="mb-4 flex items-center gap-3 bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide shrink-0">Compliance</span>
          <div className="flex items-center gap-2 flex-wrap">
            {reviewCount > 0 && (
              <button
                onClick={() => setComplianceFilter(f => f === 'review' ? 'none' : 'review')}
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition ${
                  complianceFilter === 'review'
                    ? 'bg-amber-500 text-white'
                    : 'bg-amber-100 text-amber-800 hover:bg-amber-200'
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-current inline-block" />
                {reviewCount} awaiting review
              </button>
            )}
            {issueCount > 0 && (
              <button
                onClick={() => setComplianceFilter(f => f === 'issues' ? 'none' : 'issues')}
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition ${
                  complianceFilter === 'issues'
                    ? 'bg-red-500 text-white'
                    : 'bg-red-100 text-red-700 hover:bg-red-200'
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-current inline-block" />
                {issueCount} missing/expired
              </button>
            )}
          </div>
          {complianceFilter !== 'none' && (
            <button
              onClick={() => setComplianceFilter('none')}
              className="ml-auto text-xs text-gray-400 hover:text-gray-600 font-medium"
            >
              Show all
            </button>
          )}
        </div>
      )}
      {!loading && viewMode === 'active' && issueCount === 0 && volunteers.length > 0 && (
        <div className="mb-4 flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl px-4 py-3">
          <CheckCircle size={18} className="text-green-600 shrink-0" />
          <p className="text-sm text-green-800 font-medium">All volunteers are compliant.</p>
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setViewMode('active')}
              className={`px-4 py-2 rounded text-sm font-semibold transition ${
                viewMode === 'active' ? 'bg-[#0e62ae] text-white' : 'bg-gray-200 text-gray-800'
              }`}
            >
              Active Volunteers
            </button>
            <button
              onClick={() => setViewMode('archived')}
              className={`px-4 py-2 rounded text-sm font-semibold transition ${
                viewMode === 'archived' ? 'bg-orange-600 text-white' : 'bg-gray-200 text-gray-800'
              }`}
            >
              Archived
            </button>
          </div>
          <div className="flex gap-2 items-center">
            <select
              value={regionFilter ?? 'all'}
              onChange={e => {
                // Region is a server filter now, so changing it refetches rather than
                // narrowing a list that's already in memory.
                setRegionFilter(e.target.value);
                loadData({ region: e.target.value });
              }}
              className="border border-gray-300 px-3 py-1.5 rounded-md text-sm"
            >
              <option value="all">All Regions</option>
              <option value="unassigned">Unassigned</option>
              {regions.filter(r => r.is_active).map(r => (
                <option key={r.id} value={String(r.id)}>{r.name}</option>
              ))}
            </select>
            <input
              type="text"
              placeholder="Search..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="border border-gray-300 px-3 py-1.5 rounded-md text-sm w-48"
            />
          </div>
        </div>

        {/* Loading */}
        {(loading || (viewMode === 'archived' && archivedLoading)) && (
          <div className="flex items-center justify-center py-12 gap-2">
            <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            <span className="text-gray-600">Loading volunteers...</span>
          </div>
        )}

        {/* Error */}
        {error && !loading && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4 text-sm text-red-700">{error}</div>
        )}

        {/* Active Volunteers Table */}
        {!loading && !error && viewMode === 'active' && (
          <div className="overflow-x-auto"><table className="w-full text-sm border border-gray-200 rounded-md min-w-[720px]">
            <thead className="bg-gray-100 text-left">
              <tr className="group">
                {([
                  ['Name', 'name'], ['City', 'city'],
                  ['Region', 'region'], ['Tier', 'tier'], ['VSC', 'vsc'], ['Vaccine', 'vaccine'],
                ] as [string, SortKey][]).map(([label, column]) => (
                  <SortableHeader
                    key={column}
                    label={label}
                    column={column}
                    sortKey={sortKey}
                    sortAsc={sortAsc}
                    onSort={handleSort}
                  />
                ))}
                <th className="px-2 py-2 w-20" />
              </tr>
            </thead>
            <tbody>
              {filteredVolunteers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                    {complianceFilter !== 'none' ? 'No volunteers match this filter.' : 'No volunteers found.'}
                  </td>
                </tr>
              ) : filteredVolunteers.map(user => {
                const compliance = complianceMap.get(user.id);
                const rowHasIssue = hasComplianceIssue(user.id);
                // Derived status, not the raw verification column: getComplianceStatus only
                // reports 'pending_review' when a document actually exists. A row with
                // vsc_verification_status = 'pending_review' but no vsc_document_url — which real
                // data does contain — would otherwise offer a Review button with nothing to review.
                const needsReview = user.vsc_status === 'pending_review'
                  || user.vaccine_status === 'pending_review';
                const tierBadge = TIER_BADGE[(user.volunteer_tier ?? 'regular') as VolunteerTier];
                return (
                  <tr
                    key={user.id}
                    className={`border-t hover:bg-gray-50 ${onSelectVolunteer ? 'cursor-pointer' : ''} ${rowHasIssue ? 'bg-red-50/30' : ''}`}
                    onClick={() => onSelectVolunteer?.(user.id)}
                  >
                    <td className="px-4 py-2">
                      <span className={`whitespace-nowrap ${onSelectVolunteer ? 'font-medium text-[#0e62ae]' : ''}`}>
                        {user.first_name} {user.last_name}
                      </span>
                    </td>
                    <td className="px-4 py-2">{user.city}</td>
                    <td className="px-4 py-2">
                      {user.assigned_region_id
                        ? <span className="text-sm text-gray-800">{regions.find(r => r.id === user.assigned_region_id)?.name ?? '—'}</span>
                        : <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">Unassigned</span>
                      }
                    </td>
                    <td className="px-4 py-2">
                      {tierBadge
                        ? <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${tierBadge.classes}`}>{tierBadge.label}</span>
                        : <span className="text-xs text-gray-400">—</span>
                      }
                    </td>
                    <td className="px-4 py-2"><ComplianceBadge status={user.vsc_status} /></td>
                    <td className="px-4 py-2"><ComplianceBadge status={user.vaccine_status} /></td>
                    <td className="px-2 py-2 text-right">
                      {/* Review stays on the list so the "N awaiting review" banner remains a
                          workable queue — filter, review, move on — rather than forcing a detour
                          through each profile. Everything else now lives on the detail view. */}
                      {needsReview && compliance && (
                        <button
                          onClick={e => {
                            e.stopPropagation();
                            setSelectedDocVolunteer({
                              id: user.id,
                              name: `${user.first_name} ${user.last_name}`,
                              record: compliance,
                              dog: pendingDogs.get(user.id) ?? null,
                            });
                          }}
                          className="px-3 py-1 text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-300 rounded-lg hover:bg-amber-100 transition whitespace-nowrap"
                        >
                          Review
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table></div>
        )}

        {/* Archived Volunteers Table */}
        {!loading && !error && viewMode === 'archived' && !archivedLoading && (
          <div className="overflow-x-auto"><table className="w-full text-sm border border-gray-200 rounded-md min-w-[720px]">
            <thead className="bg-gray-100 text-left">
              <tr>
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2">Email</th>
                <th className="px-4 py-2">City</th>
                <th className="px-4 py-2">Archived Date</th>
                <th className="px-4 py-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredArchived.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-500">No archived volunteers found.</td>
                </tr>
              ) : filteredArchived.map(user => (
                <tr key={user.id} className="border-t hover:bg-gray-50">
                  <td className="px-4 py-2">{user.first_name} {user.last_name}</td>
                  <td className="px-4 py-2">{user.email}</td>
                  <td className="px-4 py-2">{user.city}</td>
                  <td className="px-4 py-2">{new Date(user.archived_at).toLocaleDateString()}</td>
                  <td className="px-4 py-2">
                    <button
                      onClick={() => handleUnarchiveUser(user.id, `${user.first_name} ${user.last_name}`)}
                      className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white text-xs font-medium rounded transition"
                    >
                      Unarchive
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </div>

      {/* Document Modal */}
      {selectedDocVolunteer && (
        <DocumentModal
          volunteerId={selectedDocVolunteer.id}
          volunteerName={selectedDocVolunteer.name}
          record={selectedDocVolunteer.record}
          prefetchedDocs={signedUrlCache.get(selectedDocVolunteer.id) ?? null}
          dog={selectedDocVolunteer.dog}
          onClose={() => setSelectedDocVolunteer(null)}
          onVerified={(updated) => {
            setSignedUrlCache(prev => { const m = new Map(prev); m.delete(selectedDocVolunteer.id); return m; });
            setSelectedDocVolunteer(prev => prev ? { ...prev, record: updated } : null);
            setComplianceMap(prev => { const m = new Map(prev); m.set(selectedDocVolunteer.id, updated); return m; });
            onDocReviewChange?.();
          }}
        />
      )}
    </div>
  );
}
