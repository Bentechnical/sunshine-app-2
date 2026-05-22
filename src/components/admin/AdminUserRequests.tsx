'use client';

import React, { useEffect, useState } from 'react';

// ─── Compliance helpers (mirrors AdminManageVolunteers) ────────────────────────

type ComplianceStatus = 'missing' | 'uploaded' | 'expiring' | 'expired';

function getComplianceStatus(documentUrl: string | null, expiryDate: string | null): ComplianceStatus {
  if (!documentUrl) return 'missing';
  if (!expiryDate) return 'uploaded';
  const expiry = new Date(expiryDate);
  const daysUntil = (expiry.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
  if (daysUntil < 0) return 'expired';
  if (daysUntil <= 30) return 'expiring';
  return 'uploaded';
}

const complianceConfig: Record<ComplianceStatus, { label: string; classes: string }> = {
  missing:  { label: 'Missing',       classes: 'bg-red-100 text-red-700' },
  uploaded: { label: 'Compliant',     classes: 'bg-green-100 text-green-700' },
  expiring: { label: 'Expiring Soon', classes: 'bg-amber-100 text-amber-700' },
  expired:  { label: 'Expired',       classes: 'bg-red-100 text-red-800' },
};

function ComplianceBadge({ status }: { status: ComplianceStatus }) {
  const { label, classes } = complianceConfig[status];
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap ${classes}`}>
      {label}
    </span>
  );
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return '—';
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' });
}

function DocumentModal({ volunteerId, volunteerName, onClose }: { volunteerId: string; volunteerName: string; onClose: () => void }) {
  const [loading, setLoading] = useState(true);
  const [docs, setDocs] = useState<{ vsc_signed_url: string | null; vaccine_signed_url: string | null; dog_name: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`/api/admin/compliance/${volunteerId}/documents`);
        const json = await res.json();
        if (!res.ok) { setError(json.error || 'Failed to load documents'); return; }
        setDocs(json.documents ? { ...json.documents, dog_name: json.dog_name } : null);
      } catch { setError('Failed to load documents'); }
      finally { setLoading(false); }
    };
    load();
  }, [volunteerId]);

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">Documents — {volunteerName}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>
        {loading && (
          <div className="flex items-center gap-2 py-6 justify-center">
            <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm text-gray-600">Loading…</span>
          </div>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
        {!loading && !error && docs && (
          <div className="space-y-4">
            <div>
              <p className="text-sm font-semibold text-gray-700 mb-2">VSC Document</p>
              {docs.vsc_signed_url
                ? <a href={docs.vsc_signed_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700">Open VSC Document</a>
                : <p className="text-sm text-gray-500 italic">No document uploaded</p>}
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-700 mb-2">Vaccine Record{docs.dog_name ? ` — ${docs.dog_name}` : ''}</p>
              {docs.vaccine_signed_url
                ? <a href={docs.vaccine_signed_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700">Open Vaccine Record</a>
                : <p className="text-sm text-gray-500 italic">No document uploaded</p>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

interface VolunteerRequest {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  city: string;
  postal_code: string;
  bio: string;
  travel_distance_km: number;
  profile_picture_url: string;
  role: string;
  assigned_region_id: number | null;
  region_assignment_method: string | null;
  vsc_document_url: string | null;
  vsc_date_issued: string | null;
  vsc_renewal_due: string | null;
  dog: {
    dog_name: string;
    dog_breed: string;
    dog_bio: string;
    dog_picture_url: string;
    dog_age?: number;
    vaccine_record_url: string | null;
    vaccine_expiry_date: string | null;
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
  birthday?: number;
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

interface Region {
  id: number;
  name: string;
  is_active: boolean;
}

export default function UserRequestsTab({ hideIndividuals = false, onCountChange }: { hideIndividuals?: boolean; onCountChange?: () => void }) {
  const [activeSubtab, setActiveSubtab] = useState<'individual' | 'volunteer' | 'organization' | 'incomplete'>(hideIndividuals ? 'volunteer' : 'individual');
  const [volunteerRequests, setVolunteerRequests] = useState<VolunteerRequest[]>([]);
  const [individualRequests, setIndividualRequests] = useState<IndividualRequest[]>([]);
  const [organizationRequests, setOrganizationRequests] = useState<OrganizationRequest[]>([]);
  const [incompleteSignups, setIncompleteSignups] = useState<IncompleteSignup[]>([]);
  const [regions, setRegions] = useState<Region[]>([]);
  const [orgSetupDraft, setOrgSetupDraft] = useState<Record<string, { feeTier: string; regionId: string }>>({});
  const [volRegionDraft, setVolRegionDraft] = useState<Record<string, string>>({});
  const [docModal, setDocModal] = useState<{ id: string; name: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchPendingUsers = async () => {
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

        const data = json.users;

        const volunteers: VolunteerRequest[] = data
          .filter((u: any) => u.role === 'volunteer')
          .map((u: any) => ({
            id: u.id,
            first_name: u.first_name,
            last_name: u.last_name,
            email: u.email,
            phone: u.phone_number,
            city: u.city,
            postal_code: u.postal_code,
            bio: u.bio,
            travel_distance_km: u.travel_distance_km,
            profile_picture_url: u.profile_image,
            role: u.role,
            assigned_region_id: u.assigned_region_id ?? null,
            region_assignment_method: u.region_assignment_method ?? null,
            vsc_document_url: u.vsc_document_url ?? null,
            vsc_date_issued: u.vsc_date_issued ?? null,
            vsc_renewal_due: u.vsc_renewal_due ?? null,
            dog: u.dogs?.status === 'pending'
              ? {
                dog_name: u.dogs.dog_name,
                dog_breed: u.dogs.dog_breed,
                dog_bio: u.dogs.dog_bio,
                dog_picture_url: u.dogs.dog_picture_url,
                dog_age: u.dogs.dog_age,
                vaccine_record_url: u.dogs.vaccine_record_url ?? null,
                vaccine_expiry_date: u.dogs.vaccine_expiry_date ?? null,
              }
              : null,
          }));

        const individuals = data
          .filter((u: any) => u.role === 'individual')
          .map((u: any) => ({
            id: u.id,
            first_name: u.first_name,
            last_name: u.last_name,
            email: u.email,
            phone: u.phone_number,
            city: u.city,
            postal_code: u.postal_code,
            bio: u.bio,
            profile_picture_url: u.profile_image,
            role: u.role,
            // New individual user fields
            pronouns: u.pronouns,
            birthday: u.birthday,
            physical_address: u.physical_address,
            other_pets_on_site: u.other_pets_on_site,
            other_pets_description: u.other_pets_description,
            third_party_available: u.third_party_available,
            additional_information: u.additional_information,
            liability_waiver_accepted: u.liability_waiver_accepted,
            liability_waiver_accepted_at: u.liability_waiver_accepted_at,
            // Visit recipient fields
            visit_recipient_type: u.visit_recipient_type,
            relationship_to_recipient: u.relationship_to_recipient,
            dependant_name: u.dependant_name,
          }));

        const organizations: OrganizationRequest[] = data
          .filter((u: any) => u.role === 'organization')
          .map((u: any) => ({
            id: u.id,
            first_name: u.first_name,
            last_name: u.last_name,
            email: u.email,
            org_name: u.org_name,
            org_type: u.org_type,
            org_address: u.org_address,
            org_contact_name: u.org_contact_name,
            org_contact_phone: u.org_contact_phone,
            fee_tier: u.fee_tier ?? null,
            assigned_region_id: u.assigned_region_id ?? null,
            region_assignment_method: u.region_assignment_method ?? null,
          }));

        setVolunteerRequests(volunteers);
        setIndividualRequests(individuals);
        setOrganizationRequests(organizations);

        // Pre-populate setup drafts with auto-assigned values
        const drafts: Record<string, { feeTier: string; regionId: string }> = {};
        for (const org of organizations) {
          if (org.fee_tier || org.assigned_region_id) {
            drafts[org.id] = {
              feeTier: org.fee_tier ?? '',
              regionId: org.assigned_region_id ? String(org.assigned_region_id) : '',
            };
          }
        }
        if (Object.keys(drafts).length > 0) {
          setOrgSetupDraft(drafts);
        }

        // Pre-populate volunteer region drafts
        const volDrafts: Record<string, string> = {};
        for (const vol of volunteers) {
          if (vol.assigned_region_id) {
            volDrafts[vol.id] = String(vol.assigned_region_id);
          }
        }
        if (Object.keys(volDrafts).length > 0) {
          setVolRegionDraft(volDrafts);
        }

        // Fetch incomplete signups
        const incompleteRes = await fetch('/api/admin/incomplete-signups');
        const incompleteJson = await incompleteRes.json();

        if (incompleteRes.ok) {
          setIncompleteSignups(incompleteJson.users || []);
        } else {
          console.error('[Admin] Error fetching incomplete signups:', incompleteJson.error);
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

    fetchPendingUsers();
  }, []);

  const handleStatusChange = async (userId: string, status: 'approved' | 'denied') => {
    try {
      const res = await fetch('/api/admin/updateUserStatus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, status }),
      });

      if (res.ok) {
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

  return (
    <div className="px-4 py-4">
      {/* Tabs */}
      <div className="flex space-x-4 mb-6">
        {!hideIndividuals && (
          <button
            onClick={() => setActiveSubtab('individual')}
            className={`inline-flex items-center gap-1.5 px-4 py-2 rounded text-sm font-semibold transition ${activeSubtab === 'individual' ? 'bg-[#0e62ae] text-white' : 'bg-gray-200 text-gray-800'}`}
          >
            Individual Requests
            {individualRequests.length > 0 && (
              <span className="bg-red-500 text-white text-xs font-bold rounded-full px-1.5 py-0.5 leading-none">
                {individualRequests.length}
              </span>
            )}
          </button>
        )}
        <button
          onClick={() => setActiveSubtab('volunteer')}
          className={`inline-flex items-center gap-1.5 px-4 py-2 rounded text-sm font-semibold transition ${activeSubtab === 'volunteer' ? 'bg-[#0e62ae] text-white' : 'bg-gray-200 text-gray-800'}`}
        >
          Volunteer Requests
          {volunteerRequests.length > 0 && (
            <span className="bg-red-500 text-white text-xs font-bold rounded-full px-1.5 py-0.5 leading-none">
              {volunteerRequests.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveSubtab('organization')}
          className={`inline-flex items-center gap-1.5 px-4 py-2 rounded text-sm font-semibold transition ${activeSubtab === 'organization' ? 'bg-[#0e62ae] text-white' : 'bg-gray-200 text-gray-800'}`}
        >
          Organization Requests
          {organizationRequests.length > 0 && (
            <span className="bg-red-500 text-white text-xs font-bold rounded-full px-1.5 py-0.5 leading-none">
              {organizationRequests.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveSubtab('incomplete')}
          className={`px-4 py-2 rounded text-sm font-semibold transition ${activeSubtab === 'incomplete' ? 'bg-[#0e62ae] text-white' : 'bg-gray-200 text-gray-800'}`}
        >
          Incomplete Signups {incompleteSignups.length > 0 && `(${incompleteSignups.length})`}
        </button>
      </div>

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
                volunteerRequests.map((user) => (
                  <div
                    key={user.id}
                    className="bg-white p-6 rounded-2xl shadow-md border border-gray-200 flex flex-col gap-4"
                  >
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      {/* Left Column: Volunteer Info */}
                      <div className="flex items-start gap-4">
                        <div className="w-28 h-28 rounded-xl overflow-hidden shrink-0">
                          <img
                            src={user.profile_picture_url}
                            alt={`${user.first_name} ${user.last_name}`}
                            className="object-cover w-full h-full"
                          />
                        </div>
                        <div className="flex flex-col gap-3 text-left">
                          <h2 className="text-xl font-bold text-gray-900">
                            {user.first_name} {user.last_name}
                          </h2>
                          
                          {/* Contact Information */}
                          <div className="space-y-2">
                            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Contact Information</h3>
                            <div className="space-y-1">
                              <p className="text-sm"><span className="font-semibold text-gray-700">Email:</span> <span className="text-gray-900">{user.email}</span></p>
                              <p className="text-sm"><span className="font-semibold text-gray-700">Phone:</span> <span className="text-gray-900">{user.phone}</span></p>
                              <p className="text-sm"><span className="font-semibold text-gray-700">Postal Code:</span> <span className="text-gray-900">{user.postal_code}, {user.city}</span></p>
                              <p className="text-sm"><span className="font-semibold text-gray-700">Travel Distance:</span> <span className="text-gray-900">{user.travel_distance_km} km</span></p>
                            </div>
                          </div>

                          {/* Bio */}
                          <div className="space-y-2">
                            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Bio</h3>
                            <p className="text-sm text-gray-900 whitespace-pre-line italic">"{user.bio}"</p>
                          </div>
                        </div>
                      </div>

                      {/* Right Column: Dog Info */}
                      {user.dog && (
                        <div className="flex items-start gap-4">
                          <div className="w-28 h-28 rounded-xl overflow-hidden shrink-0">
                            <img
                              src={user.dog.dog_picture_url}
                              alt={user.dog.dog_name}
                              className="object-cover w-full h-full"
                            />
                          </div>
                          <div className="flex flex-col gap-3 text-left">
                            <h2 className="text-xl font-bold text-gray-900">{user.dog.dog_name}</h2>
                            
                            {/* Dog Details */}
                            <div className="space-y-2">
                              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Dog Details</h3>
                              <div className="space-y-1">
                                <p className="text-sm"><span className="font-semibold text-gray-700">Breed:</span> <span className="text-gray-900">{user.dog.dog_breed}</span></p>
                                {user.dog.dog_age !== null && (
                                  <p className="text-sm"><span className="font-semibold text-gray-700">Age:</span> <span className="text-gray-900">{user.dog.dog_age} years</span></p>
                                )}
                              </div>
                            </div>

                            {/* Dog Bio */}
                            <div className="space-y-2">
                              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Dog Bio</h3>
                              <p className="text-sm text-gray-900 whitespace-pre-line italic">"{user.dog.dog_bio}"</p>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-1 lg:grid-cols-2 gap-4">
                      {/* Compliance */}
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Compliance</p>
                          <button
                            onClick={() => setDocModal({ id: user.id, name: `${user.first_name} ${user.last_name}` })}
                            className="text-xs text-blue-600 hover:underline"
                          >
                            View Documents
                          </button>
                        </div>
                        <div className="grid grid-cols-2 gap-3 text-sm">
                          <div>
                            <p className="font-medium text-gray-600 mb-1">VSC</p>
                            <ComplianceBadge status={getComplianceStatus(user.vsc_document_url, user.vsc_renewal_due)} />
                            {user.vsc_date_issued && <p className="text-xs text-gray-500 mt-1">Issued: {formatDate(user.vsc_date_issued)}</p>}
                            {user.vsc_renewal_due && <p className="text-xs text-gray-500">Renewal: {formatDate(user.vsc_renewal_due)}</p>}
                          </div>
                          <div>
                            <p className="font-medium text-gray-600 mb-1">Vaccine{user.dog ? ` — ${user.dog.dog_name}` : ''}</p>
                            <ComplianceBadge status={getComplianceStatus(user.dog?.vaccine_record_url ?? null, user.dog?.vaccine_expiry_date ?? null)} />
                            {user.dog?.vaccine_expiry_date && <p className="text-xs text-gray-500 mt-1">Expires: {formatDate(user.dog.vaccine_expiry_date)}</p>}
                          </div>
                        </div>
                      </div>

                      {/* Region */}
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide">Region</label>
                          {user.assigned_region_id && (
                            <span className="text-xs text-blue-600 font-medium">
                              Auto-assigned ({user.region_assignment_method === 'boundary_auto' ? 'boundary' : user.region_assignment_method === 'fsa_auto' ? 'FSA' : 'distance'})
                            </span>
                          )}
                        </div>
                        <select
                          value={volRegionDraft[user.id] ?? ''}
                          onChange={e => setVolRegionDraft(prev => ({ ...prev, [user.id]: e.target.value }))}
                          className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm bg-white"
                        >
                          <option value="">— Assign later —</option>
                          {regions.map(r => (
                            <option key={r.id} value={r.id}>{r.name}</option>
                          ))}
                        </select>
                      </div>
                    </div>{/* end compliance+region grid */}

                    <div className="mt-4 flex justify-center gap-4">
                      <button
                        onClick={() => handleApproveVolunteer(user.id)}
                        className="bg-green-600 text-white px-5 py-2 rounded hover:bg-green-700 text-sm"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => handleStatusChange(user.id, 'denied')}
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
                                {user.birthday && user.visit_recipient_type !== 'other' && (
                                  <p><span className="font-semibold text-gray-700">Birth Year:</span> {user.birthday} ({new Date().getFullYear() - user.birthday} years old)</p>
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
                                  {user.birthday && (
                                    <p><span className="font-semibold text-gray-700">Birth Year:</span> {user.birthday} ({new Date().getFullYear() - user.birthday} years old)</p>
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
                        onClick={() => handleStatusChange(user.id, 'denied')}
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
                        onClick={() => handleStatusChange(org.id, 'denied')}
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

          {/* Incomplete Signups */}
          {activeSubtab === 'incomplete' && (
            <div className="bg-white rounded-2xl shadow-md border border-gray-200 overflow-hidden">
              {incompleteSignups.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <p>No incomplete signups</p>
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
          )}
        </>
      )}

      {docModal && (
        <DocumentModal
          volunteerId={docModal.id}
          volunteerName={docModal.name}
          onClose={() => setDocModal(null)}
        />
      )}
    </div>
  );
}
