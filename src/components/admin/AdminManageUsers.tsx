// src/components/admin/AdminManageUsers.tsx
'use client';

import React, { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface DogProfile {
  dog_name: string;
  dog_breed: string;
  dog_bio: string;
  dog_picture_url: string;
  dog_age?: number;
}

interface VolunteerUser {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  city: string;
  postal_code: string;
  travel_distance_km: number;
  bio: string;
  profile_picture_url: string;
  dog?: DogProfile | null;
  audience_categories: string[];
  is_browsable: boolean;
}

interface IndividualUser {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  city: string;
  postal_code: string;
  bio: string;
  profile_picture_url: string;
  audience_categories: string[];
  is_browsable: boolean;
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

const FEE_TIER_LABELS: Record<string, string> = {
  tier_500: '$500 — Corporate / for-profit / conferences / large events',
  tier_200: '$200 — Post-secondary / private schools / private care / wellness',
  tier_0: '$0 — Public schools / non-profits / first responders / inpatients',
};

interface OrganizationUser {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  org_name: string;
  org_type: string;
  org_address: string;
  org_contact_name: string;
  org_contact_phone: string;
  assigned_pd_id: string | null;
  fee_tier: string | null;
}

interface PdUser {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  pd_postal_code: string | null;
  profile_complete: boolean;
}

interface ArchivedUser {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  role: 'individual' | 'volunteer';
  phone: string;
  city: string;
  archived_at: string;
  dog?: DogProfile | null;
}

interface ActiveAppointment {
  id: number;
  start_time: string;
  end_time: string;
  status: 'pending' | 'confirmed';
  other_user_name: string;
  dog_name?: string;
}

export default function ManageUsersTab({ hideIndividuals = false }: { hideIndividuals?: boolean }) {
  const [activeSubtab, setActiveSubtab] = useState<'individual' | 'volunteer' | 'organization' | 'pd' | 'archived'>(hideIndividuals ? 'volunteer' : 'individual');
  const [volunteers, setVolunteers] = useState<VolunteerUser[]>([]);
  const [individuals, setIndividuals] = useState<IndividualUser[]>([]);
  const [organizations, setOrganizations] = useState<OrganizationUser[]>([]);
  const [pdUsers, setPdUsers] = useState<PdUser[]>([]);
  const [archivedUsers, setArchivedUsers] = useState<ArchivedUser[]>([]);
  // Invite PD modal
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState(false);
  const [expandedUserIds, setExpandedUserIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Archive modal state
  const [archiveModalOpen, setArchiveModalOpen] = useState(false);
  const [userToArchive, setUserToArchive] = useState<{id: string, name: string} | null>(null);
  const [archiveWarning, setArchiveWarning] = useState<{appointments: ActiveAppointment[]} | null>(null);
  const [archiving, setArchiving] = useState(false);

  // PD assignment state
  const [orgPdSaving, setOrgPdSaving] = useState<Record<string, boolean>>({});
  const [pdAssignConfirm, setPdAssignConfirm] = useState<{
    orgId: string; orgName: string; pdId: string | null; pdName: string;
  } | null>(null);

  // Fee tier state
  const [orgFeeTierDraft, setOrgFeeTierDraft] = useState<Record<string, string>>({});
  const [orgFeeTierSaving, setOrgFeeTierSaving] = useState<Record<string, boolean>>({});

  const handleSaveOrgFeeTier = async (orgId: string) => {
    const tier = orgFeeTierDraft[orgId] ?? '';
    setOrgFeeTierSaving(prev => ({ ...prev, [orgId]: true }));
    try {
      const res = await fetch('/api/admin/update-org-fee-tier', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ org_id: orgId, fee_tier: tier || null }),
      });
      if (!res.ok) {
        const json = await res.json();
        alert(json.error || 'Failed to update fee tier');
        return;
      }
      setOrganizations(prev => prev.map(o => o.id === orgId ? { ...o, fee_tier: tier || null } : o));
    } catch {
      alert('Failed to update fee tier');
    } finally {
      setOrgFeeTierSaving(prev => ({ ...prev, [orgId]: false }));
    }
  };

  const handleAssignOrgPd = async (orgId: string, pdId: string | null, cascade: boolean) => {
    setOrgPdSaving(prev => ({ ...prev, [orgId]: true }));
    setPdAssignConfirm(null);
    try {
      const res = await fetch('/api/admin/assign-org-pd', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ org_id: orgId, pd_id: pdId, cascade_visits: cascade }),
      });
      if (!res.ok) {
        const json = await res.json();
        alert(json.error || 'Failed to update assignment');
        return;
      }
      setOrganizations(prev => prev.map(o => o.id === orgId ? { ...o, assigned_pd_id: pdId } : o));
    } catch {
      alert('An error occurred. Please try again.');
    } finally {
      setOrgPdSaving(prev => ({ ...prev, [orgId]: false }));
    }
  };

  const allCategories = ['Young Kids', 'Teens/Young Adults', 'Adults', 'Seniors'];

  const toggleExpand = (userId: string) => {
    setExpandedUserIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  useEffect(() => {
    const fetchUsers = async () => {
      setLoading(true);
      setError(null);
      
      try {
        const res = await fetch('/api/admin/approved-users');
        const json = await res.json();

        if (!res.ok) {
          console.error('[Admin fetch error]', json.error || 'Unknown error');
          setError(json.error || 'Failed to load users');
          return;
        }

        const data = json.users;

        const sortedVolunteers = data
          .filter((u: any) => u.role === 'volunteer')
          .map((u: any) => ({
            id: u.id,
            first_name: u.first_name,
            last_name: u.last_name,
            email: u.email,
            phone: u.phone_number,
            city: u.city,
            postal_code: u.postal_code,
            travel_distance_km: u.travel_distance_km,
            bio: u.bio,
            profile_picture_url: u.profile_image,
            dog: u.dogs
              ? {
                  dog_name: u.dogs.dog_name,
                  dog_breed: u.dogs.dog_breed,
                  dog_bio: u.dogs.dog_bio,
                  dog_picture_url: u.dogs.dog_picture_url,
                  dog_age: u.dogs.dog_age,
                }
              : null,
            audience_categories: u.audience_categories || [],
            is_browsable: u.is_browsable ?? true,
          }))
          .sort((a: VolunteerUser, b: VolunteerUser) => a.last_name.localeCompare(b.last_name));

        const sortedIndividuals = data
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
            audience_categories: u.audience_categories || [],
            is_browsable: u.is_browsable ?? true,
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
          }))
          .sort((a: IndividualUser, b: IndividualUser) => a.last_name.localeCompare(b.last_name));

        const sortedOrganizations = data
          .filter((u: any) => u.role === 'organization')
          .map((u: any) => ({
            id: u.id,
            first_name: u.first_name,
            last_name: u.last_name,
            email: u.email,
            phone: u.phone_number,
            org_name: u.org_name,
            org_type: u.org_type,
            org_address: u.org_address,
            org_contact_name: u.org_contact_name,
            org_contact_phone: u.org_contact_phone,
            assigned_pd_id: u.assigned_pd_id ?? null,
            fee_tier: u.fee_tier ?? null,
          }))
          .sort((a: OrganizationUser, b: OrganizationUser) => (a.org_name || '').localeCompare(b.org_name || ''));

        const sortedPds = data
          .filter((u: any) => u.role === 'pd')
          .map((u: any) => ({
            id: u.id,
            first_name: u.first_name,
            last_name: u.last_name,
            email: u.email,
            phone: u.phone_number,
            pd_postal_code: u.pd_postal_code ?? null,
            profile_complete: u.profile_complete ?? false,
          }))
          .sort((a: PdUser, b: PdUser) => a.last_name.localeCompare(b.last_name));

        setVolunteers(sortedVolunteers);
        setIndividuals(sortedIndividuals);
        setOrganizations(sortedOrganizations);
        setPdUsers(sortedPds);
      } catch (err) {
        console.error('[Admin] Error fetching users:', err);
        setError('Failed to load users');
      } finally {
        setLoading(false);
      }
    };

    fetchUsers();
  }, []);

  // Fetch archived users when archived tab is selected
  useEffect(() => {
    const fetchArchivedUsers = async () => {
      if (activeSubtab !== 'archived') return;

      setLoading(true);
      setError(null);

      try {
        const res = await fetch('/api/admin/archived-users');
        const json = await res.json();

        if (!res.ok) {
          console.error('[Admin fetch archived error]', json.error || 'Unknown error');
          setError(json.error || 'Failed to load archived users');
          return;
        }

        const sortedArchived = json.users.map((u: any) => ({
          id: u.id,
          first_name: u.first_name,
          last_name: u.last_name,
          email: u.email,
          role: u.role,
          phone: u.phone_number,
          city: u.city,
          archived_at: u.archived_at,
          dog: u.dogs
            ? {
                dog_name: u.dogs.dog_name,
                dog_breed: u.dogs.dog_breed,
                dog_bio: u.dogs.dog_bio,
                dog_picture_url: u.dogs.dog_picture_url,
                dog_age: u.dogs.dog_age,
              }
            : null,
        })).sort((a: ArchivedUser, b: ArchivedUser) =>
          new Date(b.archived_at).getTime() - new Date(a.archived_at).getTime()
        );

        setArchivedUsers(sortedArchived);
      } catch (err) {
        console.error('[Admin] Error fetching archived users:', err);
        setError('Failed to load archived users');
      } finally {
        setLoading(false);
      }
    };

    fetchArchivedUsers();
  }, [activeSubtab]);

  // Handle archive user action
  const handleArchiveUser = async (userId: string, userName: string) => {
    setUserToArchive({ id: userId, name: userName });
    setArchiving(false);

    // First call to check for active appointments
    try {
      const res = await fetch('/api/admin/archive-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId }),
      });

      const result = await res.json();

      if (result.requires_confirmation) {
        // Show modal with appointment warnings (or empty if no appointments)
        setArchiveWarning({ appointments: result.active_appointments });
        setArchiveModalOpen(true);
      } else if (result.success) {
        // No appointments, archiving succeeded
        // Refresh user lists
        setVolunteers(prev => prev.filter(u => u.id !== userId));
        setIndividuals(prev => prev.filter(u => u.id !== userId));
        setOrganizations(prev => prev.filter(u => u.id !== userId));
        alert('User archived successfully');
      } else {
        alert(`Failed to archive user: ${result.error}`);
      }
    } catch (err) {
      console.error('[Admin] Error archiving user:', err);
      alert('Failed to archive user');
    }
  };

  // Confirm archive with appointments
  const confirmArchive = async () => {
    if (!userToArchive) return;

    setArchiving(true);

    try {
      const res = await fetch('/api/admin/archive-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userToArchive.id, confirmed: true }),
      });

      const result = await res.json();

      if (result.success) {
        // Remove from current lists
        setVolunteers(prev => prev.filter(u => u.id !== userToArchive.id));
        setIndividuals(prev => prev.filter(u => u.id !== userToArchive.id));
        setOrganizations(prev => prev.filter(u => u.id !== userToArchive.id));

        // Close modal
        setArchiveModalOpen(false);
        setUserToArchive(null);
        setArchiveWarning(null);
      } else {
        alert(`Failed to archive user: ${result.error}`);
      }
    } catch (err) {
      console.error('[Admin] Error confirming archive:', err);
      alert('Failed to archive user');
    } finally {
      setArchiving(false);
    }
  };

  // Handle unarchive user action
  const handleUnarchiveUser = async (userId: string, userName: string) => {
    if (!confirm(`Restore ${userName}'s account? They will be able to access the platform again.`)) {
      return;
    }

    try {
      const res = await fetch('/api/admin/unarchive-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId }),
      });

      const result = await res.json();

      if (result.success) {
        // Remove from archived list
        setArchivedUsers(prev => prev.filter(u => u.id !== userId));
        alert('User unarchived successfully');

        // Optionally refresh the approved users list
        // For now, admin can just switch tabs to see the restored user
      } else {
        alert(`Failed to unarchive user: ${result.error}`);
      }
    } catch (err) {
      console.error('[Admin] Error unarchiving user:', err);
      alert('Failed to unarchive user');
    }
  };

  const updateAudience = async (
    userId: string,
    role: 'volunteer' | 'individual',
    newCategories: string[]
  ) => {
    const res = await fetch('/api/admin/update-audience-preferences', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: userId,
        role,
        category_labels: newCategories,
      }),
    });

    if (!res.ok) {
      const err = await res.json();
      console.error('Failed to update audience prefs', err);
    }
  };

  const handleCheckboxChange = (
    userId: string,
    role: 'volunteer' | 'individual',
    label: string,
    current: string[],
    setUsers: React.Dispatch<React.SetStateAction<any[]>>
  ) => {
    const newCategories = current.includes(label)
      ? current.filter((c) => c !== label)
      : [...current, label];

    updateAudience(userId, role, newCategories);
    setUsers((prev) =>
      prev.map((u) =>
        u.id === userId ? { ...u, audience_categories: newCategories } : u
      )
    );
  };

  const handleToggleBrowsable = async (
    userId: string,
    current: boolean,
    setUsers: React.Dispatch<React.SetStateAction<any[]>>
  ) => {
    const next = !current;
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, is_browsable: next } : u));

    const res = await fetch('/api/admin/set-browsable', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, is_browsable: next }),
    });

    if (!res.ok) {
      // Revert on failure
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, is_browsable: current } : u));
      alert('Failed to update visibility');
    }
  };

  const handleInvitePd = async () => {
    setInviteError(null);
    if (!inviteEmail.trim()) { setInviteError('Email is required.'); return; }
    setInviting(true);
    try {
      const res = await fetch('/api/admin/invite-pd', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail.trim() }),
      });
      const json = await res.json();
      if (!res.ok) { setInviteError(json.error || 'Failed to send invitation.'); return; }
      setInviteSuccess(true);
      setInviteEmail('');
    } catch {
      setInviteError('Failed to send invitation.');
    } finally {
      setInviting(false);
    }
  };

  const renderCategoryBubbles = (categories: string[]) => {
    // Sort categories based on the predefined order
    const sortedCategories = categories.sort((a, b) => {
      const indexA = allCategories.indexOf(a);
      const indexB = allCategories.indexOf(b);
      return indexA - indexB;
    });

    return (
      <div className="flex flex-wrap gap-1">
        {sortedCategories.map((label) => (
          <span
            key={label}
            className="bg-blue-100 text-blue-800 text-xs font-medium px-2 py-0.5 rounded-full"
          >
            {label}
          </span>
        ))}
      </div>
    );
  };

  const renderAudienceCheckboxes = (
    userId: string,
    role: 'volunteer' | 'individual',
    selected: string[],
    setUsers: React.Dispatch<React.SetStateAction<any[]>>
  ) => (
    <div className="flex flex-wrap items-center gap-4 mt-4">
      <span className="font-semibold">Audience Preferences:</span>
      {allCategories.map((label) => (
        <label key={label} className="flex items-center gap-1 text-sm">
          <input
            type="checkbox"
            checked={selected.includes(label)}
            onChange={() =>
              handleCheckboxChange(userId, role, label, selected, setUsers)
            }
          />
          {label}
        </label>
      ))}
    </div>
  );

  const filteredVolunteers = volunteers.filter((u) =>
    `${u.first_name} ${u.last_name} ${u.email} ${u.city}`
      .toLowerCase()
      .includes(searchQuery.toLowerCase())
  );

  const filteredIndividuals = individuals.filter((u) =>
    `${u.first_name} ${u.last_name} ${u.email} ${u.city}`
      .toLowerCase()
      .includes(searchQuery.toLowerCase())
  );

  const filteredOrganizations = organizations.filter((u) =>
    `${u.org_name} ${u.email} ${u.org_contact_name} ${u.org_address}`
      .toLowerCase()
      .includes(searchQuery.toLowerCase())
  );

  const filteredArchivedUsers = archivedUsers.filter((u) =>
    `${u.first_name} ${u.last_name} ${u.email} ${u.city}`
      .toLowerCase()
      .includes(searchQuery.toLowerCase())
  );

  return (
    <div className="px-4 py-4">
      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
        {/* Header */}
        <div className="flex justify-between items-center mb-4">
          <div className="flex space-x-4">
            {!hideIndividuals && (
              <button
                onClick={() => setActiveSubtab('individual')}
                className={`px-4 py-2 rounded text-sm font-semibold transition ${
                  activeSubtab === 'individual'
                    ? 'bg-[#0e62ae] text-white'
                    : 'bg-gray-200 text-gray-800'
                }`}
              >
                Individual Users
              </button>
            )}
            <button
              onClick={() => setActiveSubtab('volunteer')}
              className={`px-4 py-2 rounded text-sm font-semibold transition ${
                activeSubtab === 'volunteer'
                  ? 'bg-[#0e62ae] text-white'
                  : 'bg-gray-200 text-gray-800'
              }`}
            >
              Volunteer Users
            </button>
            <button
              onClick={() => setActiveSubtab('organization')}
              className={`px-4 py-2 rounded text-sm font-semibold transition ${
                activeSubtab === 'organization'
                  ? 'bg-[#0e62ae] text-white'
                  : 'bg-gray-200 text-gray-800'
              }`}
            >
              Organizations
            </button>
            <button
              onClick={() => setActiveSubtab('pd')}
              className={`px-4 py-2 rounded text-sm font-semibold transition ${
                activeSubtab === 'pd'
                  ? 'bg-[#0e62ae] text-white'
                  : 'bg-gray-200 text-gray-800'
              }`}
            >
              Program Directors
            </button>
            <button
              onClick={() => setActiveSubtab('archived')}
              className={`px-4 py-2 rounded text-sm font-semibold transition ${
                activeSubtab === 'archived'
                  ? 'bg-orange-600 text-white'
                  : 'bg-gray-200 text-gray-800'
              }`}
            >
              Archived Users
            </button>
          </div>
          <input
            type="text"
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="border border-gray-300 px-3 py-1.5 rounded-md text-sm w-64"
          />
        </div>

        {/* Loading State */}
        {loading && (
          <div className="flex items-center justify-center py-12">
            <div className="flex items-center space-x-2">
              <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
              <span className="text-gray-600">Loading users...</span>
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
            {/* Volunteer Table */}
            {activeSubtab === 'volunteer' && (
          <table className="w-full text-sm border border-gray-200 rounded-md">
            <thead className="bg-gray-100 text-left">
              <tr>
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2">Email</th>
                <th className="px-4 py-2">City</th>
                <th className="px-4 py-2">Audience</th>
                <th className="px-2 py-2 w-6" />
              </tr>
            </thead>
            <tbody>
              {filteredVolunteers.map((user) => {
                const isExpanded = expandedUserIds.includes(user.id);
                return (
                  <React.Fragment key={user.id}>
                    <tr
                      className="border-t hover:bg-gray-50 cursor-pointer"
                      onClick={() => toggleExpand(user.id)}
                    >
                      <td className="px-4 py-2">{user.first_name} {user.last_name}</td>
                      <td className="px-4 py-2">{user.email}</td>
                      <td className="px-4 py-2">{user.city}</td>
                      <td className="px-4 py-2">{renderCategoryBubbles(user.audience_categories)}</td>
                      <td className="px-2 py-2">{isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</td>
                    </tr>
                    {isExpanded && (
                      <tr className="bg-gray-50 border-t">
                        <td colSpan={5} className="px-6 py-4">
                          <div className="flex flex-col lg:flex-row gap-6">
                            <div className="flex gap-4 items-start w-full lg:w-1/2">
                              <img
                                src={user.profile_picture_url}
                                alt={`${user.first_name} ${user.last_name}`}
                                className="w-28 h-28 object-cover rounded-lg"
                              />
                              <div className="space-y-3">
                                <h3 className="text-lg font-semibold text-gray-900">Volunteer Information</h3>
                                <div className="space-y-2 text-sm">
                                  <p><span className="font-semibold text-gray-700">Phone:</span> <span className="text-gray-900">{user.phone}</span></p>
                                  <p><span className="font-semibold text-gray-700">Postal Code:</span> <span className="text-gray-900">{user.postal_code}</span></p>
                                  <p><span className="font-semibold text-gray-700">Travel Distance:</span> <span className="text-gray-900">{user.travel_distance_km} km</span></p>
                                  <p><span className="font-semibold text-gray-700">Bio:</span></p>
                                  <p className="text-gray-900 italic">"{user.bio}"</p>
                                </div>
                              </div>
                            </div>
                            {user.dog && (
                              <div className="flex gap-4 items-start w-full lg:w-1/2">
                                <img
                                  src={user.dog.dog_picture_url}
                                  alt={user.dog.dog_name}
                                  className="w-28 h-28 object-cover rounded-lg"
                                />
                                <div className="space-y-3">
                                  <h3 className="text-lg font-semibold text-gray-900">Dog Information</h3>
                                  <div className="space-y-2 text-sm">
                                    <p><span className="font-semibold text-gray-700">Name:</span> <span className="text-gray-900">{user.dog.dog_name}</span></p>
                                    <p><span className="font-semibold text-gray-700">Breed:</span> <span className="text-gray-900">{user.dog.dog_breed}</span></p>
                                    {user.dog.dog_age && <p><span className="font-semibold text-gray-700">Age:</span> <span className="text-gray-900">{user.dog.dog_age} years</span></p>}
                                    <p><span className="font-semibold text-gray-700">Bio:</span></p>
                                    <p className="text-gray-900 italic">"{user.dog.dog_bio}"</p>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                          {renderAudienceCheckboxes(user.id, 'volunteer', user.audience_categories, setVolunteers)}

                          {/* Admin Controls */}
                          <div className="mt-6 pt-4 border-t border-gray-200 flex items-center gap-6">
                            <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                              <input
                                type="checkbox"
                                checked={user.is_browsable}
                                onChange={() => handleToggleBrowsable(user.id, user.is_browsable, setVolunteers)}
                                onClick={(e) => e.stopPropagation()}
                              />
                              <span className="font-medium text-gray-700">Visible in search</span>
                            </label>
                            <button
                              onClick={() => handleArchiveUser(user.id, `${user.first_name} ${user.last_name}`)}
                              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded transition"
                            >
                              Archive User
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

        {/* Individual Table */}
        {activeSubtab === 'individual' && (
          <table className="w-full text-sm border border-gray-200 rounded-md">
            <thead className="bg-gray-100 text-left">
              <tr>
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2">Email</th>
                <th className="px-4 py-2">City</th>
                <th className="px-4 py-2">Audience</th>
                <th className="px-2 py-2 w-6" />
              </tr>
            </thead>
            <tbody>
              {filteredIndividuals.map((user) => {
                const isExpanded = expandedUserIds.includes(user.id);
                return (
                  <React.Fragment key={user.id}>
                    <tr
                      className="border-t hover:bg-gray-50 cursor-pointer"
                      onClick={() => toggleExpand(user.id)}
                    >
                      <td className="px-4 py-2">{user.first_name} {user.last_name}</td>
                      <td className="px-4 py-2">{user.email}</td>
                      <td className="px-4 py-2">{user.city}</td>
                      <td className="px-4 py-2">{renderCategoryBubbles(user.audience_categories)}</td>
                      <td className="px-2 py-2">{isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</td>
                    </tr>
                    {isExpanded && (
                      <tr className="bg-gray-50 border-t">
                        <td colSpan={5} className="px-6 py-4">
                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            {/* Left Column - Contact Info and Visit Recipient */}
                            <div className="space-y-4">
                              <div className="flex gap-4 items-start">
                                <img
                                  src={user.profile_picture_url}
                                  alt={`${user.first_name} ${user.last_name}`}
                                  className="w-28 h-28 object-cover rounded-lg"
                                />
                                <div className="space-y-3">
                                  {/* Contact Information Section */}
                                  <div className="space-y-2">
                                    <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Contact Information</h3>
                                    <div className="space-y-1 text-sm">
                                      <p><span className="font-semibold text-gray-700">Phone:</span> <span className="text-gray-900">{user.phone || 'User left this field blank'}</span></p>
                                      <p><span className="font-semibold text-gray-700">Postal Code:</span> <span className="text-gray-900">{user.postal_code}, {user.city}</span></p>
                                      {user.pronouns && user.visit_recipient_type !== 'other' && <p><span className="font-semibold text-gray-700">Pronouns:</span> <span className="text-gray-900">{user.pronouns}</span></p>}
                                      {user.birthday && user.visit_recipient_type !== 'other' && (
                                        <p><span className="font-semibold text-gray-700">Birth Year:</span> <span className="text-gray-900">{user.birthday} ({new Date().getFullYear() - user.birthday} years old)</span></p>
                                      )}
                                      {user.physical_address && <p><span className="font-semibold text-gray-700">Physical Address:</span> <span className="text-gray-900">{user.physical_address}</span></p>}
                                    </div>
                                  </div>

                                  {/* Visit Recipient Information (for dependants) */}
                                  {user.visit_recipient_type === 'other' && (
                                    <div className="border-t border-gray-200 pt-3">
                                      <h4 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">Visit Recipient</h4>
                                      <div className="space-y-1 text-sm">
                                        <p><span className="font-semibold text-gray-700">Name:</span> <span className="text-gray-900">{user.dependant_name || 'User left this field blank'}</span></p>
                                        <p><span className="font-semibold text-gray-700">Relationship:</span> <span className="text-gray-900">{user.relationship_to_recipient || 'User left this field blank'}</span></p>
                                        {user.pronouns && <p><span className="font-semibold text-gray-700">Pronouns:</span> <span className="text-gray-900">{user.pronouns}</span></p>}
                                        {user.birthday && (
                                          <p><span className="font-semibold text-gray-700">Birth Year:</span> <span className="text-gray-900">{user.birthday} ({new Date().getFullYear() - user.birthday} years old)</span></p>
                                        )}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Right Column - Visit Details and Legal */}
                            <div className="space-y-4">
                              {/* Visit Details Section */}
                              <div className="space-y-2">
                                <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Visit Details</h4>
                                <div className="space-y-2 text-sm">
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
                                <div className="space-y-1 text-sm">
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

                          {renderAudienceCheckboxes(user.id, 'individual', user.audience_categories, setIndividuals)}

                          {/* Admin Controls */}
                          <div className="mt-6 pt-4 border-t border-gray-200 flex items-center gap-6">
                            <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                              <input
                                type="checkbox"
                                checked={user.is_browsable}
                                onChange={() => handleToggleBrowsable(user.id, user.is_browsable, setIndividuals)}
                                onClick={(e) => e.stopPropagation()}
                              />
                              <span className="font-medium text-gray-700">Visible in search</span>
                            </label>
                            <button
                              onClick={() => handleArchiveUser(user.id, `${user.first_name} ${user.last_name}`)}
                              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded transition"
                            >
                              Archive User
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

        {/* Organizations Table */}
        {activeSubtab === 'organization' && (
          <table className="w-full text-sm border border-gray-200 rounded-md">
            <thead className="bg-gray-100 text-left">
              <tr>
                <th className="px-4 py-2">Organization</th>
                <th className="px-4 py-2">Type</th>
                <th className="px-4 py-2">Contact</th>
                <th className="px-4 py-2">Assigned PD</th>
                <th className="px-2 py-2 w-6" />
              </tr>
            </thead>
            <tbody>
              {filteredOrganizations.map((org) => {
                const isExpanded = expandedUserIds.includes(org.id);
                const assignedPd = pdUsers.find(p => p.id === org.assigned_pd_id);
                const isSaving = orgPdSaving[org.id];
                return (
                  <React.Fragment key={org.id}>
                    <tr
                      className="border-t hover:bg-gray-50 cursor-pointer"
                      onClick={() => toggleExpand(org.id)}
                    >
                      <td className="px-4 py-2 font-medium">{org.org_name || '—'}</td>
                      <td className="px-4 py-2 capitalize">{org.org_type || '—'}</td>
                      <td className="px-4 py-2">{org.org_contact_name || `${org.first_name} ${org.last_name}`}</td>
                      <td className="px-4 py-2">
                        {assignedPd
                          ? <span className="text-gray-800">{assignedPd.first_name} {assignedPd.last_name}</span>
                          : <span className="text-xs font-semibold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">Unassigned</span>
                        }
                      </td>
                      <td className="px-2 py-2">{isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</td>
                    </tr>
                    {isExpanded && (
                      <tr className="bg-gray-50 border-t">
                        <td colSpan={5} className="px-6 py-4">
                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 text-sm">
                            <div className="space-y-2">
                              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Organization Details</h3>
                              <p><span className="font-semibold text-gray-700">Name:</span> <span className="text-gray-900">{org.org_name || '—'}</span></p>
                              <p><span className="font-semibold text-gray-700">Type:</span> <span className="text-gray-900 capitalize">{org.org_type || '—'}</span></p>
                              <p><span className="font-semibold text-gray-700">Address:</span> <span className="text-gray-900">{org.org_address || '—'}</span></p>
                            </div>
                            <div className="space-y-2">
                              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Contact</h3>
                              <p><span className="font-semibold text-gray-700">Contact Name:</span> <span className="text-gray-900">{org.org_contact_name || '—'}</span></p>
                              <p><span className="font-semibold text-gray-700">Contact Phone:</span> <span className="text-gray-900">{org.org_contact_phone || '—'}</span></p>
                              <p><span className="font-semibold text-gray-700">Account Email:</span> <span className="text-gray-900">{org.email}</span></p>
                              <p><span className="font-semibold text-gray-700">Account Phone:</span> <span className="text-gray-900">{org.phone || '—'}</span></p>
                            </div>
                          </div>

                          {/* Fee Tier */}
                          <div className="mt-4 pt-4 border-t border-gray-200">
                            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">Fee Tier</h3>
                            <div className="flex items-center gap-3">
                              <select
                                value={orgFeeTierDraft[org.id] ?? (org.fee_tier ?? '')}
                                onChange={e => setOrgFeeTierDraft(prev => ({ ...prev, [org.id]: e.target.value }))}
                                disabled={orgFeeTierSaving[org.id]}
                                className="border border-gray-300 rounded px-3 py-1.5 text-sm bg-white disabled:opacity-50"
                              >
                                <option value="">— Not set —</option>
                                <option value="tier_500">$500 — Corporate / for-profit / conferences / large events</option>
                                <option value="tier_200">$200 — Post-secondary / private schools / private care / wellness</option>
                                <option value="tier_0">$0 — Public schools / non-profits / first responders / inpatients</option>
                              </select>
                              <button
                                onClick={() => handleSaveOrgFeeTier(org.id)}
                                disabled={orgFeeTierSaving[org.id]}
                                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded disabled:opacity-50"
                              >
                                {orgFeeTierSaving[org.id] ? 'Saving…' : 'Save'}
                              </button>
                            </div>
                          </div>

                          {/* PD Assignment */}
                          <div className="mt-4 pt-4 border-t border-gray-200">
                            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">Program Director Assignment</h3>
                            <div className="flex items-center gap-3">
                              <select
                                defaultValue={org.assigned_pd_id ?? ''}
                                disabled={isSaving}
                                onChange={e => {
                                  const newPdId = e.target.value || null;
                                  const newPd = pdUsers.find(p => p.id === newPdId);
                                  setPdAssignConfirm({
                                    orgId: org.id,
                                    orgName: org.org_name || `${org.first_name} ${org.last_name}`,
                                    pdId: newPdId,
                                    pdName: newPd ? `${newPd.first_name} ${newPd.last_name}` : 'Unassigned',
                                  });
                                }}
                                className="border border-gray-300 rounded px-3 py-1.5 text-sm bg-white disabled:opacity-50"
                              >
                                <option value="">— Unassigned —</option>
                                {pdUsers.map(pd => (
                                  <option key={pd.id} value={pd.id}>{pd.first_name} {pd.last_name}</option>
                                ))}
                              </select>
                              {isSaving && <span className="text-xs text-gray-400">Saving…</span>}
                            </div>
                          </div>

                          <div className="mt-6 pt-4 border-t border-gray-200 flex items-center gap-6">
                            <button
                              onClick={() => handleArchiveUser(org.id, org.org_name || `${org.first_name} ${org.last_name}`)}
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
              {filteredOrganizations.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-500">No approved organizations found.</td>
                </tr>
              )}
            </tbody>
          </table>
        )}

        {/* Program Directors Tab */}
        {activeSubtab === 'pd' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-gray-500">{pdUsers.length} Program Director{pdUsers.length !== 1 ? 's' : ''}</p>
              {!hideIndividuals && (
                <button
                  onClick={() => { setShowInviteModal(true); setInviteSuccess(false); setInviteError(null); setInviteEmail(''); }}
                  className="px-3 py-1.5 text-sm font-semibold text-[#0e62ae] border border-[#0e62ae] rounded-lg hover:bg-blue-50 transition"
                >
                  + Invite Program Director
                </button>
              )}
            </div>

            {pdUsers.length === 0 ? (
              <p className="text-sm text-gray-400 italic py-6 text-center">No Program Directors yet.</p>
            ) : (
              <table className="w-full text-sm border border-gray-200 rounded-md">
                <thead className="bg-gray-100 text-left">
                  <tr>
                    <th className="px-4 py-2">Name</th>
                    <th className="px-4 py-2">Email</th>
                    <th className="px-4 py-2">Phone</th>
                    <th className="px-4 py-2">Postal Code</th>
                    <th className="px-4 py-2">Profile</th>
                  </tr>
                </thead>
                <tbody>
                  {pdUsers.map(u => (
                    <tr key={u.id} className="border-t hover:bg-gray-50">
                      <td className="px-4 py-2 font-medium">{u.first_name} {u.last_name}</td>
                      <td className="px-4 py-2 text-gray-600">{u.email}</td>
                      <td className="px-4 py-2 text-gray-600">{u.phone || '—'}</td>
                      <td className="px-4 py-2 text-gray-600">{u.pd_postal_code || '—'}</td>
                      <td className="px-4 py-2">
                        {u.profile_complete
                          ? <span className="text-xs bg-green-100 text-green-700 font-semibold px-2 py-0.5 rounded-full">Complete</span>
                          : <span className="text-xs bg-amber-100 text-amber-700 font-semibold px-2 py-0.5 rounded-full">Pending setup</span>
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Archived Users Table */}
        {activeSubtab === 'archived' && (
          <table className="w-full text-sm border border-gray-200 rounded-md">
            <thead className="bg-gray-100 text-left">
              <tr>
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2">Email</th>
                <th className="px-4 py-2">Role</th>
                <th className="px-4 py-2">City</th>
                <th className="px-4 py-2">Archived Date</th>
                <th className="px-4 py-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredArchivedUsers.map((user) => (
                <tr key={user.id} className="border-t hover:bg-gray-50">
                  <td className="px-4 py-2">{user.first_name} {user.last_name}</td>
                  <td className="px-4 py-2">{user.email}</td>
                  <td className="px-4 py-2 capitalize">{user.role}</td>
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
          </table>
        )}
          </>
        )}
      </div>

      {/* Archive Confirmation Modal */}
      {archiveModalOpen && userToArchive && archiveWarning && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              {archiveWarning.appointments.length === 0 ? (
                // Simple confirmation when no appointments
                <>
                  <div className="flex items-start mb-4">
                    <div className="flex-shrink-0">
                      <svg className="h-6 w-6 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <div className="ml-3 flex-1">
                      <h3 className="text-lg font-semibold text-gray-900">
                        Archive User
                      </h3>
                      <p className="mt-2 text-sm text-gray-700">
                        Are you sure you want to archive <span className="font-semibold">{userToArchive.name}</span>?
                      </p>
                      <p className="mt-2 text-sm text-gray-600">
                        They will no longer be able to access the platform or book appointments.
                      </p>
                    </div>
                  </div>

                  <div className="flex justify-end space-x-3 mt-6">
                    <button
                      onClick={() => {
                        setArchiveModalOpen(false);
                        setUserToArchive(null);
                        setArchiveWarning(null);
                      }}
                      className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
                      disabled={archiving}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={confirmArchive}
                      disabled={archiving}
                      className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-md transition disabled:opacity-50"
                    >
                      {archiving ? 'Archiving...' : 'Archive User'}
                    </button>
                  </div>
                </>
              ) : (
                // Warning when there are appointments
                <>
                  <div className="flex items-start mb-4">
                    <div className="flex-shrink-0">
                      <svg className="h-6 w-6 text-orange-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                    </div>
                    <div className="ml-3 flex-1">
                      <h3 className="text-lg font-semibold text-gray-900">
                        Warning: This user has {archiveWarning.appointments.length} active appointment{archiveWarning.appointments.length !== 1 ? 's' : ''}
                      </h3>
                      <p className="mt-2 text-sm text-gray-600">
                        Archiving this user will automatically cancel the following appointments:
                      </p>
                    </div>
                  </div>

                  {/* Confirmed Appointments */}
                  {archiveWarning.appointments.filter(a => a.status === 'confirmed').length > 0 && (
                    <div className="mb-4">
                      <h4 className="font-semibold text-red-700 mb-2">Confirmed Appointments ({archiveWarning.appointments.filter(a => a.status === 'confirmed').length}):</h4>
                      <ul className="space-y-2 ml-4">
                        {archiveWarning.appointments.filter(a => a.status === 'confirmed').map((appt) => (
                          <li key={appt.id} className="text-sm text-gray-700">
                            • {new Date(appt.start_time).toLocaleString()} with <span className="font-medium">{appt.other_user_name}</span>
                            {appt.dog_name && <span className="text-gray-500"> ({appt.dog_name})</span>}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Pending Appointments */}
                  {archiveWarning.appointments.filter(a => a.status === 'pending').length > 0 && (
                    <div className="mb-4">
                      <h4 className="font-semibold text-orange-700 mb-2">Pending Appointments ({archiveWarning.appointments.filter(a => a.status === 'pending').length}):</h4>
                      <ul className="space-y-2 ml-4">
                        {archiveWarning.appointments.filter(a => a.status === 'pending').map((appt) => (
                          <li key={appt.id} className="text-sm text-gray-700">
                            • {new Date(appt.start_time).toLocaleString()} with <span className="font-medium">{appt.other_user_name}</span>
                            {appt.dog_name && <span className="text-gray-500"> ({appt.dog_name})</span>}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-4">
                    <p className="text-sm text-yellow-800">
                      The other parties will be notified via email that their appointments were canceled by a Sunshine administrator.
                    </p>
                  </div>

                  <p className="text-sm text-gray-700 mb-6">
                    Are you sure you want to archive <span className="font-semibold">{userToArchive.name}</span> and cancel their appointments?
                  </p>

                  <div className="flex justify-end space-x-3">
                    <button
                      onClick={() => {
                        setArchiveModalOpen(false);
                        setUserToArchive(null);
                        setArchiveWarning(null);
                      }}
                      className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
                      disabled={archiving}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={confirmArchive}
                      disabled={archiving}
                      className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-md transition disabled:opacity-50"
                    >
                      {archiving ? 'Archiving...' : 'Archive & Cancel Appointments'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* PD Assignment Confirm Modal */}
      {pdAssignConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Update PD Assignment</h3>
            <p className="text-sm text-gray-600 mb-4">
              Assign <strong>{pdAssignConfirm.pdName}</strong> to <strong>{pdAssignConfirm.orgName}</strong>.
            </p>
            <p className="text-sm text-gray-600 mb-6">
              Do you also want to update all active visits for this organization?
            </p>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => handleAssignOrgPd(pdAssignConfirm.orgId, pdAssignConfirm.pdId, true)}
                className="w-full px-4 py-2 bg-[#0e62ae] hover:bg-[#0a4f8f] text-white text-sm font-semibold rounded-lg transition"
              >
                Yes — update org and all active visits
              </button>
              <button
                onClick={() => handleAssignOrgPd(pdAssignConfirm.orgId, pdAssignConfirm.pdId, false)}
                className="w-full px-4 py-2 bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 text-sm font-semibold rounded-lg transition"
              >
                No — update org only
              </button>
              <button
                onClick={() => setPdAssignConfirm(null)}
                className="w-full px-4 py-2 text-gray-500 hover:text-gray-700 text-sm font-medium transition"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Invite PD Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-1">Invite Program Director</h3>
            <p className="text-sm text-gray-500 mb-4">
              They&apos;ll receive an email with a link to create their account.
            </p>

            {inviteSuccess ? (
              <div className="text-center py-4">
                <p className="text-green-700 font-semibold mb-1">Invitation sent!</p>
                <p className="text-sm text-gray-500 mb-4">{inviteEmail || 'The invite has been sent.'}</p>
                <div className="flex justify-center gap-3">
                  <button
                    onClick={() => { setInviteSuccess(false); setInviteEmail(''); setInviteError(null); }}
                    className="px-4 py-2 text-sm font-medium text-[#0e62ae] border border-[#0e62ae] rounded-lg hover:bg-blue-50"
                  >
                    Send another
                  </button>
                  <button
                    onClick={() => setShowInviteModal(false)}
                    className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
                  >
                    Close
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={e => setInviteEmail(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleInvitePd()}
                    placeholder="pd@sunshinetherapydogs.com"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    disabled={inviting}
                    autoFocus
                  />
                </div>

                {inviteError && (
                  <p className="text-sm text-red-600 mb-3">{inviteError}</p>
                )}

                <div className="flex justify-end gap-3">
                  <button
                    onClick={() => setShowInviteModal(false)}
                    className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
                    disabled={inviting}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleInvitePd}
                    disabled={inviting || !inviteEmail.trim()}
                    className="px-4 py-2 text-sm font-semibold bg-[#0e62ae] text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                  >
                    {inviting ? 'Sending…' : 'Send Invite'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
