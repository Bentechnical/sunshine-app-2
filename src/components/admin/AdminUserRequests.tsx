'use client';

import React, { useEffect, useState } from 'react';

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
  dog: {
    dog_name: string;
    dog_breed: string;
    dog_bio: string;
    dog_picture_url: string;
    dog_age?: number;
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
}

export default function UserRequestsTab() {
  const [activeSubtab, setActiveSubtab] = useState<'volunteer' | 'individual'>('volunteer');
  const [volunteerRequests, setVolunteerRequests] = useState<VolunteerRequest[]>([]);
  const [individualRequests, setIndividualRequests] = useState<IndividualRequest[]>([]);

  useEffect(() => {
    const fetchPendingUsers = async () => {
      const res = await fetch('/api/admin/pending-users');
      const json = await res.json();

      if (!res.ok) {
        console.error('[Admin fetch error]', json.error || 'Unknown error');
        return;
      }

      const data = json.users;

      const volunteers = data
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
          dog: u.dogs?.status === 'pending'
            ? {
              dog_name: u.dogs.dog_name,
              dog_breed: u.dogs.dog_breed,
              dog_bio: u.dogs.dog_bio,
              dog_picture_url: u.dogs.dog_picture_url,
              dog_age: u.dogs.dog_age,
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
        }));

      setVolunteerRequests(volunteers);
      setIndividualRequests(individuals);
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
      } else {
        console.error('[Admin] Failed to update user status');
      }
    } catch (err) {
      console.error('[Admin] Error updating user status', err);
    }
  };

  return (
    <div className="px-4 py-4">
      {/* Tabs */}
      <div className="flex space-x-4 mb-6">
        <button
          onClick={() => setActiveSubtab('volunteer')}
          className={`px-4 py-2 rounded text-sm font-semibold transition ${activeSubtab === 'volunteer' ? 'bg-[#0e62ae] text-white' : 'bg-gray-200 text-gray-800'
            }`}
        >
          Volunteer Requests
        </button>
        <button
          onClick={() => setActiveSubtab('individual')}
          className={`px-4 py-2 rounded text-sm font-semibold transition ${activeSubtab === 'individual' ? 'bg-[#0e62ae] text-white' : 'bg-gray-200 text-gray-800'
            }`}
        >
          Individual Requests
        </button>
      </div>

      {/* Volunteer Requests */}
      {activeSubtab === 'volunteer' && (
        <div className="grid grid-cols-1 gap-6">
          {volunteerRequests.map((user) => (
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
                  <div className="flex flex-col gap-2 text-left">
                    <h2 className="text-xl font-bold">
                      {user.first_name} {user.last_name}
                    </h2>
                    <p className="text-sm"><span className="font-medium">Email:</span> {user.email}</p>
                    <p className="text-sm"><span className="font-medium">Phone:</span> {user.phone}</p>
                    <p className="text-sm"><span className="font-medium">Postal Code:</span> {user.postal_code}, {user.city}</p>
                    <p className="text-sm"><span className="font-medium">Travel Distance:</span> {user.travel_distance_km} km</p>
                    <div>
                      <h3 className="text-sm font-semibold mb-1">Bio</h3>
                      <p className="text-sm text-muted-foreground whitespace-pre-line">{user.bio}</p>
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
                    <div className="flex flex-col gap-2 text-left">
                      <h2 className="text-xl font-bold">{user.dog.dog_name}</h2>
                      <p className="text-sm"><span className="font-medium">Breed:</span> {user.dog.dog_breed}</p>
                      {user.dog.dog_age !== null && (
                        <p><span className="font-medium">Age:</span> {user.dog.dog_age} years</p>
                      )}

                      <div>
                        <h3 className="text-sm font-semibold mb-1">Dog Bio</h3>
                        <p className="text-sm text-muted-foreground whitespace-pre-line">{user.dog.dog_bio}</p>
                      </div>
                    </div>
                  </div>
                )}
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
          ))}
        </div>
      )}

      {/* Individual Requests */}
      {activeSubtab === 'individual' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {individualRequests.map((user) => (
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
                <div className="flex flex-col gap-2">
                  <h2 className="text-xl font-bold">
                    {user.first_name} {user.last_name}
                  </h2>
                  <p className="text-sm"><span className="font-medium">Email:</span> {user.email}</p>
                  <p className="text-sm"><span className="font-medium">Phone:</span> {user.phone}</p>
                  <p className="text-sm"><span className="font-medium">Postal Code:</span> {user.postal_code}, {user.city}</p>
                  <div>
                    <h3 className="text-sm font-semibold mb-1">Bio</h3>
                    <p className="text-sm text-muted-foreground whitespace-pre-line">{user.bio}</p>
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
          ))}
        </div>
      )}
    </div>
  );
}
