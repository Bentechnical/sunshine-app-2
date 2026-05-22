// src/components/admin/AdminGroupVisits.tsx
'use client';

import React, { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useUser } from '@clerk/clerk-react';
import AdminVisits from './AdminVisits';

// ─── Types ────────────────────────────────────────────────────────────────────

type GroupVisitsSubtab = 'visits' | 'orgs';

interface Region {
  id: number;
  name: string;
  is_active: boolean;
  owner_pd_id: string | null;
}

interface OrganizationUser {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  org_name: string;
  org_logo: string | null;
  org_address: string;
  org_contact_name: string;
  org_contact_phone: string;
  assigned_region_id: number | null;
  fee_tier: string | null;
}

interface ArchivedOrg {
  id: string;
  org_name: string | null;
  first_name: string;
  last_name: string;
  email: string;
  archived_at: string;
}

const FEE_TIER_LABELS: Record<string, string> = {
  tier_500: '$500 — Corporate / for-profit / conferences / large events',
  tier_200: '$200 — Post-secondary / private schools / private care / wellness',
  tier_0:   '$0 — Public schools / non-profits / first responders / inpatients',
};

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  selectedVisitId: number | null;
  onSelectVisit: (id: number) => void;
  onBackFromVisit: () => void;
  onCountChange?: () => void;
  role?: 'admin' | 'pd';
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AdminGroupVisits({ selectedVisitId, onSelectVisit, onBackFromVisit, onCountChange, role = 'admin' }: Props) {
  const { user: clerkUser } = useUser();
  const [subtab, setSubtab] = useState<GroupVisitsSubtab>('visits');

  // Orgs state
  const [organizations, setOrganizations] = useState<OrganizationUser[]>([]);
  const [archivedOrgs, setArchivedOrgs] = useState<ArchivedOrg[]>([]);
  const [orgViewMode, setOrgViewMode] = useState<'active' | 'archived'>('active');
  const [archivedOrgsLoading, setArchivedOrgsLoading] = useState(false);
  const [orgRegionFilter, setOrgRegionFilter] = useState<string>('all');
  const orgRegionFilterInitialized = React.useRef(false);

  // Regions state
  const [regions, setRegions] = useState<Region[]>([]);

  // Shared state
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedOrgIds, setExpandedOrgIds] = useState<string[]>([]);
  const [orgSearchQuery, setOrgSearchQuery] = useState('');

  // Org mutation state
  const [orgRegionSaving, setOrgRegionSaving] = useState<Record<string, boolean>>({});
  const [regionAssignConfirm, setRegionAssignConfirm] = useState<{
    orgId: string; orgName: string; regionId: number | null; regionName: string;
  } | null>(null);
  const [orgFeeTierDraft, setOrgFeeTierDraft] = useState<Record<string, string>>({});
  const [orgFeeTierSaving, setOrgFeeTierSaving] = useState<Record<string, boolean>>({});

  // ── Data fetching ─────────────────────────────────────────────────────────────

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const [usersRes, regionsRes] = await Promise.all([
          fetch('/api/admin/approved-users'),
          fetch('/api/admin/regions'),
        ]);
        const usersJson = await usersRes.json();
        if (!usersRes.ok) { setError(usersJson.error || 'Failed to load data'); return; }

        const sortedOrgs: OrganizationUser[] = usersJson.users
          .filter((u: any) => u.role === 'organization')
          .map((u: any) => ({
            id: u.id,
            first_name: u.first_name,
            last_name: u.last_name,
            email: u.email,
            phone: u.phone_number,
            org_name: u.org_name || '',
            org_logo: u.profile_image ?? null,
            org_address: u.org_address || '',
            org_contact_name: u.org_contact_name || '',
            org_contact_phone: u.org_contact_phone || '',
            assigned_region_id: u.assigned_region_id ?? null,
            fee_tier: u.fee_tier ?? null,
          }))
          .sort((a: OrganizationUser, b: OrganizationUser) =>
            (a.org_name || '').localeCompare(b.org_name || '')
          );

        setOrganizations(sortedOrgs);

        if (regionsRes.ok) {
          const regionsJson = await regionsRes.json();
          setRegions((regionsJson.regions ?? []).filter((r: Region) => r.is_active));
        }
      } catch (err) {
        console.error('[AdminGroupVisits] Error:', err);
        setError('Failed to load data');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  useEffect(() => {
    if (orgViewMode !== 'archived') return;
    const fetchArchivedOrgs = async () => {
      setArchivedOrgsLoading(true);
      try {
        const res = await fetch('/api/admin/archived-users');
        const json = await res.json();
        if (!res.ok) return;
        const filtered: ArchivedOrg[] = json.users
          .filter((u: any) => u.role === 'organization')
          .map((u: any) => ({
            id: u.id,
            org_name: u.org_name,
            first_name: u.first_name,
            last_name: u.last_name,
            email: u.email,
            archived_at: u.archived_at,
          }))
          .sort((a: ArchivedOrg, b: ArchivedOrg) =>
            new Date(b.archived_at).getTime() - new Date(a.archived_at).getTime()
          );
        setArchivedOrgs(filtered);
      } catch (err) {
        console.error('[AdminGroupVisits] Error fetching archived orgs:', err);
      } finally {
        setArchivedOrgsLoading(false);
      }
    };
    fetchArchivedOrgs();
  }, [orgViewMode]);

  // ── Org handlers ──────────────────────────────────────────────────────────────

  const handleSaveOrgFeeTier = async (orgId: string) => {
    const tier = orgFeeTierDraft[orgId] ?? '';
    setOrgFeeTierSaving(prev => ({ ...prev, [orgId]: true }));
    try {
      const res = await fetch('/api/admin/update-org-fee-tier', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ org_id: orgId, fee_tier: tier || null }),
      });
      if (!res.ok) { const json = await res.json(); alert(json.error || 'Failed to update fee tier'); return; }
      setOrganizations(prev => prev.map(o => o.id === orgId ? { ...o, fee_tier: tier || null } : o));
    } catch {
      alert('Failed to update fee tier');
    } finally {
      setOrgFeeTierSaving(prev => ({ ...prev, [orgId]: false }));
    }
  };

  const handleAssignOrgRegion = async (orgId: string, regionId: number | null, cascade: boolean) => {
    setOrgRegionSaving(prev => ({ ...prev, [orgId]: true }));
    setRegionAssignConfirm(null);
    try {
      const res = await fetch('/api/admin/assign-org-region', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ org_id: orgId, region_id: regionId, cascade_visits: cascade }),
      });
      if (!res.ok) { const json = await res.json(); alert(json.error || 'Failed to update assignment'); return; }
      setOrganizations(prev => prev.map(o => o.id === orgId ? { ...o, assigned_region_id: regionId } : o));
    } catch {
      alert('An error occurred. Please try again.');
    } finally {
      setOrgRegionSaving(prev => ({ ...prev, [orgId]: false }));
    }
  };

  const handleArchiveOrg = async (orgId: string, orgName: string) => {
    if (!confirm(`Archive ${orgName}? They will no longer be able to access the platform.`)) return;
    try {
      const res = await fetch('/api/admin/archive-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: orgId }),
      });
      const result = await res.json();
      if (result.success || result.requires_confirmation) {
        if (result.requires_confirmation) {
          const confirmed = confirm(`This organization has ${result.active_appointments?.length || 0} active visit registrations. Archive anyway?`);
          if (!confirmed) return;
          const res2 = await fetch('/api/admin/archive-user', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: orgId, confirmed: true }),
          });
          const result2 = await res2.json();
          if (!result2.success) { alert(`Failed to archive: ${result2.error}`); return; }
        }
        setOrganizations(prev => prev.filter(o => o.id !== orgId));
        alert('Organization archived successfully');
      } else {
        alert(`Failed to archive: ${result.error}`);
      }
    } catch {
      alert('Failed to archive organization');
    }
  };

  const handleUnarchiveOrg = async (orgId: string, orgName: string) => {
    if (!confirm(`Restore ${orgName}? They will be able to access the platform again.`)) return;
    try {
      const res = await fetch('/api/admin/unarchive-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: orgId }),
      });
      const result = await res.json();
      if (result.success) {
        setArchivedOrgs(prev => prev.filter(o => o.id !== orgId));
        alert('Organization unarchived successfully');
      } else {
        alert(`Failed to unarchive: ${result.error}`);
      }
    } catch {
      alert('Failed to unarchive organization');
    }
  };

  // ── Derived state ─────────────────────────────────────────────────────────────

  // For PD: default org region filter to their region once regions load
  useEffect(() => {
    if (role !== 'pd' || !clerkUser?.id || regions.length === 0 || orgRegionFilterInitialized.current) return;
    const myRegion = regions.find(r => r.owner_pd_id === clerkUser.id && r.is_active);
    if (myRegion) setOrgRegionFilter(String(myRegion.id));
    orgRegionFilterInitialized.current = true;
  }, [regions, clerkUser?.id, role]);

  const filteredOrgs = organizations.filter(o => {
    const matchesSearch = `${o.org_name} ${o.email} ${o.org_contact_name} ${o.org_address}`
      .toLowerCase().includes(orgSearchQuery.toLowerCase());
    const matchesRegion = orgRegionFilter === 'all'
      ? true
      : orgRegionFilter === 'unassigned'
        ? o.assigned_region_id === null
        : o.assigned_region_id === Number(orgRegionFilter);
    return matchesSearch && matchesRegion;
  });

  // Hide the subtab nav when viewing a visit detail
  const showSubtabNav = !(subtab === 'visits' && selectedVisitId !== null);

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Subtab Nav */}
      {showSubtabNav && (
        <div className="flex gap-2 px-4 pt-4 pb-2">
          {(['visits', 'orgs'] as GroupVisitsSubtab[]).map(key => {
            const labels: Record<GroupVisitsSubtab, string> = {
              visits: 'All Visits',
              orgs: 'Manage Organizations',
            };
            return (
              <button
                key={key}
                onClick={() => setSubtab(key)}
                className={`px-4 py-2 rounded text-sm font-semibold transition ${
                  subtab === key ? 'bg-[#0e62ae] text-white' : 'bg-gray-200 text-gray-800 hover:bg-gray-300'
                }`}
              >
                {labels[key]}
              </button>
            );
          })}
        </div>
      )}

      {/* All Visits */}
      {subtab === 'visits' && (
        <AdminVisits
          pdMode={role === 'pd'}
          selectedVisitId={selectedVisitId}
          onSelectVisit={onSelectVisit}
          onBackFromVisit={onBackFromVisit}
          onCountChange={onCountChange}
        />
      )}

      {/* Manage Organizations */}
      {subtab === 'orgs' && (
        <div className="px-4 py-4">
          <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
            {/* Header */}
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setOrgViewMode('active')}
                  className={`px-4 py-2 rounded text-sm font-semibold transition ${
                    orgViewMode === 'active' ? 'bg-[#0e62ae] text-white' : 'bg-gray-200 text-gray-800'
                  }`}
                >
                  Active Organizations
                </button>
                <button
                  onClick={() => setOrgViewMode('archived')}
                  className={`px-4 py-2 rounded text-sm font-semibold transition ${
                    orgViewMode === 'archived' ? 'bg-orange-600 text-white' : 'bg-gray-200 text-gray-800'
                  }`}
                >
                  Archived
                </button>
              </div>
              <div className="flex gap-2">
                {regions.length > 0 && (
                  <select
                    value={orgRegionFilter}
                    onChange={e => setOrgRegionFilter(e.target.value)}
                    className="border border-gray-300 px-3 py-1.5 rounded-md text-sm bg-white"
                  >
                    <option value="all">All Regions</option>
                    {role === 'admin' && <option value="unassigned">Unassigned</option>}
                    {regions.map(r => (
                      <option key={r.id} value={String(r.id)}>{r.name}</option>
                    ))}
                  </select>
                )}
                <input
                  type="text"
                  placeholder="Search organizations..."
                  value={orgSearchQuery}
                  onChange={e => setOrgSearchQuery(e.target.value)}
                  className="border border-gray-300 px-3 py-1.5 rounded-md text-sm w-64"
                />
              </div>
            </div>

            {/* Loading */}
            {loading && (
              <div className="flex items-center justify-center py-12 gap-2">
                <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                <span className="text-gray-600">Loading...</span>
              </div>
            )}

            {/* Error */}
            {error && !loading && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4 text-sm text-red-700">{error}</div>
            )}

            {/* Active Orgs Table */}
            {!loading && !error && orgViewMode === 'active' && (
              <table className="w-full text-sm border border-gray-200 rounded-md">
                <thead className="bg-gray-100 text-left">
                  <tr>
                    <th className="px-4 py-2 w-12" />
                    <th className="px-4 py-2">Organization</th>
                    <th className="px-4 py-2">Contact</th>
                    <th className="px-4 py-2">Default Fee Tier</th>
                    <th className="px-4 py-2">Region</th>
                    <th className="px-2 py-2 w-6" />
                  </tr>
                </thead>
                <tbody>
                  {filteredOrgs.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-gray-500">No approved organizations found.</td>
                    </tr>
                  ) : filteredOrgs.map(org => {
                    const isExpanded = expandedOrgIds.includes(org.id);
                    const assignedRegion = regions.find(r => r.id === org.assigned_region_id);
                    const isSaving = orgRegionSaving[org.id];
                    return (
                      <React.Fragment key={org.id}>
                        <tr
                          className="border-t hover:bg-gray-50 cursor-pointer"
                          onClick={() => setExpandedOrgIds(prev =>
                            prev.includes(org.id) ? prev.filter(id => id !== org.id) : [...prev, org.id]
                          )}
                        >
                          <td className="px-2 py-2">
                            {org.org_logo ? (
                              <img src={org.org_logo} alt="" className="w-8 h-8 rounded-lg object-cover" />
                            ) : (
                              <div className="w-8 h-8 rounded-lg bg-gray-200 flex items-center justify-center text-gray-400 text-xs font-bold">
                                {(org.org_name || '?')[0].toUpperCase()}
                              </div>
                            )}
                          </td>
                          <td className="px-2 py-2 font-medium">{org.org_name || '—'}</td>
                          <td className="px-4 py-2">{org.org_contact_name || `${org.first_name} ${org.last_name}`}</td>
                          <td className="px-4 py-2">
                            {org.fee_tier
                              ? <span className="text-xs font-semibold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">{FEE_TIER_LABELS[org.fee_tier]?.split(' — ')[0] ?? org.fee_tier}</span>
                              : <span className="text-xs font-semibold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">Not set</span>
                            }
                          </td>
                          <td className="px-4 py-2">
                            {assignedRegion
                              ? <span className="text-xs font-semibold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">{assignedRegion.name}</span>
                              : <span className="text-xs font-semibold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">Unassigned</span>
                            }
                          </td>
                          <td className="px-2 py-2">{isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</td>
                        </tr>
                        {isExpanded && (
                          <tr className="bg-gray-50 border-t">
                            <td colSpan={6} className="px-6 py-4">
                              {/* Org header: logo + name + address */}
                              <div className="flex gap-4 items-start mb-4">
                                {org.org_logo ? (
                                  <img src={org.org_logo} alt={org.org_name} className="w-16 h-16 rounded-xl object-cover shrink-0" />
                                ) : (
                                  <div className="w-16 h-16 rounded-xl bg-gray-200 flex items-center justify-center text-gray-400 text-xl font-bold shrink-0">
                                    {(org.org_name || '?')[0].toUpperCase()}
                                  </div>
                                )}
                                <div className="space-y-1 text-sm">
                                  <p className="font-semibold text-gray-900 text-base">{org.org_name || '—'}</p>
                                  {org.org_address && <p className="text-gray-500">{org.org_address}</p>}
                                </div>
                              </div>

                              {/* Contact details */}
                              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 text-sm mb-4">
                                <div>
                                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Contact Name</p>
                                  <p className="text-gray-900">{org.org_contact_name || `${org.first_name} ${org.last_name}`}</p>
                                </div>
                                <div>
                                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Contact Phone</p>
                                  <p className="text-gray-900">{org.org_contact_phone || '—'}</p>
                                </div>
                                <div>
                                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Account Email</p>
                                  <p className="text-gray-900">{org.email}</p>
                                </div>
                              </div>

                              {/* Default Fee Tier + PD Assignment side by side */}
                              <div className="mt-4 pt-4 border-t border-gray-200 grid grid-cols-1 lg:grid-cols-2 gap-6">
                                <div>
                                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Default Fee Tier</h3>
                                  <div className="flex items-center gap-3">
                                    <select
                                      value={orgFeeTierDraft[org.id] ?? (org.fee_tier ?? '')}
                                      onChange={e => setOrgFeeTierDraft(prev => ({ ...prev, [org.id]: e.target.value }))}
                                      disabled={orgFeeTierSaving[org.id]}
                                      className="border border-gray-300 rounded px-3 py-1.5 text-sm bg-white disabled:opacity-50 flex-1 min-w-0"
                                    >
                                      <option value="">— Not set —</option>
                                      <option value="tier_500">$500 — Corporate / for-profit</option>
                                      <option value="tier_200">$200 — Post-secondary / private</option>
                                      <option value="tier_0">$0 — Public schools / non-profits</option>
                                    </select>
                                    <button
                                      onClick={() => handleSaveOrgFeeTier(org.id)}
                                      disabled={orgFeeTierSaving[org.id]}
                                      className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded disabled:opacity-50 shrink-0"
                                    >
                                      {orgFeeTierSaving[org.id] ? 'Saving…' : 'Save'}
                                    </button>
                                  </div>
                                </div>
                                <div>
                                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Region</h3>
                                  <div className="flex items-center gap-3">
                                    <select
                                      value={org.assigned_region_id ?? ''}
                                      disabled={isSaving}
                                      onChange={e => {
                                        const newRegionId = e.target.value ? Number(e.target.value) : null;
                                        const newRegion = regions.find(r => r.id === newRegionId);
                                        setRegionAssignConfirm({
                                          orgId: org.id,
                                          orgName: org.org_name || `${org.first_name} ${org.last_name}`,
                                          regionId: newRegionId,
                                          regionName: newRegion ? newRegion.name : 'Unassigned',
                                        });
                                      }}
                                      className="border border-gray-300 rounded px-3 py-1.5 text-sm bg-white disabled:opacity-50 flex-1 min-w-0"
                                    >
                                      <option value="">— Unassigned —</option>
                                      {regions.map(r => (
                                        <option key={r.id} value={r.id}>{r.name}</option>
                                      ))}
                                    </select>
                                    {isSaving && <span className="text-xs text-gray-400 shrink-0">Saving…</span>}
                                  </div>
                                </div>
                              </div>

                              <div className="mt-6 pt-4 border-t border-gray-200">
                                <button
                                  onClick={() => handleArchiveOrg(org.id, org.org_name || `${org.first_name} ${org.last_name}`)}
                                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded transition"
                                >
                                  Archive Organization
                                </button>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            )}

            {/* Archived Orgs Table */}
            {!loading && !error && orgViewMode === 'archived' && !archivedOrgsLoading && (
              <table className="w-full text-sm border border-gray-200 rounded-md">
                <thead className="bg-gray-100 text-left">
                  <tr>
                    <th className="px-4 py-2">Organization</th>
                    <th className="px-4 py-2">Email</th>
                    <th className="px-4 py-2">Archived Date</th>
                    <th className="px-4 py-2">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {archivedOrgs.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-gray-500">No archived organizations found.</td>
                    </tr>
                  ) : archivedOrgs.map(org => (
                    <tr key={org.id} className="border-t hover:bg-gray-50">
                      <td className="px-4 py-2 font-medium">{org.org_name || `${org.first_name} ${org.last_name}`}</td>
                      <td className="px-4 py-2">{org.email}</td>
                      <td className="px-4 py-2">{new Date(org.archived_at).toLocaleDateString()}</td>
                      <td className="px-4 py-2">
                        <button
                          onClick={() => handleUnarchiveOrg(org.id, org.org_name || `${org.first_name} ${org.last_name}`)}
                          className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white text-xs font-medium rounded transition"
                        >
                          Unarchive
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {orgViewMode === 'archived' && archivedOrgsLoading && (
              <div className="flex items-center justify-center py-12 gap-2">
                <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                <span className="text-gray-600">Loading...</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Region Assignment Confirm Modal */}
      {regionAssignConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Update Region Assignment</h3>
            <p className="text-sm text-gray-600 mb-4">
              Assign <strong>{regionAssignConfirm.orgName}</strong> to region <strong>{regionAssignConfirm.regionName}</strong>.
            </p>
            <p className="text-sm text-gray-600 mb-6">Do you also want to update all active visits for this organization to the region&apos;s Program Director?</p>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => handleAssignOrgRegion(regionAssignConfirm.orgId, regionAssignConfirm.regionId, true)}
                className="w-full px-4 py-2 bg-[#0e62ae] hover:bg-[#0a4f8f] text-white text-sm font-semibold rounded-lg transition"
              >
                Yes — update org and all active visits
              </button>
              <button
                onClick={() => handleAssignOrgRegion(regionAssignConfirm.orgId, regionAssignConfirm.regionId, false)}
                className="w-full px-4 py-2 bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 text-sm font-semibold rounded-lg transition"
              >
                No — update org only
              </button>
              <button
                onClick={() => setRegionAssignConfirm(null)}
                className="w-full px-4 py-2 text-gray-500 hover:text-gray-700 text-sm font-medium transition"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
