// src/components/dashboard/MyTherapyDogTab.tsx

'use client';

import React from 'react';
import { useUser } from '@clerk/nextjs';
import VolunteerAvailability from '@/components/availability/VolunteerAvailability';
import EditDogProfile from '@/components/dog/EditDogProfile';

export default function MyTherapyDogTab() {
  const { user } = useUser();

  if (!user) {
    return <p>Loading user...</p>;
  }

  return (
    <div className="space-y-8 p-6">
      <section>
        <h2 className="text-2xl font-bold mb-4">My Dog Profile</h2>
        <EditDogProfile />
      </section>

      <hr className="my-8 border-gray-300" />

      <section>
        <h2 className="text-2xl font-bold mb-4">Availability Calendar</h2>
        <VolunteerAvailability userId={user.id} />
      </section>
    </div>
  );
}
