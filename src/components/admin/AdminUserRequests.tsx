'use client';

import React, { useEffect, useState } from 'react';
import {
  ComplianceBadge,
  ComplianceRecord,
  ComplianceStatus,
  DocumentModal,
  formatDate,
} from '@/components/admin/AdminManageVolunteers';

// ─── Compliance status derivation (matches API logic) ─────────────────────────

function getComplianceStatus(
  documentUrl: string | null,
  expiryDate: string | null,
  verificationStatus: string | null,
): ComplianceStatus {
  if (!documentUrl) return 'missing';
  if (verificationStatus === 'rejected') return 'rejected';
  if (!verificationStatus || verificationStatus === 'pending_review') return 'pending_review';
  // approved
  if (!expiryDate) return 'approved';
  const expiry = new Date(expiryDate);
  const daysUntil = (expiry.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
  if (daysUntil < 0) return 'expired';
  if (daysUntil <= 30) return 'expiring';
  return 'approved';
}

function buildComplianceRecord(user: VolunteerRequest): ComplianceRecord {
  const vscStatus = getComplianceStatus(user.vsc_document_url, user.vsc_renewal_due, user.vsc_verification_status);
  const vaccineStatus = user.dog
    ? getComplianceStatus(user.dog.vaccine_record_url, user.dog.vaccine_expiry_date, user.dog.vaccine_verification_status)
    : 'missing';
  return {
    vsc: {
      status: vscStatus,
      document_url: user.vsc_document_url,
      date_issued: user.vsc_date_issued,
      renewal_due: user.vsc_renewal_due,
      verification_status: user.vsc_verification_status ?? null,
      verified_at: null,
      verified_by: null,
      verified_by_name: null,
      upload_comment: user.vsc_upload_comment ?? null,
      rejection_reason: null,
    },
    vaccine: {
      status: vaccineStatus,
      document_url: user.dog?.vaccine_record_url ?? null,
      date_issued: user.dog?.vaccine_date_issued ?? null,
      expiry_date: user.dog?.vaccine_expiry_date ?? null,
      dog_name: user.dog?.dog_name ?? null,
      verification_status: user.dog?.vaccine_verification_status ?? null,
      verified_at: null,
      verified_by: null,
      verified_by_name: null,
      upload_comment: user.dog?.vaccine_upload_comment ?? null,
      rejection_reason: null,
    },
  };
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface VolunteerRequest {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  city: string;
  postal_code: string;
  bio: string;
  date_of_birth: string | null;
  travel_distance_km: number;
  profile_picture_url: string;
  role: string;
  assigned_region_id: number | null;
  region_assignment_method: string | null;
  vsc_document_url: string | null;
  vsc_date_issued: string | null;
  vsc_renewal_due: string | null;
  vsc_verification_status: string | null;
  vsc_upload_comment: string | null;
  dog: {
    dog_name: string;
    dog_breed: string;
    dog_bio: string;
    dog_picture_url: string;
    dog_age?: number;
    vaccine_record_url: string | null;
    vaccine_expiry_date: string | null;
    vaccine_date_issued: string | null;
    vaccine_verification_status: string | null;
    vaccine_upload_comment: string | null;
  } | null;
}


interface IndividualRequest {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone?: string;
  city: string;
  postal_code: string;
  bio: string;
  profile_picture_url: string;
  role: string;
  // New individual user fields
  pronouns?: string;
  date_of_birth?: string;
  physical_address?: string;
  other_pets_on_site?: boolean;
  other_pets_description?: string;
  third_party_available?: string;
  additional_information?: string;
  liability_waiver_accepted?: boolean;
  liability_waiver_accepted_at?: string;
  // Visit recipient fields
  visit_recipient_type?: string;
  relationship_to_recipient?: string;
  dependant_name?: string;
}

interface OrganizationRequest {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  org_name: string | null;
  org_type: string | null;
  org_address: string | null;
  org_contact_name: string | null;
  org_contact_phone: string | null;
  fee_tier: string | null;
  assigned_region_id: number | null;
  region_assignment_method: string | null;
}

interface IncompleteSignup {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  role: string;
  created_at: string;
}

interface DeniedUser {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  role: string;
  created_at: string;
}

interface Region {
  id: number;
  name: string;
  is_active: boolean;
}

export type RequestsView = 'volunteers' | 'orgs' | 'individuals';

export default function UserRequestsTab({ view = 'volunteers', onCountChange }: { view?: RequestsView; onCountChange?: () => void }) {
  // Only the volunteers view has subtabs (requests vs. incomplete/denied); the
  // org and individual views are a single list each.
  const [showIncomplete, setShowIncomplete] = useState(false);
  const activeSubtab: 'individual' | 'volunteer' | 'organization' | 'incomplete' =
    view === 'orgs' ? 'organization'
    : view === 'individuals' ? 'individual'
    : showIncomplete ? 'incomplete'
    : 'volunteer';
  const [volunteerRequests, setVolunteerRequests] = useState<VolunteerRequest[]>([]);
  const [individualRequests, setIndividualRequests] = useState<IndividualRequest[]>([]);
  const [organizationRequests, setOrganizationRequests] = useState<OrganizationRequest[]>([]);
  const [incompleteSignups, setIncompleteSignups] = useState<IncompleteSignup[]>([]);
  const [deniedUsers, setDeniedUsers] = useState<DeniedUser[]>([]);
  const [regions, setRegions] = useState<Region[]>([]);
  const [orgSetupDraft, setOrgSetupDraft] = useState<Record<string, { feeTier: string; regionId: string }>>({});
  const [volRegionDraft, setVolRegionDraft] = useState<Record<string, string>>({});
  const [complianceRecords, setComplianceRecords] = useState<Record<string, ComplianceRecord>>({});
  const [docModal, setDocModal] = useState<{ id: string; name: string; record: ComplianceRecord; dog: VolunteerRequest['dog'] } | null>(null);
  const [approveGate, setApproveGate] = useState<string | null>(null); // volunteerId being gate-prompted
  const [confirmDeny, setConfirmDeny] = useState<{ id: string; name: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Shared helper: fetch and process pending users from API
  const processPendingData = (data: any[]) => {
    const volunteers: VolunteerRequest[] = data
      .filter((u: any) => u.role === 'volunteer')
      .map((u: any) => ({
        id: u.id, first_name: u.first_name, last_name: u.last_name, email: u.email,
        phone: u.phone_number, city: u.city, postal_code: u.postal_code, bio: u.bio,
        date_of_birth: u.date_of_birth ?? null, travel_distance_km: u.travel_distance_km,
        profile_picture_url: u.profile_image, role: u.role,
        assigned_region_id: u.assigned_region_id ?? null,
        region_assignment_method: u.region_assignment_method ?? null,
        vsc_document_url: u.vsc_document_url ?? null, vsc_date_issued: u.vsc_date_issued ?? null,
        vsc_renewal_due: u.vsc_renewal_due ?? null, vsc_verification_status: u.vsc_verification_status ?? null,
        vsc_upload_comment: u.vsc_upload_comment ?? null,
        dog: (() => {
          const d = Array.isArray(u.dogs) ? u.dogs[0] : u.dogs;
          if (!d) return null;
          return {
            dog_name: d.dog_name, dog_breed: d.dog_breed, dog_bio: d.dog_bio,
            dog_picture_url: d.dog_picture_url, dog_age: d.dog_age,
            vaccine_record_url: d.vaccine_record_url ?? null, vaccine_expiry_date: d.vaccine_expiry_date ?? null,
            vaccine_date_issued: d.vaccine_date_issued ?? null,
            vaccine_verification_status: d.vaccine_verification_status ?? null,
            vaccine_upload_comment: d.vaccine_upload_comment ?? null,
          };
        })(),
      }));

    const individuals = data
      .filter((u: any) => u.role === 'individual')
      .map((u: any) => ({
        id: u.id, first_name: u.first_name, last_name: u.last_name, email: u.email,
        phone: u.phone_number, city: u.city, postal_code: u.postal_code, bio: u.bio,
        profile_picture_url: u.profile_image, role: u.role, pronouns: u.pronouns,
        date_of_birth: u.date_of_birth, physical_address: u.physical_address,
        other_pets_on_site: u.other_pets_on_site, other_pets_description: u.other_pets_description,
        third_party_available: u.third_party_available, additional_information: u.additional_information,
        liability_waiver_accepted: u.liability_waiver_accepted,
        liability_waiver_accepted_at: u.liability_waiver_accepted_at,
        visit_recipient_type: u.visit_recipient_type, relationship_to_recipient: u.relationship_to_recipient,
        dependant_name: u.dependant_name,
      }));

    const organizations: OrganizationRequest[] = data
      .filter((u: any) => u.role === 'organization')
      .map((u: any) => ({
        id: u.id, first_name: u.first_name, last_name: u.last_name, email: u.email,
        org_name: u.org_name, org_type: u.org_type, org_address: u.org_address,
        org_contact_name: u.org_contact_name, org_contact_phone: u.org_contact_phone,
        fee_tier: u.fee_tier ?? null, assigned_region_id: u.assigned_region_id ?? null,
        region_assignment_method: u.region_assignment_method ?? null,
      }));

    setVolunteerRequests(volunteers);
    setIndividualRequests(individuals);
    setOrganizationRequests(organizations);

    const records: Record<string, ComplianceRecord> = {};
    for (const vol of volunteers) { records[vol.id] = buildComplianceRecord(vol); }
    setComplianceRecords(records);

    const drafts: Record<string, { feeTier: string; regionId: string }> = {};
    for (const org of organizations) {
      if (org.fee_tier || org.assigned_region_id) {
        drafts[org.id] = { feeTier: org.fee_tier ?? '', regionId: org.assigned_region_id ? String(org.assigned_region_id) : '' };
      }
    }
    if (Object.keys(drafts).length > 0) setOrgSetupDraft(drafts);

    const volDrafts: Record<string, string> = {};
    for (const vol of volunteers) {
      if (vol.assigned_region_id) volDrafts[vol.id] = String(vol.assigned_region_id);
    }
    if (Object.keys(volDrafts).length > 0) setVolRegionDraft(volDrafts);
  };

  // Lightweight refetch for use after status changes (no loading state, no secondary fetches)
  const refetchPendingUsers = async () => {
    try {
      const res = await fetch('/api/admin/pending-users');
      const json = await res.json();
      if (res.ok) processPendingData(json.users);
    } catch (err) {
      console.error('[Admin] Error refetching pending users', err);
    }
  };

  useEffect(() => {
    const fetchAll = async () => {
      setLoading(true);
      setError(null);

      try {
        const res = await fetch('/api/admin/pending-users');
        const json = await res.json();

        if (!res.ok) {
          console.error('[Admin fetch error]', json.error || 'Unknown error');
          setError(json.error || 'Failed to load pending users');
          return;
        }

        processPendingData(json.users);

        // Incomplete signups and denied users only surface in the volunteers view
        if (view === 'volunteers') {
          const [incompleteRes, deniedRes] = await Promise.all([
            fetch('/api/admin/incomplete-signups'),
            fetch('/api/admin/denied-users'),
          ]);
          const incompleteJson = await incompleteRes.json();
          const deniedJson = await deniedRes.json();

          if (incompleteRes.ok) {
            setIncompleteSignups(incompleteJson.users || []);
          } else {
            console.error('[Admin] Error fetching incomplete signups:', incompleteJson.error);
          }
          if (deniedRes.ok) {
            setDeniedUsers(deniedJson.users || []);
          } else {
            console.error('[Admin] Error fetching denied users:', deniedJson.error);
          }
        }

        // Fetch regions for org approval setup
        const regionsRes = await fetch('/api/admin/regions');
        const regionsJson = await regionsRes.json();
        if (regionsRes.ok && regionsJson.regions) {
          setRegions(regionsJson.regions.filter((r: Region) => r.is_active));
        }
      } catch (err) {
        console.error('[Admin] Error fetching pending users:', err);
        setError('Failed to load pending users');
      } finally {
        setLoading(false);
      }
    };

    fetchAll();
  }, [view]);

  const handleStatusChange = async (userId: string, status: 'approved' | 'denied') => {
    try {
      const res = await fetch('/api/admin/updateUserStatus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, status }),
      });

      if (res.ok) {
        // Find the user before removing so we can add to denied list if needed
        if (status === 'denied') {
          const vol = volunteerRequests.find(v => v.id === userId);
          const ind = individualRequests.find(i => i.id === userId);
          const org = organizationRequests.find(o => o.id === userId);
          const match = vol || ind || org;
          if (match) {
            setDeniedUsers(prev => [{
              id: match.id,
              first_name: 'first_name' in match ? match.first_name : null,
              last_name: 'last_name' in match ? match.last_name : null,
              email: match.email,
              role: 'role' in match ? (match as any).role ?? 'organization' : 'organization',
              created_at: new Date().toISOString(),
            }, ...prev]);
          }
        }
        setVolunteerRequests((prev) => prev.filter((v) => v.id !== userId));
        setIndividualRequests((prev) => prev.filter((i) => i.id !== userId));
        setOrganizationRequests((prev) => prev.filter((o) => o.id !== userId));
        onCountChange?.();
      } else {
        console.error('[Admin] Failed to update user status');
      }
    } catch (err) {
      console.error('[Admin] Error updating user status', err);
    }
  };

  const handleRestoreDenied = async (userId: string) => {
    try {
      const res = await fetch('/api/admin/updateUserStatus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, status: 'pending' }),
      });
      if (res.ok) {
        setDeniedUsers(prev => prev.filter(u => u.id !== userId));
        onCountChange?.();
        // Refetch pending users so the restored user appears immediately
        await refetchPendingUsers();
      } else {
        console.error('[Admin] Failed to restore denied user');
      }
    } catch (err) {
      console.error('[Admin] Error restoring denied user', err);
    }
  };

  const handleApproveOrg = async (orgId: string) => {
    try {
      const res = await fetch('/api/admin/updateUserStatus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: orgId, status: 'approved' }),
      });
      if (!res.ok) { console.error('[Admin] Failed to approve org'); return; }
      onCountChange?.();

      // Apply setup fields if provided (non-blocking — failures are logged, not fatal)
      const setup = orgSetupDraft[orgId];
      if (setup?.feeTier) {
        fetch('/api/admin/update-org-fee-tier', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ org_id: orgId, fee_tier: setup.feeTier }),
        }).catch(e => console.error('[Admin] Fee tier save failed:', e));
      }
      if (setup?.regionId) {
        fetch('/api/admin/assign-org-region', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ org_id: orgId, region_id: Number(setup.regionId), cascade_visits: false }),
        }).catch(e => console.error('[Admin] Region assignment save failed:', e));
      }

      setOrganizationRequests(prev => prev.filter(o => o.id !== orgId));
    } catch (err) {
      console.error('[Admin] Error approving org', err);
    }
  };

  const handleApproveVolunteer = async (volId: string) => {
    // Soft gate: if docs are pending review, prompt before approving
    const record = complianceRecords[volId];
    if (record && approveGate !== volId) {
      const pendingDocs =
        record.vsc.status === 'pending_review' ||
        record.vaccine.status === 'pending_review';
      if (pendingDocs) {
        setApproveGate(volId);
        return;
      }
    }
    setApproveGate(null);

    try {
      const res = await fetch('/api/admin/updateUserStatus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: volId, status: 'approved' }),
      });
      if (!res.ok) { console.error('[Admin] Failed to approve volunteer'); return; }
      onCountChange?.();

      const regionId = volRegionDraft[volId];
      if (regionId) {
        fetch('/api/admin/assign-volunteer-region', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ volunteer_id: volId, region_id: Number(regionId) }),
        }).catch(e => console.error('[Admin] Volunteer region assignment failed:', e));
      }

      setVolunteerRequests(prev => prev.filter(v => v.id !== volId));
    } catch (err) {
      console.error('[Admin] Error approving volunteer', err);
    }
  };

  // Check if a volunteer has any docs uploaded (for showing Review Documents button)
  const hasAnyDocs = (user: VolunteerRequest) =>
    !!(user.vsc_document_url || user.dog?.vaccine_record_url);

  // Check if any docs are pending review (use derived status, not raw verification_status,
  // because uploaded docs with null verification_status should also count as pending)
  const hasPendingDocs = (record: ComplianceRecord) =>
    record.vsc.status === 'pending_review' ||
    record.vaccine.status === 'pending_review';

  return (
    <div className="px-4 py-4">
      {/* Subtabs (volunteers view only) */}
      {view === 'volunteers' && (
        <div className="flex space-x-4 mb-6">
          <button
            onClick={() => setShowIncomplete(false)}
            className={`inline-flex items-center gap-1.5 px-4 py-2 rounded text-sm font-semibold transition ${!showIncomplete ? 'bg-[#0e62ae] text-white' : 'bg-gray-200 text-gray-800'}`}
          >
            Volunteer Requests
            {volunteerRequests.length > 0 && (
              <span className="bg-red-500 text-white text-xs font-bold rounded-full px-1.5 py-0.5 leading-none">
                {volunteerRequests.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setShowIncomplete(true)}
            className={`px-4 py-2 rounded text-sm font-semibold transition ${showIncomplete ? 'bg-[#0e62ae] text-white' : 'bg-gray-200 text-gray-800'}`}
          >
            Incomplete / Denied
          </button>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="flex items-center space-x-2">
            <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
            <span className="text-gray-600">Loading pending users...</span>
          </div>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">Error loading data</h3>
              <p className="text-sm text-red-700 mt-1">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Content */}
      {!loading && !error && (
        <>
          {/* Volunteer Requests */}
          {activeSubtab === 'volunteer' && (
            <div className="grid grid-cols-1 gap-6">
              {volunteerRequests.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <p>No pending volunteer requests</p>
                </div>
              ) : (
                volunteerRequests.map((user) => {
                  const record = complianceRecords[user.id];
                  const docsUploaded = hasAnyDocs(user);
                  const docsPending = record && hasPendingDocs(record);
                  const isGated = approveGate === user.id;

                  return (
                    <div
                      key={user.id}
                      className="bg-white p-6 rounded-2xl shadow-md border border-gray-200 flex flex-col"
                    >
                      {/* 1. Header: Volunteer name */}
                      <h2 className="text-xl font-bold text-gray-900 mb-4">
                        {user.first_name} {user.last_name}
                      </h2>

                      {/* 2. Two-column profile section */}
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Volunteer */}
                        <div className="flex items-start gap-4">
                          <div className="w-24 h-24 rounded-xl overflow-hidden shrink-0">
                            <img
                              src={user.profile_picture_url}
                              alt={`${user.first_name} ${user.last_name}`}
                              className="object-cover w-full h-full"
                            />
                          </div>
                          <div className="space-y-1 text-sm min-w-0">
                            <p><span className="font-semibold text-gray-700">Email:</span> <span className="text-gray-900">{user.email}</span></p>
                            <p><span className="font-semibold text-gray-700">Phone:</span> <span className="text-gray-900">{user.phone}</span></p>
                            <p><span className="font-semibold text-gray-700">Location:</span> <span className="text-gray-900">{user.postal_code}, {user.city}</span></p>
                            {user.date_of_birth && (
                              <p><span className="font-semibold text-gray-700">Date of Birth:</span> <span className="text-gray-900">{formatDate(user.date_of_birth)}</span></p>
                            )}
                            {user.bio && (
                              <p className="text-gray-600 italic pt-1">&ldquo;{user.bio}&rdquo;</p>
                            )}
                          </div>
                        </div>

                        {/* Dog */}
                        {user.dog && (
                          <div className="flex items-start gap-4">
                            <div className="w-24 h-24 rounded-xl overflow-hidden shrink-0">
                              <img
                                src={user.dog.dog_picture_url}
                                alt={user.dog.dog_name}
                                className="object-cover w-full h-full"
                              />
                            </div>
                            <div className="space-y-1 text-sm min-w-0">
                              <p className="font-bold text-base text-gray-900">{user.dog.dog_name}</p>
                              <p><span className="font-semibold text-gray-700">Breed:</span> <span className="text-gray-900">{user.dog.dog_breed}</span></p>
                              {user.dog.dog_age !== null && user.dog.dog_age !== undefined && (
                                <p><span className="font-semibold text-gray-700">Age:</span> <span className="text-gray-900">{user.dog.dog_age} years</span></p>
                              )}
                              {user.dog.dog_bio && (
                                <p className="text-gray-600 italic pt-1">&ldquo;{user.dog.dog_bio}&rdquo;</p>
                              )}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* 3. Compliance section */}
                      <div className="mt-4 pt-4 border-t border-gray-100">
                        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                          {/* VSC status */}
                          {(() => {
                            const s = record?.vsc.status;
                            const dotColor = s === 'approved' ? 'bg-green-500' : s === 'missing' ? 'bg-red-400' : s === 'pending_review' ? 'bg-amber-500' : s === 'rejected' ? 'bg-red-500' : s === 'expired' ? 'bg-red-500' : s === 'expiring' ? 'bg-amber-400' : 'bg-gray-300';
                            const label = s === 'approved' ? 'Approved' : s === 'missing' ? 'Missing' : s === 'pending_review' ? 'Needs Review' : s === 'rejected' ? 'Rejected' : s === 'expired' ? 'Expired' : s === 'expiring' ? 'Expiring Soon' : '—';
                            const textColor = s === 'approved' ? 'text-green-700' : s === 'missing' || s === 'expired' || s === 'rejected' ? 'text-red-700' : s === 'pending_review' || s === 'expiring' ? 'text-amber-700' : 'text-gray-500';
                            return (
                              <span className="inline-flex items-center gap-2 text-sm">
                                <span className={`w-2.5 h-2.5 rounded-full ${dotColor}`} />
                                <span className="font-semibold text-gray-700">VSC</span>
                                <span className={`font-medium ${textColor}`}>{label}</span>
                              </span>
                            );
                          })()}

                          {/* Vaccine status */}
                          {(() => {
                            const s = record?.vaccine.status;
                            const dotColor = s === 'approved' ? 'bg-green-500' : s === 'missing' ? 'bg-red-400' : s === 'pending_review' ? 'bg-amber-500' : s === 'rejected' ? 'bg-red-500' : s === 'expired' ? 'bg-red-500' : s === 'expiring' ? 'bg-amber-400' : 'bg-gray-300';
                            const label = s === 'approved' ? 'Approved' : s === 'missing' ? 'Missing' : s === 'pending_review' ? 'Needs Review' : s === 'rejected' ? 'Rejected' : s === 'expired' ? 'Expired' : s === 'expiring' ? 'Expiring Soon' : '—';
                            const textColor = s === 'approved' ? 'text-green-700' : s === 'missing' || s === 'expired' || s === 'rejected' ? 'text-red-700' : s === 'pending_review' || s === 'expiring' ? 'text-amber-700' : 'text-gray-500';
                            return (
                              <span className="inline-flex items-center gap-2 text-sm">
                                <span className={`w-2.5 h-2.5 rounded-full ${dotColor}`} />
                                <span className="font-semibold text-gray-700">Vaccine</span>
                                <span className={`font-medium ${textColor}`}>{label}</span>
                              </span>
                            );
                          })()}

                          {/* Review Documents button */}
                          {docsUploaded && record && (
                            <button
                              onClick={() => setDocModal({ id: user.id, name: `${user.first_name} ${user.last_name}`, record, dog: user.dog })}
                              className={`text-sm font-semibold rounded-lg px-4 py-1.5 transition ${
                                docsPending
                                  ? 'bg-amber-50 text-amber-800 border border-amber-300 hover:bg-amber-100'
                                  : 'bg-blue-50 text-[#0e62ae] border border-blue-200 hover:bg-blue-100'
                              }`}
                            >
                              {docsPending ? 'Review Documents' : 'View Documents'}
                            </button>
                          )}

                          {/* Region — pushed right */}
                          <div className="ml-auto flex items-center gap-2">
                            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Region:</label>
                            <select
                              value={volRegionDraft[user.id] ?? ''}
                              onChange={e => setVolRegionDraft(prev => ({ ...prev, [user.id]: e.target.value }))}
                              className="border border-gray-300 rounded px-2 py-1 text-sm bg-white"
                            >
                              <option value="">— Assign later —</option>
                              {regions.map(r => (
                                <option key={r.id} value={r.id}>{r.name}</option>
                              ))}
                            </select>
                            {user.assigned_region_id && (
                              <span className="text-xs text-gray-400 font-medium whitespace-nowrap">
                                Auto-assigned
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Helper text when both docs are missing */}
                        {record && record.vsc.status === 'missing' && record.vaccine.status === 'missing' && (
                          <p className="text-xs text-gray-500 italic mt-2">
                            Compliance documents are not required for approval. This volunteer will need to upload them before registering for visits.
                          </p>
                        )}
                      </div>

                      {/* 4. Approve Gate Warning (appears here, below profiles + compliance) */}
                      {isGated && (
                        <div className="mt-4 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
                          <p className="text-sm font-semibold text-amber-800 mb-2">
                            This volunteer has uploaded compliance documents that haven&apos;t been reviewed yet.
                          </p>
                          <div className="flex gap-3">
                            <button
                              onClick={() => {
                                setApproveGate(null);
                                if (record) setDocModal({ id: user.id, name: `${user.first_name} ${user.last_name}`, record, dog: user.dog });
                              }}
                              className="px-4 py-2 text-sm font-semibold bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition"
                            >
                              Review Documents
                            </button>
                            <button
                              onClick={() => handleApproveVolunteer(user.id)}
                              className="px-4 py-2 text-sm font-semibold text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
                            >
                              Approve Anyway
                            </button>
                            <button
                              onClick={() => setApproveGate(null)}
                              className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}

                      {/* 5. Approve / Deny — bottom of card */}
                      {!isGated && (
                        <div className="mt-4 pt-4 border-t border-gray-100 flex justify-end gap-3">
                          <button
                            onClick={() => setConfirmDeny({ id: user.id, name: `${user.first_name} ${user.last_name}` })}
                            className="px-5 py-2 text-sm font-semibold text-red-700 border border-red-200 rounded-lg hover:bg-red-50 transition"
                          >
                            Deny
                          </button>
                          <button
                            onClick={() => handleApproveVolunteer(user.id)}
                            className="px-5 py-2 text-sm font-semibold bg-green-600 text-white rounded-lg hover:bg-green-700 transition"
                          >
                            Approve
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* Individual Requests */}
          {activeSubtab === 'individual' && (
            <div className="grid grid-cols-1 gap-6">
              {individualRequests.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <p>No pending individual requests</p>
                </div>
              ) : (
                individualRequests.map((user) => (
                  <div
                    key={user.id}
                    className="bg-white p-6 rounded-2xl shadow-md border border-gray-200 flex flex-col gap-4"
                  >
                    <div className="flex gap-4 items-start text-left">
                      <div className="w-28 h-28 rounded-xl overflow-hidden shrink-0">
                        <img
                          src={user.profile_picture_url}
                          alt={`${user.first_name} ${user.last_name}`}
                          className="object-cover w-full h-full"
                        />
                      </div>
                      <div className="flex-1">
                        <h2 className="text-xl font-bold text-gray-900 mb-4">
                          {user.first_name} {user.last_name}
                        </h2>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                          {/* Left Column: Contact Info and Visit Recipient */}
                          <div className="space-y-4">
                            {/* Contact Information Section */}
                            <div className="space-y-2">
                              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Contact Information</h3>
                              <div className="text-sm text-gray-800 space-y-1">
                                <p><span className="font-semibold text-gray-700">Email:</span> {user.email}</p>
                                <p><span className="font-semibold text-gray-700">Phone:</span> {user.phone || 'User left this field blank'}</p>
                                <p><span className="font-semibold text-gray-700">Postal Code:</span> {user.postal_code}, {user.city}</p>
                                {user.pronouns && user.visit_recipient_type !== 'other' && <p><span className="font-semibold text-gray-700">Pronouns:</span> {user.pronouns}</p>}
                                {user.date_of_birth && user.visit_recipient_type !== 'other' && (
                                  <p><span className="font-semibold text-gray-700">Date of Birth:</span> {user.date_of_birth}</p>
                                )}
                              </div>
                            </div>

                            {/* Visit Recipient Information (for dependants) */}
                            {user.visit_recipient_type === 'other' && (
                              <div className="border-t border-gray-200 pt-3">
                                <h4 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">Visit Recipient</h4>
                                <div className="text-sm text-gray-800 space-y-1">
                                  <p><span className="font-semibold text-gray-700">Name:</span> {user.dependant_name || 'User left this field blank'}</p>
                                  <p><span className="font-semibold text-gray-700">Relationship:</span> {user.relationship_to_recipient || 'User left this field blank'}</p>
                                  {user.pronouns && <p><span className="font-semibold text-gray-700">Pronouns:</span> {user.pronouns}</p>}
                                  {user.date_of_birth && (
                                    <p><span className="font-semibold text-gray-700">Date of Birth:</span> {user.date_of_birth}</p>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Right Column: Visit Details and Legal */}
                          <div className="space-y-4">
                            {/* Visit Details Section */}
                            <div className="space-y-2">
                              <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Visit Details</h4>
                              <div className="text-sm text-gray-800 space-y-2">
                                <div>
                                  <p className="font-medium text-gray-700">Reason for Visit:</p>
                                  <p className="text-gray-600 italic">{user.bio ? `"${user.bio}"` : 'User left this field blank'}</p>
                                </div>
                                <div>
                                  <p className="font-medium text-gray-700">Location of Visits:</p>
                                  <p className="text-gray-600 italic">{user.physical_address ? `"${user.physical_address}"` : 'User left this field blank'}</p>
                                </div>
                                <div>
                                  <p className="font-medium text-gray-700">Other Animals on Site:</p>
                                  <p className="text-gray-600 italic">"{user.other_pets_on_site ? (user.other_pets_description || 'Yes') : 'No'}"</p>
                                </div>
                                <div>
                                  <p className="font-medium text-gray-700">Third Party Contact:</p>
                                  <p className="text-gray-600 italic">{user.third_party_available ? `"${user.third_party_available}"` : 'User left this field blank'}</p>
                                </div>
                                <div>
                                  <p className="font-medium text-gray-700">Additional Information:</p>
                                  <p className="text-gray-600 italic">{user.additional_information ? `"${user.additional_information}"` : 'User left this field blank'}</p>
                                </div>
                              </div>
                            </div>

                            {/* Legal Section */}
                            <div className="space-y-2">
                              <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Legal</h4>
                              <div className="text-sm text-gray-800 space-y-1">
                                <p>
                                  <span className="font-semibold text-gray-700">Liability Waiver:</span>
                                  <span className={`ml-1 ${user.liability_waiver_accepted ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}`}>
                                    {user.liability_waiver_accepted ? '✓ Accepted' : '✗ Not Accepted'}
                                  </span>
                                </p>
                                {user.liability_waiver_accepted_at && (
                                  <p className="text-xs text-gray-500 ml-4">Accepted on: {new Date(user.liability_waiver_accepted_at).toLocaleDateString()}</p>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 flex justify-center gap-4">
                      <button
                        onClick={() => handleStatusChange(user.id, 'approved')}
                        className="bg-green-600 text-white px-5 py-2 rounded hover:bg-green-700 text-sm"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => setConfirmDeny({ id: user.id, name: `${user.first_name} ${user.last_name}` })}
                        className="bg-red-600 text-white px-5 py-2 rounded hover:bg-red-700 text-sm"
                      >
                        Deny
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Organization Requests */}
          {activeSubtab === 'organization' && (
            <div className="grid grid-cols-1 gap-6">
              {organizationRequests.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <p>No pending organization requests</p>
                </div>
              ) : (
                organizationRequests.map((org) => (
                  <div
                    key={org.id}
                    className="bg-white p-6 rounded-2xl shadow-md border border-gray-200 flex flex-col gap-4"
                  >
                    <div className="flex items-start gap-4">
                      <div className="flex-1">
                        <h2 className="text-xl font-bold text-gray-900 mb-4">
                          {org.org_name || `${org.first_name} ${org.last_name}`}
                        </h2>
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                          <div className="space-y-2">
                            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Organization</h3>
                            <div className="text-sm text-gray-800 space-y-1">
                              {org.org_type && <p><span className="font-semibold text-gray-700">Type:</span> {org.org_type}</p>}
                              {org.org_address && <p><span className="font-semibold text-gray-700">Address:</span> {org.org_address}</p>}
                            </div>
                          </div>
                          <div className="space-y-2">
                            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Contact</h3>
                            <div className="text-sm text-gray-800 space-y-1">
                              {org.org_contact_name && <p><span className="font-semibold text-gray-700">Name:</span> {org.org_contact_name}</p>}
                              <p><span className="font-semibold text-gray-700">Email:</span> {org.email}</p>
                              {org.org_contact_phone && <p><span className="font-semibold text-gray-700">Phone:</span> {org.org_contact_phone}</p>}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                    {/* Optional setup before approving */}
                    <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-1 lg:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Fee Tier (optional)</label>
                        <select
                          value={orgSetupDraft[org.id]?.feeTier ?? org.fee_tier ?? ''}
                          onChange={e => setOrgSetupDraft(prev => ({ ...prev, [org.id]: { ...prev[org.id], feeTier: e.target.value, regionId: prev[org.id]?.regionId ?? '' } }))}
                          className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm bg-white"
                        >
                          <option value="">— Set later —</option>
                          <option value="tier_500">$500 — Corporate / for-profit / large events</option>
                          <option value="tier_200">$200 — Post-secondary / private / wellness</option>
                          <option value="tier_0">$0 — Public schools / non-profits / inpatients</option>
                        </select>
                      </div>
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide">Region</label>
                          {org.assigned_region_id && (
                            <span className="text-xs text-blue-600 font-medium">
                              Auto-assigned ({org.region_assignment_method === 'fsa_auto' ? 'FSA' : org.region_assignment_method === 'boundary_auto' ? 'boundary' : 'distance'})
                            </span>
                          )}
                        </div>
                        <select
                          value={orgSetupDraft[org.id]?.regionId ?? ''}
                          onChange={e => setOrgSetupDraft(prev => ({ ...prev, [org.id]: { ...prev[org.id], regionId: e.target.value, feeTier: prev[org.id]?.feeTier ?? '' } }))}
                          className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm bg-white"
                        >
                          <option value="">— Assign later —</option>
                          {regions.map(r => (
                            <option key={r.id} value={r.id}>{r.name}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="mt-4 flex justify-center gap-4">
                      <button
                        onClick={() => handleApproveOrg(org.id)}
                        className="bg-green-600 text-white px-5 py-2 rounded hover:bg-green-700 text-sm"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => setConfirmDeny({ id: org.id, name: org.org_name || `${org.first_name} ${org.last_name}` })}
                        className="bg-red-600 text-white px-5 py-2 rounded hover:bg-red-700 text-sm"
                      >
                        Deny
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Incomplete / Denied */}
          {activeSubtab === 'incomplete' && (
            <div className="space-y-8">
              {/* Denied Users */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">Denied Users</h3>
                <div className="bg-white rounded-2xl shadow-md border border-gray-200 overflow-hidden">
                  {deniedUsers.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      <p className="text-sm">No denied users</p>
                    </div>
                  ) : (
                    <table className="w-full">
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                          <th className="text-left px-6 py-3 text-sm font-semibold text-gray-700">Name</th>
                          <th className="text-left px-6 py-3 text-sm font-semibold text-gray-700">Email</th>
                          <th className="text-left px-6 py-3 text-sm font-semibold text-gray-700">Role</th>
                          <th className="text-left px-6 py-3 text-sm font-semibold text-gray-700">Created</th>
                          <th className="text-right px-6 py-3 text-sm font-semibold text-gray-700"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {deniedUsers.map((user) => (
                          <tr key={user.id} className="hover:bg-gray-50">
                            <td className="px-6 py-4 text-sm text-gray-900">
                              {user.first_name || user.last_name
                                ? `${user.first_name || ''} ${user.last_name || ''}`.trim()
                                : <span className="text-gray-400 italic">No name</span>
                              }
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-900">{user.email}</td>
                            <td className="px-6 py-4 text-sm text-gray-500 capitalize">{user.role}</td>
                            <td className="px-6 py-4 text-sm text-gray-500">
                              {new Date(user.created_at).toLocaleDateString()}
                            </td>
                            <td className="px-6 py-4 text-right">
                              <button
                                onClick={() => handleRestoreDenied(user.id)}
                                className="text-sm font-semibold text-[#0e62ae] hover:underline"
                              >
                                Restore to Pending
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>

              {/* Incomplete Signups */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">Incomplete Signups</h3>
                <p className="text-xs text-gray-500 mb-3">Users who registered but haven&apos;t completed their profile.</p>
                <div className="bg-white rounded-2xl shadow-md border border-gray-200 overflow-hidden">
                  {incompleteSignups.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      <p className="text-sm">No incomplete signups</p>
                    </div>
                  ) : (
                    <table className="w-full">
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                          <th className="text-left px-6 py-3 text-sm font-semibold text-gray-700">Name</th>
                          <th className="text-left px-6 py-3 text-sm font-semibold text-gray-700">Email</th>
                          <th className="text-left px-6 py-3 text-sm font-semibold text-gray-700">Created</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {incompleteSignups.map((user) => (
                          <tr key={user.id} className="hover:bg-gray-50">
                            <td className="px-6 py-4 text-sm text-gray-900">
                              {user.first_name || user.last_name
                                ? `${user.first_name || ''} ${user.last_name || ''}`.trim()
                                : <span className="text-gray-400 italic">No name</span>
                              }
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-900">{user.email}</td>
                            <td className="px-6 py-4 text-sm text-gray-500">
                              {new Date(user.created_at).toLocaleDateString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Deny Confirmation Modal */}
      {confirmDeny && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-2">Deny {confirmDeny.name}?</h3>
            <p className="text-sm text-gray-600 mb-5">
              This user will not be able to access the platform. You can restore them later from the Incomplete / Denied tab.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setConfirmDeny(null)}
                className="px-4 py-2 text-sm font-semibold text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  handleStatusChange(confirmDeny.id, 'denied');
                  setConfirmDeny(null);
                }}
                className="px-4 py-2 text-sm font-semibold bg-red-600 text-white rounded-lg hover:bg-red-700 transition"
              >
                Deny User
              </button>
            </div>
          </div>
        </div>
      )}

      {docModal && (
        <DocumentModal
          volunteerId={docModal.id}
          volunteerName={docModal.name}
          record={docModal.record}
          dog={docModal.dog ? { dog_name: docModal.dog.dog_name, dog_breed: docModal.dog.dog_breed, dog_bio: docModal.dog.dog_bio, dog_picture_url: docModal.dog.dog_picture_url, dog_age: docModal.dog.dog_age } : null}
          onClose={() => setDocModal(null)}
          onVerified={(updated) => {
            setComplianceRecords(prev => ({ ...prev, [docModal.id]: updated }));
            // Also update the docModal's record so the modal reflects the change
            setDocModal(prev => prev ? { ...prev, record: updated } : null);
          }}
        />
      )}
    </div>
  );
}
