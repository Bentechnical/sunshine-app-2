// src/components/profile/EditProfileForm.tsx

'use client';

import React, { FormEvent, useRef, useState } from 'react';
import AvatarUpload from '@/components/profile/AvatarUpload';

interface EditProfileFormProps {
  initialBio?: string | null;
  initialPhone?: string | null;
  initialAvatarUrl?: string | null;
  initialPostalCode?: string | null;
  initialTravelDistance?: number | null;
  userId: string;
  role: 'individual' | 'volunteer' | 'admin';
  onSubmit: (
    bio: string,
    phone: string,
    avatarUrl?: string,
    postalCode?: string,
    travelDistanceKm?: number
  ) => Promise<void>;
  error?: string | null;
}

export default function EditProfileForm({
  initialBio = '',
  initialPhone = '',
  initialAvatarUrl = '',
  initialPostalCode = '',
  initialTravelDistance = 10,
  userId,
  role,
  onSubmit,
  error,
}: EditProfileFormProps) {
  const [bio, setBio] = useState(initialBio ?? '');
  const [phone, setPhone] = useState(initialPhone ?? '');
  const [postalCode, setPostalCode] = useState(initialPostalCode ?? '');
  const [travelDistance, setTravelDistance] = useState(initialTravelDistance || 10);
  const [previewAvatarUrl, setPreviewAvatarUrl] = useState(initialAvatarUrl ?? '');
  const avatarUrlRef = useRef(initialAvatarUrl ?? '');
  const [isUploading, setIsUploading] = useState(false);

  const normalizePostalCode = (code: string): string => {
    const upper = code.toUpperCase().replace(/\s+/g, '');
    return upper.length === 6 ? `${upper.slice(0, 3)} ${upper.slice(3)}` : upper;
  };

  const isValidPostalCode = (code: string): boolean => {
    const cleaned = code.toUpperCase().replace(/\s+/g, '');
    const regex = /^[A-Z]\d[A-Z]\d[A-Z]\d$/;
    return regex.test(cleaned);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (isUploading) {
      alert('Please wait for the profile picture to finish uploading.');
      return;
    }

    if (!postalCode.trim()) {
      alert('Postal code is required.');
      return;
    }

    const cleanedCode = postalCode.toUpperCase().replace(/\s+/g, '');
    if (!isValidPostalCode(cleanedCode)) {
      alert('Postal code must be in the format A1A1A1, alternating letters and numbers.');
      return;
    }

    const normalizedPostalCode = normalizePostalCode(cleanedCode);
    const finalAvatarUrl = avatarUrlRef.current;

    await onSubmit(bio, phone, finalAvatarUrl, normalizedPostalCode, travelDistance);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="flex items-center gap-4">
        <div className="relative w-24 aspect-square rounded-lg overflow-hidden shadow-md border border-gray-300">
          <AvatarUpload
            initialUrl={previewAvatarUrl}
            fallbackUrl="https://via.placeholder.com/100"
            onUpload={(url: string) => {
              setPreviewAvatarUrl(url);
              avatarUrlRef.current = url;
              setIsUploading(false);
            }}
            altText="Profile Picture"
          />
        </div>
        <span className="font-medium">Change Profile Picture</span>
      </div>

      <div>
        <label htmlFor="phone_number" className="block text-sm font-medium text-gray-700">
          Phone Number
        </label>
        <input
          type="text"
          id="phone_number"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="w-full px-3 py-2 bg-gray-100 rounded-md border border-gray-300"
        />
      </div>

      <div>
        <label htmlFor="postal_code" className="block text-sm font-medium text-gray-700">
          Postal Code <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          id="postal_code"
          value={postalCode}
          onChange={(e) => setPostalCode(e.target.value.toUpperCase())}
          className="w-full px-3 py-2 bg-gray-100 rounded-md border border-gray-300 uppercase"
          placeholder="e.g., M5V 2T6"
        />
      </div>

      {role === 'volunteer' && (
        <div>
          <label htmlFor="travel_distance" className="block text-sm font-medium text-gray-700">
            How far are you willing to travel? <span className="text-gray-500 text-xs">(for appointments)</span>
          </label>
          <select
            id="travel_distance"
            value={travelDistance}
            onChange={(e) => setTravelDistance(Number(e.target.value))}
            className="w-full px-3 py-2 bg-gray-100 rounded-md border border-gray-300"
          >
            <option value={5}>5 km</option>
            <option value={10}>10 km</option>
            <option value={25}>25 km</option>
            <option value={50}>50 km</option>
          </select>
        </div>
      )}

      <div>
        <label htmlFor="bio" className="block text-sm font-medium text-gray-700">
          Bio
        </label>
        <textarea
          id="bio"
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          className="w-full px-3 py-2 bg-gray-100 rounded-md border border-gray-300"
          rows={4}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">
          Please contact us to update your email address.
        </label>
      </div>

      <button
        type="submit"
        className="w-full py-2 px-4 bg-[#0e62ae] text-white rounded-md hover:bg-[#094e8b] transition"
      >
        Save Changes
      </button>

      {error && <p className="text-red-600 mt-2">{error}</p>}
    </form>
  );
}
