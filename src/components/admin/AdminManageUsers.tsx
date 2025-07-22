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
}

export default function ManageUsersTab() {
  const [activeSubtab, setActiveSubtab] = useState<'volunteer' | 'individual'>('volunteer');
  const [volunteers, setVolunteers] = useState<VolunteerUser[]>([]);
  const [individuals, setIndividuals] = useState<IndividualUser[]>([]);
  const [expandedUserIds, setExpandedUserIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  const allCategories = ['Young Kids', 'Teens/Young Adults', 'Adults', 'Seniors'];

  const toggleExpand = (userId: string) => {
    setExpandedUserIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  useEffect(() => {
    const fetchUsers = async () => {
      const res = await fetch('/api/admin/approved-users');
      const json = await res.json();

      if (!res.ok) {
        console.error('[Admin fetch error]', json.error || 'Unknown error');
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
        }))
        .sort((a: IndividualUser, b: IndividualUser) => a.last_name.localeCompare(b.last_name));

      setVolunteers(sortedVolunteers);
      setIndividuals(sortedIndividuals);
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
              onClick={() => setActiveSubtab('individual')}
              className={`px-4 py-2 rounded text-sm font-semibold transition ${
                activeSubtab === 'individual'
                  ? 'bg-[#0e62ae] text-white'
                  : 'bg-gray-200 text-gray-800'
              }`}
            >
              Individual Users
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
                              <div className="text-sm">
                                <p><strong>Phone:</strong> {user.phone}</p>
                                <p><strong>Postal Code:</strong> {user.postal_code}</p>
                                <p><strong>Distance:</strong> {user.travel_distance_km} km</p>
                                <p><strong>Bio:</strong> {user.bio}</p>
                              </div>
                            </div>
                            {user.dog && (
                              <div className="flex gap-4 items-start w-full lg:w-1/2">
                                <img
                                  src={user.dog.dog_picture_url}
                                  alt={user.dog.dog_name}
                                  className="w-28 h-28 object-cover rounded-lg"
                                />
                                <div className="text-sm">
                                  <p><strong>Name:</strong> {user.dog.dog_name}</p>
                                  <p><strong>Breed:</strong> {user.dog.dog_breed}</p>
                                  {user.dog.dog_age && <p><strong>Age:</strong> {user.dog.dog_age} years</p>}
                                  <p><strong>Bio:</strong> {user.dog.dog_bio}</p>
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
                          <div className="flex gap-4 items-start">
                            <img
                              src={user.profile_picture_url}
                              alt={`${user.first_name} ${user.last_name}`}
                              className="w-28 h-28 object-cover rounded-lg"
                            />
                            <div className="text-sm">
                              <p><strong>Phone:</strong> {user.phone}</p>
                              <p><strong>Postal Code:</strong> {user.postal_code}</p>
                              <p><strong>Bio:</strong> {user.bio}</p>
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
      </div>
    </div>
  );
}
