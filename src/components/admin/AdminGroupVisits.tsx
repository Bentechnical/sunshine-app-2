// src/components/admin/AdminGroupVisits.tsx
'use client';

import React, { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { useUser } from '@clerk/clerk-react';
import AdminVisits from './AdminVisits';
import AdminOrgDetail from './AdminOrgDetail';
import ManagedOrgModal, { ManagedOrgData } from './ManagedOrgModal';
import LinkOrgModal from './LinkOrgModal';

// ─── Types ────────────────────────────────────────────────────────────────────


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
  org_type: string;
  org_logo: string | null;
  org_address: string;
  org_place_id: string;
  location_lat: number | null;
  location_lng: number | null;
  postal_code: string;
  org_contact_name: string;
  org_contact_phone: string;
  assigned_region_id: number | null;
  fee_tier: string | null;
  is_admin_managed: boolean;
  default_parking_coverage: string | null;
  default_parking_instructions: string | null;
  default_arrival_instructions: string | null;
  default_event_description: string | null;
  default_accessibility_notes: string | null;
  default_space_sqft: number | null;
  default_dogs_needed: number | null;
  default_requires_vsc: boolean | null;
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
  /** Which view to show. 'visits' = group visits list, 'orgs' = manage organizations. Default: 'visits' */
  view?: 'visits' | 'orgs';
  selectedOrgId?: string | null;
  onSelectOrg?: (orgId: string) => void;
  onBackFromOrg?: () => void;
  initialVisitFilter?: string | null;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AdminGroupVisits({ selectedVisitId, onSelectVisit, onBackFromVisit, onCountChange, role = 'admin', view = 'visits', selectedOrgId, onSelectOrg, onBackFromOrg, initialVisitFilter }: Props) {
  const { user: clerkUser } = useUser();
  const subtab = view;

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
  const [orgSearchQuery, setOrgSearchQuery] = useState('');

  // Managed org modal state
  const [managedOrgModal, setManagedOrgModal] = useState<{
    mode: 'create' | 'edit';
    org?: OrganizationUser;
  } | null>(null);
  const [linkModal, setLinkModal] = useState<{ managedOrgId: string; managedOrgName: string } | null>(null);
  const [unlinkConfirm, setUnlinkConfirm] = useState<{ orgId: string; orgName: string } | null>(null);
  const [unlinking, setUnlinking] = useState(false);

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
            org_type: u.org_type || '',
            org_logo: u.profile_image ?? null,
            org_address: u.org_address || '',
            org_place_id: u.org_place_id || '',
            location_lat: u.location_lat ?? null,
            location_lng: u.location_lng ?? null,
            postal_code: u.postal_code || '',
            org_contact_name: u.org_contact_name || '',
            org_contact_phone: u.org_contact_phone || '',
            assigned_region_id: u.assigned_region_id ?? null,
            fee_tier: u.fee_tier ?? null,
            is_admin_managed: u.is_admin_managed ?? false,
            default_parking_coverage: u.default_parking_coverage ?? null,
            default_parking_instructions: u.default_parking_instructions ?? null,
            default_arrival_instructions: u.default_arrival_instructions ?? null,
            default_event_description: u.default_event_description ?? null,
            default_accessibility_notes: u.default_accessibility_notes ?? null,
            default_space_sqft: u.default_space_sqft ?? null,
            default_dogs_needed: u.default_dogs_needed ?? null,
            default_requires_vsc: u.default_requires_vsc ?? null,
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
        if (selectedOrgId === orgId) onBackFromOrg?.();
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

  // ── Managed org handlers ─────────────────────────────────────────────────────

  const handleManagedOrgSaved = (data: ManagedOrgData & { id: string; assigned_region_id?: number | null }) => {
    if (managedOrgModal?.mode === 'create') {
      const newOrg: OrganizationUser = {
        id: data.id,
        first_name: data.org_contact_name || data.org_name,
        last_name: '',
        email: data.email || '',
        phone: '',
        org_name: data.org_name,
        org_type: data.org_type || '',
        org_logo: data.profile_image || null,
        org_address: data.org_address,
        org_place_id: data.org_place_id || '',
        location_lat: data.location_lat,
        location_lng: data.location_lng,
        postal_code: data.postal_code || '',
        org_contact_name: data.org_contact_name,
        org_contact_phone: data.org_contact_phone,
        assigned_region_id: data.assigned_region_id ?? null,
        fee_tier: data.fee_tier || null,
        is_admin_managed: true,
        default_parking_coverage: data.default_parking_coverage || null,
        default_parking_instructions: data.default_parking_instructions || null,
        default_arrival_instructions: data.default_arrival_instructions || null,
        default_event_description: data.default_event_description || null,
        default_accessibility_notes: data.default_accessibility_notes || null,
        default_space_sqft: data.default_space_sqft,
        default_dogs_needed: data.default_dogs_needed,
        default_requires_vsc: data.default_requires_vsc,
      };
      setOrganizations(prev => [...prev, newOrg].sort((a, b) => (a.org_name || '').localeCompare(b.org_name || '')));
    } else if (managedOrgModal?.mode === 'edit' && managedOrgModal.org) {
      setOrganizations(prev => prev.map(o =>
        o.id === data.id
          ? {
              ...o,
              org_name: data.org_name,
              org_type: data.org_type || o.org_type,
              org_logo: data.profile_image || null,
              org_address: data.org_address,
              org_place_id: data.org_place_id || o.org_place_id,
              location_lat: data.location_lat,
              location_lng: data.location_lng,
              postal_code: data.postal_code || o.postal_code,
              org_contact_name: data.org_contact_name,
              org_contact_phone: data.org_contact_phone,
              email: data.email || o.email,
              fee_tier: data.fee_tier || o.fee_tier,
              assigned_region_id: data.assigned_region_id ?? o.assigned_region_id,
              default_parking_coverage: data.default_parking_coverage || null,
              default_parking_instructions: data.default_parking_instructions || null,
              default_arrival_instructions: data.default_arrival_instructions || null,
              default_event_description: data.default_event_description || null,
              default_accessibility_notes: data.default_accessibility_notes || null,
              default_space_sqft: data.default_space_sqft,
              default_dogs_needed: data.default_dogs_needed,
              default_requires_vsc: data.default_requires_vsc,
            }
          : o
      ));
    }
    setManagedOrgModal(null);
  };

  const handleLinked = (_clerkUserId: string, visitsTransferred: number) => {
    if (linkModal) {
      if (selectedOrgId === linkModal.managedOrgId) onBackFromOrg?.();
      setOrganizations(prev => prev.filter(o => o.id !== linkModal.managedOrgId));
    }
    setLinkModal(null);
    alert(`Linked successfully. ${visitsTransferred} visit(s) transferred.`);
  };

  const handleUnlink = async (orgId: string) => {
    setUnlinking(true);
    try {
      const res = await fetch(`/api/admin/managed-orgs/${orgId}/unlink`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const json = await res.json();
      if (!res.ok) { alert(json.error || 'Failed to unlink'); return; }
      // Refresh the full org list to show the new managed org
      const usersRes = await fetch('/api/admin/approved-users');
      const usersJson = await usersRes.json();
      if (usersRes.ok) {
        const sortedOrgs: OrganizationUser[] = usersJson.users
          .filter((u: any) => u.role === 'organization')
          .map((u: any) => ({
            id: u.id,
            first_name: u.first_name,
            last_name: u.last_name,
            email: u.email,
            phone: u.phone_number,
            org_name: u.org_name || '',
            org_type: u.org_type || '',
            org_logo: u.profile_image ?? null,
            org_address: u.org_address || '',
            org_place_id: u.org_place_id || '',
            location_lat: u.location_lat ?? null,
            location_lng: u.location_lng ?? null,
            postal_code: u.postal_code || '',
            org_contact_name: u.org_contact_name || '',
            org_contact_phone: u.org_contact_phone || '',
            assigned_region_id: u.assigned_region_id ?? null,
            fee_tier: u.fee_tier ?? null,
            is_admin_managed: u.is_admin_managed ?? false,
            default_parking_coverage: u.default_parking_coverage ?? null,
            default_parking_instructions: u.default_parking_instructions ?? null,
            default_arrival_instructions: u.default_arrival_instructions ?? null,
            default_event_description: u.default_event_description ?? null,
            default_accessibility_notes: u.default_accessibility_notes ?? null,
            default_space_sqft: u.default_space_sqft ?? null,
            default_dogs_needed: u.default_dogs_needed ?? null,
            default_requires_vsc: u.default_requires_vsc ?? null,
          }))
          .sort((a: OrganizationUser, b: OrganizationUser) =>
            (a.org_name || '').localeCompare(b.org_name || '')
          );
        setOrganizations(sortedOrgs);
      }
      if (selectedOrgId === orgId) onBackFromOrg?.();
      alert(`Unlinked successfully. ${json.visits_transferred} visit(s) moved to a new managed organization.`);
    } catch {
      alert('An error occurred. Please try again.');
    } finally {
      setUnlinking(false);
      setUnlinkConfirm(null);
    }
  };

  const handleDeleteManagedOrg = async (orgId: string, orgName: string) => {
    if (!confirm(`Delete the managed organization "${orgName}"? This cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/admin/managed-orgs/${orgId}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok) { alert(json.error || 'Failed to delete'); return; }
      setOrganizations(prev => prev.filter(o => o.id !== orgId));
      if (selectedOrgId === orgId) onBackFromOrg?.();
    } catch {
      alert('Failed to delete organization');
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

  // ── Render helpers ────────────────────────────────────────────────────────────

  const selectedOrg = selectedOrgId ? organizations.find(o => o.id === selectedOrgId) : null;

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* All Visits */}
      {subtab === 'visits' && (
        <AdminVisits
          pdMode={role === 'pd'}
          selectedVisitId={selectedVisitId}
          onSelectVisit={onSelectVisit}
          onBackFromVisit={onBackFromVisit}
          onCountChange={onCountChange}
          onSelectOrg={onSelectOrg}
          initialFilter={initialVisitFilter}
        />
      )}

      {/* Manage Organizations — Loading org detail */}
      {subtab === 'orgs' && selectedOrgId && !selectedOrg && loading && (
        <div className="flex items-center justify-center py-24 gap-2">
          <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <span className="text-gray-600">Loading organization…</span>
        </div>
      )}

      {/* Manage Organizations — Org not found */}
      {subtab === 'orgs' && selectedOrgId && !selectedOrg && !loading && (
        <div className="px-4 py-4 max-w-3xl mx-auto">
          <button
            onClick={() => onBackFromOrg?.()}
            className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 font-medium transition mb-5"
          >
            ← Back
          </button>
          <div className="text-center py-12 text-gray-500">
            <p className="font-medium">Organization not found</p>
            <p className="text-sm mt-1">This organization may have been removed or the link is invalid.</p>
          </div>
        </div>
      )}

      {/* Manage Organizations — Org Detail View */}
      {subtab === 'orgs' && selectedOrg && (
        <AdminOrgDetail
          org={selectedOrg}
          regions={regions}
          onBack={() => onBackFromOrg?.()}
          onSelectVisit={onSelectVisit}
          onEditOrg={() => setManagedOrgModal({ mode: 'edit', org: selectedOrg })}
          onArchiveOrg={() => handleArchiveOrg(selectedOrg.id, selectedOrg.org_name || `${selectedOrg.first_name} ${selectedOrg.last_name}`)}
          onDeleteOrg={() => handleDeleteManagedOrg(selectedOrg.id, selectedOrg.org_name || '—')}
          onLinkOrg={() => setLinkModal({ managedOrgId: selectedOrg.id, managedOrgName: selectedOrg.org_name || '—' })}
          onUnlinkOrg={() => setUnlinkConfirm({ orgId: selectedOrg.id, orgName: selectedOrg.org_name || '—' })}
        />
      )}

      {/* Manage Organizations — Org List */}
      {subtab === 'orgs' && !selectedOrgId && (
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
                <button
                  onClick={() => setManagedOrgModal({ mode: 'create' })}
                  className="flex items-center gap-1.5 px-4 py-2 rounded text-sm font-semibold bg-green-600 text-white hover:bg-green-700 transition"
                >
                  <Plus size={14} /> Create Organization
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
                  </tr>
                </thead>
                <tbody>
                  {filteredOrgs.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-gray-500">No approved organizations found.</td>
                    </tr>
                  ) : filteredOrgs.map(org => {
                    const assignedRegion = regions.find(r => r.id === org.assigned_region_id);
                    return (
                      <tr
                        key={org.id}
                        className="border-t hover:bg-gray-50 cursor-pointer"
                        onClick={() => onSelectOrg?.(org.id)}
                      >
                        <td className="px-2 py-2">
                          {org.org_logo ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={org.org_logo} alt="" className="w-8 h-8 rounded-lg object-cover" />
                          ) : (
                            <div className="w-8 h-8 rounded-lg bg-gray-200 flex items-center justify-center text-gray-400 text-xs font-bold">
                              {(org.org_name || '?')[0].toUpperCase()}
                            </div>
                          )}
                        </td>
                        <td className="px-2 py-2 font-medium">
                          {org.org_name || '—'}
                          {org.is_admin_managed && (
                            <span className="ml-2 text-[10px] font-semibold bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full">
                              Admin-managed
                            </span>
                          )}
                        </td>
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
                      </tr>
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

      {/* Org Create/Edit Modal */}
      {managedOrgModal && (
        <ManagedOrgModal
          mode={managedOrgModal.mode}
          context={managedOrgModal.org?.is_admin_managed === false ? 'linked' : 'managed'}
          initialData={managedOrgModal.org ? {
            id: managedOrgModal.org.id,
            org_name: managedOrgModal.org.org_name,
            org_type: managedOrgModal.org.org_type || '',
            org_address: managedOrgModal.org.org_address,
            org_place_id: managedOrgModal.org.org_place_id || '',
            location_lat: managedOrgModal.org.location_lat,
            location_lng: managedOrgModal.org.location_lng,
            postal_code: managedOrgModal.org.postal_code || '',
            org_contact_name: managedOrgModal.org.org_contact_name,
            org_contact_phone: managedOrgModal.org.org_contact_phone,
            email: managedOrgModal.org.email,
            fee_tier: managedOrgModal.org.fee_tier || '',
            profile_image: managedOrgModal.org.org_logo || '',
            assigned_region_id: managedOrgModal.org.assigned_region_id,
            default_parking_coverage: managedOrgModal.org.default_parking_coverage || '',
            default_parking_instructions: managedOrgModal.org.default_parking_instructions || '',
            default_arrival_instructions: managedOrgModal.org.default_arrival_instructions || '',
            default_event_description: managedOrgModal.org.default_event_description || '',
            default_accessibility_notes: managedOrgModal.org.default_accessibility_notes || '',
            default_space_sqft: managedOrgModal.org.default_space_sqft,
            default_dogs_needed: managedOrgModal.org.default_dogs_needed,
            default_requires_vsc: managedOrgModal.org.default_requires_vsc,
          } : undefined}
          regions={regions}
          onClose={() => setManagedOrgModal(null)}
          onSaved={handleManagedOrgSaved}
        />
      )}

      {/* Link Org Modal */}
      {linkModal && (
        <LinkOrgModal
          managedOrgId={linkModal.managedOrgId}
          managedOrgName={linkModal.managedOrgName}
          realOrgAccounts={organizations
            .filter(o => !o.is_admin_managed && o.id !== linkModal.managedOrgId)
            .map(o => ({ id: o.id, org_name: o.org_name, email: o.email, org_address: o.org_address, profile_image: o.org_logo }))}
          onClose={() => setLinkModal(null)}
          onLinked={handleLinked}
        />
      )}

      {/* Unlink Confirm Modal */}
      {unlinkConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Detach to Managed Organization</h3>
            <p className="text-sm text-gray-600 mb-4">
              This will create a new admin-managed organization with <strong>{unlinkConfirm.orgName}</strong>&apos;s
              profile data and transfer all visits to it.
            </p>
            <p className="text-sm text-gray-600 mb-6">
              The real account will keep its login but will have no visit history. You can later link the
              managed org to a different account.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setUnlinkConfirm(null)}
                disabled={unlinking}
                className="flex-1 px-4 py-2 text-gray-700 font-medium border border-gray-300 rounded-lg hover:bg-gray-50 transition"
              >
                Cancel
              </button>
              <button
                onClick={() => handleUnlink(unlinkConfirm.orgId)}
                disabled={unlinking}
                className="flex-1 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-semibold rounded-lg disabled:opacity-50 transition"
              >
                {unlinking ? 'Processing…' : 'Confirm Detach'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
