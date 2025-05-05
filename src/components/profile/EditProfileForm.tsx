"use client";

import React, { FormEvent, useState, useEffect } from "react";
import AvatarUpload from "@/components/profile/AvatarUpload"; // updated path

interface EditProfileFormProps {
  initialBio?: string | null;
  initialPhone?: string | null;
  initialAvatarUrl?: string | null;
  onSubmit: (bio: string, phone: string, avatarUrl?: string) => Promise<void>;
  error?: string | null;
}

export default function EditProfileForm({
  initialBio = "",
  initialPhone = "",
  initialAvatarUrl = "",
  onSubmit,
  error,
}: EditProfileFormProps) {
  const [bio, setBio] = useState(initialBio ?? "");
  const [phone, setPhone] = useState(initialPhone ?? "");
  const [avatarUrl, setAvatarUrl] = useState(initialAvatarUrl ?? "");

  console.log("EditProfileForm: current avatarUrl:", avatarUrl);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    console.log("Submitting with avatarUrl:", avatarUrl);
    await onSubmit(bio, phone, avatarUrl);
  };

  return (
    <div className="bg-white shadow-lg rounded-lg p-5 mb-6">
      <h3 className="text-xl font-semibold mb-4">Edit Profile</h3>
      
      <div className="flex items-center mb-4">
        <AvatarUpload 
          initialUrl={avatarUrl}
          fallbackUrl="https://via.placeholder.com/100" // fallback if avatarUrl is empty
          onUpload={(url: string) => {
            console.log("AvatarUpload onUpload - new url:", url);
            setAvatarUrl(url);
          }}
          size={64}
          altText="Profile Picture"
        />
        <span className="ml-4 font-medium">Change Profile Picture</span>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="mb-4">
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
        <div className="mb-4">
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
        <button
          type="submit"
          className="w-full py-2 px-4 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition duration-200"
        >
          Save Changes
        </button>
      </form>

      {error && <p className="text-red-600 mt-4">{error}</p>}
    </div>
  );
}
