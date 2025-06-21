'use client';

import React, { FormEvent, useState } from 'react';
import AvatarUpload from '@/components/profile/AvatarUpload';

interface EditProfileFormProps {
  initialBio?: string | null;
  initialPhone?: string | null;
  initialAvatarUrl?: string | null;
  onSubmit: (bio: string, phone: string, avatarUrl?: string) => Promise<void>;
  error?: string | null;
}

export default function EditProfileForm({
  initialBio = '',
  initialPhone = '',
  initialAvatarUrl = '',
  onSubmit,
  error,
}: EditProfileFormProps) {
  const [bio, setBio] = useState(initialBio ?? '');
  const [phone, setPhone] = useState(initialPhone ?? '');
  const [avatarUrl, setAvatarUrl] = useState(initialAvatarUrl ?? '');
  const [isUploading, setIsUploading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (isUploading) {
      alert('Please wait for the profile picture to finish uploading.');
      return;
    }

    await onSubmit(bio, phone, avatarUrl);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="flex items-center gap-4">
        <div className="relative w-24 aspect-square rounded-lg overflow-hidden shadow-md border border-gray-300">
          <AvatarUpload
            initialUrl={avatarUrl}
            fallbackUrl="https://via.placeholder.com/100"
            onUpload={(url: string) => {
              setAvatarUrl(url);
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
