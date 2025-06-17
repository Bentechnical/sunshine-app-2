// src/components/profile/ProfileCard.tsx

'use client';

import React from 'react';
import Image from 'next/image';

interface ProfileCardProps {
  userId?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phoneNumber?: string;
  role?: string;
  bio?: string;
  profileImage?: string;
}

export default function ProfileCard({
  userId,
  firstName,
  lastName,
  email,
  phoneNumber,
  role,
  bio,
  profileImage,
}: ProfileCardProps) {
  return (
    <div className="bg-white shadow-lg rounded-lg p-5 mb-6">
      <h3 className="text-xl font-semibold mb-4">Logged in as:</h3>

      <p className="text-lg text-gray-700">
        <strong>User ID:</strong> {userId || 'ID not available'}
      </p>
      <p className="text-lg text-gray-700">
        <strong>Name:</strong>{' '}
        {firstName || 'First name'} {lastName || 'Last name'}
      </p>
      <p className="text-lg text-gray-700">
        <strong>Email:</strong> {email || 'Email not available'}
      </p>
      <p className="text-lg text-gray-700">
        <strong>Phone Number:</strong>{' '}
        {phoneNumber || 'Phone number not available'}
      </p>
      <p className="text-lg text-gray-700">
        <strong>Profile Type:</strong> {role || 'No role assigned'}
      </p>
      <p className="text-lg text-gray-700 mt-4">
        <strong>Bio:</strong> {bio || 'Bio not available'}
      </p>

      {profileImage && (
        <div className="relative w-24 h-24 mt-4 rounded-full overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={profileImage}
            alt="Profile"
            className="absolute inset-0 w-full h-full object-cover rounded-full"
          />
        </div>

      )}
    </div>
  );
}
