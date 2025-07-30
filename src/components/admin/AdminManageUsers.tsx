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

export default function ManageUsersTab() {
  const [activeSubtab, setActiveSubtab] = useState<'individual' | 'volunteer'>('individual');
  const [volunteers, setVolunteers] = useState<VolunteerUser[]>([]);
  const [individuals, setIndividuals] = useState<IndividualUser[]>([]);
  const [expandedUserIds, setExpandedUserIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

        setVolunteers(sortedVolunteers);
        setIndividuals(sortedIndividuals);
      } catch (err) {
        console.error('[Admin] Error fetching users:', err);
        setError('Failed to load users');
      } finally {
        setLoading(false);
      }
    };

    fetchUsers();
  }, []);

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

  const renderCategoryBubbles = (categories: string[]) => (
    <div className="flex flex-wrap gap-1">
      {categories.map((label) => (
        <span
          key={label}
          className="bg-blue-100 text-blue-800 text-xs font-medium px-2 py-0.5 rounded-full"
        >
          {label}
        </span>
      ))}
    </div>
  );

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

  return (
    <div className="px-4 py-4">
      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
        {/* Header */}
        <div className="flex justify-between items-center mb-4">
          <div className="flex space-x-4">
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
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        )}
          </>
        )}
      </div>
    </div>
  );
}
