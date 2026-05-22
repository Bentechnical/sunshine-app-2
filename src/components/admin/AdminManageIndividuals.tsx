// src/components/admin/AdminManageIndividuals.tsx
'use client';

import React, { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

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
  pronouns?: string;
  birthday?: number;
  physical_address?: string;
  other_pets_on_site?: boolean;
  other_pets_description?: string;
  third_party_available?: string;
  additional_information?: string;
  liability_waiver_accepted?: boolean;
  liability_waiver_accepted_at?: string;
  visit_recipient_type?: string;
  relationship_to_recipient?: string;
  dependant_name?: string;
}

interface ArchivedIndividual {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  city: string;
  archived_at: string;
}

interface ActiveAppointment {
  id: number;
  start_time: string;
  status: 'pending' | 'confirmed';
  other_user_name: string;
  dog_name?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const allCategories = ['Young Kids', 'Teens/Young Adults', 'Adults', 'Seniors'];

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AdminManageIndividuals() {
  const [individuals, setIndividuals] = useState<IndividualUser[]>([]);
  const [archivedIndividuals, setArchivedIndividuals] = useState<ArchivedIndividual[]>([]);
  const [viewMode, setViewMode] = useState<'active' | 'archived'>('active');
  const [loading, setLoading] = useState(true);
  const [archivedLoading, setArchivedLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedUserIds, setExpandedUserIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  // Archive modal
  const [archiveModalOpen, setArchiveModalOpen] = useState(false);
  const [userToArchive, setUserToArchive] = useState<{ id: string; name: string } | null>(null);
  const [archiveWarning, setArchiveWarning] = useState<{ appointments: ActiveAppointment[] } | null>(null);
  const [archiving, setArchiving] = useState(false);

  // ── Data fetching ─────────────────────────────────────────────────────────────

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/admin/approved-users');
        const json = await res.json();
        if (!res.ok) { setError(json.error || 'Failed to load users'); return; }

        const sorted: IndividualUser[] = json.users
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
            pronouns: u.pronouns,
            birthday: u.birthday,
            physical_address: u.physical_address,
            other_pets_on_site: u.other_pets_on_site,
            other_pets_description: u.other_pets_description,
            third_party_available: u.third_party_available,
            additional_information: u.additional_information,
            liability_waiver_accepted: u.liability_waiver_accepted,
            liability_waiver_accepted_at: u.liability_waiver_accepted_at,
            visit_recipient_type: u.visit_recipient_type,
            relationship_to_recipient: u.relationship_to_recipient,
            dependant_name: u.dependant_name,
          }))
          .sort((a: IndividualUser, b: IndividualUser) => a.last_name.localeCompare(b.last_name));

        setIndividuals(sorted);
      } catch (err) {
        console.error('[AdminManageIndividuals] Error:', err);
        setError('Failed to load data');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  useEffect(() => {
    if (viewMode !== 'archived') return;
    const fetchArchived = async () => {
      setArchivedLoading(true);
      try {
        const res = await fetch('/api/admin/archived-users');
        const json = await res.json();
        if (!res.ok) { setError(json.error || 'Failed to load archived users'); return; }
        const filtered: ArchivedIndividual[] = json.users
          .filter((u: any) => u.role === 'individual')
          .map((u: any) => ({
            id: u.id,
            first_name: u.first_name,
            last_name: u.last_name,
            email: u.email,
            city: u.city,
            archived_at: u.archived_at,
          }))
          .sort((a: ArchivedIndividual, b: ArchivedIndividual) =>
            new Date(b.archived_at).getTime() - new Date(a.archived_at).getTime()
          );
        setArchivedIndividuals(filtered);
      } catch (err) {
        console.error('[AdminManageIndividuals] Error fetching archived:', err);
      } finally {
        setArchivedLoading(false);
      }
    };
    fetchArchived();
  }, [viewMode]);

  // ── Archive handlers ──────────────────────────────────────────────────────────

  const handleArchiveUser = async (userId: string, userName: string) => {
    setUserToArchive({ id: userId, name: userName });
    setArchiving(false);
    try {
      const res = await fetch('/api/admin/archive-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId }),
      });
      const result = await res.json();
      if (result.requires_confirmation) {
        setArchiveWarning({ appointments: result.active_appointments });
        setArchiveModalOpen(true);
      } else if (result.success) {
        setIndividuals(prev => prev.filter(u => u.id !== userId));
        alert('User archived successfully');
      } else {
        alert(`Failed to archive: ${result.error}`);
      }
    } catch {
      alert('Failed to archive user');
    }
  };

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
        setIndividuals(prev => prev.filter(u => u.id !== userToArchive.id));
        setArchiveModalOpen(false);
        setUserToArchive(null);
        setArchiveWarning(null);
      } else {
        alert(`Failed to archive: ${result.error}`);
      }
    } catch {
      alert('Failed to archive user');
    } finally {
      setArchiving(false);
    }
  };

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
        setArchivedIndividuals(prev => prev.filter(u => u.id !== userId));
        alert('User unarchived successfully');
      } else {
        alert(`Failed to unarchive: ${result.error}`);
      }
    } catch {
      alert('Failed to unarchive user');
    }
  };

  // ── Other handlers ────────────────────────────────────────────────────────────

  const toggleExpand = (userId: string) => {
    setExpandedUserIds(prev =>
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
    );
  };

  const updateAudience = async (userId: string, newCategories: string[]) => {
    const res = await fetch('/api/admin/update-audience-preferences', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, role: 'individual', category_labels: newCategories }),
    });
    if (!res.ok) console.error('Failed to update audience prefs');
  };

  const handleCheckboxChange = (userId: string, label: string, current: string[]) => {
    const newCategories = current.includes(label)
      ? current.filter(c => c !== label)
      : [...current, label];
    updateAudience(userId, newCategories);
    setIndividuals(prev => prev.map(u => u.id === userId ? { ...u, audience_categories: newCategories } : u));
  };

  const handleToggleBrowsable = async (userId: string, current: boolean) => {
    setIndividuals(prev => prev.map(u => u.id === userId ? { ...u, is_browsable: !current } : u));
    const res = await fetch('/api/admin/set-browsable', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, is_browsable: !current }),
    });
    if (!res.ok) {
      setIndividuals(prev => prev.map(u => u.id === userId ? { ...u, is_browsable: current } : u));
      alert('Failed to update visibility');
    }
  };

  // ── Derived state ─────────────────────────────────────────────────────────────

  const filteredIndividuals = individuals.filter(u =>
    `${u.first_name} ${u.last_name} ${u.email} ${u.city}`
      .toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredArchived = archivedIndividuals.filter(u =>
    `${u.first_name} ${u.last_name} ${u.email} ${u.city}`
      .toLowerCase().includes(searchQuery.toLowerCase())
  );

  const renderCategoryBubbles = (categories: string[]) => {
    const sorted = [...categories].sort((a, b) => allCategories.indexOf(a) - allCategories.indexOf(b));
    return (
      <div className="flex flex-wrap gap-1">
        {sorted.map(label => (
          <span key={label} className="bg-blue-100 text-blue-800 text-xs font-medium px-2 py-0.5 rounded-full">
            {label}
          </span>
        ))}
      </div>
    );
  };

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="px-4 py-4">
      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex gap-2">
            <button
              onClick={() => setViewMode('active')}
              className={`px-4 py-2 rounded text-sm font-semibold transition ${
                viewMode === 'active' ? 'bg-[#0e62ae] text-white' : 'bg-gray-200 text-gray-800'
              }`}
            >
              Active Individuals
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
          <input
            type="text"
            placeholder="Search..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="border border-gray-300 px-3 py-1.5 rounded-md text-sm w-64"
          />
        </div>

        {/* Loading */}
        {(loading || (viewMode === 'archived' && archivedLoading)) && (
          <div className="flex items-center justify-center py-12 gap-2">
            <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            <span className="text-gray-600">Loading...</span>
          </div>
        )}

        {/* Error */}
        {error && !loading && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4 text-sm text-red-700">{error}</div>
        )}

        {/* Active Individuals Table */}
        {!loading && !error && viewMode === 'active' && (
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
              {filteredIndividuals.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-500">No individuals found.</td>
                </tr>
              ) : filteredIndividuals.map(user => {
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
                            {/* Left Column */}
                            <div className="space-y-4">
                              <div className="flex gap-4 items-start">
                                <img
                                  src={user.profile_picture_url}
                                  alt={`${user.first_name} ${user.last_name}`}
                                  className="w-28 h-28 object-cover rounded-lg"
                                />
                                <div className="space-y-3">
                                  <div className="space-y-2">
                                    <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Contact Information</h3>
                                    <div className="space-y-1 text-sm">
                                      <p><span className="font-semibold text-gray-700">Phone:</span> <span className="text-gray-900">{user.phone || 'Not provided'}</span></p>
                                      <p><span className="font-semibold text-gray-700">Postal Code:</span> <span className="text-gray-900">{user.postal_code}, {user.city}</span></p>
                                      {user.pronouns && user.visit_recipient_type !== 'other' && (
                                        <p><span className="font-semibold text-gray-700">Pronouns:</span> <span className="text-gray-900">{user.pronouns}</span></p>
                                      )}
                                      {user.birthday && user.visit_recipient_type !== 'other' && (
                                        <p><span className="font-semibold text-gray-700">Birth Year:</span> <span className="text-gray-900">{user.birthday} ({new Date().getFullYear() - user.birthday} years old)</span></p>
                                      )}
                                      {user.physical_address && (
                                        <p><span className="font-semibold text-gray-700">Address:</span> <span className="text-gray-900">{user.physical_address}</span></p>
                                      )}
                                    </div>
                                  </div>
                                  {user.visit_recipient_type === 'other' && (
                                    <div className="border-t border-gray-200 pt-3">
                                      <h4 className="text-sm font-semibold text-gray-700 mb-2 uppercase tracking-wide">Visit Recipient</h4>
                                      <div className="space-y-1 text-sm">
                                        <p><span className="font-semibold text-gray-700">Name:</span> <span className="text-gray-900">{user.dependant_name || 'Not provided'}</span></p>
                                        <p><span className="font-semibold text-gray-700">Relationship:</span> <span className="text-gray-900">{user.relationship_to_recipient || 'Not provided'}</span></p>
                                        {user.pronouns && <p><span className="font-semibold text-gray-700">Pronouns:</span> <span className="text-gray-900">{user.pronouns}</span></p>}
                                        {user.birthday && <p><span className="font-semibold text-gray-700">Birth Year:</span> <span className="text-gray-900">{user.birthday} ({new Date().getFullYear() - user.birthday} years old)</span></p>}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Right Column */}
                            <div className="space-y-4">
                              <div className="space-y-2">
                                <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Visit Details</h4>
                                <div className="space-y-2 text-sm">
                                  <div>
                                    <p className="font-medium text-gray-700">Reason for Visit:</p>
                                    <p className="text-gray-600 italic">{user.bio ? `"${user.bio}"` : 'Not provided'}</p>
                                  </div>
                                  <div>
                                    <p className="font-medium text-gray-700">Other Animals on Site:</p>
                                    <p className="text-gray-600 italic">&ldquo;{user.other_pets_on_site ? (user.other_pets_description || 'Yes') : 'No'}&rdquo;</p>
                                  </div>
                                  {user.third_party_available && (
                                    <div>
                                      <p className="font-medium text-gray-700">Third Party Contact:</p>
                                      <p className="text-gray-600 italic">&ldquo;{user.third_party_available}&rdquo;</p>
                                    </div>
                                  )}
                                  {user.additional_information && (
                                    <div>
                                      <p className="font-medium text-gray-700">Additional Information:</p>
                                      <p className="text-gray-600 italic">&ldquo;{user.additional_information}&rdquo;</p>
                                    </div>
                                  )}
                                </div>
                              </div>
                              <div className="space-y-2">
                                <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Legal</h4>
                                <p className="text-sm">
                                  <span className="font-semibold text-gray-700">Liability Waiver:</span>{' '}
                                  <span className={user.liability_waiver_accepted ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>
                                    {user.liability_waiver_accepted ? '✓ Accepted' : '✗ Not Accepted'}
                                  </span>
                                </p>
                                {user.liability_waiver_accepted_at && (
                                  <p className="text-xs text-gray-500 ml-4">Accepted on: {new Date(user.liability_waiver_accepted_at).toLocaleDateString()}</p>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Audience checkboxes */}
                          <div className="flex flex-wrap items-center gap-4 mt-4">
                            <span className="font-semibold text-sm">Audience Preferences:</span>
                            {allCategories.map(label => (
                              <label key={label} className="flex items-center gap-1 text-sm">
                                <input
                                  type="checkbox"
                                  checked={user.audience_categories.includes(label)}
                                  onChange={() => handleCheckboxChange(user.id, label, user.audience_categories)}
                                />
                                {label}
                              </label>
                            ))}
                          </div>

                          {/* Admin Controls */}
                          <div className="mt-6 pt-4 border-t border-gray-200 flex items-center gap-6">
                            <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                              <input
                                type="checkbox"
                                checked={user.is_browsable}
                                onChange={() => handleToggleBrowsable(user.id, user.is_browsable)}
                                onClick={e => e.stopPropagation()}
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

        {/* Archived Individuals Table */}
        {!loading && !error && viewMode === 'archived' && !archivedLoading && (
          <table className="w-full text-sm border border-gray-200 rounded-md">
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
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-500">No archived individuals found.</td>
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
          </table>
        )}
      </div>

      {/* Archive Confirmation Modal */}
      {archiveModalOpen && userToArchive && archiveWarning && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              {archiveWarning.appointments.length === 0 ? (
                <>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">Archive User</h3>
                  <p className="text-sm text-gray-700 mb-2">
                    Are you sure you want to archive <span className="font-semibold">{userToArchive.name}</span>?
                  </p>
                  <p className="text-sm text-gray-600 mb-6">They will no longer be able to access the platform or book appointments.</p>
                  <div className="flex justify-end space-x-3">
                    <button
                      onClick={() => { setArchiveModalOpen(false); setUserToArchive(null); setArchiveWarning(null); }}
                      className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
                      disabled={archiving}
                    >
                      Cancel
                    </button>
                    <button onClick={confirmArchive} disabled={archiving}
                      className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-md disabled:opacity-50">
                      {archiving ? 'Archiving...' : 'Archive User'}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">
                    Warning: {archiveWarning.appointments.length} active appointment{archiveWarning.appointments.length !== 1 ? 's' : ''}
                  </h3>
                  <p className="text-sm text-gray-600 mb-4">Archiving this user will automatically cancel the following appointments:</p>
                  {archiveWarning.appointments.filter(a => a.status === 'confirmed').length > 0 && (
                    <div className="mb-4">
                      <h4 className="font-semibold text-red-700 mb-2">Confirmed ({archiveWarning.appointments.filter(a => a.status === 'confirmed').length}):</h4>
                      <ul className="space-y-2 ml-4">
                        {archiveWarning.appointments.filter(a => a.status === 'confirmed').map(appt => (
                          <li key={appt.id} className="text-sm text-gray-700">
                            • {new Date(appt.start_time).toLocaleString()} with <span className="font-medium">{appt.other_user_name}</span>
                            {appt.dog_name && <span className="text-gray-500"> ({appt.dog_name})</span>}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {archiveWarning.appointments.filter(a => a.status === 'pending').length > 0 && (
                    <div className="mb-4">
                      <h4 className="font-semibold text-orange-700 mb-2">Pending ({archiveWarning.appointments.filter(a => a.status === 'pending').length}):</h4>
                      <ul className="space-y-2 ml-4">
                        {archiveWarning.appointments.filter(a => a.status === 'pending').map(appt => (
                          <li key={appt.id} className="text-sm text-gray-700">
                            • {new Date(appt.start_time).toLocaleString()} with <span className="font-medium">{appt.other_user_name}</span>
                            {appt.dog_name && <span className="text-gray-500"> ({appt.dog_name})</span>}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-4">
                    <p className="text-sm text-yellow-800">The other parties will be notified via email that their appointments were canceled by a Sunshine administrator.</p>
                  </div>
                  <p className="text-sm text-gray-700 mb-6">
                    Are you sure you want to archive <span className="font-semibold">{userToArchive.name}</span> and cancel their appointments?
                  </p>
                  <div className="flex justify-end space-x-3">
                    <button
                      onClick={() => { setArchiveModalOpen(false); setUserToArchive(null); setArchiveWarning(null); }}
                      className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
                      disabled={archiving}
                    >
                      Cancel
                    </button>
                    <button onClick={confirmArchive} disabled={archiving}
                      className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-md disabled:opacity-50">
                      {archiving ? 'Archiving...' : 'Archive & Cancel Appointments'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
